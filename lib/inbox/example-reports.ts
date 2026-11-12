import type { StockHistory } from "@/lib/earnings-season";
import { countWord, listNames, shortDay } from "@/lib/read-format";

/**
 * The signed-out inbox's other stocks: under the read, each stock of the example portfolio the read does not already
 * talk about, by what its last report did, newest first (judges, ship 50: the inbox repeated the briefing's day moves
 * card for card). The inbox is the dated record: what came out and when, and what is coming. Each card is one stock:
 * the report's day, how the stock moved on it as the big figure, and a highlight only for what is its own (a report
 * coming up, a surprise far past the rest, a miss among beats). What most cards share, beat or miss, is said once
 * above them (owner rule 1). Funds have no reports and no card. Pure; the page reads the histories
 * (lib/earnings-season-data.ts loadTickerEarnings, the same cached read as the calendar and Earnings season).
 */

export type ExampleReportStock = {
  ticker: string;
  kind: "holding" | "watching";
  fund: boolean;
  history: Pick<StockHistory, "past" | "next">;
};

export type ExampleReportCard = {
  ticker: string;
  /** The last report's day, YYYY-MM-DD. */
  day: string;
  /** How the stock moved on that report, percent, or null when it could not be measured. */
  move: number | null;
  /** One highlight of its own, or null. */
  fact: string | null;
  watching: boolean;
};

export type ExampleReports = {
  title: string;
  /** What most of them did, said once: "Seven beat profit forecasts; JPM missed." Null with fewer than two results. */
  line: string | null;
  cards: ExampleReportCard[];
};

/** A beat this far past the forecast, percent, is worth a highlight of its own. */
const BIG_SURPRISE_PCT = 20;
/** A next report further ahead than this is a guess from the calendar, not news. */
const NEXT_MAX_DAYS = 45;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** "Beat by 39%", "Missed by 3.2%": whole numbers once the surprise is big. */
function byWords(pct: number): string {
  const size = Math.abs(pct);
  return size >= 10 ? `${Math.round(size)}%` : `${size.toFixed(1).replace(/\.0$/, "")}%`;
}

/** "Seven beat profit forecasts; JPM missed.", "Five beat profit forecasts; two missed; UNH met them." */
function resultLine(results: Array<{ ticker: string; result: "beat" | "miss" | "in-line" }>): string | null {
  if (results.length < 2) return null;
  const of = (result: string) => results.filter((entry) => entry.result === result).map((entry) => entry.ticker);
  const group = (tickers: string[], verb: string, many: string) =>
    tickers.length === 0 ? null : tickers.length === 1 ? `${tickers[0]} ${verb}` : tickers.length <= 3 ? `${listNames(tickers)} ${verb}` : `${countWord(tickers.length).toLowerCase()} ${many}`;
  const beat = of("beat");
  const miss = of("miss");
  // "Profit forecasts" is said by the first group only; a later one says "missed" or "met them".
  const missed = beat.length > 0 ? "missed" : "missed profit forecasts";
  const met = beat.length > 0 || miss.length > 0 ? "met them" : "met profit forecasts";
  const parts = [
    beat.length > 3 ? `${countWord(beat.length).toLowerCase()} beat profit forecasts` : group(beat, "beat profit forecasts", "beat profit forecasts"),
    group(miss, missed, missed),
    group(of("in-line"), met, met),
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  // A semicolon between the groups, so a list of names never meets a second "and".
  const sentence = parts.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export function exampleReports(stocks: readonly ExampleReportStock[], skip: Iterable<string>, today: string): ExampleReports | null {
  if (!DAY.test(today)) return null;
  const skipped = new Set([...skip].map((ticker) => ticker.toUpperCase()));
  const found: Array<{ card: ExampleReportCard; result: "beat" | "miss" | "in-line" | null; surprise: number | null; next: string | null }> = [];
  for (const stock of stocks) {
    const ticker = stock.ticker.toUpperCase();
    if (stock.fund || skipped.has(ticker) || found.some((entry) => entry.card.ticker === ticker)) continue;
    const last = [...stock.history.past].filter((report) => DAY.test(report.date) && report.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last || (last.move === null && last.result === null)) continue;
    const next = stock.history.next;
    const ahead = next && DAY.test(next.date) && !next.reported ? daysBetween(today, next.date) : null;
    found.push({
      card: { ticker, day: last.date, move: typeof last.move === "number" && Number.isFinite(last.move) ? last.move : null, fact: null, watching: stock.kind === "watching" },
      result: last.result,
      surprise: typeof last.surprisePct === "number" && Number.isFinite(last.surprisePct) ? last.surprisePct : null,
      next: ahead !== null && ahead >= 0 && ahead <= NEXT_MAX_DAYS ? `Reports ${ahead === 0 ? "today" : shortDay(next!.date)}` : null,
    });
  }
  if (found.length < 2) return null;
  // Newest report first: the inbox reads as a dated record.
  found.sort((a, b) => b.card.day.localeCompare(a.card.day) || a.card.ticker.localeCompare(b.card.ticker));
  const results = found.filter((entry) => entry.result !== null).map((entry) => ({ ticker: entry.card.ticker, result: entry.result! }));
  const line = resultLine(results);
  const misses = results.filter((entry) => entry.result === "miss").length;
  // The line names a lone miss, and up to three of a kind; a card says it only when the line could not (no line with
  // fewer than two results, or too many misses to name).
  const missNamed = line !== null && misses <= 3;
  for (const entry of found) {
    entry.card.fact =
      entry.next ??
      (entry.result === "beat" && entry.surprise !== null && entry.surprise >= BIG_SURPRISE_PCT
        ? `Beat by ${byWords(entry.surprise)}`
        : entry.result === "miss" && !missNamed && entry.surprise !== null
          ? `Missed by ${byWords(entry.surprise)}`
          : null);
  }
  return { title: "How the example's other stocks moved on their last report", line, cards: found.map((entry) => entry.card) };
}
