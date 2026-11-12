/**
 * Earnings day reports: the shape stored by backend/agentdata/earnings_day.py
 * in `tm_earnings_day/{TICKER}__{date}`, and the pure rules the pages use on
 * it (who may see what, when a page is indexable, the words for each verdict).
 *
 * No server imports, so client components and tests can use it.
 *
 * Gating (lib/entitlements.ts rules): a report is written once for everyone
 * from a public filing, so the report page is free to read on every plan and
 * carries no price levels. What a plan changes is delivery: the read of a
 * report inside your briefing follows `briefing_personal` (covered stocks on
 * Free, every stock on Pro). An uncovered name on Free gets the title and the
 * link, never the read itself.
 */

export type EarningsDayVerdict = "beat" | "miss" | "in_line" | "pending" | "no_estimate";
export type GuidanceChange = "raised" | "lowered" | "mixed" | "narrowed" | "reaffirmed" | "issued" | "none";
export type GuidanceDirection = "raised" | "lowered" | "narrowed" | "reaffirmed" | "issued" | "new";

export type EarningsDayFigure = {
  value: number;
  prior?: number | null;
  quote?: string;
  prior_quote?: string;
  text_quote?: string;
  method?: string;
  label?: string;
};

export type EarningsDayGuidanceItem = {
  metric: string;
  label: string;
  period: string;
  low: number;
  high: number;
  unit: "usd" | "usd_per_share";
  prev_low?: number | null;
  prev_high?: number | null;
  prev_from?: string;
  direction: GuidanceDirection;
  quote?: string;
};

export type EarningsDayInsight = { id: string; tone: "up" | "down" | "flat"; text: string; so_what?: string | null };

export type EarningsDayReport = {
  ticker: string;
  company: string;
  event_date: string;
  market?: string;
  status: "complete" | "partial";
  session?: "bmo" | "amc" | "during";
  report_day?: string;
  period?: { label?: string; quarter?: number | null; year?: number | null; fiscal?: boolean } | null;
  filing?: {
    form: string;
    accession: string;
    filed_at: string;
    url: string;
    index_url: string;
    exhibit?: string;
  } | null;
  eps?: {
    estimate: number | null;
    actual: number | null;
    verdict: EarningsDayVerdict;
    surprise: number | null;
    surprise_pct: number | null;
    estimate_source?: string | null;
    actual_source?: string | null;
    source_url?: string | null;
    gaap?: EarningsDayFigure | null;
    adjusted?: EarningsDayFigure | null;
  } | null;
  revenue?: (EarningsDayFigure & { yoy_pct?: number | null; estimate?: number | null }) | null;
  guidance?: { change: GuidanceChange; items: EarningsDayGuidanceItem[]; headline_quote?: string | null } | null;
  quotes?: Array<{ text: string; speaker: string; why?: string | null }>;
  reaction?: {
    pct: number;
    basis: "next_session" | "report_day" | "after_hours" | "premarket" | "so_far_today";
    from_date?: string;
    from_close?: number;
    to_date?: string;
    price?: number;
    price_at?: string;
    final: boolean;
    typical_abs_pct?: number | null;
    typical_n?: number;
    history?: Array<{ day: string; session: string; pct: number }>;
    source?: string;
  } | null;
  read?: {
    title: string;
    headline: string;
    lead?: string;
    insights: EarningsDayInsight[];
    watch: string[];
  } | null;
  sources?: Array<{ label: string; url: string }>;
  next_report?: string | null;
  generated_at?: string;
  updated_at?: string;
  llm?: { used?: boolean; model?: string | null } | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function cleanReportTicker(raw: string | null | undefined): string | null {
  const ticker = decodeURIComponent(String(raw ?? "")).trim().toUpperCase();
  return TICKER.test(ticker) ? ticker : null;
}

export function isReportDay(raw: string | null | undefined): raw is string {
  if (!raw || !ISO_DAY.test(raw)) return false;
  const time = Date.parse(`${raw}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === raw;
}

export function earningsDayDocId(ticker: string, day: string): string {
  return `${ticker.toUpperCase().replace(/\//g, "-")}__${day}`;
}

export function earningsDayHref(ticker: string, day: string): string {
  return `/stock/${encodeURIComponent(ticker.toUpperCase())}/earnings/${day}`;
}

/** Parse a stored document defensively: anything without the basics is not a report. */
export function toReport(data: unknown): EarningsDayReport | null {
  if (!data || typeof data !== "object") return null;
  const doc = data as Partial<EarningsDayReport>;
  if (typeof doc.ticker !== "string" || !doc.ticker || typeof doc.event_date !== "string" || !isReportDay(doc.event_date.slice(0, 10))) return null;
  if (!doc.read || typeof doc.read.title !== "string") return null;
  return {
    ...(doc as EarningsDayReport),
    ticker: doc.ticker.toUpperCase(),
    event_date: doc.event_date.slice(0, 10),
    company: typeof doc.company === "string" && doc.company ? doc.company : doc.ticker.toUpperCase(),
    status: doc.status === "complete" ? "complete" : "partial",
    read: { ...doc.read, insights: Array.isArray(doc.read.insights) ? doc.read.insights : [], watch: Array.isArray(doc.read.watch) ? doc.read.watch : [] },
    quotes: Array.isArray(doc.quotes) ? doc.quotes : [],
    sources: Array.isArray(doc.sources) ? doc.sources : [],
  };
}

/**
 * Search engines get a report page once it says something of its own: the
 * release was read, and it carries a verdict on EPS or a revenue figure.
 * A page still waiting for the filing stays out of the index.
 */
export function isIndexable(report: EarningsDayReport | null | undefined): boolean {
  if (!report || report.status !== "complete" || !report.filing?.url || !report.read?.title) return false;
  const verdict = report.eps?.verdict;
  return verdict === "beat" || verdict === "miss" || verdict === "in_line" || typeof report.revenue?.value === "number";
}

/** How long the latest report counts as the stock's latest (the API, thesis watch). A quarter, until the next one. */
export const EARNINGS_DAY_LINK_DAYS = 100;
/** How far back the sitemap lists report pages. */
export const EARNINGS_DAY_SITEMAP_DAYS = 400;

export function daysSince(day: string, today: string): number {
  const a = Date.parse(`${day}T12:00:00Z`);
  const b = Date.parse(`${today}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : Number.POSITIVE_INFINITY;
}

/* ── words ──────────────────────────────────────────────────────────────── */

export function verdictWord(verdict: EarningsDayVerdict | null | undefined): string {
  switch (verdict) {
    case "beat":
      return "Beat";
    case "miss":
      return "Missed";
    case "in_line":
      return "In line";
    case "pending":
      return "Waiting for the actual";
    default:
      return "No estimate";
  }
}

export function guidanceWord(change: GuidanceChange | GuidanceDirection | null | undefined): string {
  switch (change) {
    case "raised":
      return "Raised";
    case "lowered":
      return "Cut";
    case "mixed":
      return "Mixed";
    case "narrowed":
      return "Narrowed";
    case "reaffirmed":
      return "Reaffirmed";
    case "issued":
    case "new":
      return "Given";
    default:
      return "None given";
  }
}

export function toneOfVerdict(verdict: EarningsDayVerdict | null | undefined): "up" | "down" | "flat" {
  return verdict === "beat" ? "up" : verdict === "miss" ? "down" : "flat";
}

export function toneOfGuidance(change: GuidanceChange | GuidanceDirection | null | undefined): "up" | "down" | "flat" {
  return change === "raised" ? "up" : change === "lowered" || change === "mixed" ? "down" : "flat";
}

export function reactionWhen(basis: NonNullable<EarningsDayReport["reaction"]>["basis"] | undefined): string {
  switch (basis) {
    case "next_session":
      return "next session";
    case "report_day":
      return "report day";
    case "after_hours":
      return "after hours";
    case "premarket":
      return "before the open";
    case "so_far_today":
      return "so far today";
    default:
      return "";
  }
}

/** $188.0 million, $1.50 billion, $736,000. */
export function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)} billion`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)} million`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** $1.62, −$0.29. */
export function fmtEps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
}

export function fmtRange(item: Pick<EarningsDayGuidanceItem, "low" | "high" | "unit">): string {
  const fmt = item.unit === "usd_per_share" ? fmtEps : fmtUsd;
  if (Math.abs(item.low - item.high) < 1e-9) return fmt(item.low);
  const low = fmt(item.low);
  const high = fmt(item.high);
  const unitLow = low.split(" ")[1];
  if (unitLow && unitLow === high.split(" ")[1]) return `${low.split(" ")[0]} to ${high}`;
  return `${low} to ${high}`;
}

export function fmtSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** One line for SEO and link previews: the headline, then the lead. */
export function reportDescription(report: EarningsDayReport): string {
  const parts = [report.read?.headline, report.read?.lead].filter((part): part is string => Boolean(part && part.trim()));
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297).replace(/\s+\S*$/, "")}…` : text;
}

/** The newest report per ticker, newest first. */
export function latestPerTicker(reports: readonly EarningsDayReport[]): EarningsDayReport[] {
  const best = new Map<string, EarningsDayReport>();
  for (const report of reports) {
    const known = best.get(report.ticker);
    if (!known || report.event_date > known.event_date) best.set(report.ticker, report);
  }
  return [...best.values()].sort((a, b) => b.event_date.localeCompare(a.event_date) || a.ticker.localeCompare(b.ticker));
}
