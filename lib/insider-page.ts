import type { InsiderTrade } from "@/lib/follow-shared";
import { fin } from "@/lib/insight-format";

/**
 * Totals for a per-stock insider page (/insiders/[ticker]) and the memo, from
 * the open-market Form 4 trades we hold for the stock: how much was bought and
 * sold, by how many insiders, how much of the selling was pre-scheduled, and
 * the average price insiders paid.
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
