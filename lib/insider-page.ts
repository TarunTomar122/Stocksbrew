import type { InsiderTrade } from "@/lib/follow-shared";
import { fin, money, signedPct } from "@/lib/insight-format";
import { pickInsights, sharePct, type Insight, type TheRead } from "@/lib/insights";
import { clusterBuys, longDay } from "@/lib/seo/families";

/**
 * The read at the top of a per-stock insider page (/insiders/[ticker]), from
 * the open-market Form 4 trades we hold for it: net buying or selling, cluster
 * buys, the largest trade and who made it, how much of the selling was
 * pre-scheduled, and where the price sits against what insiders paid. Plain
 * rules; an insight the trades cannot back is left out.
 */

export type InsiderTotals = {
  buys: number;
  sells: number;
  bought: number;
  sold: number;
  buyers: number;
  sellers: number;
  /** Value-weighted average price paid on buys, when the filings carry prices. */
  avgBuyPrice: number | null;
  planSells: number;
  first: string | null;
  last: string | null;
};

export function insiderTotals(trades: readonly InsiderTrade[]): InsiderTotals {
  const totals: InsiderTotals = { buys: 0, sells: 0, bought: 0, sold: 0, buyers: 0, sellers: 0, avgBuyPrice: null, planSells: 0, first: null, last: null };
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let paid = 0;
  let shares = 0;
  for (const trade of trades) {
    const who = trade.insider_id || trade.insider;
    const day = (trade.filing_date || trade.filed_at || "").slice(0, 10);
    if (day) {
      if (!totals.first || day < totals.first) totals.first = day;
      if (!totals.last || day > totals.last) totals.last = day;
    }
    if (trade.tx_type === "buy") {
      totals.buys += 1;
      totals.bought += trade.value ?? 0;
      buyers.add(who);
      if (fin(trade.price) && trade.price > 0 && trade.shares > 0) {
        paid += trade.price * trade.shares;
        shares += trade.shares;
      }
    } else {
      totals.sells += 1;
      totals.sold += trade.value ?? 0;
      sellers.add(who);
      if (trade.plan_10b5_1) totals.planSells += 1;
    }
  }
  totals.buyers = buyers.size;
  totals.sellers = sellers.size;
  totals.avgBuyPrice = shares > 0 ? paid / shares : null;
  return totals;
}

/** "$1.2M", "$840K", "$9,500". */
export function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs).toLocaleString("en-US")}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function buildInsiderPageRead(input: { ticker: string; trades: readonly InsiderTrade[]; price: number | null }): TheRead | null {
  const { ticker, trades } = input;
  if (trades.length === 0) return null;
  const totals = insiderTotals(trades);
  const net = totals.bought - totals.sold;
  const since = totals.first ? ` since ${longDay(totals.first)}` : "";

  let headline: string;
  if (totals.buys === 0) {
    headline = `Insiders sold ${usd(totals.sold)} of ${ticker} in ${plural(totals.sells, "trade")} and bought none${since}.`;
  } else if (totals.sells === 0) {
    headline = `Insiders bought ${usd(totals.bought)} of ${ticker} in ${plural(totals.buys, "trade")} and sold none${since}.`;
  } else {
    headline = `Insiders were net ${net >= 0 ? "buyers" : "sellers"} of ${ticker}${since}: ${usd(totals.bought)} bought against ${usd(totals.sold)} sold.`;
  }

  const clusters = clusterBuys(trades);
  const cluster = clusters[clusters.length - 1];
  const clusterInsight: Insight | null = cluster
    ? {
        id: "cluster",
        tone: "up",
        text: `${plural(cluster.insiders.length, "insider")} bought within 30 days (${longDay(cluster.first)} to ${longDay(cluster.last)}), ${usd(cluster.value)} in all.`,
      }
    : null;

  const largest = [...trades].filter((trade) => fin(trade.value)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  const largestInsight: Insight | null = largest
    ? {
        id: "largest",
        tone: largest.tx_type === "buy" ? "up" : "down",
        text: `The largest trade: ${largest.insider}${largest.role ? ` (${largest.role})` : ""} ${largest.tx_type === "buy" ? "bought" : "sold"} ${usd(largest.value!)} on ${longDay(largest.transaction_date)}${largest.plan_10b5_1 ? ", under a pre-set 10b5-1 plan" : ""}.`,
        action: largest.url ? { label: "Form 4", href: largest.url } : undefined,
      }
    : null;

  const planShare = sharePct(totals.planSells, totals.sells);
  const planInsight: Insight | null =
    totals.sells >= 3 && planShare !== null
      ? {
          id: "plans",
          tone: "flat",
          text: `${planShare}% of the ${totals.sells} sales were under pre-set 10b5-1 plans.`,
          soWhat: planShare >= 50 ? "Scheduled sales say little about what insiders think of the price." : "Most sales were not pre-scheduled.",
        }
      : null;

  // Form 4 prices are per reported share, which is not always the listed share (foreign filers
  // report ordinary shares behind an ADR). Compare only when every buy price is within 2x of today's.
  const buyPrices = trades.filter((trade) => trade.tx_type === "buy" && fin(trade.price) && trade.price > 0).map((trade) => trade.price as number);
  const comparable =
    fin(input.price) && input.price > 0 && buyPrices.length > 0 && buyPrices.every((price) => price >= input.price! / 2 && price <= input.price! * 2);
  const priceInsight: Insight | null =
    comparable && totals.avgBuyPrice !== null && fin(input.price) && input.price > 0
      ? {
          id: "price",
          tone: input.price >= totals.avgBuyPrice ? "up" : "down",
          text: `Insiders paid ${money(totals.avgBuyPrice)} a share on average; ${ticker} is at ${money(input.price)} now (${signedPct((input.price / totals.avgBuyPrice - 1) * 100)}).`,
        }
      : null;

  return {
    headline,
    insights: pickInsights([clusterInsight, priceInsight, largestInsight, planInsight], 3),
    // A filing day, not an instant: it goes in the source line, never through the read's time formatter.
    source: totals.last ? `SEC Form 4, open-market trades filed through ${longDay(totals.last)}` : "SEC Form 4, open-market trades",
  };
}
