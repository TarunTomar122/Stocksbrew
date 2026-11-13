/**
 * Measurable conditions on a reason: "Holds if revenue growth > 20%". A person adds one or two to the reason they
 * saved for a stock, each picked from a fixed menu of figures we store, with an operator and a number. The reason
 * watcher checks them on every nightly run, and once on the night a new report's figures land (the event check).
 *
 * Stored on the person's own reason (`theses[id].conditions`, additive). Pure: no server imports, so the reasons
 * sheet, the stock page, the route, the nightly run and the tests share the menu, the bounds and the words.
 *
 * Every figure is a stored one with its date and source; when a report has landed and its figures have not, the
 * condition is unknown, never "holds".
 */

/* ── the menu ───────────────────────────────────────────────────────────── */

export const CONDITION_METRICS = ["revenue_growth", "gross_margin", "operating_margin", "eps_surprise", "dividend", "price", "pe"] as const;
export type ConditionMetric = (typeof CONDITION_METRICS)[number];
export type ConditionOp = "above" | "below";
export type Condition = { metric: ConditionMetric; op: ConditionOp; value: number };

/** At most this many conditions on one reason. */
export const MAX_CONDITIONS = 2;

export type MetricSpec = {
  /** Menu words: "Revenue growth". */
  label: string;
  /** Lower-case, inside a sentence: "revenue growth". */
  words: string;
  unit: "pct" | "usd" | "ratio";
  ops: readonly ConditionOp[];
  /** The operator a new condition starts with. */
  defaultOp: ConditionOp;
  /** Sane bounds for the number a person types. Price is also held to a band around the stock's own price. */
  min: number;
  max: number;
  /** When a new value can arrive: with a quarterly report, or any day. */
  timing: "report" | "daily";
  /** Hover words: what the figure is, plainly. */
  about: string;
};

export const METRICS: Record<ConditionMetric, MetricSpec> = {
  revenue_growth: {
    label: "Revenue growth",
    words: "revenue growth",
    unit: "pct",
    ops: ["above", "below"],
    defaultOp: "above",
    min: -100,
    max: 10_000,
    timing: "report",
    about: "Revenue over the last twelve months against the twelve before.",
  },
  gross_margin: {
    label: "Gross margin",
    words: "gross margin",
    unit: "pct",
    ops: ["above", "below"],
    defaultOp: "above",
    min: -1000,
    max: 100,
    timing: "report",
    about: "Gross profit as a share of revenue, last twelve months.",
  },
  operating_margin: {
    label: "Operating margin",
    words: "operating margin",
    unit: "pct",
    ops: ["above", "below"],
    defaultOp: "above",
    min: -10_000,
    max: 100,
    timing: "report",
    about: "Operating income as a share of revenue, last twelve months.",
  },
  eps_surprise: {
    label: "EPS vs estimate",
    words: "EPS against the estimate",
    unit: "pct",
    ops: ["above", "below"],
    defaultOp: "above",
    min: -1000,
    max: 1000,
    timing: "report",
    about: "Earnings per share in the latest report against analysts' estimate.",
  },
  dividend: {
    label: "Dividend a share",
    words: "the dividend",
    unit: "usd",
    ops: ["above"],
    defaultOp: "above",
    min: 0.001,
    max: 1000,
    timing: "daily",
    about: "The latest regular payment a share. A dividend that stops counts as zero.",
  },
  price: {
    label: "Price",
    words: "the price",
    unit: "usd",
    ops: ["above", "below"],
    defaultOp: "above",
    min: 0.01,
    max: 1_000_000,
    timing: "daily",
    about: "The last daily close.",
  },
  pe: {
    label: "P/E",
    words: "the P/E",
    unit: "ratio",
    ops: ["below", "above"],
    defaultOp: "below",
    min: 1,
    max: 1000,
    timing: "daily",
    about: "Price against the last twelve months' earnings.",
  },
};

/** A typed price must sit within this band of the stock's own price: 0.2x to 5x. */
export const PRICE_BAND = { low: 0.2, high: 5 } as const;

export function isConditionMetric(value: unknown): value is ConditionMetric {
  return typeof value === "string" && (CONDITION_METRICS as readonly string[]).includes(value);
}

/** "revenue_growth:above:20": one condition's identity, stable across saves. */
export function conditionKey(condition: Condition): string {
  return `${condition.metric}:${condition.op}:${condition.value}`;
}

/* ── the stored figures ─────────────────────────────────────────────────── */

/** A quarterly report, from the company's 8-K results filing (tm_earnings_history). */
export type ReportRef = {
  /** New York day of the release. */
  date: string;
  /** "Q3", or "Q4" for the year's last report; null when the fiscal year cannot be placed. */
  quarter: string | null;
  /** When SEC accepted the filing, ISO; null when unknown. */
  acceptedAt: string | null;
  url: string | null;
};

/** One stored figure for one metric. */
export type MetricValue = {
  value: number;
  /** When the figure was stored, ISO or YYYY-MM-DD: compared with the report's time for staleness. */
  asOf: string;
  /** Where it comes from, in words. */
  source: string;
  href: string | null;
  /** The report this figure belongs to, when it is a per-report figure (EPS against the estimate). */
  reportDate?: string | null;
  /** The dividend has stopped: the last payment went ex on this day and none has come since. */
  stoppedSince?: string | null;
};

export type ConditionInputs = {
  ticker: string;
  /** The newest report on or before today, or null when none is stored. */
  report: ReportRef | null;
  values: Partial<Record<ConditionMetric, MetricValue>>;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The metrics this stock has a figure for: the only ones a person may pick. */
export function availableMetrics(inputs: ConditionInputs | null): ConditionMetric[] {
  if (!inputs) return [];
  // A dividend that has stopped cannot be offered as a line to keep: it would start broken.
  // Nor a P/E line on a loss: a P/E at or under zero has no meaning, and "P/E < 1" would be its prefill.
  return CONDITION_METRICS.filter(
    (metric) => fin(inputs.values[metric]?.value) && !(metric === "dividend" && inputs.values.dividend?.stoppedSince) && !(metric === "pe" && inputs.values.pe!.value <= 0),
  );
}

/* ── validation ─────────────────────────────────────────────────────────── */

export type ConditionsValidation = { ok: true; conditions: Condition[] } | { ok: false; error: "invalid_conditions" | "too_many_conditions" };

/**
 * The conditions a request sends for one reason, checked for shape and the fixed bounds: a known metric, an operator
 * that metric takes, a finite number in its bounds, at most MAX_CONDITIONS, no metric twice. Whether the stock has a
 * figure for each metric needs the store: `conditionsFitStock`.
 */
export function validateConditions(raw: unknown): ConditionsValidation {
  if (raw === null) return { ok: true, conditions: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_conditions" };
  if (raw.length > MAX_CONDITIONS) return { ok: false, error: "too_many_conditions" };
  const out: Condition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_conditions" };
    const row = item as Record<string, unknown>;
    if (!isConditionMetric(row.metric)) return { ok: false, error: "invalid_conditions" };
    const spec = METRICS[row.metric];
    if (row.op !== "above" && row.op !== "below") return { ok: false, error: "invalid_conditions" };
    if (!spec.ops.includes(row.op)) return { ok: false, error: "invalid_conditions" };
    const value = typeof row.value === "string" ? (row.value.trim() ? Number(row.value) : Number.NaN) : row.value;
    if (!fin(value) || value < spec.min || value > spec.max) return { ok: false, error: "invalid_conditions" };
    if (out.some((condition) => condition.metric === row.metric)) return { ok: false, error: "invalid_conditions" };
    out.push({ metric: row.metric, op: row.op, value: cleanNumber(row.metric, value) });
  }
  return { ok: true, conditions: out };
}

/** The number as stored: cents for dollars, one decimal for percents and ratios. */
export function cleanNumber(metric: ConditionMetric, value: number): number {
  const spec = METRICS[metric];
  if (spec.unit === "usd") return value >= 1 ? Math.round(value * 100) / 100 : Math.round(value * 10_000) / 10_000;
  return Math.round(value * 10) / 10;
}

/**
 * Whether every condition fits this stock: it has a figure for the metric, and a price line sits within PRICE_BAND of
 * its price. The id of the first metric that does not fit, or null.
 */
export function conditionsFitStock(conditions: readonly Condition[], inputs: ConditionInputs | null): ConditionMetric | null {
  const available = new Set(availableMetrics(inputs));
  for (const condition of conditions) {
    if (!available.has(condition.metric)) return condition.metric;
    if (condition.metric === "price") {
      const price = inputs!.values.price!.value;
      if (condition.value < price * PRICE_BAND.low || condition.value > price * PRICE_BAND.high) return condition.metric;
    }
  }
  return null;
}

/** The stored list on a reason, with anything malformed dropped. */
export function readConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const valid = validateConditions(raw.slice(0, MAX_CONDITIONS));
  if (valid.ok) return valid.conditions;
  // One bad row must not lose the good one.
  return raw
    .slice(0, MAX_CONDITIONS)
    .map((row) => validateConditions([row]))
    .flatMap((result) => (result.ok ? result.conditions : []))
    .filter((condition, index, all) => all.findIndex((other) => other.metric === condition.metric) === index);
}

/* ── a sensible first number ────────────────────────────────────────────── */

function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** A round price near `value`: whole dollars from $20, else cents. */
function niceUsd(value: number, way: "down" | "up"): number {
  const step = value >= 500 ? 10 : value >= 100 ? 5 : value >= 20 ? 1 : value >= 1 ? 0.05 : 0.01;
  const rounded = way === "down" ? floorTo(value, step) : ceilTo(value, step);
  return cleanNumber("price", rounded);
}

/**
 * The number a new condition starts with, from the stock's own figure: a line the stock clears today with some room,
 * so the condition holds when it is saved and breaks only on a real change.
 */
export function prefill(metric: ConditionMetric, op: ConditionOp, current: number): number {
  const spec = METRICS[metric];
  return Math.min(spec.max, Math.max(spec.min, firstLine(metric, op, current)));
}

function firstLine(metric: ConditionMetric, op: ConditionOp, current: number): number {
  const below = op === "below";
  switch (metric) {
    case "revenue_growth":
      // A quarter under today's pace, to the nearest 5 points (42% → 30%); a shrinking company: 5 points under.
      return below ? ceilTo(current + 5, 5) : current > 0 ? Math.max(0, floorTo(current * 0.75, 5)) : floorTo(current - 5, 5);
    case "gross_margin":
    case "operating_margin":
      return below ? ceilTo(current + 3, 1) : floorTo(current - 3, 1);
    case "eps_surprise":
      // Beat the estimate (above 0%); after a miss, miss by no more than a bit more than this time.
      return below ? Math.max(0, ceilTo(current + 5, 5)) : current >= 0 ? 0 : floorTo(current - 5, 5);
    case "dividend":
      // Keeps paying at least what it pays now: rounded down, so the line never starts above the payment.
      return current >= 1 ? Math.floor(current * 100) / 100 : Math.floor(current * 10_000) / 10_000;
    case "price":
      return below ? niceUsd(current * 1.1, "up") : niceUsd(current * 0.9, "down");
    case "pe":
      return below ? ceilTo(current * 1.25, 1) : Math.max(1, floorTo(current * 0.75, 1));
  }
}

/* ── words ──────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-03" → "Nov 3". */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return month && date ? `${MONTHS[month - 1]} ${date}` : day;
}

function pctText(value: number, digits: number): string {
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
}

function usdText(value: number, extra = 0): string {
  const digits = (value >= 100 && Math.abs(value - Math.round(value)) < 0.005 ? 0 : value < 1 ? 3 : 2) + extra;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: Math.min(4, digits) })}`;
}

/** A figure in its unit: "42%", "$150", "$0.26", "29". */
export function formatValue(metric: ConditionMetric, value: number, digits?: number): string {
  const unit = METRICS[metric].unit;
  if (unit === "usd") return usdText(value);
  const d = digits ?? (Math.abs(value) >= 10 ? 0 : 1);
  return unit === "pct" ? pctText(value, d) : value.toFixed(d).replace(/\.0+$/, "");
}

/** The figure with enough digits that it never reads the same as the line it is compared with (19.6% is not "20%" against 20%). */
export function figureText(metric: ConditionMetric, value: number, line: number): string {
  if (METRICS[metric].unit === "usd") {
    for (const extra of [0, 1, 2, 3, 4]) {
      const text = usdText(value, extra);
      // Judged on the number the text says: "$150.00" reads as the $150 line.
      if (value === line || Number(text.replace(/[$,]/g, "")) !== line) return text;
    }
    return usdText(value, 4);
  }
  for (const digits of [undefined, 1, 2]) {
    const text = formatValue(metric, value, digits);
    if (value === line || text !== formatValue(metric, line, digits)) return text;
  }
  return formatValue(metric, value, 2);
}

const OP_SIGN: Record<ConditionOp, string> = { above: ">", below: "<" };

/** "revenue growth > 20%", "the price < $150". */
export function conditionText(condition: Condition): string {
  return `${METRICS[condition.metric].words} ${OP_SIGN[condition.op]} ${formatValue(condition.metric, condition.value)}`;
}

/** "Holds if revenue growth > 20%". */
export function holdsIfText(condition: Condition): string {
  return `Holds if ${conditionText(condition)}`;
}

/* ── the check ──────────────────────────────────────────────────────────── */

export type ConditionStatus = "holds" | "broken" | "unknown";

/** Report figures older than this, with no report on file to say otherwise, are too old to judge. */
export const REPORT_FIGURE_MAX_DAYS = 120;
/** A close or a P/E older than this many days is too old to judge. */
export const DAILY_FIGURE_MAX_DAYS = 6;

export type ConditionResult = {
  key: string;
  condition: Condition;
  status: ConditionStatus;
  /** The figure judged, or null when there is none. */
  now: number | null;
  /** "42%": the figure in its unit, never reading the same as the line. */
  nowText: string | null;
  /** New York day of the figure. */
  asOf: string | null;
  /** The report the figure reflects (report metrics only). */
  report: ReportRef | null;
  /** One line, at most 15 words: what the check found. */
  line: string;
  /** Where the figure comes from, dated: "Revenue growth 42% after the Q3 report, Nov 3 (SEC 8-K)". */
  source: string;
  href: string | null;
  /**
   * A line that broke stays broken while the next figure is awaited: the figure and source are the last judged ones,
   * and this says what is awaited ("Q3", or the report's day). Null when the figure is tonight's own.
   */
  waitingFor?: string | null;
  /** A dividend line on a dividend that has stopped: the last ex-date. */
  stoppedSince?: string | null;
};

const DAY_MS = 86_400_000;

export function nyDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whether a stored figure came in before the report's own figures could have: its time is before SEC accepted the
 * release (or, with no accepted time, it is from the report's day or earlier).
 */
export function olderThanReport(asOf: string, report: ReportRef): boolean {
  if (report.acceptedAt && Number.isFinite(Date.parse(report.acceptedAt)) && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Date.parse(asOf) < Date.parse(report.acceptedAt);
  }
  return nyDay(asOf) <= report.date;
}

/** "the Q3 report, Nov 3", or "the Nov 3 report". */
export function reportWords(report: ReportRef): string {
  return report.quarter ? `the ${report.quarter} report, ${shortDay(report.date)}` : `the ${shortDay(report.date)} report`;
}

function holdsNow(condition: Condition, value: number): boolean {
  return condition.op === "above" ? value >= condition.value : value <= condition.value;
}

/** The broken line: "Revenue growth is 18%, under your 20%." */
function brokenLine(condition: Condition, value: number, nowText: string, figure: MetricValue, ticker: string): string {
  const line = formatValue(condition.metric, condition.value);
  const side = condition.op === "above" ? "under" : "over";
  switch (condition.metric) {
    case "price":
      return `${ticker} closed at ${nowText}, ${side} your ${line}.`;
    case "dividend":
      return figure.stoppedSince ? `No ${ticker} dividend has gone ex since ${shortDay(figure.stoppedSince)}.` : `${ticker}'s last dividend was ${nowText}, under your ${line}.`;
    case "eps_surprise":
      return value < 0 ? `EPS missed the estimate by ${nowText.replace("−", "")}, ${side} your ${line}.` : `EPS beat the estimate by ${nowText}, ${side} your ${line}.`;
    default: {
      const label = METRICS[condition.metric].label;
      // "is", not "fell to": a line set above today's figure never held, so nothing fell.
      return `${label} is ${nowText}, ${side} your ${line}.`;
    }
  }
}

/** The holds line, for the record on the report day: "AMD's Q3: revenue growth 42%, above your 20%. Reason holds." */
function holdsLine(condition: Condition, nowText: string, ticker: string, report: ReportRef | null): string {
  const side = condition.op === "above" ? "above" : "under";
  const lead = report ? `${ticker}'s ${report.quarter ?? shortDay(report.date)}` : ticker;
  const line = formatValue(condition.metric, condition.value);
  if (condition.metric === "eps_surprise") {
    const did = nowText.startsWith("−") ? `EPS missed the estimate by ${nowText.slice(1)}` : `EPS beat the estimate by ${nowText}`;
    return `${lead}: ${did}, ${side} your ${line}. Reason holds.`;
  }
  return `${lead}: ${METRICS[condition.metric].words} ${nowText}, ${side} your ${line}. Reason holds.`;
}

function sourceLine(condition: Condition, nowText: string, figure: MetricValue, report: ReportRef | null): string {
  const label = METRICS[condition.metric].label;
  if (report) return `${label} ${nowText} after ${reportWords(report)} (SEC 8-K)`;
  return `${label} ${nowText}, ${shortDay(nyDay(figure.asOf))} (${figure.source})`;
}

/**
 * One condition against the stored figures on `today`. Pure.
 * - A report metric is unknown when a report has landed and its figure is from before it (waiting for the figures),
 *   or when its figure is older than REPORT_FIGURE_MAX_DAYS with no report on file.
 * - EPS against the estimate is unknown unless the stored figure is the latest report's.
 * - A daily metric is unknown when its figure is older than DAILY_FIGURE_MAX_DAYS.
 * The line at exactly the threshold holds.
 */
export function judgeCondition(condition: Condition, inputs: ConditionInputs, today: string): ConditionResult {
  const spec = METRICS[condition.metric];
  const figure = inputs.values[condition.metric] ?? null;
  const key = conditionKey(condition);
  const base = { key, condition, href: figure?.href ?? null };
  const unknown = (line: string, report: ReportRef | null = null): ConditionResult => ({
    ...base,
    status: "unknown",
    now: null,
    nowText: null,
    asOf: figure ? nyDay(figure.asOf) : null,
    report,
    line,
    source: figure ? `${spec.label}, ${shortDay(nyDay(figure.asOf))} (${figure.source})` : spec.label,
  });
  if (!figure || !fin(figure.value)) return unknown(`No ${spec.words} figure for ${inputs.ticker} yet.`);
  const day = nyDay(figure.asOf);
  let report: ReportRef | null = null;
  if (spec.timing === "report") {
    report = inputs.report && inputs.report.date <= today ? inputs.report : null;
    if (condition.metric === "eps_surprise") {
      if (!report || figure.reportDate !== report.date) return unknown(report ? `Waiting for ${inputs.ticker}'s EPS from ${reportWords(report)}.` : `No recent report for ${inputs.ticker} on file.`, report);
    } else if (report && olderThanReport(figure.asOf, report)) {
      return unknown(`Waiting for the figures from ${reportWords(report)}.`, report);
    } else if (!report && daysBetween(day, today) > REPORT_FIGURE_MAX_DAYS) {
      return unknown(`${spec.label} figure is from ${shortDay(day)}, too old to judge.`);
    }
  } else if (daysBetween(day, today) > DAILY_FIGURE_MAX_DAYS) {
    return unknown(`${spec.label} figure is from ${shortDay(day)}, too old to judge.`);
  }
  // A stopped dividend is no payment at all.
  const value = condition.metric === "dividend" && figure.stoppedSince ? 0 : figure.value;
  const nowText = figureText(condition.metric, value, condition.value);
  const holds = holdsNow(condition, value);
  return {
    ...base,
    status: holds ? "holds" : "broken",
    stoppedSince: condition.metric === "dividend" ? (figure.stoppedSince ?? null) : null,
    now: value,
    nowText,
    asOf: day,
    report,
    line: holds ? holdsLine(condition, nowText, inputs.ticker, report) : brokenLine(condition, value, nowText, figure, inputs.ticker),
    source: sourceLine(condition, nowText, figure, report),
  };
}

/** A broken price line clears only once the close is this far past it (owner rule: stable calls, no daily flip-flop). */
export const PRICE_CLEAR_PCT = 1;

/** The record a line's bookkeeping carries on from: the same line, else the same figure (a line whose number was edited). */
export function previousFor(condition: Condition, previous: readonly ConditionRecord[]): ConditionRecord | null {
  return previous.find((record) => record.key === conditionKey(condition)) ?? previous.find((record) => record.metric === condition.metric) ?? null;
}

/**
 * Every condition against tonight's figures and the records of the last check (lib/thesis-watch/conditions.ts
 * ConditionRecord). On top of the stateless judge:
 * - A report figure exactly equal to the one last judged on an earlier report has not been refreshed yet, whatever
 *   its stored time says (the figures job stamps every scrape, changed or not): it waits as unknown.
 * - A line that was broken stays broken while its next figure is awaited (marked `waitingFor`), so the reason does not
 *   flip back to holding and break again the next night.
 * - A broken price line clears only once the close is PRICE_CLEAR_PCT past the line.
 */
export function judgeConditions(conditions: readonly Condition[], inputs: ConditionInputs | null, today: string, previous: readonly ConditionRecord[] = []): ConditionResult[] {
  if (!inputs) return [];
  return conditions.map((condition) => {
    let result = judgeCondition(condition, inputs, today);
    const before = previousFor(condition, previous);
    const report = result.report;
    if (
      result.status !== "unknown" &&
      report &&
      METRICS[condition.metric].timing === "report" &&
      condition.metric !== "eps_surprise" &&
      before?.report_date &&
      before.report_date < report.date &&
      before.judged_now !== null &&
      result.now === before.judged_now
    ) {
      result = { ...result, status: "unknown", now: null, nowText: null, line: `Waiting for the figures from ${reportWords(report)}.` };
    }
    if (
      condition.metric === "price" &&
      result.status === "holds" &&
      result.now !== null &&
      before?.key === result.key &&
      before.status === "broken" &&
      (condition.op === "above" ? result.now < condition.value * (1 + PRICE_CLEAR_PCT / 100) : result.now > condition.value * (1 - PRICE_CLEAR_PCT / 100))
    ) {
      const nowText = figureText("price", result.now, condition.value);
      result = { ...result, status: "broken", nowText, line: brokenLine(condition, result.now, nowText, { value: result.now, asOf: today, source: "", href: null }, inputs.ticker) };
    }
    if (result.status === "unknown" && before && before.judged_status === "broken" && before.judged_now !== null && !holdsNow(condition, before.judged_now)) {
      const nowText = figureText(condition.metric, before.judged_now, condition.value);
      const waiting = report ? (report.quarter ?? shortDay(report.date)) : null;
      result = {
        ...result,
        status: "broken",
        now: before.judged_now,
        nowText,
        asOf: before.as_of,
        line: brokenLine(condition, before.judged_now, nowText, { value: before.judged_now, asOf: before.as_of ?? today, source: "", href: null, stoppedSince: before.judged_stopped }, inputs.ticker),
        source: before.judged_source || result.source,
        report: null,
        waitingFor: waiting,
      };
    }
    return result;
  });
}

/* ── the record of checks, per condition ────────────────────────────────── */

/** What is kept per condition on the stored check (tm_thesis_checks), so a report is checked once. */
export type ConditionRecord = {
  key: string;
  /** The figure the line is on: a line whose number is edited keeps its report bookkeeping. */
  metric: ConditionMetric | null;
  status: ConditionStatus;
  now: number | null;
  /** The figure's own day. */
  as_of: string | null;
  line: string;
  source: string;
  href: string | null;
  /** The report whose figures were last judged (holds or broken): a later report date is a new report. */
  report_date: string | null;
  report_quarter: string | null;
  /** The New York day a new report's figures were first judged: the report-day line on the record. */
  checked_on: string | null;
  /** The day the status became what it is. */
  since: string;
  /**
   * The last figure actually judged (holds or broken), its verdict and source, carried over nights that wait: the
   * staleness guard compares tonight's figure with it, and a broken line stays broken on it until a new figure judges.
   */
  judged_now: number | null;
  judged_status: "holds" | "broken" | null;
  judged_source: string | null;
  judged_stopped: string | null;
};

/** A report this many days old or newer, judged for the first time when the condition is saved, still counts as news. */
export const FIRST_CHECK_REPORT_DAYS = 3;
/** A new report whose figures land later than this many days after it is recorded without a report-day line. */
export const LATE_FIGURES_DAYS = 7;

/**
 * The records after tonight's check. A report is checked once: `checked_on` is set the first night its figures are
 * judged (holds or broken), and stays on later nights. A night still waiting for the figures (unknown) keeps the
 * last judged report, so the next night tries again. A condition saved after a report only records it as news when
 * the report is at most FIRST_CHECK_REPORT_DAYS old.
 */
export function nextConditionRecords(stored: readonly ConditionRecord[], results: readonly ConditionResult[], today: string): ConditionRecord[] {
  return results.map((result) => {
    const before = previousFor(result.condition, stored);
    const sameLine = before?.key === result.key;
    // A figure judged tonight: not a wait, not a broken line carried on its old figure.
    const fresh = result.status !== "unknown" && !result.waitingFor;
    const judged = fresh && result.report ? result.report : null;
    let reportDate = before?.report_date ?? null;
    let quarter = before?.report_quarter ?? null;
    let checkedOn = before?.checked_on ?? null;
    // Keyed on the figure and the report, not the line's number: an edited line does not make the same report news twice.
    if (judged && judged.date !== reportDate) {
      // News only while the report is fresh: a line first saved after it, or figures that came weeks late, are a baseline.
      const news = daysBetween(judged.date, today) <= (before?.report_date ? LATE_FIGURES_DAYS : FIRST_CHECK_REPORT_DAYS);
      reportDate = judged.date;
      quarter = judged.quarter;
      checkedOn = news ? today : null;
    }
    const stopped = fresh ? (result.stoppedSince ?? null) : null;
    return {
      key: result.key,
      metric: result.condition.metric,
      status: result.status,
      now: result.now,
      as_of: result.asOf,
      line: result.line,
      source: result.source,
      href: result.href,
      report_date: reportDate,
      report_quarter: quarter,
      checked_on: checkedOn,
      since: before && sameLine && before.status === result.status ? before.since : today,
      judged_now: fresh ? result.now : (before?.judged_now ?? null),
      judged_status: fresh ? (result.status as "holds" | "broken") : (before?.judged_status ?? null),
      judged_source: fresh ? result.source : (before?.judged_source ?? null),
      judged_stopped: fresh ? stopped : (before?.judged_stopped ?? null),
    };
  });
}

const STATUSES = new Set<ConditionStatus>(["holds", "broken", "unknown"]);
const s = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

export function readConditionRecords(raw: unknown): ConditionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ConditionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!s(row.key) || !STATUSES.has(row.status as ConditionStatus) || !s(row.since)) continue;
    out.push({
      key: row.key as string,
      status: row.status as ConditionStatus,
      now: fin(row.now) ? row.now : null,
      as_of: s(row.as_of),
      line: s(row.line) ?? "",
      source: s(row.source) ?? "",
      href: s(row.href),
      report_date: s(row.report_date),
      report_quarter: s(row.report_quarter),
      checked_on: s(row.checked_on),
      since: row.since as string,
      metric: isConditionMetric(row.metric) ? row.metric : isConditionMetric(String(row.key).split(":")[0]) ? (String(row.key).split(":")[0] as ConditionMetric) : null,
      // Older records kept only `now`: a judged status stands for its judged figure.
      judged_now: fin(row.judged_now) ? row.judged_now : row.status !== "unknown" && fin(row.now) ? row.now : null,
      judged_status: row.judged_status === "holds" || row.judged_status === "broken" ? row.judged_status : row.status === "holds" || row.status === "broken" ? row.status : null,
      judged_source: s(row.judged_source) ?? (row.status !== "unknown" ? s(row.source) : null),
      judged_stopped: s(row.judged_stopped),
    });
  }
  return out;
}

/* ── the verdict ────────────────────────────────────────────────────────── */

/** A broken condition as one of the watcher's signals: one hard signal breaks the reason. */
export function conditionSignal(result: ConditionResult, ticker: string) {
  return {
    id: `condition_${result.condition.metric}`,
    level: "hard" as const,
    text: result.line,
    source: result.source,
    asOf: result.asOf ?? "",
    href: result.href,
    data: {
      ticker,
      now: result.now,
      line: result.condition.value,
      metric: result.condition.metric,
      report_day: result.report?.date ?? null,
    } as Record<string, string | number | null>,
  };
}

/* ── the bar ────────────────────────────────────────────────────────────── */

/** The smallest of 1, 2, 2.5, 5 × 10^k at or above `x` (x > 0). */
function niceCeil(x: number): number {
  if (!(x > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(x));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= x * (1 - 1e-9)) return step * power;
  return 10 * power;
}

export type BarScale = {
  /** The scale's two ends, in the figure's unit, labelled once under the bar. */
  from: number;
  to: number;
  /** Positions on the track, 0 to 1. */
  value: number;
  line: number;
  /** Where zero sits when the scale runs below it (a shrinking company, a loss, an EPS miss); null when it starts at zero. */
  zero: number | null;
};

/**
 * One honest scale for a figure and the person's line: it starts at zero (or at a round number under the lowest of the
 * two, with zero marked), and ends at 100% for a margin, else at the next round number over the highest. So 83%
 * against a 60% line reads 83 and 60 of the same 0-to-100 track. For the reasons sheet and the stock page.
 */
export function barScale(metric: ConditionMetric, value: number, line: number): BarScale {
  const low = Math.min(value, line);
  const high = Math.max(value, line);
  const from = low < 0 ? -niceCeil(-low) : 0;
  const margin = metric === "gross_margin" || metric === "operating_margin";
  let to = margin && high <= 100 && high > 0 ? 100 : high > 0 ? niceCeil(high) : 0;
  if (to <= from) to = from + 1;
  // A figure right at the top end leaves no room to read it against the end: one step more.
  if (to > 0 && high >= to * 0.97 && !(margin && to === 100)) to = niceCeil(to * 1.01);
  const at = (x: number) => Math.min(1, Math.max(0, (x - from) / (to - from)));
  return { from, to, value: at(value), line: at(line), zero: from < 0 ? at(0) : null };
}

/** Words in a line, for the word budget (docs/owner-design-rules.md rule 8). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The fiscal quarter of a report: whole quarters since the fiscal year's end before it (from the 10-K's period end). */
export function fiscalQuarter(periodEnd: string | null, yearEnd: string | null, periodicForm: string | null): string | null {
  if (periodicForm === "10-K") return "Q4";
  if (!periodEnd || !yearEnd || yearEnd >= periodEnd) return null;
  const months = daysBetween(yearEnd, periodEnd) / 30.44;
  const quarter = Math.round(months / 3);
  return quarter >= 1 && quarter <= 3 ? `Q${quarter}` : null;
}
