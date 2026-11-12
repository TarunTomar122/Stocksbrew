import { typicalDailyMove } from "@/lib/calendar-insights";
import { vsDayWords, whenWords } from "@/lib/earnings-season";
import { shortDay } from "@/lib/read-format";

/**
 * Price facts for a briefing card whose stock moved with no confirmed reason (owner rule 3: every stock card carries
 * one highlighted fact of its own; rule 7: never a reason we could not confirm). Worked out from the stock's own daily
 * closes, so every word is a measured number: "Its biggest gain since Sep 9", "About three times a normal day", "A
 * normal day moves it about 1.1%". Pure; the closes are read in ./briefing-move-facts-server.ts.
 */

/** Daily closes, oldest first. */
export type CloseSeries = { dates: string[]; closes: number[] };

/** A move this many sessions after the last one at least as big is worth "its biggest since" (about two months). */
const SINCE_MIN_SESSIONS = 40;
/** A same-sized move is "this one" when the last close already holds it (prices taken after the close). */
const SAME_MOVE_PP = 0.2;
/**
 * A move at least this many times a normal day says so ("About twice a normal day"); anything smaller is an ordinary
 * move, shown as its percent alone (judges, ship 53: "1.3×" stamped on an ordinary move said nothing).
 */
export const VS_DAY_MIN = 1.75;

/**
 * "about twice a normal day", "about four times a normal day": a multiple of a normal day only once it means
 * something (from about 2×), so the briefing, the inbox and My stocks never call an ordinary move "one and a half
 * times" anything. Null under that.
 */
export function bigVsDayWords(ratio: number | null | undefined): string | null {
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio >= VS_DAY_MIN ? vsDayWords(ratio) : null;
}
/** The month is the last 21 sessions, today's included. */
export const MONTH_SESSIONS = 21;
/** A month that moved less than this says nothing worth a card. */
const MONTH_MIN_PCT = 1;

function capitalise(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** "Sep 9", or "Sep 9, 2025" when it is from another year than the move. */
function sinceDay(day: string, moveDay: string): string {
  return day.slice(0, 4) === moveDay.slice(0, 4) ? shortDay(day) : `${shortDay(day)}, ${day.slice(0, 4)}`;
}

/**
 * The facts for a move of `pct` percent on `moveDay`, most telling first. Only closes before the move's day count, and
 * a last close that already holds this same move is left out, so the move is never measured against itself. Empty
 * when the history is too short to say anything.
 */
export function moveFacts(
  pct: number,
  series: CloseSeries | null | undefined,
  moveDay: string,
  /**
   * `month`: the stock's month already worked out the one way every page works it out (monthChange), so the briefing,
   * the inbox and My stocks never show two figures for one month (judges, ship 46: VOO −1.7% here, −2.4% there).
   * Null leaves the month out; undefined counts it from this series.
   */
  options: { exactDay?: boolean; month?: number | null } = {},
): string[] {
  if (!series || !Number.isFinite(pct) || pct === 0) return [];
  const points: Array<{ date: string; close: number }> = [];
  const n = Math.min(series.dates.length, series.closes.length);
  for (let index = 0; index < n; index += 1) {
    const date = series.dates[index];
    const close = series.closes[index];
    if (typeof date === "string" && date < moveDay && typeof close === "number" && Number.isFinite(close) && close > 0) points.push({ date, close });
  }
  // Only when the move's day is a guess (no quote time): a close that already holds this same move is the move itself.
  if (!options.exactDay && points.length >= 2) {
    const last = points[points.length - 1]!;
    const before = points[points.length - 2]!;
    const lastPct = (last.close / before.close - 1) * 100;
    if (Math.abs(lastPct - pct) < SAME_MOVE_PP) points.pop();
  }
  if (points.length < 31) return [];

  const out: string[] = [];
  const up = pct > 0;
  const size = Math.abs(pct);
  // The last session that moved at least as much the same way.
  let found: number | null = null;
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const move = (points[index]!.close / points[index - 1]!.close - 1) * 100;
    if ((move > 0) === up && Math.abs(move) >= size) {
      found = index;
      break;
    }
  }
  const word = up ? "gain" : "drop";
  if (found !== null) {
    if (points.length - found >= SINCE_MIN_SESSIONS) out.push(`Its biggest ${word} since ${sinceDay(points[found]!.date, moveDay)}`);
  } else if (points.length >= SINCE_MIN_SESSIONS) {
    const days = (Date.parse(`${moveDay}T12:00:00Z`) - Date.parse(`${points[0]!.date}T12:00:00Z`)) / 86_400_000;
    const years = Math.floor(days / 365.25);
    const months = Math.floor(days / 30.44);
    if (years >= 2) out.push(`Its biggest ${word} in more than ${years} years`);
    else if (years === 1) out.push(`Its biggest ${word} in more than a year`);
    else if (months >= 2) out.push(`Its biggest ${word} in more than ${months} months`);
  }

  const normal = typicalDailyMove(points.map((point) => point.close));
  if (normal !== null && normal > 0) {
    const ratio = size / normal;
    // "About twice a normal 1.1% day": the stock's own normal day in the words, so two cards never say the same thing.
    const versus = ratio >= VS_DAY_MIN ? vsDayWords(ratio) : null;
    out.push(versus ? `${capitalise(versus.replace(/ normal day$/, ""))} normal ${normal.toFixed(1)}% day` : `A normal day moves it about ${normal.toFixed(1)}%`);
  }

  // Where the month stands with today's move in it: "Still down 5.1% over the past month" after a gain.
  let month: number | null = null;
  if (options.month !== undefined) month = options.month !== null && Number.isFinite(options.month) ? options.month : null;
  else {
    const monthAgo = points[points.length - MONTH_SESSIONS];
    // Only from a series that runs up to the move (a cached copy a session or more behind would count the wrong month).
    const lastGap = (Date.parse(`${moveDay}T12:00:00Z`) - Date.parse(`${points[points.length - 1]!.date}T12:00:00Z`)) / 86_400_000;
    if (monthAgo && lastGap <= 4) month = ((points[points.length - 1]!.close * (1 + pct / 100)) / monthAgo.close - 1) * 100;
  }
  if (month !== null && Math.abs(month) >= MONTH_MIN_PCT) {
    const words = `${month > 0 ? "up" : "down"} ${Math.abs(month).toFixed(1)}% over the past month`;
    out.push(month > 0 === up ? capitalise(words) : `Still ${words}`);
  }
  return out;
}

/* ── one month, worked out one way ─────────────────────────────────────── */

/** The close on `day`, else the last one before it within four days (a fund's close can be a day late). */
export function closeOnOrBefore(series: CloseSeries | null | undefined, day: string): number | null {
  if (!series) return null;
  const floor = new Date(Date.parse(`${day}T00:00:00Z`) - 4 * 86_400_000).toISOString().slice(0, 10);
  for (let i = Math.min(series.dates.length, series.closes.length) - 1; i >= 0; i--) {
    const date = series.dates[i]!.slice(0, 10);
    if (date > day) continue;
    if (date < floor) return null;
    const close = series.closes[i];
    return typeof close === "number" && Number.isFinite(close) && close > 0 ? close : null;
  }
  return null;
}

/**
 * Where a window of `sessions` ending on `day` starts, counted on the S&P 500's own sessions (SPY's closes), so a
 * stock whose stored closes miss a day is still measured over the same days as every other: the start day, SPY's
 * index of it and of its last close up to `day`, and whether `day` itself is stored yet. Null when SPY does not
 * reach that far back.
 */
export function windowStart(benchmark: CloseSeries | null | undefined, day: string | null | undefined, sessions: number): { from: string; start: number; last: number; stored: boolean } | null {
  if (!benchmark || !day) return null;
  let last = Math.min(benchmark.dates.length, benchmark.closes.length) - 1;
  while (last >= 0 && benchmark.dates[last]!.slice(0, 10) > day) last--;
  if (last < 0) return null;
  // A weekend day is no session of its own: its prices are the last session's, as if that day were stored.
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  const stored = benchmark.dates[last]!.slice(0, 10) === day || weekend;
  const start = stored ? last - sessions : last - (sessions - 1);
  if (start < 0) return null;
  return { from: benchmark.dates[start]!.slice(0, 10), start, last, stored };
}

/**
 * A stock's month, percent: from its close on the month's first day (windowStart over MONTH_SESSIONS) to `now`, its
 * price on `day`. The one calculation My stocks, the briefing, the inbox and the home page all read, so one stock
 * never shows two months (judges, ship 46). Null without a close that far back.
 */
export function monthChange(series: CloseSeries | null | undefined, benchmark: CloseSeries | null | undefined, day: string | null | undefined, now: number | null | undefined): number | null {
  if (typeof now !== "number" || !Number.isFinite(now) || now <= 0) return null;
  const window = windowStart(benchmark, day, MONTH_SESSIONS);
  const then = window ? closeOnOrBefore(series, window.from) : null;
  return then !== null ? (now / then - 1) * 100 : null;
}

/* ── the quiet cards' facts, varied ────────────────────────────────────── */

/** What a fact is about, so two neighbouring cards never say the same kind of sentence (owner rule 1). */
export type FactShape = "report" | "since" | "day" | "month" | "reason";

/** One stock on a quiet list: its move, its price facts (moveFacts) and its report day in words, when within two weeks. */
export type QuietStock = { ticker: string; pct: number | null; facts?: readonly string[] | null; report?: string | null };

/**
 * The move against the stock's own normal day, in words with the normal day's size, only when it means something:
 * "About twice its normal 1.0% day", "About four times its normal 1.3% day". Null for an ordinary move (under about
 * twice a normal day), which is shown as its percent alone (judges, ship 53).
 */
export function normalDayWords(pct: number, normal: number): string | null {
  if (!Number.isFinite(pct) || !Number.isFinite(normal) || normal <= 0) return null;
  const words = bigVsDayWords(Math.abs(pct) / normal);
  return words ? capitalise(words.replace(/ a normal day$/, ` its normal ${normal.toFixed(1)}% day`)) : null;
}

type Candidate = { shape: FactShape; text: string; rank: number };

/** Each fact a quiet card could say, with how telling it is (lower first). */
function candidates(stock: QuietStock): Candidate[] {
  const out: Candidate[] = [];
  if (stock.report) out.push({ shape: "report", text: stock.report, rank: 0 });
  for (const fact of stock.facts ?? []) {
    const since = /^Its biggest (gain|drop) (.+)$/.exec(fact);
    if (since) {
      out.push({ shape: "since", text: `Biggest ${since[1]} ${since[2]}`, rank: 1 });
      continue;
    }
    const month = /^(?:Still )?(up|down) ([\d.]+)% over the past month$/i.exec(fact);
    if (month) {
      const size = Number(month[2]);
      out.push({ shape: "month", text: `${month[1]!.charAt(0).toUpperCase()}${month[1]!.slice(1).toLowerCase()} ${month[2]}% in a month`, rank: size >= 5 ? 2.5 : 3 });
      continue;
    }
    // "About twice a normal 1.0% day" or "A normal day moves it about 1.3%": the normal day, read against the move.
    const normal = /normal ([\d.]+)% day$/.exec(fact) ?? /^A normal day moves it about ([\d.]+)%$/.exec(fact);
    if (normal && stock.pct !== null && Number.isFinite(stock.pct)) {
      // Only a move of about twice its normal day or more: an ordinary move has no multiple.
      const words = normalDayWords(stock.pct, Number(normal[1]));
      if (words) out.push({ shape: "day", text: words, rank: 2 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/** Saying the same kind of sentence as the card before costs this much; each earlier use of the kind costs one. */
const SAME_AS_LAST = 4;

/**
 * One fact for each card on a quiet list (the briefing's other stocks, the inbox's), in the order shown: the most
 * telling fact each stock has, unless the card before it says the same kind of sentence, in which case its next
 * best of another kind (owner rule 1, judges ship 46: seven cards all "Up x% in a month"). Kinds used often already
 * cost a little more, so the list mixes them. A stock with a confirmed reason (`reasons`) says that and nothing else.
 * Never two cards with the same words. Null for a stock with nothing to say.
 */
export function quietFacts(stocks: readonly QuietStock[], reasons: ReadonlySet<string> = new Set()): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const used = new Set<string>();
  const counts: Partial<Record<FactShape, number>> = {};
  let last: FactShape | null = null;
  for (const stock of stocks) {
    if (reasons.has(stock.ticker)) {
      out.set(stock.ticker, null);
      last = "reason";
      continue;
    }
    let best: Candidate | null = null;
    let bestCost = Infinity;
    for (const candidate of candidates(stock)) {
      if (used.has(candidate.text)) continue;
      const cost = candidate.rank + (candidate.shape === last ? SAME_AS_LAST : 0) + (counts[candidate.shape] ?? 0);
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
    out.set(stock.ticker, best?.text ?? null);
    if (best) {
      used.add(best.text);
      counts[best.shape] = (counts[best.shape] ?? 0) + 1;
    }
    last = best?.shape ?? null;
  }
  return out;
}

/** "Reports Tuesday after the close", "Reports Nov 20": a report within two weeks of `today`, else null. */
export function reportSoonWords(report: { date: string; time?: string | null } | null | undefined, today: string): string | null {
  if (!report || !/^\d{4}-\d{2}-\d{2}$/.test(report.date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const gap = Math.round((Date.parse(`${report.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (gap < 0 || gap > 14) return null;
  const session = report.time === "amc" ? " after the close" : report.time === "bmo" ? " before the open" : "";
  // A report today counts only after the close: before the open, or at an unknown time, it may already be out.
  if (gap === 0 && report.time !== "amc") return null;
  return `Reports ${whenWords(report.date, today).replace(/^on /, "")}${session}`;
}

/* ── the quiet grid's cards ───────────────────────────────────────────── */

/** The normal day a stock's facts carry ("About twice a normal 1.1% day", "A normal day moves it about 1.3%"), or null. */
export function normalDayOf(facts: readonly string[] | null | undefined): number | null {
  for (const fact of facts ?? []) {
    const match = /normal ([\d.]+)% day$/.exec(fact) ?? /^A normal day moves it about ([\d.]+)%$/.exec(fact);
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/** A month at least this big, and well past what the stock's normal day adds up to, is worth its own chip. */
const OUTLIER_MONTH_PCT = 10;

/** A month is an outlier when it is past OUTLIER_MONTH_PCT and one and a half times a normal day's month (√21 days). */
function outlierMonth(month: number, normal: number | null): boolean {
  const size = Math.abs(month);
  return size >= OUTLIER_MONTH_PCT && (normal === null || size >= 1.5 * normal * Math.sqrt(MONTH_SESSIONS));
}

export type QuietCardsWords = {
  /** Each card's one fact of its own, by ticker: a report soon, its biggest move in a while, a big move against its normal day, an outlier month. */
  facts: Map<string, string | null>;
};

/**
 * The words for a quiet list's cards (the briefing's other stocks). An ordinary move is its percent alone: no
 * "1.3×" stamped on it, and no line above the grid explaining a multiple (judges, ship 53). A card keeps one fact only
 * for what is different about it: a report soon, its biggest move in a while, a move of about twice its normal day or
 * more, worded as Worth knowing words it ("About twice its normal 1.1% day"), or a month far outside its usual range.
 * When most cards do not know their stock's normal day, each card picks one fact as quietFacts does. Never two cards
 * with the same words. Pure.
 */
export function quietCardsWords(stocks: readonly QuietStock[], reasons: ReadonlySet<string> = new Set()): QuietCardsWords {
  const normals = new Map<string, number>();
  for (const stock of stocks) {
    const normal = normalDayOf(stock.facts);
    if (normal !== null && stock.pct !== null && Number.isFinite(stock.pct)) normals.set(stock.ticker, normal);
  }
  // "Most": more than half the cards, and at least three; otherwise each card says its own most telling fact.
  if (normals.size < 3 || normals.size * 2 <= stocks.length) return { facts: quietFacts(stocks, reasons) };
  const facts = new Map<string, string | null>();
  const used = new Set<string>();
  for (const stock of stocks) {
    if (reasons.has(stock.ticker)) {
      facts.set(stock.ticker, null);
      continue;
    }
    const normal = normals.get(stock.ticker) ?? null;
    const own: string[] = [];
    if (stock.report) own.push(stock.report);
    for (const fact of stock.facts ?? []) {
      const since = /^Its biggest (gain|drop) (.+)$/.exec(fact);
      if (since) own.push(`Biggest ${since[1]} ${since[2]}`);
    }
    const big = normal !== null ? normalDayWords(stock.pct!, normal) : null;
    if (big) own.push(big);
    for (const fact of stock.facts ?? []) {
      const month = /^(?:Still )?(up|down) ([\d.]+)% over the past month$/i.exec(fact);
      if (month && outlierMonth(Number(month[2]), normal)) own.push(`${month[1]!.charAt(0).toUpperCase()}${month[1]!.slice(1).toLowerCase()} ${month[2]}% in a month`);
    }
    const pick = own.find((text) => !used.has(text)) ?? null;
    if (pick) used.add(pick);
    facts.set(stock.ticker, pick);
  }
  return { facts };
}
