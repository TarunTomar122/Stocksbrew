/**
 * Types and pure helpers for the Follow surface (funds, Congress, insiders).
 *
 * Nothing here touches the database, so client components and tests can
 * import it. The loaders live in `lib/follow.ts`.
 */

export type FollowKind = "fund" | "congress";

/** Returns are fractions (0.12 is +12%). Null means the record is too short for that window. */
export type PerfStats = {
  r_1m: number | null;
  r_3m: number | null;
  r_ytd: number | null;
  r_1y: number | null;
  r_since: number | null;
  annualized: number | null;
  max_drawdown: number | null;
};

export type PerfKey =
  | "r_1m"
  | "r_3m"
  | "r_ytd"
  | "r_1y"
  | "r_since"
  | "max_drawdown";

export type PerfCard = {
  start_date: string;
  end_date: string;
  ended: boolean;
  fund: PerfStats;
  spy: PerfStats;
  covered_weight_latest: number | null;
  covered_weight_avg: number | null;
  spark?: number[];
  spark_spy?: number[];
};

export type Performance = PerfCard & {
  label: string;
  method: string;
  benchmark: string;
  sessions: number;
  filings_followed: number;
  covered_weight_min: number | null;
  priced_positions_latest: number;
  /** Rows of [date, fund, spy], both starting at 1. */
  curve: [string, number, number][];
  price_source: string;
};

export type HoldingChip = {
  ticker: string | null;
  name: string | null;
  weight: number | null;
};

export type ChangeBrief = {
  ticker: string | null;
  name: string | null;
  shares_delta_pct: number | null;
  weight: number | null;
  prev_weight: number | null;
};

export type ChangeCounts = {
  new: number;
  added: number;
  reduced: number;
  sold: number;
  held: number;
};

export type CongressStats = {
  trades: number;
  buys: number;
  sells: number;
  est_volume: number;
  median_lag_days: number | null;
  late_trades: number;
  top_bought: HoldingChip[];
};

export type FollowSource = {
  id: string;
  slug: string;
  kind: FollowKind;
  name: string;
  person: string;
  style: string;
  active: boolean;
  latest_date: string;
  latest_period?: string;
  lag_days?: number | null;
  headline: string;
  stock_value?: number;
  stock_positions?: number;
  top10_weight?: number | null;
  top_holdings: HoldingChip[];
  performance: PerfCard | null;
  party?: string;
  state?: string;
  district?: string;
  stats?: CongressStats;
  source: string;
  source_url: string;
  updated_at: string;
};

export type ActivityItem = {
  action: string;
  ticker: string | null;
  name: string | null;
  shares_delta_pct?: number | null;
  weight?: number | null;
  prev_weight?: number | null;
  amount_low?: number | null;
  amount_high?: number | null;
  transaction_date?: string;
};

export type FollowActivity = {
  id: string;
  source_id: string;
  kind: FollowKind;
  type: string;
  name: string;
  person: string;
  party?: string;
  date: string;
  period?: string;
  traded_from?: string;
  traded_to?: string;
  headline: string;
  items: ActivityItem[];
  url: string;
  source: string;
};

export type FundPosition = {
  cusip: string;
  ticker: string | null;
  name: string;
  issuer: string;
  title_class: string;
  value: number;
  weight: number | null;
  shares: number | null;
  change?: "new" | "added" | "reduced" | "held";
  shares_delta_pct?: number;
  prev_weight?: number;
  held_since?: string;
  held_since_is_floor?: boolean;
};

export type FundChange = {
  cusip: string;
  ticker: string | null;
  name: string;
  value?: number;
  prev_value?: number;
  shares?: number;
  prev_shares?: number;
  shares_delta?: number;
  delta_value?: number;
  weight?: number;
  prev_weight?: number;
  shares_delta_pct?: number;
};

export type FundChanges = {
  counts: ChangeCounts;
  new: FundChange[];
  added: FundChange[];
  reduced: FundChange[];
  sold: FundChange[];
};

export type FundFilingRow = {
  period: string;
  quarter: string;
  filed_at: string;
  latest_filed_at: string;
  lag_days: number;
  form: string;
  accession: string;
  url: string;
  amended: boolean;
  stock_value: number;
  stock_positions: number;
  option_positions: number;
};

export type FundOption = {
  cusip: string;
  ticker: string | null;
  name: string;
  put_call: string;
  underlying_value: number;
  shares: number | null;
};

export type FundProfile = {
  slug: string;
  kind: "fund";
  manager: string;
  fund: string;
  style: string;
  active: boolean;
  edgar_names: string[];
  latest: FundFilingRow & {
    top10_weight: number | null;
    options_underlying_value: number | null;
    other_positions: number;
  };
  median_lag_days: number | null;
  first_period: string;
  filings: FundFilingRow[];
  portfolio: FundPosition[];
  portfolio_shown: number;
  portfolio_mapped: number;
  options: FundOption[];
  changes: FundChanges | null;
  compared_with: string | null;
  headline: string;
  performance: Performance | null;
  source: string;
  source_url: string;
  updated_at: string;
};

export type CongressTrade = {
  trade_id: string;
  doc_id: string;
  person_id: string;
  person_name: string;
  ticker: string;
  company: string;
  asset_type: string;
  tx_type: "buy" | "sell";
  partial: boolean;
  owner: string;
  amount_low: number | null;
  amount_high: number | null;
  est_amount: number | null;
  transaction_date: string;
  disclosure_date: string;
  lag_days: number | null;
  source_url: string;
};

export type CongressReport = {
  doc_id: string;
  filed_at: string;
  trades: number;
  buys: number;
  sells: number;
  url: string;
};

export type CongressProfile = {
  slug: string;
  kind: "congress";
  name: string;
  person: string;
  party: string;
  state: string;
  district: string;
  sitting: boolean;
  style: string;
  active: boolean;
  latest_date: string;
  headline: string;
  stats: CongressStats;
  first_report: string;
  reports_count: number;
  trades: CongressTrade[];
  trades_total: number;
  reports: CongressReport[];
  performance: Performance | null;
  source: string;
  source_url: string;
  updated_at: string;
};

export type InsiderTrade = {
  id: string;
  symbol: string;
  company: string;
  insider: string;
  insider_id: string;
  role: string;
  tx_type: "buy" | "sell";
  shares: number;
  price: number | null;
  value: number | null;
  transaction_date: string;
  filing_date: string;
  /** US Eastern wall time, "2026-11-06T16:32:10", or just the date. */
  filed_at: string;
  lag_days: number | null;
  shares_after: number | null;
  ownership: string;
  plan_10b5_1: boolean;
  url: string;
};

export type InsiderCluster = {
  symbol: string;
  company: string;
  insiders: number;
  filings: number;
  first_date: string;
  last_date: string;
  last_filed_at: string;
  total_value: number | null;
  total_shares: number;
  members: {
    insider: string;
    role: string;
    value: number | null;
    shares: number;
  }[];
  window_days: number;
};

export type InsiderMeta = {
  generated_at: string;
  since: string;
  days: number;
  stocks: number;
  filings_read: number;
  trades: number;
  buys: number;
  sells: number;
  buy_value: number;
  sell_value: number;
  clusters: number;
  cluster_rule: string;
  source: string;
  source_url: string;
};

export const PERF_WINDOWS: { key: PerfKey; label: string; long: string }[] = [
  { key: "r_1m", label: "1M", long: "Past month" },
  { key: "r_3m", label: "3M", long: "Past 3 months" },
  { key: "r_ytd", label: "YTD", long: "This year" },
  { key: "r_1y", label: "1Y", long: "Past year" },
  { key: "r_since", label: "All", long: "Since first filing" },
  { key: "max_drawdown", label: "Max DD", long: "Worst drop" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MINUS = "−";

/** "2026-08-14" -> "Aug 14, 2026" (or "Aug 14" without the year). Parsed by hand so no timezone can shift the day. */
export function fmtDate(
  iso: string | null | undefined,
  withYear = true,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  const text = `${month} ${Number(match[3])}`;
  return withYear ? `${text}, ${match[1]}` : text;
}

/** "2026-08-14" -> "Aug 2026". */
export function fmtMonthYear(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : "";
}

/** "2026-11-06T16:32:10" -> "Nov 6, 4:32 PM ET". A bare date stays a date. */
export function fmtFiledAt(value: string | null | undefined): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value ?? "");
  if (!match) return "";
  const day = fmtDate(match[1], false);
  if (match[2] === undefined) return day;
  const hour = Number(match[2]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day}, ${hour12}:${match[3]} ${suffix} ET`;
}

/** "2026-06-30" -> "Q2 2026". */
export function quarterLabel(period: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(period ?? "");
  if (!match) return "";
  return `Q${Math.floor((Number(match[2]) - 1) / 3) + 1} ${match[1]}`;
}

/** A fraction as a signed percent: 0.1234 -> "+12.3%". Empty string for a missing value. */
export function fmtFrac(
  value: number | null | undefined,
  digits = 1,
  signed = true,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const pct = value * 100;
  const rounded = Number(pct.toFixed(digits));
  const sign = rounded < 0 ? MINUS : signed && rounded > 0 ? "+" : "";
  const abs = Math.abs(rounded);
  const text =
    abs >= 1000 ? Math.round(abs).toLocaleString("en-US") : abs.toFixed(digits);
  return `${sign}${text}%`;
}

/** Percentage points, for "vs S&P": 0.031 -> "+3.1". */
export function fmtPoints(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const rounded = Number((value * 100).toFixed(digits));
  const sign = rounded < 0 ? MINUS : rounded > 0 ? "+" : "";
  const abs = Math.abs(rounded);
  return `${sign}${abs >= 1000 ? Math.round(abs).toLocaleString("en-US") : abs.toFixed(digits)}`;
}

/** A weight as an unsigned percent: 0.2204 -> "22.0%", tiny ones as "<0.1%". */
export function fmtWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const pct = value * 100;
  if (pct > 0 && pct < 0.05) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

/** Dollars in the shortest readable form: 65950296923 -> "$66.0B". */
export function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  // Each cutoff sits just under the round number so 999,990 reads "$1.0M", never "$1000K".
  if (abs >= 999.5e9) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 999.5e6)
    return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 999.5e3)
    return `${sign}$${(abs / 1e6).toFixed(abs >= 99.95e6 ? 0 : 1)}M`;
  if (abs >= 999.5)
    return `${sign}$${(abs / 1e3).toFixed(abs >= 99.95e3 ? 0 : 1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Share counts: 227917808 -> "227.9M". */
export function fmtShares(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(abs / 1e3).toFixed(0)}K`;
  return Math.round(abs).toLocaleString("en-US");
}

/** A disclosure bracket: (1001, 15000) -> "$1K to $15K". */
export function fmtBracket(
  low: number | null | undefined,
  high: number | null | undefined,
): string {
  if (low == null) return "";
  // Brackets are round numbers ($1,001 to $15,000), so "$1K to $15K" reads better than "$1.0K to $15.0K".
  const short = (value: number) => fmtUsd(value).replace(/\.0(?=[KMBT]$)/, "");
  if (high == null || high < low) return `over ${short(low)}`;
  return `${short(low)} to ${short(high)}`;
}

/** Whole days from one ISO date to another; null when either is missing. */
export function daysBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from ?? "");
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to ?? "");
  if (!a || !b) return null;
  const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((end - start) / 86400000);
}

export function stockHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker.toUpperCase())}`;
}

export function sourceHref(slug: string): string {
  return `/follow/${encodeURIComponent(slug)}`;
}

/** The follower's return minus the S&P 500's over the same window, as a fraction. */
export function excess(
  card: PerfCard | null | undefined,
  key: PerfKey,
): number | null {
  const mine = card?.fund?.[key];
  const theirs = card?.spy?.[key];
  if (mine == null || theirs == null) return null;
  return mine - theirs;
}

export type SortKey = PerfKey | "name" | "latest_date" | "stock_value";

function sortValue(source: FollowSource, key: SortKey): number | string | null {
  if (key === "name") return source.name.toLowerCase();
  if (key === "latest_date") return source.latest_date || null;
  if (key === "stock_value")
    return source.stock_value ?? source.stats?.est_volume ?? null;
  return source.performance?.fund?.[key] ?? null;
}

/**
 * Followed sources first, then by the chosen column. A source with no value
 * for that column always sinks to the bottom, whichever way the sort runs.
 */
export function sortSources(
  sources: FollowSource[],
  key: SortKey,
  direction: "asc" | "desc",
  followed: ReadonlySet<string> = new Set(),
): FollowSource[] {
  const flip = direction === "asc" ? 1 : -1;
  return [...sources].sort((a, b) => {
    const pinned = Number(followed.has(b.slug)) - Number(followed.has(a.slug));
    if (pinned !== 0) return pinned;
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (left == null && right == null) return a.name.localeCompare(b.name);
    if (left == null) return 1;
    if (right == null) return -1;
    if (left < right) return -1 * flip;
    if (left > right) return 1 * flip;
    return a.name.localeCompare(b.name);
  });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const MAX_FOLLOWED = 200;

export function isValidSourceSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** Whatever is stored on the user doc, cleaned: valid slugs, no repeats, capped. */
export function normalizeFollowed(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const value of input) {
    if (isValidSourceSlug(value) && !out.includes(value)) out.push(value);
    if (out.length >= MAX_FOLLOWED) break;
  }
  return out;
}

export function toggleFollowed(
  current: unknown,
  slug: string,
  follow: boolean,
): string[] {
  const list = normalizeFollowed(current).filter((item) => item !== slug);
  if (follow && isValidSourceSlug(slug)) list.unshift(slug);
  return list.slice(0, MAX_FOLLOWED);
}

export type ChartGeometry = {
  fund: string;
  spy: string;
  /** Horizontal guides: y is 0 to 1 from the top, label is the return at that level. */
  ticks: { y: number; label: string }[];
  /** Years to mark on the x axis: x is 0 to 1 from the left. */
  years: { x: number; label: string }[];
  min: number;
  max: number;
  /** The log-scale bounds of the box, for placing a hover marker. */
  logBottom: number;
  logTop: number;
};

/**
 * Paths for the record chart in a 0..1000 by 0..1000 box (the SVG stretches
 * it). Values are growth of 1, drawn on a log scale so a long record does not
 * flatten its early years.
 */
export function chartGeometry(
  curve: [string, number, number][],
): ChartGeometry | null {
  const rows = curve.filter((row) => row[1] > 0 && row[2] > 0);
  if (rows.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    min = Math.min(min, row[1], row[2]);
    max = Math.max(max, row[1], row[2]);
  }
  const lo = Math.log(min);
  const hi = Math.log(max);
  const pad = (hi - lo || 0.1) * 0.06;
  const bottom = lo - pad;
  const top = hi + pad;
  const yOf = (value: number) =>
    1 - (Math.log(value) - bottom) / (top - bottom);
  const xOf = (index: number) => index / (rows.length - 1);
  const path = (column: 1 | 2) =>
    rows
      .map(
        (row, index) =>
          `${index === 0 ? "M" : "L"}${(xOf(index) * 1000).toFixed(1)},${(yOf(row[column]) * 1000).toFixed(1)}`,
      )
      .join("");

  const candidates = [
    -0.9, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50, 100,
  ];
  let ticks = candidates
    .map((ret) => ({ ret, y: yOf(1 + ret) }))
    .filter((tick) => tick.y >= 0.02 && tick.y <= 0.98);
  while (ticks.length > 6)
    ticks = ticks.filter(
      (_, index) => index % 2 === 0 || ticks[index].ret === 0,
    );
  const years: { x: number; label: string }[] = [];
  let lastYear = rows[0][0].slice(0, 4);
  rows.forEach((row, index) => {
    const year = row[0].slice(0, 4);
    if (year !== lastYear) {
      years.push({ x: xOf(index), label: year });
      lastYear = year;
    }
  });
  const every = Math.max(1, Math.ceil(years.length / 7));
  return {
    fund: path(1),
    spy: path(2),
    ticks: ticks.map((tick) => ({
      y: tick.y,
      label: tick.ret === 0 ? "0%" : fmtFrac(tick.ret, 0),
    })),
    years: years.filter((_, index) => index % every === 0),
    min,
    max,
    logBottom: bottom,
    logTop: top,
  };
}

/** Where a value sits in the chart box, 0 at the top and 1 at the bottom. */
export function chartY(geometry: ChartGeometry, value: number): number {
  return (
    1 -
    (Math.log(value) - geometry.logBottom) /
      (geometry.logTop - geometry.logBottom)
  );
}

/** Points for a tiny sparkline in a width by height box. */
export function sparkPath(
  values: number[] | undefined,
  width: number,
  height: number,
  floor?: number,
  ceil?: number,
): string {
  if (!values || values.length < 2) return "";
  const lo = floor ?? Math.min(...values);
  const hi = ceil ?? Math.max(...values);
  const span = hi - lo || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - lo) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

/** Lawmakers have 45 days to report a trade. */
export const STOCK_ACT_DEADLINE_DAYS = 45;

export function partyLabel(party: string | null | undefined): string {
  if (party === "D") return "Democrat";
  if (party === "R") return "Republican";
  if (party === "I") return "Independent";
  return "";
}

/** "Bought", "Added to" and so on, for one change in a 13F or a trade report. */
export function actionLabel(action: string): string {
  switch (action) {
    case "new":
      return "New";
    case "added":
      return "Added";
    case "reduced":
      return "Trimmed";
    case "sold":
      return "Exited";
    case "buy":
      return "Bought";
    case "sell":
      return "Sold";
    default:
      return action;
  }
}

export function actionTone(action: string): "up" | "down" {
  return action === "new" || action === "added" || action === "buy"
    ? "up"
    : "down";
}

/** How big one line of a filing was, in words a person would use. */
export function activitySize(item: ActivityItem): string {
  if (item.amount_low != null)
    return fmtBracket(item.amount_low, item.amount_high);
  if (item.action === "new" && item.weight != null)
    return `${fmtWeight(item.weight)} of the book`;
  if (item.action === "sold" && item.prev_weight != null)
    return `was ${fmtWeight(item.prev_weight)}`;
  if (item.shares_delta_pct != null) {
    const pct = Math.abs(item.shares_delta_pct);
    const text =
      pct >= 1000
        ? Math.round(pct).toLocaleString("en-US")
        : pct.toFixed(pct >= 100 ? 0 : 1);
    return `${item.shares_delta_pct > 0 ? "+" : MINUS}${text}% shares`;
  }
  return "";
}
