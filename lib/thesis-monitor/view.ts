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

/* ── one scale per figure ───────────────────────────────────────────────── */

export type Scale = { from: number; to: number };

/** The smallest of 1, 2, 2.5, 5 × 10^k at or above `x` (x > 0). */
function niceCeil(x: number): number {
  if (!(x > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(x));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= x * (1 - 1e-9)) return step * power;
  return 10 * power;
}

const MARGINS = new Set(["gross_margin", "operating_margin"]);

/**
 * One scale per figure for every bar on the page, so lengths compare across cards: margins run 0 to 100%; any other
 * percent or ratio from zero (or a round number under the lowest) to a round number over the highest, but never more
 * than three times the highest line, so one outlier (a 256% grower) cannot shrink every other bar to a sliver. A
 * figure past the end is drawn capped, with its number beside it. Prices and dividends are each company's own, so
 * they keep a scale of their own (left out here).
 */
export function sharedScales(companies: readonly CompanyView[]): Partial<Record<Condition["metric"], Scale>> {
  const byMetric = new Map<Condition["metric"], { values: number[]; lines: number[] }>();
  for (const company of companies) {
    for (const line of company.lines) {
      const metric = line.condition.metric;
      if (METRICS[metric].unit === "usd") continue;
      const entry = byMetric.get(metric) ?? { values: [], lines: [] };
      entry.lines.push(line.condition.value);
      if (line.now !== null && line.status !== "unknown") entry.values.push(line.now);
      byMetric.set(metric, entry);
    }
  }
  const out: Partial<Record<Condition["metric"], Scale>> = {};
  for (const [metric, { values, lines }] of byMetric) {
    const maxLine = Math.max(...lines);
    const all = [...values, ...lines];
    const lowest = Math.min(...all);
    const cap = Math.max(...lines.map(Math.abs)) * 3 || 1;
    const from = lowest < 0 ? -niceCeil(Math.min(-lowest, cap)) : 0;
    let to: number;
    if (MARGINS.has(metric)) to = 100;
    else {
      const highest = Math.max(...all);
      to = niceCeil(Math.max(Math.min(highest, cap), maxLine * 1.1, 1));
    }
    out[metric] = { from, to: to > from ? to : from + 1 };
  }
  return out;
}

/** "Revenue growth 0–100%", once per figure, for the scale legend. */
export function scaleWords(metric: Condition["metric"], scale: Scale): string {
  const unit = METRICS[metric].unit === "pct" ? "%" : "";
  const end = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value)}${unit}`;
  return `${METRICS[metric].label} ${end(scale.from)}–${end(scale.to)}`;
}

/** "Q3" or "Nov 3" from a waiting line ("Waiting for the figures from the Q3 report, Nov 3."), for "Waiting for Q3". */
export function waitingFor(text: string): string | null {
  const match = /Waiting for (?:the figures from|[A-Z.]+'s EPS from) the (Q\d) report|Waiting for (?:the figures from|[A-Z.]+'s EPS from) the (\w{3} \d{1,2}) report/.exec(text);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/** The oldest and newest day the verdicts stand on, for "lines from reports Aug 26 – Nov 8". */
export function basisSpan(companies: readonly CompanyView[]): { from: string; to: string } | null {
  const days = companies.flatMap((company) => (company.basis ? [company.basis.day] : [])).sort();
  return days.length > 0 ? { from: days[0]!, to: days[days.length - 1]! } : null;
}
