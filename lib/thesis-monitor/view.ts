/**
 * What the thesis page shows, worked out from the stored thesis and its latest check. Pure: safe on the client.
 */

import { conditionKey, conditionText, figureText, METRICS, type Condition, type ConditionRecord } from "@/lib/thesis-watch/conditions";

import type { ThesisHistoryRow, ThesisRisk, ThesisSpec, ThesisState, ThesisStatus } from "./model";

export type LineView = {
  key: string;
  condition: Condition;
  /** "Revenue growth > 40%". */
  label: string;
  status: "holds" | "broken" | "unknown";
  now: number | null;
  /** The figure in its unit, never reading the same as the line. */
  nowText: string | null;
  /** What the check found, one line ("Waiting for the figures from the Q3 report, Nov 3."). */
  text: string;
  /** Where the figure comes from, dated: for the hover. */
  source: string;
  /** Not checked since the line was saved. */
  fresh: boolean;
};

export type CompanyView = {
  ticker: string;
  lines: LineView[];
  risk: ThesisRisk | null;
  broken: number;
  /** What the verdicts stand on: the newest report judged ("Q2", Aug 27), else the newest figure's day. */
  basis: { quarter: string | null; day: string; report: boolean } | null;
};

/** The newest report the records were judged on, else the newest figure's own day. */
function basisOf(records: readonly ConditionRecord[]): CompanyView["basis"] {
  const judged = records.filter((record) => record.status !== "unknown");
  const report = judged.filter((record) => record.report_date).sort((a, b) => b.report_date!.localeCompare(a.report_date!))[0];
  if (report) return { quarter: report.report_quarter, day: report.report_date!, report: true };
  const day = judged.map((record) => record.as_of).filter((value): value is string => Boolean(value)).sort().at(-1);
  return day ? { quarter: null, day, report: false } : null;
}

function capital(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function lineOf(condition: Condition, record: ConditionRecord | null): LineView {
  const key = conditionKey(condition);
  const label = capital(conditionText(condition).replace(/^the /, ""));
  if (!record) return { key, condition, label, status: "unknown", now: null, nowText: null, text: "Checked after the next close.", source: "", fresh: true };
  return {
    key,
    condition,
    label,
    status: record.status,
    now: record.now,
    nowText: record.now !== null ? figureText(condition.metric, record.now, condition.value) : null,
    text: record.line,
    source: record.source,
    fresh: false,
  };
}

/**
 * Each company with its lines as last checked, the ones that need a look first (a broken line, then new risks), then
 * the ones with more lines (so cards of one height share a row), then the person's order.
 */
export function companiesView(spec: Pick<ThesisSpec, "lines">, state: ThesisState | null, tickers: readonly string[]): CompanyView[] {
  const inBasket = new Set(tickers);
  const records = new Map((state?.lines ?? []).map((line) => [line.ticker, line.records]));
  const risks = new Map((state?.risks ?? []).map((risk) => [risk.ticker, risk]));
  return spec.lines
    .filter((line) => inBasket.has(line.ticker))
    .map((line, index) => {
      const stored = records.get(line.ticker) ?? [];
      const lines = line.conditions.map((condition) => lineOf(condition, stored.find((record) => record.key === conditionKey(condition)) ?? null));
      const view: CompanyView = {
        ticker: line.ticker,
        lines,
        risk: risks.get(line.ticker) ?? null,
        broken: lines.filter((entry) => entry.status === "broken").length,
        basis: basisOf(stored.filter((record) => line.conditions.some((condition) => conditionKey(condition) === record.key))),
      };
      return { view, index };
    })
    .sort((a, b) => b.view.broken - a.view.broken || Number(Boolean(b.view.risk)) - Number(Boolean(a.view.risk)) || b.view.lines.length - a.view.lines.length || a.index - b.index)
    .map((entry) => entry.view);
}

/** The figure's unit, for a bar's ends. */
export function unitOf(condition: Condition): "pct" | "usd" | "ratio" {
  return METRICS[condition.metric].unit;
}

/* ── history ────────────────────────────────────────────────────────────── */

export type HistoryStretch = {
  from: string;
  to: string;
  status: ThesisStatus;
  holds: number;
  broke: number;
  waiting: number;
  checks: number;
  sources: string[];
};

/**
 * The dated record of checks, newest first, with checks in a row that found the same thing folded into one stretch
 * (owner rule 1: the same line is never repeated down the list); every check keeps its day in the stretch's range.
 */
export function historyStretches(history: readonly ThesisHistoryRow[]): HistoryStretch[] {
  const out: HistoryStretch[] = [];
  for (const row of [...history].sort((a, b) => a.day.localeCompare(b.day))) {
    const last = out[out.length - 1];
    if (last && last.status === row.status && last.holds === row.holds && last.broke === row.broke && last.waiting === row.waiting) {
      last.to = row.day;
      last.checks += 1;
      last.sources = [...new Set([...last.sources, ...row.sources])].slice(0, 6);
      continue;
    }
    out.push({ from: row.day, to: row.day, status: row.status, holds: row.holds, broke: row.broke, waiting: row.waiting, checks: 1, sources: row.sources });
  }
  return out.reverse();
}
