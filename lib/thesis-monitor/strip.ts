/**
 * The thesis, made tangible in one strip (judge90, Nov 13): where it stands (holds, under strain, broken), the one
 * measurable line that changed most recently with its figure, the line, the report or filing it came from and its
 * date, the next report that will test it, and a link to the thesis. The same strip goes on the briefing, My stocks
 * and the first look (components/thesis-monitor/thesis-strip.tsx).
 *
 * From a thesis over several companies (lib/thesis-monitor) first; without one, from the person's measurable reasons
 * on single stocks (lib/thesis-watch conditions), rolled up the same way. Nothing checked yet, no strip (owner: no
 * card without data). Pure: safe on the client, tested in strip.test.ts.
 */

import { conditionText, figureText, isConditionMetric, type Condition, type ConditionRecord } from "@/lib/thesis-watch/conditions";

import { rollUp } from "./check";
import { STATUS_RANK, thesisHref, type ThesisCounts, type ThesisState, type ThesisStatus } from "./model";

export type StripLine = {
  ticker: string;
  condition: Condition;
  /** "Gross margin > 55%". */
  label: string;
  /** The figure now, never reading the same as the line ("54.6%"). */
  nowText: string;
  now: number;
  status: "holds" | "broken";
  /** Where the figure came from ("Q3 report, 10-Q"), for the strip's own line and hover. */
  source: string;
  /** The day the figure is from: its report, else its own day. */
  day: string;
  /** The report it came from ("Q3"), or null for a daily figure (the price, the P/E). */
  quarter: string | null;
  /** Whether the figure is from a report (else a daily figure). */
  report: boolean;
  /** The day the line became what it is. */
  since: string;
  href: string | null;
};

export type ThesisStripData = {
  /** "AI infrastructure", or "Your reasons" for reasons on single stocks. */
  name: string;
  href: string;
  status: Exclude<ThesisStatus, "waiting">;
  counts: ThesisCounts;
  line: StripLine | null;
  /** The next report on a company in it: the night its report lines are judged again. */
  next: { ticker: string; day: string } | null;
};

function conditionOf(key: string): Condition | null {
  const [metric, op, value] = key.split(":");
  if (!isConditionMetric(metric) || (op !== "above" && op !== "below")) return null;
  const line = Number(value);
  return Number.isFinite(line) ? { metric, op, value: line } : null;
}

function capital(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/**
 * The line that changed most recently among the judged ones: the newest `since`, a broken line before one that holds
 * on the same day, then the newest figure. A line waiting tonight counts on its last judged figure; one never judged
 * is never picked.
 */
export function changedLine(lines: ReadonlyArray<{ ticker: string; records: readonly ConditionRecord[] }>): StripLine | null {
  const out: StripLine[] = [];
  for (const entry of lines) {
    for (const record of entry.records) {
      // A night still waiting for its figure keeps the last judged one (and a broken line stays broken on it).
      const status = record.status === "holds" || record.status === "broken" ? record.status : record.judged_status;
      const now = record.status === "holds" || record.status === "broken" ? record.now : record.judged_now;
      if ((status !== "holds" && status !== "broken") || now === null || !Number.isFinite(now)) continue;
      const condition = conditionOf(record.key);
      if (!condition) continue;
      const judgedHere = record.status === "holds" || record.status === "broken";
      const day = record.report_date ?? record.as_of?.slice(0, 10) ?? record.since;
      out.push({
        ticker: entry.ticker,
        condition,
        label: capital(conditionText(condition).replace(/^the /, "")),
        nowText: figureText(condition.metric, now, condition.value),
        now,
        status,
        source: (judgedHere ? record.source : record.judged_source) || record.source,
        day,
        quarter: record.report_date ? record.report_quarter : null,
        report: Boolean(record.report_date),
        since: record.since,
        href: record.href,
      });
    }
  }
  out.sort((a, b) => b.since.localeCompare(a.since) || Number(b.status === "broken") - Number(a.status === "broken") || b.day.localeCompare(a.day) || a.ticker.localeCompare(b.ticker));
  return out[0] ?? null;
}

/** The earliest report on or after today among `tickers`, from `reports` (ticker → day). */
export function nextReport(tickers: readonly string[], reports: Readonly<Record<string, string>>, today: string): ThesisStripData["next"] {
  let best: ThesisStripData["next"] = null;
  for (const ticker of tickers) {
    const day = reports[ticker];
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today) continue;
    if (!best || day < best.day || (day === best.day && ticker < best.ticker)) best = { ticker, day };
  }
  return best;
}

export type StripThesis = { id: string; name: string; enabled: boolean; tickers: string[]; state: ThesisState | null };

/**
 * The thesis the strip shows: a checked one, switched on first, then the worst status, then the latest check. Null
 * when none has a check with a judged line.
 */
export function thesisStrip(theses: readonly StripThesis[], reports: Readonly<Record<string, string>>, today: string): ThesisStripData | null {
  const checked = theses.filter((entry): entry is StripThesis & { state: ThesisState } => Boolean(entry.state && entry.state.status !== "waiting"));
  checked.sort(
    (a, b) =>
      Number(b.enabled) - Number(a.enabled) ||
      STATUS_RANK[b.state.status] - STATUS_RANK[a.state.status] ||
      b.state.checked_at.localeCompare(a.state.checked_at) ||
      a.id.localeCompare(b.id),
  );
  const pick = checked[0];
  if (!pick) return null;
  return {
    name: pick.name,
    href: thesisHref(pick.id),
    status: pick.state.status as ThesisStripData["status"],
    counts: pick.state.counts,
    line: changedLine(pick.state.lines.filter((line) => pick.tickers.includes(line.ticker))),
    next: nextReport(pick.tickers, reports, today),
  };
}

/**
 * Without a thesis, the person's measurable reasons on single stocks as one strip: every condition's latest record,
 * rolled up by the thesis rules (no filing risks: reasons are not checked against filings). Null when none is judged.
 */
export function reasonsStrip(records: ReadonlyArray<{ ticker: string; records: readonly ConditionRecord[] }>, reports: Readonly<Record<string, string>>, today: string): ThesisStripData | null {
  const verdicts = records.flatMap((entry) => entry.records.map((record) => ({ ticker: entry.ticker, status: record.status })));
  if (verdicts.length === 0) return null;
  const rolled = rollUp(verdicts, []);
  if (rolled.status === "waiting") return null;
  const line = changedLine(records);
  return {
    name: "Your reasons",
    href: line ? `/stock/${encodeURIComponent(line.ticker)}` : "/portfolio",
    status: rolled.status,
    counts: rolled.counts,
    line,
    next: nextReport(records.map((entry) => entry.ticker), reports, today),
  };
}
