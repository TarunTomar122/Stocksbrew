/**
 * Full research on one stock: the shapes the orchestrator, the store, the API
 * and the page share. Pure (no server imports) so client components can read it.
 *
 * A report is written once from evidence we gathered in fixed steps. Every
 * sentence cites the sources it came from as [S1] markers, and every figure in
 * the text was checked against the evidence before it was saved
 * (lib/research/check.ts).
 */

export const RESEARCH_COLLECTION = "tm_research_reports";
export const RESEARCH_SHARES_COLLECTION = "tm_research_shares";

/** A run that has said nothing for this long is treated as stopped. */
export const RESEARCH_STALE_MS = 6 * 60 * 1000;

export type ResearchSourceKind = "filing" | "news" | "data" | "ours" | "social";

export type ResearchSource = {
  /** "S1", "S2", ... in the order they were first read. */
  id: string;
  label: string;
  /** An outside link (SEC, a publisher) or one of our pages ("/stock/NVDA"). Null when there is nothing to open. */
  url: string | null;
  kind: ResearchSourceKind;
  /** ISO date or time the source is current to, when known. */
  as_of: string | null;
};

export type ResearchStepId =
  | "brief"
  | "financials"
  | "earnings"
  | "annual"
  | "quarterly"
  | "filings"
  | "ownership"
  | "peers"
  | "news"
  | "social"
  | "write"
  | "check";

export type ResearchStepStatus = "pending" | "running" | "done" | "empty" | "failed";

export type ResearchStep = {
  id: ResearchStepId;
  label: string;
  status: ResearchStepStatus;
  /** One short line on what the step found, or why it found nothing. */
  detail: string | null;
};

/** The steps in the order a person sees them. */
export const RESEARCH_STEPS: Array<{ id: ResearchStepId; label: string }> = [
  { id: "brief", label: "Reading our brief and the price history" },
  { id: "financials", label: "Reading the financials and their history" },
  { id: "earnings", label: "Reading the last four earnings reports" },
  { id: "annual", label: "Reading the latest 10-K" },
  { id: "quarterly", label: "Reading the latest 10-Q" },
  { id: "filings", label: "Checking recent SEC filings" },
  { id: "ownership", label: "Checking who is buying and selling" },
  { id: "peers", label: "Comparing with peers" },
  { id: "news", label: "Reading the last 30 days of news" },
  { id: "social", label: "Checking Reddit and policy posts" },
  { id: "write", label: "Writing the report" },
  { id: "check", label: "Checking every number against its source" },
];

export function initialSteps(): ResearchStep[] {
  return RESEARCH_STEPS.map((step) => ({ ...step, status: "pending" as const, detail: null }));
}

export type ResearchPoint = { title: string; text: string };
export type ResearchWatch = { date: string | null; text: string };

/** What the model wrote, after the numbers check. Text carries [S#] citation markers. */
export type ResearchBody = {
  headline: string;
  /** Up to five one-sentence lines, the most important first. */
  summary: string[];
  business: string[];
  drivers: string[];
  bull: ResearchPoint[];
  bear: ResearchPoint[];
  valuation: string[];
  numbers: string[];
  ownership: string[];
  risks: ResearchPoint[];
  change: string[];
  watch: ResearchWatch[];
};

export type PricePoint = { date: string; close: number };

/** Charts are drawn from the evidence by our code, never from model text. */
export type ResearchCharts = {
  price: {
    points: PricePoint[];
    benchmark: PricePoint[] | null;
    return_pct: number | null;
    benchmark_return_pct: number | null;
    source_id: string;
  } | null;
  revenue: {
    rows: Array<{ period: string; revenue: number; op_margin_pct: number | null }>;
    source_id: string;
  } | null;
  reactions: {
    rows: Array<{ date: string; pct: number; surprise: "beat" | "miss" | "in-line" | "reported" | null }>;
    source_id: string;
  } | null;
  peers: {
    metric: "pe" | "ps";
    rows: Array<{ ticker: string; value: number; self: boolean }>;
    median: number | null;
    source_id: string;
  } | null;
  valuation: {
    pe: number;
    median: number | null;
    pctile: number | null;
    from: string | null;
    to?: string | null;
    source_id: string;
  } | null;
  stats: Array<{ label: string; value: string; sub: string | null; tone: "up" | "down" | "flat" | null }>;
};

export const EMPTY_CHARTS: ResearchCharts = { price: null, revenue: null, reactions: null, peers: null, valuation: null, stats: [] };

export type ResearchAudit = {
  /** Figures found in the text. */
  checked: number;
  /** Figures that matched a number in the evidence. */
  traced: number;
  /** Sentences removed because a figure in them matched nothing, as written. */
  removed: string[];
  /** Citation markers that named no source and were dropped. */
  citations_dropped: number;
};

export type ResearchUsage = {
  via: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  /** Wall time of the whole run. */
  ms: number;
};

export type ResearchStatus = "running" | "ready" | "failed";

export type ResearchReport = {
  /** "20261110T153012Z": the start time, unique per person and stock. */
  key: string;
  uid: string;
  ticker: string;
  name: string;
  status: ResearchStatus;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  steps: ResearchStep[];
  body: ResearchBody | null;
  sources: ResearchSource[];
  charts: ResearchCharts;
  /** Plain lines on what we looked for and could not find. */
  missing: string[];
  audit: ResearchAudit | null;
  usage: ResearchUsage | null;
  error: string | null;
  /** Set while the report has a public link. */
  share_id: string | null;
};

export type ResearchIndexItem = {
  key: string;
  ticker: string;
  name: string;
  status: ResearchStatus;
  created_at: string;
  headline: string | null;
};

/** Lines of the NDJSON stream POST /api/research sends while it works. */
export type ResearchEvent =
  | { type: "start"; key: string; ticker: string; steps: ResearchStep[] }
  | { type: "step"; step: ResearchStep }
  | { type: "done"; key: string; href: string; removed: number }
  | { type: "error"; code: string; message: string };

const KEY_RE = /^\d{8}T\d{6}Z$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const SHARE_RE = /^[a-z0-9]{16,40}$/;

export function isReportKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value);
}

export function isShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_RE.test(value);
}

/** "nvda", "BRK-B", " brk.b " to "NVDA", "BRK.B". Null when it cannot be a US ticker. */
export function cleanTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase().replace(/-/g, ".");
  return TICKER_RE.test(upper) ? upper : null;
}

/** The start time as a compact, sortable key. */
export function reportKeyAt(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

export function reportHref(ticker: string, key: string): string {
  return `/stock/${encodeURIComponent(ticker)}/research/${key}`;
}

export function sharedHref(ticker: string, shareId: string): string {
  return `/stock/${encodeURIComponent(ticker)}/research/s/${shareId}`;
}

/** A running report whose last write is older than the stale window stopped somewhere. */
export function isStale(report: Pick<ResearchReport, "status" | "updated_at">, now: number = Date.now()): boolean {
  if (report.status !== "running") return false;
  const at = Date.parse(report.updated_at);
  return !Number.isFinite(at) || now - at > RESEARCH_STALE_MS;
}
