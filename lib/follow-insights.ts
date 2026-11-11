/**
 * The read for the Follow surface (funds, Congress, insiders), computed with
 * plain rules from what the jobs store: 13F changes per fund, House trade
 * reports, Form 4 buys. Pure: the loaders in `lib/follow.ts` hand the rows in.
 *
 * Everything is grouped by stock first, because "which stocks are they
 * buying" is the question people bring here. An insight the data cannot back
 * is left out.
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import {
  fmtDate,
  fmtMonthYear,
  quarterLabel,
  type CongressProfile,
  type FundChanges,
  type FundProfile,
  type InsiderTrade,
  type PerfCard,
} from "@/lib/follow-shared";
import { shortCompanyName } from "@/lib/plain-copy";

// ── shapes the loaders produce ─────────────────────────────────────────────

export type FundMove = { ticker: string; name: string | null; weight: number | null };

/** One fund's latest 13F, reduced to the tickers it moved. */
export type FundDigest = {
  slug: string;
  name: string;
  period: string;
  filed_at: string;
  opened: FundMove[];
  added: FundMove[];
  reduced: FundMove[];
  exited: FundMove[];
};

/** One reported House trade, the fields the read needs. */
export type CongressTradeLite = {
  ticker: string;
  company: string;
  person_id: string;
  person_name: string;
  tx_type: "buy" | "sell";
  disclosure_date: string;
};

/** ticker -> sector, from the screener snapshot. */
export type SectorMap = Record<string, string | undefined>;

// ── formatting ─────────────────────────────────────────────────────────────

const MINUS = "−";

function pct(value: number, digits = 0): string {
  const percent = value * 100;
  if (percent > 0 && percent < 0.1) return "under 0.1%";
  // Small weights keep a decimal so a new 0.4% line does not read as 0%.
  return `${Number(percent.toFixed(percent < 1 ? Math.max(digits, 1) : digits))}%`;
}

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

function pts(value: number, digits = 1): string {
  return `${Math.abs(value * 100).toFixed(digits)} pts`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function sectorWord(sector: string): string {
  const lower = sector.toLowerCase();
  if (lower === "technology") return "tech";
  return lower;
}

/** Index funds and money-market lines are not a stock idea; keep them out of "most bought" lists. */
const NOT_A_STOCK = new Set(["SPY", "IVV", "VOO", "QQQ", "IWM", "DIA", "VTI", "EFA", "EEM", "GLD", "TLT", "IEF", "HYG", "LQD", "AGG", "BND"]);

function isStock(ticker: string | null | undefined): ticker is string {
  return Boolean(ticker && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker) && !NOT_A_STOCK.has(ticker));
}

function daysBefore(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// ── funds: who bought what ──────────────────────────────────────────────────

export type StockTally = {
  ticker: string;
  name: string | null;
  /** Distinct holders (funds, members or insiders) on each side. */
  buyers: { id: string; name: string; detail?: string }[];
  sellers: { id: string; name: string; detail?: string }[];
  /** Funds only: how many of the buyers opened a brand new position. */
  opened?: number;
  /** Insiders only: dollars bought. */
  value?: number;
};

/** The quarter most funds have filed for, so counts compare like with like. */
export function dominantPeriod(digests: FundDigest[]): string | null {
  const counts = new Map<string, number>();
  for (const digest of digests) if (digest.period) counts.set(digest.period, (counts.get(digest.period) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [period, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && period > best)) {
      best = period;
      bestCount = count;
    }
  }
  return best;
}

/** Per stock: how many funds bought or added, and how many trimmed or exited, in one quarter's filings. */
export function tallyFundMoves(digests: FundDigest[], period: string | null): StockTally[] {
  const byTicker = new Map<string, StockTally>();
  const get = (move: FundMove) => {
    let row = byTicker.get(move.ticker);
    if (!row) {
      row = { ticker: move.ticker, name: move.name, buyers: [], sellers: [], opened: 0 };
      byTicker.set(move.ticker, row);
    }
    if (!row.name && move.name) row.name = move.name;
    return row;
  };
  for (const digest of digests) {
    if (period && digest.period !== period) continue;
    const seen = new Set<string>();
    const mark = (moves: FundMove[], side: "buy" | "sell", detail: string, opened = false) => {
      for (const move of moves) {
        if (!isStock(move.ticker)) continue;
        const key = `${side}:${move.ticker}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row = get(move);
        (side === "buy" ? row.buyers : row.sellers).push({ id: digest.slug, name: digest.name, detail });
        if (opened) row.opened = (row.opened ?? 0) + 1;
      }
    };
    mark(digest.opened, "buy", "new", true);
    mark(digest.added, "buy", "added");
    mark(digest.exited, "sell", "sold out");
    mark(digest.reduced, "sell", "trimmed");
  }
  return [...byTicker.values()];
}

export function mostBought(tallies: StockTally[], limit = 8): StockTally[] {
  return [...tallies]
    .filter((row) => row.buyers.length > 0)
    .sort((a, b) => b.buyers.length - a.buyers.length || a.sellers.length - b.sellers.length || a.ticker.localeCompare(b.ticker))
    .slice(0, limit);
}

export function mostSold(tallies: StockTally[], limit = 8): StockTally[] {
  return [...tallies]
    .filter((row) => row.sellers.length > 0)
    .sort((a, b) => b.sellers.length - a.sellers.length || a.buyers.length - b.buyers.length || a.ticker.localeCompare(b.ticker))
    .slice(0, limit);
}

// ── Congress: by stock and by sector ────────────────────────────────────────

/** Distinct members buying and selling each stock in reports filed on or after `since`. */
export function tallyCongress(trades: CongressTradeLite[], since: string): StockTally[] {
  const byTicker = new Map<string, StockTally>();
  for (const trade of trades) {
    if (!isStock(trade.ticker) || trade.disclosure_date < since) continue;
    let row = byTicker.get(trade.ticker);
    if (!row) {
      row = { ticker: trade.ticker, name: trade.company || null, buyers: [], sellers: [] };
      byTicker.set(trade.ticker, row);
    }
    const side = trade.tx_type === "buy" ? row.buyers : row.sellers;
    if (!side.some((member) => member.id === trade.person_id)) side.push({ id: trade.person_id, name: trade.person_name });
  }
  return [...byTicker.values()];
}

/** The sector the most distinct members bought into, with the stocks they bought there. */
export function congressSectorBuys(
  tallies: StockTally[],
  sectors: SectorMap,
): { sector: string; members: number; tickers: string[] } | null {
  const bySector = new Map<string, { members: Set<string>; tickers: Map<string, number> }>();
  for (const row of tallies) {
    const sector = sectors[row.ticker];
    if (!sector || row.buyers.length === 0) continue;
    let entry = bySector.get(sector);
    if (!entry) {
      entry = { members: new Set(), tickers: new Map() };
      bySector.set(sector, entry);
    }
    for (const buyer of row.buyers) entry.members.add(buyer.id);
    entry.tickers.set(row.ticker, row.buyers.length);
  }
  let best: { sector: string; members: number; tickers: string[] } | null = null;
  for (const [sector, entry] of bySector) {
    const members = entry.members.size;
    if (!best || members > best.members) {
      const tickers = [...entry.tickers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ticker]) => ticker);
      best = { sector, members, tickers };
    }
  }
  return best;
}

// ── insiders: how unusual is this ───────────────────────────────────────────

/** Open-market buys grouped by stock, newest window only. */
export function tallyInsiderBuys(buys: InsiderTrade[], since: string): StockTally[] {
  const byTicker = new Map<string, StockTally>();
  for (const trade of buys) {
    if (trade.tx_type !== "buy" || !isStock(trade.symbol) || trade.filed_at.slice(0, 10) < since) continue;
    let row = byTicker.get(trade.symbol);
    if (!row) {
      row = { ticker: trade.symbol, name: trade.company || null, buyers: [], sellers: [], value: 0 };
      byTicker.set(trade.symbol, row);
    }
    row.value = (row.value ?? 0) + (trade.value ?? 0);
    const id = trade.insider_id || trade.insider;
    if (!row.buyers.some((buyer) => buyer.id === id)) row.buyers.push({ id, name: trade.insider, detail: trade.role });
  }
  return [...byTicker.values()].sort(
    (a, b) => b.buyers.length - a.buyers.length || (b.value ?? 0) - (a.value ?? 0) || a.ticker.localeCompare(b.ticker),
  );
}

export type InsiderPace = {
  /** Buys filed in the recent window. */
  recent: number;
  /** Average buys per window of the same length before it. */
  normal: number;
  windowDays: number;
  baselineSince: string;
  /** Sector with the biggest jump against its own normal, when one stands out. */
  hotSector: { sector: string; recent: number; normal: number; tickers: string[] } | null;
};

/**
 * Buys in the last `windowDays` against the average for the same length of
 * time over the rest of the stored history. Null when there is less than two
 * windows of history to compare with.
 */
export function insiderPace(buys: InsiderTrade[], today: string, sectors: SectorMap, windowDays = 14): InsiderPace | null {
  const dated = buys.filter((trade) => trade.tx_type === "buy" && /^\d{4}-\d{2}-\d{2}/.test(trade.filed_at));
  if (dated.length === 0) return null;
  const cutoff = daysBefore(today, windowDays);
  const first = dated.reduce((min, trade) => (trade.filed_at.slice(0, 10) < min ? trade.filed_at.slice(0, 10) : min), today);
  const baselineDays = Math.round((Date.parse(`${cutoff}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
  if (baselineDays < windowDays * 2) return null;
  const windows = baselineDays / windowDays;
  const recentTrades = dated.filter((trade) => trade.filed_at.slice(0, 10) >= cutoff);
  const earlier = dated.filter((trade) => trade.filed_at.slice(0, 10) < cutoff);

  const sectorCounts = (trades: InsiderTrade[]) => {
    const out = new Map<string, { count: number; tickers: Map<string, number> }>();
    for (const trade of trades) {
      const sector = sectors[trade.symbol];
      if (!sector) continue;
      const entry = out.get(sector) ?? { count: 0, tickers: new Map<string, number>() };
      entry.count += 1;
      entry.tickers.set(trade.symbol, (entry.tickers.get(trade.symbol) ?? 0) + 1);
      out.set(sector, entry);
    }
    return out;
  };
  const recentBySector = sectorCounts(recentTrades);
  const earlierBySector = sectorCounts(earlier);
  let hotSector: InsiderPace["hotSector"] = null;
  let bestRatio = 0;
  for (const [sector, entry] of recentBySector) {
    // A real jump: at least four buys at two or more companies, at least twice the sector's own normal.
    if (entry.count < 4 || entry.tickers.size < 2) continue;
    const normal = (earlierBySector.get(sector)?.count ?? 0) / windows;
    const ratio = entry.count / Math.max(normal, 0.5);
    if (ratio >= 2 && ratio > bestRatio) {
      bestRatio = ratio;
      hotSector = {
        sector,
        recent: entry.count,
        normal,
        tickers: [...entry.tickers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ticker]) => ticker),
      };
    }
  }
  return { recent: recentTrades.length, normal: earlier.length / windows, windowDays, baselineSince: first, hotSector };
}

function rate(value: number): string {
  if (value < 1) return "under 1";
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function windowWords(days: number): string {
  return days === 7 ? "a week" : days === 14 ? "two weeks" : days === 30 ? "a month" : `${days} days`;
}

// ── insight builders ────────────────────────────────────────────────────────

export function fundCrowdInsight(tallies: StockTally[], fundsInPeriod: number, period: string | null): Insight | null {
  const buy = mostBought(tallies, 1)[0];
  if (!buy || buy.buyers.length < 3 || !period) return null;
  const sell = mostSold(tallies.filter((row) => row.ticker !== buy.ticker), 1)[0];
  const quarter = quarterLabel(period);
  const text =
    `In their ${quarter} reports, ${buy.buyers.length} of ${fundsInPeriod} funds bought or added to ${buy.ticker}, more than any other stock` +
    (sell && sell.sellers.length >= 3 ? `. ${sell.sellers.length} sold some or all of their ${sell.ticker}, more than any other stock.` : ".");
  const others = mostBought(tallies, 3)
    .slice(1)
    .filter((row) => row.buyers.length >= 3);
  return {
    id: "fund-crowd",
    tone: "up",
    text,
    soWhat: others.length > 0 ? `Next most bought: ${listWords(others.map((row) => `${row.ticker} (${row.buyers.length})`))}.` : undefined,
    tickers: [buy.ticker, ...(sell && sell.sellers.length >= 3 ? [sell.ticker] : []), ...others.map((row) => row.ticker)],
    action: { label: `Who bought ${buy.ticker}`, href: `/stock/${encodeURIComponent(buy.ticker)}#ownership` },
  };
}

export function congressInsight(tallies: StockTally[], sectors: SectorMap, days: number): Insight | null {
  let buys = 0;
  let sells = 0;
  const buyers = new Set<string>();
  for (const row of tallies) {
    buys += row.buyers.length;
    sells += row.sellers.length;
    for (const buyer of row.buyers) buyers.add(buyer.id);
  }
  if (buys + sells < 5) return null;
  const top = mostBought(tallies, 1)[0];
  const sector = congressSectorBuys(tallies, sectors);
  const balance =
    sells > buys * 1.5
      ? `Across all stocks they reported ${sells} sales and ${buys} buys`
      : buys > sells * 1.5
        ? `Across all stocks they reported ${buys} buys and ${sells} sales`
        : `Across all stocks buys and sales were close, ${buys} to ${sells}`;
  // Counts are member-and-stock pairs, so one member buying three stocks counts three times.
  const lead =
    sector && sector.members >= 3
      ? `${plural(sector.members, "member")} of Congress reported buying ${sectorWord(sector.sector)} stocks in the last ${days} days, more than any other sector`
      : top && top.buyers.length >= 2
        ? `${plural(top.buyers.length, "member")} of Congress disclosed buying ${top.ticker} in ${days} days, the most bought stock`
        : null;
  if (!lead) return null;
  const tickers = sector && sector.members >= 3 ? sector.tickers.slice(0, 4) : top ? [top.ticker] : [];
  return {
    id: "congress",
    tone: "up",
    text: `${lead}${tickers.length > 1 ? ` (${listWords(tickers.slice(0, 3))})` : ""}.`,
    soWhat: `${balance}.`,
    tickers,
    action: { label: "Congress trades", href: "/follow?tab=congress" },
  };
}

export function insiderInsight(pace: InsiderPace | null, tallies: StockTally[]): Insight | null {
  const conviction = tallies.find((row) => row.buyers.length >= 2) ?? null;
  if (pace?.hotSector) {
    const hot = pace.hotSector;
    return {
      id: "insider-sector",
      tone: "up",
      text: `Insider buying is unusually high in ${sectorWord(hot.sector)}: ${hot.recent} buys in ${windowWords(pace.windowDays)} against ${rate(hot.normal)} in a normal ${windowWords(pace.windowDays).replace(/^a /, "")} since ${fmtDate(pace.baselineSince, false)}.`,
      soWhat: hot.tickers.length > 0 ? `Mostly ${listWords(hot.tickers.slice(0, 3))}.` : undefined,
      tickers: hot.tickers.slice(0, 4),
      action: { label: "Insider buys", href: "/insiders" },
    };
  }
  if (pace && pace.normal > 0) {
    const change = pace.recent / pace.normal - 1;
    if (Math.abs(change) >= 0.25) {
      const words = change > 0 ? "busier than usual" : "quieter than usual";
      return {
        id: "insider-pace",
        tone: toneOfChange(change),
        text: `Insider buying is ${words}: ${plural(pace.recent, "open-market buy")} in ${windowWords(pace.windowDays)} against ${rate(pace.normal)} in a normal stretch since ${fmtDate(pace.baselineSince, false)}.`,
        soWhat: conviction ? `${conviction.ticker} drew the most: ${plural(conviction.buyers.length, "insider")} bought.` : undefined,
        tickers: conviction ? [conviction.ticker] : undefined,
        action: { label: "Insider buys", href: "/insiders" },
      };
    }
  }
  if (conviction) {
    return {
      id: "insider-conviction",
      tone: "up",
      text: `${plural(conviction.buyers.length, "insider")} at ${conviction.name ?? conviction.ticker} bought ${conviction.ticker} with their own money, the most of any company in ${windowWords(pace?.windowDays ?? 14)}.`,
      tickers: [conviction.ticker],
      action: { label: "Insider buys", href: "/insiders" },
    };
  }
  return null;
}

/** For a signed-in reader: what funds did with the stocks they track. */
export function yourStocksInsight(tallies: StockTally[], mine: string[], period: string | null): Insight | null {
  if (mine.length === 0 || !period) return null;
  const set = new Set(mine.map((ticker) => ticker.toUpperCase()));
  const yours = tallies.filter((row) => set.has(row.ticker));
  const net = (row: StockTally) => row.buyers.length - row.sellers.length;
  const bought = [...yours].filter((row) => net(row) >= 2).sort((a, b) => net(b) - net(a) || a.ticker.localeCompare(b.ticker));
  const sold = [...yours].filter((row) => net(row) <= -2).sort((a, b) => net(a) - net(b) || a.ticker.localeCompare(b.ticker));
  if (bought.length === 0 && sold.length === 0) return null;
  const part = (row: StockTally) => `${row.ticker} (${row.buyers.length} bought, ${row.sellers.length} cut)`;
  const pieces: string[] = [];
  if (bought[0]) pieces.push(`net buyers of ${listWords(bought.slice(0, 2).map(part))}`);
  if (sold[0]) pieces.push(`net sellers of ${listWords(sold.slice(0, 2).map(part))}`);
  return {
    id: "your-stocks",
    tone: bought.length >= sold.length ? "up" : "down",
    text: `Of the ${plural(set.size, "stock")} you track, funds were ${pieces.join(" and ")} in ${quarterLabel(period)}.`,
    tickers: [...bought.slice(0, 2), ...sold.slice(0, 2)].map((row) => row.ticker),
    action: { label: "Your portfolio", href: "/watchlist" },
  };
}

export type FollowReadInput = {
  digests: FundDigest[];
  totalFunds: number;
  congress: CongressTradeLite[];
  insiderBuys: InsiderTrade[];
  sectors: SectorMap;
  today: string;
  mine?: string[];
  congressDays?: number;
};

export type FollowRead = TheRead & {
  fundPeriod: string | null;
  fundsInPeriod: number;
  fundTallies: StockTally[];
  congressTallies: StockTally[];
  insiderTallies: StockTally[];
};

export function buildFollowRead(input: FollowReadInput): FollowRead {
  const congressDays = input.congressDays ?? 30;
  const period = dominantPeriod(input.digests);
  const fundsInPeriod = input.digests.filter((digest) => digest.period === period).length;
  const fundTallies = tallyFundMoves(input.digests, period);
  const congressTallies = tallyCongress(input.congress, daysBefore(input.today, congressDays));
  const insiderTallies = tallyInsiderBuys(input.insiderBuys, daysBefore(input.today, 14));
  const pace = insiderPace(input.insiderBuys, input.today, input.sectors);

  const fund = fundCrowdInsight(fundTallies, fundsInPeriod, period);
  const congress = congressInsight(congressTallies, input.sectors, congressDays);
  const insider = insiderInsight(pace, insiderTallies);
  const yours = yourStocksInsight(fundTallies, input.mine ?? [], period);

  const top = mostBought(fundTallies, 2).filter((row) => row.buyers.length >= 3);
  let headline = "";
  if (top.length > 0) {
    // One stock leads; a runner-up is named as second, so the counts below never contradict the headline.
    const tied = top[1] !== undefined && top[1].buyers.length === top[0]!.buyers.length;
    headline = tied
      ? `More funds bought ${top[0]!.ticker} and ${top[1]!.ticker} than any other stock in ${quarterLabel(period)}`
      : `More funds bought ${top[0]!.ticker} than any other stock in ${quarterLabel(period)}${top[1] ? `, with ${top[1].ticker} second` : ""}`;
    let buys = 0;
    let sells = 0;
    for (const row of congressTallies) {
      buys += row.buyers.length;
      sells += row.sellers.length;
    }
    headline += ".";
    if (congress && sells > buys * 1.5) headline += " Members of Congress sold more than they bought.";
    else if (congress && buys > sells * 1.5) headline += " Members of Congress were buying too.";
  } else if (insider) {
    headline = insider.text.split(":")[0] + ".";
  }

  const insights = pickInsights(yours ? [yours, fund, congress] : [fund, congress, insider]);
  return {
    headline,
    insights,
    source:
      period && fundsInPeriod > 0
        ? `${plural(fundsInPeriod, "fund")} filed for ${quarterLabel(period)} of ${input.totalFunds} we follow; House reports and SEC Form 4`
        : "SEC 13F, House reports and SEC Form 4",
    fundPeriod: period,
    fundsInPeriod,
    fundTallies,
    congressTallies,
    insiderTallies,
  };
}

/** The read for /insiders: the pace against normal, the conviction buys, the buy-to-sell balance. */
export function buildInsiderRead(input: {
  buys: InsiderTrade[];
  recent: InsiderTrade[];
  sectors: SectorMap;
  today: string;
}): TheRead & { tallies: StockTally[] } {
  const tallies = tallyInsiderBuys(input.buys, daysBefore(input.today, 14));
  const pace = insiderPace(input.buys, input.today, input.sectors);
  const first = insiderInsight(pace, tallies);

  // The buy that matters most: several insiders at one company, else the largest by a chief executive or finance chief.
  const many = tallies.filter((row) => row.buyers.length >= 2 && row.ticker !== first?.tickers?.[0]).slice(0, 3);
  const multi: Insight | null =
    many.length > 0
      ? {
          id: "insider-multi",
          tone: "up",
          text: `More than one insider bought at ${listWords(many.map((row) => `${row.ticker} (${row.buyers.length})`))} in two weeks, the strongest kind of insider signal we track.`,
          tickers: many.map((row) => row.ticker),
          action: { label: `${many[0].ticker} insiders`, href: `/stock/${encodeURIComponent(many[0].ticker)}` },
        }
      : null;

  const chiefs = input.buys
    .filter((trade) => trade.filed_at.slice(0, 10) >= daysBefore(input.today, 14) && /chief|ceo|cfo|president/i.test(trade.role) && (trade.value ?? 0) > 0 && isStock(trade.symbol))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const chief = chiefs[0];
  const chiefInsight: Insight | null =
    chief && (chief.value ?? 0) >= 100_000
      ? {
          id: "insider-chief",
          tone: "up",
          text: `The biggest buy by a company boss in two weeks: ${chief.insider} (${chief.role}) put ${usd(chief.value ?? 0)} into ${chief.symbol} on ${fmtDate(chief.transaction_date, false)}.`,
          tickers: [chief.symbol],
          action: { label: `Open ${chief.symbol}`, href: `/stock/${encodeURIComponent(chief.symbol)}` },
        }
      : null;

  // Selling is the normal state; say how lopsided it is in dollars.
  const cutoff = daysBefore(input.today, 14);
  let buyValue = 0;
  let sellValue = 0;
  for (const trade of input.recent) {
    if (trade.filed_at.slice(0, 10) < cutoff) continue;
    if (trade.tx_type === "buy") buyValue += trade.value ?? 0;
    else if (!trade.plan_10b5_1) sellValue += trade.value ?? 0;
  }
  for (const trade of input.buys) if (trade.filed_at.slice(0, 10) >= cutoff && !input.recent.some((other) => other.id === trade.id)) buyValue += trade.value ?? 0;
  const balance: Insight | null =
    buyValue > 0 && sellValue > 0
      ? {
          id: "insider-balance",
          tone: sellValue > buyValue ? "down" : "up",
          text:
            sellValue > buyValue
              ? `Insiders sold ${usd(sellValue)} outside pre-set plans in two weeks and bought ${usd(buyValue)}, ${Math.round(sellValue / buyValue)} dollars sold for every one bought.`
              : `Insiders bought ${usd(buyValue)} in two weeks and sold ${usd(sellValue)} outside pre-set plans.`,
          soWhat: sellValue > buyValue ? "Selling is normal (pay, taxes, diversifying); buying is the rarer tell." : undefined,
        }
      : null;

  const insights = pickInsights([first, multi ?? chiefInsight, balance]);
  const lead = many[0] ?? tallies.find((row) => row.buyers.length >= 2) ?? null;
  const parts: string[] = [];
  if (pace?.hotSector) parts.push(`${sectorWord(pace.hotSector.sector).replace(/^./, (c) => c.toUpperCase())} insiders are buying at an unusual pace`);
  else if (first?.id === "insider-pace") parts.push(first.text.split(":")[0]);
  if (lead) parts.push(`${plural(lead.buyers.length, "insider")} bought ${lead.ticker} in two weeks`);
  const headline = parts.length > 0 ? `${parts.join("; ")}.` : "";
  return { headline, insights, source: "SEC Form 4, open-market trades", tallies };
}

function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

// ── one fund, one member ────────────────────────────────────────────────────

function recordInsight(card: PerfCard | null, who: string, what: string): Insight | null {
  if (!card) return null;
  const mine = card.fund.annualized;
  const spy = card.spy.annualized;
  const since = fmtDate(card.start_date);
  if (mine == null || spy == null) {
    const total = card.fund.r_since;
    const spyTotal = card.spy.r_since;
    if (total == null || spyTotal == null) return null;
    const gap = total - spyTotal;
    return {
      id: "record",
      tone: toneOfChange(gap, 0.005),
      text: `Copying ${who}'s ${what} from each filing date since ${since} returned ${signedPct(total)} against ${signedPct(spyTotal)} for the S&P 500.`,
      soWhat: "Hypothetical, measured from filing dates.",
    };
  }
  const gap = mine - spy;
  const dd = card.fund.max_drawdown;
  const spyDd = card.spy.max_drawdown;
  return {
    id: "record",
    tone: toneOfChange(gap, 0.005),
    text: `Since ${since}, copying ${who}'s ${what} from each filing date ${gap >= 0 ? "beat" : "trailed"} the S&P 500 by ${pts(gap)} a year (${signedPct(mine)} against ${signedPct(spy)}).`,
    soWhat:
      dd != null && spyDd != null
        ? `Worst drop ${signedPct(dd, 0)} against ${signedPct(spyDd, 0)} for the S&P. Hypothetical, before costs.`
        : "Hypothetical, before costs.",
  };
}

export function buildFundRead(profile: FundProfile): TheRead {
  const short = profile.fund.replace(/\s+(Capital|Management|Associates|Group|Partners|LP|L\.P\.|Holdings|Investments|Advisors)(\s.*)?$/i, "") || profile.fund;
  const stocks = profile.portfolio.filter((position) => isStock(position.ticker) && position.weight != null);
  const top3 = stocks.slice(0, 3);
  const topWeight = top3.reduce((sum, position) => sum + (position.weight ?? 0), 0);
  const concentration: Insight | null =
    top3.length === 3 && topWeight > 0
      ? {
          id: "concentration",
          tone: "flat",
          text:
            topWeight >= 0.4
              ? `${short} is ${pct(topWeight)} in three stocks: ${listWords(top3.map((position) => `${position.ticker} ${pct(position.weight ?? 0)}`))}.`
              : profile.latest.stock_positions >= 50 && topWeight < 0.2
                ? `${short} spreads its money widely: its top three stocks (${listWords(top3.map((position) => position.ticker!))}) are only ${pct(topWeight)} of ${plural(profile.latest.stock_positions, "holding")}.`
                : `Its three biggest holdings, ${listWords(top3.map((position) => `${position.ticker} ${pct(position.weight ?? 0)}`))}, make up ${pct(topWeight)} of the stocks it owns.`,
          tickers: top3.map((position) => position.ticker!),
          action: { label: "Full portfolio", href: "#portfolio" },
        }
      : null;

  const changes = profile.changes;
  let moves: Insight | null = null;
  let movesShort = "";
  if (changes) {
    type Line = { ticker: string; name: string; weight: number | null; prev: number | null };
    const lines = (list: FundChanges[keyof Omit<FundChanges, "counts">]): Line[] =>
      list
        .filter((row) => isStock(row.ticker))
        .map((row) => ({ ticker: row.ticker as string, name: shortCompanyName(row.name) || (row.ticker as string), weight: row.weight ?? null, prev: row.prev_weight ?? null }));
    const byNow = (a: Line, b: Line) => (b.weight ?? 0) - (a.weight ?? 0);
    const byBefore = (a: Line, b: Line) => (b.prev ?? 0) - (a.prev ?? 0);
    // A cut matters by how much weight it took off, not by how big the line was.
    const byDrop = (a: Line, b: Line) => (b.prev ?? 0) - (b.weight ?? 0) - ((a.prev ?? 0) - (a.weight ?? 0));
    const opened = lines(changes.new).sort(byNow).slice(0, 2);
    const added = lines(changes.added).sort(byNow).slice(0, 1);
    const exited = lines(changes.sold).sort(byBefore).slice(0, 1);
    const reduced = lines(changes.reduced).sort(byDrop).slice(0, exited.length > 0 ? 1 : 2);
    const parts: string[] = [];
    if (opened.length > 0) parts.push(`opened ${listWords(opened.map((row) => `${row.ticker} (${pct(row.weight ?? 0, 1)})`))}`);
    if (added[0]) parts.push(`added to ${added[0].ticker} (now ${pct(added[0].weight ?? 0)})`);
    if (reduced.length > 0) parts.push(`cut ${listWords(reduced.map((row) => `${row.ticker} to ${pct(row.weight ?? 0, 1)}`))}`);
    if (exited[0]) parts.push(`sold out of ${exited[0].ticker}`);
    // The headline leads with the moves that changed the fund: a new line under half a percent is
    // real but tiny, so it trails the sentence instead of opening it.
    const shortParts: string[] = [];
    const bought = [...opened, ...added].map((row) => row.ticker);
    const sold = [...reduced, ...exited].map((row) => row.ticker);
    const bigOpened = opened.filter((row) => (row.weight ?? 0) >= 0.005);
    const tinyOpened = opened.filter((row) => (row.weight ?? 0) < 0.005);
    if (bigOpened.length > 0) shortParts.push(`bought ${listWords(bigOpened.map((row) => row.name))}`);
    if (added.length > 0) shortParts.push(`added to ${listWords(added.map((row) => row.name))}`);
    if (reduced.length > 0) shortParts.push(`cut ${listWords(reduced.map((row) => row.name))}`);
    if (exited.length > 0) shortParts.push(`sold all of ${listWords(exited.map((row) => row.name))}`);
    movesShort = listWords(shortParts);
    if (tinyOpened.length > 0) {
      const tiny = `a small new stake in ${listWords(tinyOpened.map((row) => row.name))}`;
      movesShort = movesShort ? `${movesShort} in ${profile.latest.quarter}, and opened ${tiny}` : `opened ${tiny}`;
    }
    if (parts.length > 0) {
      const buys = changes.counts.new + changes.counts.added;
      const sells = changes.counts.reduced + changes.counts.sold;
      moves = {
        id: "moves",
        tone: buys > sells ? "up" : sells > buys ? "down" : "flat",
        text: `In ${profile.latest.quarter} it ${listWords(parts)}.`,
        soWhat: `In all it bought or added to ${plural(buys, "stock")} and cut or sold ${sells}.`,
        tickers: [...bought, ...sold].filter((ticker, index, all) => all.indexOf(ticker) === index),
        action: { label: "What changed", href: "#changes" },
      };
    }
  }

  const record = recordInsight(profile.performance, short, "stock picks");
  const headline = movesShort
    ? movesShort.includes(` in ${profile.latest.quarter}`)
      ? `${short} ${movesShort}.`
      : `${short} ${movesShort} in ${profile.latest.quarter}.`
    : concentration?.text ?? "";
  return {
    headline,
    insights: pickInsights([concentration, moves, record]),
    source: `From its quarterly report (13F), filed ${fmtDate(profile.latest.filed_at)}, showing holdings on ${fmtDate(profile.latest.period)}`,
  };
}

export function buildCongressMemberRead(profile: CongressProfile): TheRead {
  const stats = profile.stats;
  const counts = new Map<string, { buys: number; sells: number; company: string }>();
  for (const trade of profile.trades) {
    if (!isStock(trade.ticker)) continue;
    const entry = counts.get(trade.ticker) ?? { buys: 0, sells: 0, company: trade.company };
    if (trade.tx_type === "buy") entry.buys += 1;
    else entry.sells += 1;
    counts.set(trade.ticker, entry);
  }
  const traded = [...counts.entries()].sort((a, b) => b[1].buys + b[1].sells - (a[1].buys + a[1].sells) || a[0].localeCompare(b[0]));
  const favourite: Insight | null =
    traded.length > 0 && traded[0][1].buys + traded[0][1].sells >= 2
      ? {
          id: "favourite",
          tone: traded[0][1].buys >= traded[0][1].sells ? "up" : "down",
          text: `${traded[0][0]} is the stock ${profile.name} trades most: ${plural(traded[0][1].buys, "buy")} and ${plural(traded[0][1].sells, "sale")} in the latest ${plural(profile.trades.length, "reported trade")}.`,
          soWhat:
            traded.length > 1 ? `Then ${listWords(traded.slice(1, 3).map(([ticker, entry]) => `${ticker} (${entry.buys + entry.sells})`))}.` : undefined,
          tickers: traded.slice(0, 3).map(([ticker]) => ticker),
          action: { label: "Reported trades", href: "#trades" },
        }
      : null;

  const lean: Insight | null =
    stats.trades >= 3
      ? {
          id: "lean",
          tone: stats.buys > stats.sells ? "up" : stats.sells > stats.buys ? "down" : "flat",
          text:
            stats.buys === 0
              ? `Every one of ${profile.name}'s ${plural(stats.trades, "reported trade")} is a sale.`
              : stats.sells === 0
                ? `Every one of ${profile.name}'s ${plural(stats.trades, "reported trade")} is a buy.`
                : `${profile.name} ${stats.buys > stats.sells ? "buys more than sells" : stats.sells > stats.buys ? "sells more than buys" : "buys and sells about evenly"}: ${stats.buys} buys and ${stats.sells} sales since ${fmtDate(profile.first_report)}.`,
          soWhat:
            stats.median_lag_days != null
              ? `A typical trade reaches the public ${plural(stats.median_lag_days, "day")} after it happens${stats.late_trades > 0 ? `; ${stats.late_trades} came in past the 45-day limit` : ""}.`
              : undefined,
          tickers: stats.top_bought.map((chip) => chip.ticker).filter(isStock).slice(0, 3),
        }
      : null;

  const record = recordInsight(profile.performance, profile.name, "reported buys");
  const perf = profile.performance;
  const gap = perf && perf.fund.annualized != null && perf.spy.annualized != null ? perf.fund.annualized - perf.spy.annualized : null;
  const headline =
    perf && gap !== null
      ? `Copying ${profile.name}'s buys ${gap >= 0 ? "beat" : "trailed"} the S&P 500 by ${pts(gap)} a year since ${fmtMonthYear(perf.start_date)}.`
      : favourite?.text ?? lean?.text ?? "";
  return {
    headline,
    insights: pickInsights([favourite, lean, record]),
    source: `House reports, latest filed ${fmtDate(profile.latest_date)}`,
  };
}
