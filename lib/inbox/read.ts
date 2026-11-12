import type { InboxItem, UpcomingLine, UpcomingReport } from "./types";
import { moveSentence, reportSentence } from "./words";

/**
 * How the inbox's rows read: what is already told above the list is not said again on a row, and a move finding's
 * percent is signed from its own words. Pure.
 */

/**
 * The first percent move a sentence states, signed by its own words: "NVDA fell 5.47% in a day" is −5.47%. Null when
 * there is no percent, or when an unsigned one has no direction word to sign it.
 */
export function signedMove(text: string): { value: string; tone: "up" | "down" } | null {
  const match = /([+\-−]?)(\d+(?:\.\d+)?)%/.exec(text);
  if (!match) return null;
  const [, sign, digits] = match;
  const before = text.slice(0, match.index);
  let down: boolean;
  if (sign === "+") down = false;
  else if (sign) down = true;
  else {
    // The direction word nearest before the number, in the same sentence: "After a lower open, NVDA rose 4.2%" is up.
    const clause = before.split(/[.!?]\s/).pop() ?? before;
    const words = [...clause.matchAll(/\b(fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower|rose|rises|jumped|jumps|gained|gains|climbed|surged|soared|rallied|up|higher)\b/gi)];
    const last = words[words.length - 1]?.[1]?.toLowerCase();
    if (!last) return null;
    down = /^(?:fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower)$/.test(last);
  }
  return { value: `${down ? "−" : "+"}${digits}%`, tone: down ? "down" : "up" };
}

/**
 * What something above the list already says, so the rows under it do not say it again (owner rule 1): the move rows
 * whose sentence is told (`moveIds`), the ones whose confirmed reason is told (`reasonIds`), and the stocks whose report
 * history is told (`reports`). A report whose day alone is named keeps its history in its row. The inbox page has no
 * read above its list any more, so it passes nothing told.
 */
export type InboxTold = {
  moveIds: string[];
  reasonIds: string[];
  reports: string[];
  /** Stocks whose report day is named above the list. */
  reportDays?: string[];
  /** Results rows whose move is told above the list: the row keeps only the figures. */
  resultIds?: string[];
};

/**
 * The rows as the page draws them: a move already told is just the fact ("NVDA fell 5.5% yesterday.", no normal-day
 * comparison or reason), and a report already told is just its day. Quiet agent checks are hidden beside anything
 * else. Upcoming reports come as finished sentences, so the browser never loads the wording.
 */
export function rowsAfterRead(
  items: InboxItem[],
  upcoming: UpcomingReport[],
  told: InboxTold,
  today: string,
  options: { example?: boolean } = {},
): { items: InboxItem[]; upcoming: UpcomingLine[] } {
  const rows = rowsAfterReadAll(items, upcoming, told, today);
  // "2 example agents checked … and found nothing" says nothing a reader can use (judges, ship 39): the example never
  // shows it, and your own inbox shows it only when it is the one row left, so an empty-looking day still says the
  // agents ran. It still counts as shown, so opening the page reads it.
  const quiet = (item: InboxItem) => item.kind === "agent" && Boolean(item.quiet) && !item.told;
  const others = rows.items.some((item) => !item.told && !quiet(item)) || rows.upcoming.length > 0;
  if (!options.example && !others) return rows;
  return { ...rows, items: rows.items.map((item) => (quiet(item) ? { ...item, told: true } : item)) };
}

function rowsAfterReadAll(items: InboxItem[], upcoming: UpcomingReport[], told: InboxTold, today: string): { items: InboxItem[]; upcoming: UpcomingLine[] } {
  const moveIds = new Set(told.moveIds);
  const reasonIds = new Set(told.reasonIds);
  const reports = new Set(told.reports);
  const days = new Set(told.reportDays ?? []);
  const results = new Set(told.resultIds ?? []);
  return {
    items: items.map((item) => {
      // This result and its move are told above: the row says what was reported against the estimate.
      if (results.has(item.id) && item.result) return { ...item, text: item.result.figures };
      if (!(moveIds.has(item.id) && item.id.startsWith("move:") && item.move && item.tickers.length === 1)) return item;
      const detail = reasonIds.has(item.id) ? null : item.detail;
      // Nothing left that is not already told (the move, and its reason when it has one): no row for it (owner
      // rule 1). It still counts as shown, so opening the page reads it.
      return { ...item, text: moveSentence(item.tickers[0]!, item.move.pct, item.move.day, null, today), detail, ...(detail ? {} : { told: true }) };
    }),
    upcoming: upcoming
      // Its day is named above, and its history is told or it has none: the row would only say it again.
      .filter((report) => !(days.has(report.ticker) && (reports.has(report.ticker) || !report.history)))
      .map((report) =>
        reports.has(report.ticker)
          ? { ticker: report.ticker, date: report.date, text: reportSentence({ ...report, history: null }, today), note: null }
          : { ticker: report.ticker, date: report.date, text: reportSentence(report, today), note: report.vsDay ? `That is ${report.vsDay.replace(/ a normal day$/, " its normal day")}.` : null },
      ),
  };
}
