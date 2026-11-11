/**
 * Copy the smart money, tested: types and pure helpers.
 *
 * The records are computed by `backend/agentdata/copy_trades.py` into
 * `tm_copy_trades/{slug}` (one per fund or House member) and
 * `tm_copy_trades_meta/hub` (the ranked rows). Nothing here touches the
 * store, so client components and tests can import it; the loaders live in
 * `lib/copy-trades.ts`.
 */

import { fmtDate, fmtFrac, fmtMonthYear, partyLabel } from "@/lib/follow-shared";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { shortCompanyName } from "@/lib/plain-copy";

export type CopyKind = "fund" | "congress";

/** Fractions (0.12 is +12%). `end_value` is what $10,000 became. */
export type CopyStats = {
  end_value: number;
  total: number | null;
  annualized: number | null;
  max_drawdown: number | null;
  drawdown_peak: string | null;
  drawdown_trough: string | null;
};

export type CopyPosition = {
  ticker: string;
  name: string;
  /** Dollars this stock made or lost for a $10,000 copy. */
  pnl: number;
  /** The stock's own move over the days the copy held it (all stints compounded). */
  return: number | null;
  first: string;
  last: string | null;
  held: boolean;
  days: number;
};

export type CopyYear = {
  year: number;
  /** Set when the record starts inside this year. */
  from: string | null;
  /** Set when the record stops inside this year. */
  to: string | null;
  /** Copy, S&P 500 and (when present) the no-trading comparison, in `curve_columns` order after the date. */
  values: Array<number | null>;
};

export type CopyTrades = {
  buys: number;
  sells: number;
  resized: number;
  rebalances: number;
  skipped_trades: number;
  ignored_sales: number;
  turnover_per_year: number | null;
};

export type CopyCoverage = {
  priced: number;
  skipped: number;
  skipped_examples: string[];
  /** Funds: the average share of their stock portfolio the copy could buy. */
  weight_avg: number | null;
  weight_min: number | null;
  /** Share of trading days with nothing held. */
  cash_share: number | null;
};

type CopyBase = {
  slug: string;
  kind: CopyKind;
  name: string;
  person: string;
  party?: string;
  state?: string;
  district?: string;
  active?: boolean;
  rule: string;
  caveat: string;
  hold_label: string;
  eligible: boolean;
  not_ranked_because: string | null;
  /** Why it is not ranked: the record ended, it is too short, or too little of it could be copied. */
  not_ranked_group?: NotRankedGroup | null;
  rank?: number | null;
  updated_at: string;
  reported_trades?: number;
};

export type NotRankedGroup = "ended" | "short" | "untested";

export type CopyRecordEmpty = CopyBase & { empty: true; start_date: null; end_date: null };

export type CopyRecordFull = CopyBase & {
  empty?: false;
  start_date: string;
  end_date: string;
  ended: boolean;
  /** Ended more than about three months before the last close: said wherever the record is quoted. */
  stopped?: boolean;
  /** The last close the test was run to. */
  price_as_of?: string;
  sessions: number;
  years: number;
  start_value: number;
  copy: CopyStats;
  spy: CopyStats;
  hold: CopyStats | null;
  /** Rows of [date, copy, spy, hold?], each starting at 1. */
  curve: Array<[string, number, number, number?]>;
  curve_columns: string[];
  yearly: CopyYear[];
  trades: CopyTrades;
  positions_count: number;
  best: CopyPosition[];
  worst: CopyPosition[];
  held_now: number;
  coverage: CopyCoverage;
  excess_per_year: number | null;
  price_source: string;
  benchmark: string;
  filings?: number;
  first_filing?: string;
  last_filing?: string;
  first_report?: string;
  last_report?: string;
};

export type CopyRecord = CopyRecordEmpty | CopyRecordFull;

export type CopyHubRow = {
  slug: string;
  kind: CopyKind;
  name: string;
  person: string;
  party?: string;
  state?: string;
  district?: string;
  active?: boolean;
  start_date: string | null;
  end_date: string | null;
  ended?: boolean;
  stopped?: boolean;
  /** Trading days in the record; missing on an empty one. */
  sessions?: number | null;
  eligible: boolean;
  not_ranked_because: string | null;
  not_ranked_group?: NotRankedGroup | null;
  excess_per_year: number | null;
  years: number | null;
  copy_total: number | null;
  copy_annualized: number | null;
  spy_total: number | null;
  spy_annualized: number | null;
  max_drawdown: number | null;
  trades: number;
  best: CopyPosition | null;
  worst: CopyPosition | null;
  spark: number[];
  rank: number | null;
};

export type CopyHub = {
  generated_at: string;
  fund_start: string;
  price_as_of: string;
  rows: CopyHubRow[];
  funds: number;
  members: number;
  ranked_funds: number;
  ranked_members: number;
  fund_rule: string;
  fund_caveat: string;
  congress_rule: string;
  congress_caveat: string;
};

export const START_VALUE = 10_000;
export const COPY_HUB_PATH = "/follow/copy";
/** A record shorter than this (about six months of sessions) says too little to be worth a search result. */
export const INDEX_MIN_SESSIONS = 126;

const MINUS = "−";

/**
 * The biases, said once in plain words on every copy page and on the hub.
 * Funds and members differ only in the last clause: the funds were picked
 * with hindsight, the members are whoever reported trades.
 */
export const COPY_BIASES: Record<CopyKind, string> = {
  fund:
    "This is a test, not a real account, and it is before costs and taxes. Companies that were later delisted, bought out or have no ticker today are skipped, which flatters the result; options and short positions are left out; and these funds are today's well-known names, picked with hindsight.",
  congress:
    "This is a test, not a real account, and it is before costs and taxes. Companies that were later delisted, bought out or have no ticker today are skipped, which flatters the result, and options are left out.",
};

/** Listing tails filings and reports add to a company name: "Delta Air Lines, Inc. Common Stock" -> "Delta Air Lines, Inc.". */
const LISTING_TAIL = /\s*[-–]?\s*(?:Class\s+[A-C]\s+)?(?:Common\s+Stock|Common\s+Shares|Ordinary\s+Shares|Units|American\s+Depositary\s+Shares)\b.*$/i;

/** A company name as a person would say it: "Delta Air Lines, Inc. Common Stock" -> "Delta Air Lines". */
export function copyCompanyName(name: string | null | undefined, ticker?: string): string {
  const trimmed = (name ?? "").replace(LISTING_TAIL, "").trim();
  const short = shortCompanyName(trimmed) || trimmed;
  // Filings title-case short names ("Vf Corp" -> "Vf"); when what is left is the ticker, say the ticker.
  if (ticker && short.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === ticker.replace(/[^A-Za-z0-9]/g, "").toUpperCase()) return ticker;
  // A two-letter name is initials the filing title-cased: "Vf" is VF.
  return /^[A-Z][a-z]$/.test(short) ? short.toUpperCase() : short;
}

/** "December 2024" for a record that stopped long before the last close, or null for one still running. */
export function stoppedMonth(record: { stopped?: boolean; end_date: string | null }): string | null {
  if (!record.stopped || !record.end_date) return null;
  const match = /^(\d{4})-(\d{2})/.exec(record.end_date);
  if (!match) return null;
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : null;
}

/** "from Feb 2020" or, for a record that stopped, "from Mar 2023 until Dec 2024". */
function period(record: { start_date: string; end_date: string; stopped?: boolean }): string {
  return record.stopped ? `from ${fmtMonthYear(record.start_date)} until ${fmtMonthYear(record.end_date)}` : `from ${fmtMonthYear(record.start_date)}`;
}

export function copyHref(slug: string): string {
  return `/follow/${encodeURIComponent(slug)}/copy`;
}

export function isFullRecord(record: CopyRecord | null | undefined): record is CopyRecordFull {
  return Boolean(record && !record.empty && record.start_date && record.copy && record.spy);
}

/** Whole dollars: 23677.77 -> "$23,678"; negative as "−$375". */
export function fmtDollars(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value);
  const text = `$${Math.abs(rounded).toLocaleString("en-US")}`;
  return rounded < 0 ? `${MINUS}${text}` : text;
}

/** Percentage points a year, unsigned: 0.0283 -> "2.8 points". */
export function fmtPointsWord(value: number): string {
  const points = Math.abs(value * 100);
  const text = points >= 10 ? points.toFixed(0) : points.toFixed(1);
  return `${text} points`;
}

/** What is being copied, as a noun phrase: "Berkshire Hathaway's 13F filings". */
function whatCopied(record: Pick<CopyBase, "kind" | "name">): string {
  return record.kind === "fund" ? `${record.name}'s 13F filings` : `${record.name}'s reported trades`;
}

export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** The search title: "What If You Copied Berkshire Hathaway's 13F Moves? Backtested Since 2020". */
export function copyTitle(record: CopyRecord): string {
  const moves = record.kind === "fund" ? "13F Moves" : "Stock Trades";
  const base = `What If You Copied ${possessive(record.name)} ${moves}?`;
  return isFullRecord(record) ? `${base} Backtested Since ${record.start_date.slice(0, 4)}` : base;
}

export function copyDescription(record: CopyRecord): string {
  if (!isFullRecord(record)) {
    return `${whatCopied(record)} tested as a copy portfolio against the S&P 500. There is not enough to test yet: ${record.not_ranked_because ?? "no record"}.`;
  }
  return (
    `Copying ${whatCopied(record)} ${period(record)} would have turned $10,000 into ${fmtDollars(record.copy.end_value)}, ` +
    `against ${fmtDollars(record.spy.end_value)} in the S&P 500. See the rule, each year's return, the worst fall and the moves that made and lost the most.`
  );
}

export function copyIsIndexable(record: CopyRecord | null | undefined): boolean {
  return isFullRecord(record) && record.sessions >= INDEX_MIN_SESSIONS;
}

/** The same rule from a hub row, for the sitemap. */
export function copyRowIsIndexable(row: Pick<CopyHubRow, "start_date" | "sessions">): boolean {
  return Boolean(row.start_date) && (row.sessions ?? 0) >= INDEX_MIN_SESSIONS;
}

/** "Democrat, CA-11" for a member ("House member, VA-7" when the party is not on file), or the manager for a fund. */
export function whoLine(row: Pick<CopyBase, "kind" | "person" | "party" | "state" | "district">): string {
  if (row.kind === "fund") return row.person;
  const party = partyLabel(row.party) || "House member";
  const seat = row.state ? `${row.state}${row.district ? `-${row.district}` : ""}` : "";
  return [party, seat].filter(Boolean).join(", ");
}

/** The stock's own move, said only when it agrees in sign with what the copy made on it. */
function heldMove(position: CopyPosition): string {
  if (position.return == null || !Number.isFinite(position.return)) return "";
  if ((position.return > 0) !== (position.pnl > 0)) return "";
  // Under half a percent rounds to "0%", which says nothing.
  if (Math.abs(position.return) < 0.005) return "";
  return `${position.return > 0 ? "up" : "down"} ${fmtFrac(Math.abs(position.return), 0, false)}`;
}

/**
 * When the copy held a stock: "since Feb 2020" while the record runs, "from
 * Nov 2025 until the record ended in Feb 2026" when it stopped with the stock
 * still in it, else "from Nov 2025 to Feb 2026".
 */
function heldWhen(position: CopyPosition, stoppedAt: string | null): string {
  const from = fmtMonthYear(position.first);
  if (position.held) return stoppedAt ? `from ${from} until the record ended in ${fmtMonthYear(stoppedAt)}` : `since ${from}`;
  return `from ${from} to ${fmtMonthYear(position.last)}`;
}

/** "held since Feb 2020", "held from Nov 2025 to Feb 2026", "held from Nov 2025 until the record ended in Feb 2026". */
export function heldSpan(position: CopyPosition, stoppedAt: string | null = null): string {
  return `held ${heldWhen(position, stoppedAt)}`;
}

/**
 * A position in words for the read: "AAPL was the best move to have copied:
 * its slice of the $10,000 copy made $8,038." then "The stock was up 356%
 * while the copy held it, since Feb 2020."
 */
export function positionSentence(position: CopyPosition, best: boolean, stoppedAt: string | null = null): Insight {
  const name = copyCompanyName(position.name, position.ticker) || position.ticker;
  const amount = fmtDollars(Math.abs(position.pnl));
  const move = heldMove(position);
  const when = heldWhen(position, stoppedAt);
  const text = best
    ? `${position.ticker} was the best move to have copied: its slice of the $10,000 copy made ${amount}.`
    : `${position.ticker} was the costliest move to have copied: its slice of the $10,000 copy lost ${amount}.`;
  return {
    id: `${best ? "best" : "worst"}-${position.ticker}`,
    tone: best ? "up" : "down",
    text,
    soWhat: move ? `The stock was ${move} while the copy held it, ${when}.` : `The copy held it ${when}.`,
    tickers: [position.ticker],
    leadName: name,
    action: { label: "Open the stock", href: `/stock/${encodeURIComponent(position.ticker)}` },
  };
}

/** How the copy did against the S&P 500, as a word: "more than" or "less than". */
function versus(copy: number, spy: number): string {
  if (Math.abs(copy - spy) < 0.5) return "the same as";
  return copy > spy ? "more than" : "less than";
}

/** How the copy did a year against the S&P 500 (or in total, under a year): "That is +13.7% a year against +14.3% ...". */
export function copyPace(record: CopyRecord): Insight | null {
  if (!isFullRecord(record)) return null;
  const copy = record.copy;
  const spy = record.spy;
  if (copy.annualized != null && spy.annualized != null) {
    const gap = copy.annualized - spy.annualized;
    const side = Math.abs(gap) < 0.0005 ? "level with it" : `${fmtPointsWord(gap)} a year ${gap > 0 ? "ahead" : "behind"}`;
    return {
      id: "pace",
      tone: Math.abs(gap) < 0.0005 ? "flat" : gap > 0 ? "up" : "down",
      text: `That is ${fmtFrac(copy.annualized)} a year against ${fmtFrac(spy.annualized)} for the S&P 500, ${side}.`,
      soWhat:
        copy.max_drawdown != null && spy.max_drawdown != null
          ? `Its worst fall was ${fmtFrac(copy.max_drawdown)}, against ${fmtFrac(spy.max_drawdown)} for the index.`
          : undefined,
    };
  }
  if (copy.total != null && spy.total != null) {
    return {
      id: "pace",
      tone: "flat",
      text: `That is ${fmtFrac(copy.total)} against ${fmtFrac(spy.total)} for the S&P 500, over less than a year, which is too short to call.`,
    };
  }
  return null;
}

/** The read on top of one copy page: the result against the S&P 500, then the best and worst moves it copied. */
export function buildCopyRead(record: CopyRecord): TheRead | null {
  if (!isFullRecord(record)) return null;
  const copy = record.copy;
  const spy = record.spy;
  const stoppedAt = record.stopped ? record.end_date : null;
  // The result against the index in the headline; the index's own dollar figure is the first line under it.
  const headline = `Copying ${whatCopied(record)} ${period(record)} would have turned $10,000 into ${fmtDollars(copy.end_value)}, ${versus(copy.end_value, spy.end_value)} the S&P 500 did.`;
  const spyMade = `The S&P 500 turned the same $10,000 into ${fmtDollars(spy.end_value)} over the same days.`;
  const paced = copyPace(record);
  const pace: Insight = paced ? { ...paced, text: `${spyMade} ${paced.text.replace(/^That is /, "The copy returned ")}` } : { id: "pace", tone: "flat", text: spyMade };
  const best = record.best[0];
  const worst = record.worst[0];
  return {
    headline,
    insights: pickInsights([pace, best ? positionSentence(best, true, stoppedAt) : null, worst ? positionSentence(worst, false, stoppedAt) : null]),
    source: `${record.kind === "fund" ? "SEC 13F filings" : "House trade reports"} and daily closes to ${fmtDate(record.end_date)}`,
  };
}

/**
 * How every copy test is framed, in one plain sentence. Used wherever a copy
 * result is shown, so the pages say it the same way.
 */
export const COPY_FRAMING = "A historical test on paper, before costs and taxes; the future can differ.";

/**
 * The stored caveats (written by backend/agentdata/copy_trades.py) used to end
 * "past results do not repeat", which is too absolute. Documents written before
 * the next weekly run still say it, so readers swap in the plain ending.
 */
export function plainCaveat(text: string): string {
  return text.replace(/(past|Past) results do not repeat\.?\s*$/, (_match, word: string) => (word === "Past" ? "The" : "the") + " future can differ.");
}

/** The limits in one line, always on show; the full rule and caveats wait behind "How we tested this". */
export const COPY_LIMITS: Record<CopyKind, string> = {
  fund: "A historical test on paper, before costs and taxes. It trades at the close of the first trading day after each filing comes out, up to 45 days after the quarter, and skips delisted companies, which flatters it.",
  congress: "A historical test on paper, before costs and taxes. It trades at the close of the first trading day after each report comes out, up to 45 days after the trade, sizes from reported ranges, and skips delisted companies, which flatters it.",
};

export type CopyVerdict = {
  headline: string;
  /** The yearly return against the S&P 500's and the worst fall against the index's, kept together. */
  detail: string | null;
  /** "Copied Feb 18, 2020 to Nov 9, 2026". */
  span: string;
};

/** The compact verdict on top of a copy page: the dollar result, the yearly pace, the worst fall with its dates, and the test's dates. */
export function copyVerdict(record: CopyRecordFull): CopyVerdict | null {
  const read = buildCopyRead(record);
  if (!read) return null;
  const copy = record.copy;
  const spy = record.spy;
  // The read's first line carries the S&P 500's dollar figure and the yearly pace; the drawdowns get their dates here.
  const parts: string[] = [read.insights.find((insight) => insight.id === "pace")?.text ?? ""].filter(Boolean);
  if (copy.max_drawdown != null) {
    // The index's worst fall is over the whole test, on its own dates, so it gets its own sentence.
    const when = copy.drawdown_peak && copy.drawdown_trough ? `, from ${fmtDate(copy.drawdown_peak)} to ${fmtDate(copy.drawdown_trough)}` : "";
    parts.push(`Its worst fall was ${fmtFrac(Math.abs(copy.max_drawdown), 1, false)}${when}.`);
    if (spy.max_drawdown != null) parts.push(`The S&P 500's worst fall over the test was ${fmtFrac(Math.abs(spy.max_drawdown), 1, false)}.`);
  }
  return {
    headline: read.headline,
    detail: parts.length ? parts.join(" ") : null,
    span: `Copied ${fmtDate(record.start_date)} to ${fmtDate(record.end_date)}`,
  };
}

/**
 * The short name of the comparison line: a fund's first portfolio never
 * traded is "No trading"; a House member's every buy kept, sales ignored, is
 * "Kept every buy" (it still buys, so "no trading" would mislead).
 */
export function holdShortLabel(record: Pick<CopyRecordFull, "kind">): string {
  return record.kind === "fund" ? "No trading" : "Kept every buy";
}

/** One sentence comparing the copy with not trading at all, or null when there is no such line. */
export function holdSentence(record: CopyRecordFull): string | null {
  if (!record.hold) return null;
  const gap = record.copy.end_value - record.hold.end_value;
  const label = record.hold_label.charAt(0).toLowerCase() + record.hold_label.slice(1);
  if (Math.abs(gap) < 50) return `If you had ${label}, you would have ended at about the same place, ${fmtDollars(record.hold.end_value)}.`;
  return gap > 0
    ? `If you had ${label}, you would have ended at ${fmtDollars(record.hold.end_value)}, so following every move earned ${fmtDollars(gap)} more.`
    : `If you had ${label}, you would have ended at ${fmtDollars(record.hold.end_value)}, so following every move cost ${fmtDollars(-gap)}.`;
}

/** The one order for a ranking, here and in backend/agentdata/copy_trades.py rank_rows: excess per year, then the slug. */
export function compareRows(a: CopyHubRow, b: CopyHubRow): number {
  const gap = (b.excess_per_year ?? 0) - (a.excess_per_year ?? 0);
  if (gap !== 0) return gap;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export type RankedGroups = {
  ranked: CopyHubRow[];
  /** Records that stopped more than about three months ago, best first, unranked. */
  ended: CopyHubRow[];
  /** Under about two years, best first, unranked. */
  short: CopyHubRow[];
  /** Too little could be copied to say anything, by name. */
  untested: CopyHubRow[];
};

/** One kind's rows split into the ranking and the groups shown under it. */
export function rankRows(rows: CopyHubRow[], kind: CopyKind): RankedGroups {
  const mine = rows.filter((row) => row.kind === kind);
  const ranked = mine.filter((row) => row.eligible && row.excess_per_year != null && Number.isFinite(row.excess_per_year)).sort(compareRows);
  const rest = mine.filter((row) => !ranked.includes(row));
  // Tested means it has a start and a result; records under a year have no yearly gap but are still tests.
  const withNumbers = (row: CopyHubRow) => row.start_date != null && row.copy_total != null && Number.isFinite(row.copy_total);
  const ended = rest.filter((row) => row.not_ranked_group === "ended" && withNumbers(row)).sort(compareRows);
  // Records with a yearly gap first (best first), then the under-a-year ones by their whole result.
  const short = rest
    .filter((row) => row.not_ranked_group === "short" && withNumbers(row))
    .sort((a, b) => Number(a.excess_per_year == null) - Number(b.excess_per_year == null) || (a.excess_per_year == null ? (b.copy_total ?? 0) - (a.copy_total ?? 0) : compareRows(a, b)));
  const untested = rest.filter((row) => !ended.includes(row) && !short.includes(row)).sort((a, b) => a.name.localeCompare(b.name));
  return { ranked, ended, short, untested };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function kindRead(rows: CopyHubRow[], kind: CopyKind): { beat: number; total: number; best: CopyHubRow | null; worst: CopyHubRow | null; median: number | null } {
  const { ranked } = rankRows(rows, kind);
  return {
    beat: ranked.filter((row) => (row.excess_per_year as number) > 0).length,
    total: ranked.length,
    best: ranked[0] ?? null,
    worst: ranked[ranked.length - 1] ?? null,
    median: median(ranked.map((row) => row.excess_per_year as number)),
  };
}

function rowInsight(row: CopyHubRow, id: string, lead: string): Insight {
  const gap = row.excess_per_year as number;
  return {
    id: `${id}-${row.slug}`,
    tone: gap > 0 ? "up" : gap < 0 ? "down" : "flat",
    text: `${lead} ${row.name}: copied from ${fmtMonthYear(row.start_date)}${row.stopped && row.end_date ? ` until ${fmtMonthYear(row.end_date)}` : ""}, the copy made ${fmtFrac(row.copy_annualized)} a year against ${fmtFrac(row.spy_annualized)} for the S&P 500, ${fmtPointsWord(gap)} a year ${gap >= 0 ? "ahead" : "behind"}.`,
    action: { label: "See the test", href: copyHref(row.slug) },
  };
}

/** The read on top of the hub: how many beat the index when copied, and who did best and worst. */
export function buildHubRead(hub: CopyHub | null): TheRead | null {
  if (!hub || hub.rows.length === 0) return null;
  const funds = kindRead(hub.rows, "fund");
  const members = kindRead(hub.rows, "congress");
  if (funds.total === 0 && members.total === 0) return null;
  // The funds lead the headline; the House members' count is the first line under it.
  const fundLine = funds.total > 0 ? `${funds.beat} of the ${funds.total} funds with two years of record beat the S&P 500 when copied from ${hub.fund_start.slice(0, 4)}.` : null;
  const memberLine = members.total > 0 ? `${members.beat} of ${members.total} House members beat the S&P 500 when copied from their first reported buy.` : null;
  const headline = fundLine ?? memberLine!;
  const insights: Array<Insight | null> = [];
  if (fundLine && memberLine) insights.push({ id: "members-count", tone: members.beat * 2 > members.total ? "up" : members.beat * 2 < members.total ? "down" : "flat", text: memberLine });
  if (funds.best) insights.push(rowInsight(funds.best, "best-fund", "The fund most worth copying was"));
  if (members.best) insights.push(rowInsight(members.best, "best-member", "The member most worth copying was"));
  if (funds.median != null && funds.total >= 5) {
    insights.push({
      id: "median-fund",
      tone: funds.median > 0 ? "up" : funds.median < 0 ? "down" : "flat",
      text: `The typical fund, copied this way, ran ${fmtPointsWord(funds.median)} a year ${funds.median >= 0 ? "ahead of" : "behind"} the S&P 500.`,
    });
  }
  return {
    headline,
    // The members' count the headline handed down rides on top of the usual three points.
    insights: pickInsights(insights, insights[0]?.id === "members-count" ? 4 : 3),
    source: `SEC 13F filings, House trade reports and daily closes to ${fmtDate(hub.price_as_of)}`,
  };
}

/** The span a row covers: "Feb 2020 to now" or "Apr 2023 to Mar 2025". */
export function spanLabel(row: { start_date: string | null; end_date: string | null; ended?: boolean }): string {
  if (!row.start_date) return "";
  return `${fmtMonthYear(row.start_date)} to ${row.ended && row.end_date ? fmtMonthYear(row.end_date) : "now"}`;
}

/** Chart labels in one format: 10000 -> "$10K", 12500 -> "$12.5K". */
export function fmtThousands(dollars: number): string {
  const thousands = dollars / 1000;
  return `$${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
}

export type CopyChartGeometry = {
  paths: string[];
  ticks: { y: number; label: string }[];
  years: { x: number; label: string }[];
  min: number;
  max: number;
  /** The scale's bounds (growth of 1), for placing a hover marker. */
  bottom: number;
  top: number;
};

/**
 * Paths for the copy chart in a 0..1000 box, one per value column (copy,
 * S&P 500, no trading), on a plain linear scale of what $10,000 became so the
 * picture matches the dollar numbers beside it.
 */
export function copyChartGeometry(curve: Array<[string, number, number, number?]>, start = START_VALUE): CopyChartGeometry | null {
  const rows = curve.filter((row) => row[1] > 0 && row[2] > 0);
  if (rows.length < 2) return null;
  const columns = rows[0]!.length - 1;
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (let column = 1; column <= columns; column += 1) {
      const value = row[column] as number | undefined;
      if (value == null || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const pad = (max - min || 0.1) * 0.06;
  const bottom = Math.max(0, min - pad);
  const top = max + pad;
  const yOf = (value: number) => 1 - (value - bottom) / (top - bottom);
  const xOf = (index: number) => index / (rows.length - 1);
  const paths: string[] = [];
  for (let column = 1; column <= columns; column += 1) {
    const parts: string[] = [];
    rows.forEach((row, index) => {
      const value = row[column] as number | undefined;
      if (value == null || !Number.isFinite(value)) return;
      parts.push(`${parts.length === 0 ? "M" : "L"}${(xOf(index) * 1000).toFixed(1)},${(yOf(value) * 1000).toFixed(1)}`);
    });
    paths.push(parts.join(""));
  }
  // Round-dollar guides: steps of $2,500, $5,000 or $10,000, whichever gives three to six lines.
  const span = (top - bottom) * start;
  const step = [1000, 2500, 5000, 10000, 20000, 50000].find((candidate) => span / candidate <= 6) ?? 100000;
  const ticks: { y: number; label: string }[] = [];
  for (let dollars = Math.ceil((bottom * start) / step) * step; dollars <= top * start; dollars += step) {
    const y = yOf(dollars / start);
    if (y >= 0.03 && y <= 0.97) ticks.push({ y, label: fmtThousands(dollars) });
  }
  const years: { x: number; label: string }[] = [];
  let lastYear = rows[0]![0].slice(0, 4);
  rows.forEach((row, index) => {
    const year = row[0].slice(0, 4);
    if (year !== lastYear) {
      years.push({ x: xOf(index), label: year });
      lastYear = year;
    }
  });
  const every = Math.max(1, Math.ceil(years.length / 7));
  return { paths, ticks, years: years.filter((_, index) => index % every === 0), min, max, bottom, top };
}
