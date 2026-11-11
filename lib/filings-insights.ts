/**
 * The read at the top of /filings: what the week's SEC paperwork says about
 * companies, not a count of forms. Insider buying and selling (Form 4),
 * leadership changes (8-K item 5.02), activist-style stakes (13D) and the
 * person's own stocks, each against the week before. Plain rules only.
 */
import type { Filing } from "@/lib/filings-shared";
import type { InsiderTrade } from "@/lib/follow-shared";
import { balanceWindow, filingDay as tradeDay, insiderBalance, mergeTrades, nyDay as etDay, shiftDay, type InsiderBalance } from "@/lib/insider-balance";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { compactMoney, countWord, isNum, listNames, plural } from "@/lib/read-format";

/** [from, to] of the last 7 days ending today (New York), and the 7 before. The same window /insiders quotes. */
export function weekWindows(now: number): { thisWeek: [string, string]; lastWeek: [string, string] } {
  const thisWeek = balanceWindow(now, 7);
  return { thisWeek, lastWeek: [shiftDay(thisWeek[0], -7), shiftDay(thisWeek[0], -1)] };
}

function inWindow(day: string, [from, to]: [string, string]): boolean {
  return day >= from && day <= to;
}

const CEO = /\bceo\b|chief executive/i;

function byValue(trades: InsiderTrade[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const trade of trades) out.set(trade.symbol, (out.get(trade.symbol) ?? 0) + (trade.value ?? 0));
  return out;
}

function topSymbols(trades: InsiderTrade[], max = 3): string[] {
  return [...byValue(trades).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([symbol]) => symbol);
}

export type InsiderWeek = { value: number; companies: number; ceos: string[]; trades: InsiderTrade[] };

export function insiderWeek(trades: InsiderTrade[], side: "buy" | "sell", window: [string, string]): InsiderWeek {
  const rows = trades.filter((trade) => trade.tx_type === side && isNum(trade.value) && trade.value > 0 && inWindow(tradeDay(trade), window));
  const ceos = [...new Set(rows.filter((trade) => CEO.test(trade.role)).map((trade) => trade.symbol))];
  return { value: rows.reduce((sum, trade) => sum + (trade.value ?? 0), 0), companies: new Set(rows.map((trade) => trade.symbol)).size, ceos, trades: rows };
}

/**
 * The largest 7-day buying total in the history we hold, counted in whole
 * weeks back from today, and how many weeks that covers.
 */
function bestWeek(trades: InsiderTrade[], now: number): { value: number; weeks: number; since: string | null } {
  const buys = trades.filter((trade) => trade.tx_type === "buy" && isNum(trade.value));
  if (buys.length === 0) return { value: 0, weeks: 0, since: null };
  const earliest = buys.reduce((min, trade) => (tradeDay(trade) < min ? tradeDay(trade) : min), tradeDay(buys[0]!));
  const today = etDay(now);
  let best = 0;
  let weeks = 0;
  for (let end = shiftDay(today, -7); end >= shiftDay(earliest, 6); end = shiftDay(end, -7)) {
    weeks += 1;
    best = Math.max(best, insiderWeek(buys, "buy", [shiftDay(end, -6), end]).value);
  }
  return { value: best, weeks, since: earliest };
}

function buyingInsight(buys: InsiderTrade[], now: number): Insight | null {
  const { thisWeek, lastWeek } = weekWindows(now);
  const week = insiderWeek(buys, "buy", thisWeek);
  if (week.trades.length === 0) return null;
  const before = insiderWeek(buys, "buy", lastWeek);
  const record = bestWeek(buys, now);
  const versus =
    record.weeks >= 4 && week.value > record.value
      ? `, the most in any week since ${monthDay(record.since!)}`
      : before.value > 0
        ? `, ${week.value >= before.value ? "up" : "down"} from ${compactMoney(before.value)} the week before`
        : "";
  const ceoText = week.ceos.length ? ` ${week.ceos.length === 1 ? "One buyer was a CEO" : `${countWord(week.ceos.length)} buyers were CEOs`} (${listNames(week.ceos)}).` : "";
  const top = topSymbols(week.trades);
  return {
    id: "insider-buys",
    tone: "up",
    text: `Insiders bought ${compactMoney(week.value)} of their own stock across ${plural(week.companies, "company", "companies")} in the last 7 days${versus}; the biggest buys were in ${listNames(top)}.${ceoText}`,
    soWhat: "Insiders sell for many reasons but buy for one.",
    // Only stocks the sentence names, so no chip shows up unexplained.
    tickers: [...new Set([...top, ...week.ceos.slice(0, 3)])],
    action: { label: "See the buys", href: "/insiders" },
  };
}

function sellingInsight(trades: InsiderTrade[], balance: InsiderBalance | null, now: number): Insight | null {
  if (!balance || balance.sold < 1_000_000) return null;
  const sells = insiderWeek(trades, "sell", weekWindows(now).thisWeek);
  const unplanned = sells.trades.filter((trade) => !trade.plan_10b5_1);
  const top = topSymbols(unplanned.length ? unplanned : sells.trades, 3);
  const ratio = balance.ratio;
  return {
    id: "insider-sells",
    tone: "down",
    text: `Insiders sold ${compactMoney(balance.sold)} across ${plural(balance.sellCompanies, "company", "companies")} in the last ${balance.days} days${ratio !== null && ratio >= 2 ? `, ${ratio} dollars sold for every dollar bought` : ""}; ${balance.plannedPct ?? 0}% of it was pre-scheduled. The biggest unscheduled sellers: ${listNames(top)}.`,
    tickers: top,
    action: { label: "See the sales", href: "/insiders" },
  };
}

function monthDay(day: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function filingDayOf(filing: Pick<Filing, "filedAt">): string {
  return etDay(Date.parse(filing.filedAt));
}

function hasItem(filing: Filing, code: string): boolean {
  return filing.items.some((item) => item.code === code);
}

function companies(filings: Filing[]): string[] {
  return [...new Set(filings.map((filing) => filing.ticker))];
}

function leadershipInsight(stream: Filing[], now: number): Insight | null {
  const { thisWeek, lastWeek } = weekWindows(now);
  const changes = stream.filter((filing) => filing.group === "8-K" && hasItem(filing, "5.02"));
  const week = companies(changes.filter((filing) => inWindow(filingDayOf(filing), thisWeek)));
  if (week.length < 2) return null;
  const before = companies(changes.filter((filing) => inWindow(filingDayOf(filing), lastWeek))).length;
  const versus = before > 0 ? `, against ${before} the week before` : "";
  return {
    id: "leadership",
    tone: "flat",
    text: `${week.length} companies reported a director or executive change in the last 7 days${versus}: ${listNames(week, 4)}.`,
    soWhat: "A sudden CEO or CFO exit is the one to read first.",
    tickers: week.slice(0, 4),
    action: { label: "Open the 8-Ks", href: "/filings?form=8-K" },
  };
}

function activistInsight(stream: Filing[], now: number): Insight | null {
  const { thisWeek } = weekWindows(now);
  const active = stream.filter((filing) => filing.group === "13D/G" && /13D/i.test(filing.form) && inWindow(filingDayOf(filing), thisWeek));
  const fresh = active.filter((filing) => !filing.amendment);
  const names = companies(fresh.length ? fresh : active);
  if (names.length === 0) return null;
  return {
    id: "activist",
    tone: "flat",
    text: `${plural(names.length, "company", "companies")} got ${fresh.length ? "a new" : "an updated"} 13D in the last 7 days, the filing a holder of 5% or more uses when it may push for change: ${listNames(names, 4)}.`,
    tickers: names.slice(0, 4),
    action: { label: "Open the 13Ds", href: "/filings?form=13DG" },
  };
}

/** How much a filing tends to matter to a holder: a new activist stake or a leadership change before a routine quarterly report. */
export function weight(filing: Filing): number {
  if (filing.group === "13D/G") return /13D/i.test(filing.form) ? 9 : 1;
  if (filing.group === "8-K") {
    const codes = filing.items.map((item) => item.code);
    if (codes.includes("5.02")) return 8;
    if (codes.includes("2.01") || codes.includes("1.01")) return 7;
    if (codes.includes("2.02")) return 6;
    if (codes.includes("2.03")) return 5;
    return 3;
  }
  if (filing.group === "S-1") return 6;
  return 2;
}

function mineInsight(stream: Filing[], mine: Set<string> | null, now: number): Insight | null {
  if (!mine || mine.size === 0) return null;
  const { thisWeek } = weekWindows(now);
  const own = stream.filter((filing) => mine.has(filing.ticker) && inWindow(filingDayOf(filing), thisWeek));
  if (own.length === 0) return null;
  // The filing that says the most about each company, then the companies with the weightiest news first.
  const firstPer = new Map<string, Filing>();
  for (const filing of [...own].sort((a, b) => weight(b) - weight(a) || (a.filedAt < b.filedAt ? 1 : -1))) if (!firstPer.has(filing.ticker)) firstPer.set(filing.ticker, filing);
  const shown = [...firstPer.values()].slice(0, 3);
  const lines = shown.map((filing) => `${filing.ticker} (${lowerFirst((filing.headline || filing.form).replace(/, amended$/, ""))})`);
  return {
    id: "mine",
    tone: "flat",
    text: `${firstPer.size === 1 ? "One of your stocks" : `${countWord(firstPer.size)} of your stocks`} filed in the last 7 days: ${listNames(lines)}.`,
    tickers: shown.map((filing) => filing.ticker),
    action: { label: "Only my stocks", href: "/filings?mine=1" },
  };
}

export function buildFilingsRead(input: {
  stream: Filing[];
  trades: InsiderTrade[];
  buys: InsiderTrade[];
  mine: Set<string> | null;
  now: number;
  asOf?: string | null;
  /** Rows `trades` was asked for (INSIDER_TRADE_ROWS), so a list that stops inside the week is not counted as the week. */
  tradesLimit?: number;
}): TheRead | null {
  const { stream, trades, buys, mine, now } = input;
  // Buys come from their own query (they are rare next to sales); merge so the counts see both.
  const allTrades = mergeTrades(buys, trades);
  const { thisWeek } = weekWindows(now);
  // The same helper and window /insiders quotes, so the two pages never disagree on the balance.
  const balance = insiderBalance({ trades, buys, now, days: 7, tradesLimit: input.tradesLimit });
  const results = companies(stream.filter((filing) => filing.group === "8-K" && hasItem(filing, "2.02") && inWindow(filingDayOf(filing), thisWeek))).length;

  const parts: string[] = [];
  if (balance && (balance.bought > 0 || balance.sold > 0)) {
    const { bought, sold } = balance;
    parts.push(
      bought > 0 && sold > 0
        ? sold >= bought * 2
          ? `Insiders sold ${balance.ratio}x what they bought in the last 7 days`
          : bought >= sold
            ? `Insiders bought more than they sold in the last 7 days`
            : `Insiders sold ${compactMoney(sold)} and bought ${compactMoney(bought)} in the last 7 days`
        : bought > 0
          ? `Insiders bought ${compactMoney(bought)} in the last 7 days`
          : `Insiders sold ${compactMoney(sold)} in the last 7 days`,
    );
  }
  if (results > 0) parts.push(`${plural(results, "company", "companies")} filed quarterly results`);
  if (parts.length === 0) return null;
  const headline = `${parts.join("; ")}.`;

  return {
    headline,
    insights: pickInsights([mineInsight(stream, mine, now), buyingInsight(allTrades, now), sellingInsight(allTrades, balance, now), leadershipInsight(stream, now), activistInsight(stream, now)]),
    asOf: input.asOf ?? null,
  };
}
