/**
 * Types, formatting and plain-language readings for multi-asset market
 * coverage. No server imports here, so client components and tests can use it.
 * The data is written by `backend/agentdata/markets.py`.
 */

import { yieldDayVerdict } from "@/lib/market-verdict";
import { fedMoveWord, volCurveWord, yieldCurveWord, type ToneWord } from "@/lib/tone";

export type MarketAssetClass = "index" | "etf" | "rate" | "commodity" | "fx" | "crypto" | "option";
/** pct: percent change of a price. bps: basis points of a yield. abs: plain difference of a ratio. */
export type ChangeMode = "pct" | "bps" | "abs";
export type Tone = "up" | "down" | "flat";

export interface MarketChange {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  ytd: number | null;
  y1: number | null;
}

export interface FuturesCurvePoint {
  label: string;
  months_out: number;
  price: number;
}

export interface CurveStructure {
  state: "contango" | "backwardation" | "flat";
  front_label: string;
  front_price: number;
  later_label: string;
  later_price: number;
  later_months_out: number;
  spread_pct: number;
}

export interface MarketAsset {
  id: string;
  class: MarketAssetClass;
  group: string | null;
  name: string;
  symbol: string;
  price: number;
  prev_close: number | null;
  /** "USD", "pts", "%", "pp" (percentage points), "rate", "USD/oz", "USD/bbl", "USD/lb", "USD/MMBtu". */
  unit: string;
  change_mode: ChangeMode;
  change: MarketChange;
  high_1y: number | null;
  high_1y_date: string | null;
  low_1y: number | null;
  low_1y_date: string | null;
  /** About a year of daily values, downsampled. */
  spark: number[];
  spark_start: string | null;
  spark_end: string | null;
  source: string;
  source_name: string;
  source_url: string;
  as_of: string;
  order: number;
  /** Commodity futures only. */
  contract: string | null;
  curve: FuturesCurvePoint[];
  structure: CurveStructure | null;
  /** Crypto only. */
  market_cap: number | null;
  volume_24h: number | null;
  ath: number | null;
  ath_date: string | null;
  image: string | null;
  /** Treasury yields only. */
  tenor: string | null;
  /** ETFs only, from the fund's reported profile. Null when the source did not report it. */
  expense_ratio_pct: number | null;
  total_assets: number | null;
  yield_pct: number | null;
  fund_family: string | null;
  category: string | null;
  holdings: EtfHolding[];
  /** Sum of the weights in `holdings`. */
  holdings_weight_pct: number | null;
  sectors: Array<{ sector: string; weight_pct: number }>;
  profile_source_name: string | null;
  profile_source_url: string | null;
  profile_as_of: string | null;
  /** Options statistics only. */
  call_volume: number | null;
  put_volume: number | null;
  average_20d: number | null;
  /** True for end-of-day series that have no intraday quote. */
  daily_only: boolean;
}

export interface EtfHolding {
  symbol: string | null;
  name: string;
  weight_pct: number;
}

export interface VolCurvePoint {
  label: string;
  symbol: string;
  days: number;
  asset_id: string | null;
  value: number;
  value_1m_ago: number | null;
}

/** Implied volatility of the S&P 500 by horizon, from the Cboe VIX family. */
export interface VolCurve {
  date: string;
  points: VolCurvePoint[];
  state: "normal" | "inverted" | null;
  vix_to_vix3m: number | null;
  source_name: string;
  source_url: string;
  as_of: string;
}

export interface PredictionHistorySeries {
  label: string;
  dates: string[];
  values: number[];
}

export interface MarketSeries {
  dates: string[];
  values: number[];
}

export interface TreasuryCurvePoint {
  tenor: string;
  label: string;
  months: number;
  asset_id: string | null;
  value: number;
  value_1m_ago: number | null;
  value_1y_ago: number | null;
}

export interface TreasuryCurve {
  date: string;
  date_1m_ago: string | null;
  date_1y_ago: string | null;
  points: TreasuryCurvePoint[];
  spread_2s10s_bps: number | null;
  spread_3m10y_bps: number | null;
  source_name: string;
  source_url: string;
  as_of: string;
}

export interface PredictionOutcome {
  label: string;
  probability: number;
  strike: number | null;
  /** Change in probability over the last day, as a fraction (0.03 is three points). */
  change_24h: number | null;
}

export interface PredictionMarket {
  id: string;
  source: string;
  source_name: string;
  source_url: string;
  topic: string;
  question: string;
  detail: string;
  kind: "binary" | "exclusive" | "ladder" | "multi";
  outcomes: PredictionOutcome[];
  /** How many outcomes the market lists; `outcomes` keeps only the ones in play. */
  outcome_count: number;
  volume: number | null;
  volume_24h: number | null;
  volume_unit: "contracts" | "usd";
  close_time: string | null;
  as_of: string;
  implied_range: { low: number; high: number } | null;
  order: number;
  /** The venue's own resolution rules, verbatim. */
  rules: string | null;
  /** For multi-outcome markets: the outcome `rules` was written for. */
  rules_outcome: string | null;
  settlement_sources: Array<{ name: string; url: string }>;
  has_history: boolean;
}

export interface MarketsData {
  /** When the ingestion job last ran. Null when the store had nothing. */
  as_of: string | null;
  assets: MarketAsset[];
  predictions: PredictionMarket[];
  treasury: TreasuryCurve | null;
  volCurve: VolCurve | null;
}

/** A class as the site routes it: `/markets/{slug}` and `/markets/{slug}/{id}`. */
export interface MarketClassInfo {
  slug: "indices" | "etfs" | "rates" | "commodities" | "fx" | "crypto" | "options" | "predictions";
  /** The asset class behind it; null for prediction markets, which are not assets. */
  assetClass: MarketAssetClass | null;
  title: string;
  short: string;
  /** One line on what the class holds and where it comes from. */
  blurb: string;
}

export const MARKET_CLASSES: MarketClassInfo[] = [
  { slug: "indices", assetClass: "index", title: "Indices", short: "Indices", blurb: "The major US stock indices and the VIX." },
  { slug: "etfs", assetClass: "etf", title: "ETFs", short: "ETFs", blurb: "Broad market, sector, thematic, bond and commodity funds, with holdings and fees." },
  { slug: "rates", assetClass: "rate", title: "Rates", short: "Rates", blurb: "US Treasury par yields and the 2s10s spread, from the Treasury's daily curve." },
  { slug: "commodities", assetClass: "commodity", title: "Commodities", short: "Cmdty", blurb: "Front-month futures for metals and energy, with the shape of each curve." },
  { slug: "fx", assetClass: "fx", title: "Currencies", short: "FX", blurb: "The dollar index and the major pairs." },
  { slug: "crypto", assetClass: "crypto", title: "Crypto", short: "Crypto", blurb: "The largest coins by market value. Crypto trades all week, so changes are rolling." },
  { slug: "options", assetClass: "option", title: "Options", short: "Options", blurb: "What the options market is pricing: implied volatility by horizon and put/call ratios. Summary data only, no chains." },
  { slug: "predictions", assetClass: null, title: "Prediction markets", short: "Odds", blurb: "Traded odds on the Fed, inflation, jobs, growth and elections." },
];

export function classInfoBySlug(slug: string): MarketClassInfo | null {
  const wanted = slug.toLowerCase();
  return MARKET_CLASSES.find((item) => item.slug === wanted) ?? null;
}

export function classInfoFor(assetClass: MarketAssetClass): MarketClassInfo {
  return MARKET_CLASSES.find((item) => item.assetClass === assetClass) ?? MARKET_CLASSES[0];
}

export function classHref(slug: MarketClassInfo["slug"]): string {
  return `/markets/${slug}`;
}

export function assetHref(asset: Pick<MarketAsset, "id" | "class">): string {
  return `/markets/${classInfoFor(asset.class).slug}/${asset.id}`;
}

export function predictionHref(market: Pick<PredictionMarket, "id">): string {
  return `/markets/predictions/${market.id}`;
}

export const ETF_GROUPS: Array<{ id: string; title: string }> = [
  { id: "broad", title: "Broad market" },
  { id: "sector", title: "Sectors" },
  { id: "thematic", title: "Themes" },
  { id: "bond", title: "Bonds" },
  { id: "commodity", title: "Commodities" },
];

/** Short names for the sector heat grid. */
export const SECTOR_SHORT: Record<string, string> = {
  xlk: "Tech",
  xlf: "Financials",
  xle: "Energy",
  xlv: "Health care",
  xli: "Industrials",
  xly: "Cons. disc.",
  xlp: "Staples",
  xlu: "Utilities",
  xlb: "Materials",
  xlre: "Real estate",
  xlc: "Comm. svcs",
  smh: "Semis",
};

export const CLASS_LABEL: Record<MarketAssetClass, string> = {
  index: "Index",
  etf: "ETF",
  rate: "Treasury yield",
  commodity: "Futures",
  fx: "Currency",
  crypto: "Crypto",
  option: "Options statistic",
};

/* ── formatting ─────────────────────────────────────────────────────────── */

const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function grouped(value: number, digits: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Decimals that suit the size of the number and what it measures. */
export function levelDigits(value: number, unit: string): number {
  const abs = Math.abs(value);
  if (unit === "%" || unit === "pts" || unit === "ratio") return 2;
  if (unit === "rate") return abs >= 20 ? 2 : 4;
  if (unit === "USD") {
    if (abs >= 10_000) return 0;
    if (abs >= 1) return 2;
    if (abs >= 0.01) return 4;
    return 6;
  }
  // Commodity futures: natural gas and copper are quoted to three decimals.
  return abs >= 10 ? 2 : 3;
}

/** The level as a person reads it: "$4,137.40", "7,557.26", "4.86%", "+35 bps", "1.1227". */
export function formatLevel(value: number, unit: string): string {
  if (!isNumber(value)) return "";
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "pp") return formatBps(value * 100);
  const body = grouped(Math.abs(value), levelDigits(value, unit));
  const sign = value < 0 ? MINUS : "";
  if (unit === "pts" || unit === "rate" || unit === "ratio") return `${sign}${body}`;
  return `${sign}$${body}`;
}

/** What one unit of the price buys, for the units that need saying. */
export function unitNote(unit: string): string | null {
  switch (unit) {
    case "USD/oz":
      return "per troy ounce";
    case "USD/bbl":
      return "per barrel";
    case "USD/lb":
      return "per pound";
    case "USD/MMBtu":
      return "per MMBtu";
    default:
      return null;
  }
}

export function formatPct(value: number, digits = 2): string {
  const rounded = Number(Math.abs(value).toFixed(digits));
  const sign = rounded === 0 ? "" : value > 0 ? "+" : MINUS;
  return `${sign}${rounded.toFixed(digits)}%`;
}

export function formatBps(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = rounded === 0 ? "" : value > 0 ? "+" : MINUS;
  return `${sign}${rounded} bps`;
}

/**
 * A yield's move in plain words, for the headline strip (owner rule 8): "+10 bps" is "up 0.10 points", since a basis
 * point is a hundredth of a percentage point. The dense tables keep "+10 bps".
 */
export function formatBpsPlain(value: number): string {
  // Rounded as changeTone rounds it, so the words and their colour always agree (−0.5 bps is "unchanged", flat).
  const rounded = Math.round(value);
  if (rounded === 0) return "unchanged";
  return `${rounded > 0 ? "up" : "down"} ${(Math.abs(rounded) / 100).toFixed(2)} points`;
}

/** A change in the asset's own terms. Null when the change is not known. */
export function formatChange(value: number | null | undefined, mode: ChangeMode): string | null {
  if (!isNumber(value)) return null;
  if (mode === "abs") return formatAbs(value);
  return mode === "bps" ? formatBps(value) : formatPct(value);
}

/** A plain difference, for ratios: "+0.06". */
export function formatAbs(value: number, digits = 2): string {
  const rounded = Number(Math.abs(value).toFixed(digits));
  const sign = rounded === 0 ? "" : value > 0 ? "+" : MINUS;
  return `${sign}${rounded.toFixed(digits)}`;
}

/** A one-day change in probability, in points: "+3 pts". Null when it rounds to nothing. */
export function formatProbabilityChange(change: number | null | undefined): string | null {
  if (!isNumber(change)) return null;
  const points = Math.round(Math.abs(change) * 100);
  if (points === 0) return null;
  return `${change > 0 ? "+" : MINUS}${points} ${points === 1 ? "pt" : "pts"}`;
}

export function changeTone(value: number | null | undefined, mode: ChangeMode = "pct"): Tone {
  if (!isNumber(value)) return "flat";
  const rounded = mode === "bps" ? Math.round(value) : Number(value.toFixed(2));
  if (rounded > 0) return "up";
  if (rounded < 0) return "down";
  return "flat";
}

/**
 * The colour a change is drawn in. Green and red are for gains and losses, so
 * a ratio moving (a put/call ratio is not a price) stays neutral.
 */
/**
 * The tone of a sparkline, from its own first and last point, so the colour
 * always matches the window the line draws (about a year) and never the day
 * change printed beside it.
 */
export function sparkTone(values: number[] | null | undefined, mode: ChangeMode = "pct"): Tone {
  const points = (values ?? []).filter((value) => Number.isFinite(value));
  if (points.length < 2) return "flat";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  // Yields are stored in percent, and a "bps" change is counted in hundredths of that.
  const change = mode === "pct" ? (first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null) : mode === "bps" ? (last - first) * 100 : last - first;
  return signalTone(change, mode);
}

export function signalTone(value: number | null | undefined, mode: ChangeMode = "pct"): Tone {
  return mode === "abs" ? "flat" : changeTone(value, mode);
}

/** "$1.51T", "$35.6B", "$961.6M", "$12,400". */
export function formatCompactUsd(value: number | null | undefined): string | null {
  const body = formatCompactNumber(value);
  return body === null ? null : `$${body}`;
}

export function formatCompactNumber(value: number | null | undefined): string | null {
  if (!isNumber(value) || value < 0) return null;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}K`;
  return grouped(value, 0);
}

/** "81%", with honest ends: nothing is ever shown as 0% or 100%. */
export function formatProbability(probability: number): string {
  if (!isNumber(probability)) return "";
  if (probability < 0.01) return "<1%";
  if (probability > 0.99) return ">99%";
  return `${Math.round(probability * 100)}%`;
}

/** "2026-11-05" -> "Nov 5" (or "Nov 5, 2025" with the year). Parsed by hand so no timezone can shift the day. */
export function formatDay(iso: string | null | undefined, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return withYear ? `${month} ${Number(match[3])}, ${match[1]}` : `${month} ${Number(match[3])}`;
}

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function etParts(date: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of ET_PARTS.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

/**
 * An as-of time in New York time, where US markets keep their clock:
 * "2:49 PM ET" for today, "Nov 6, 3:30 PM ET" for another day.
 */
/**
 * The time the as-of words are worked out against. On the server it is the real clock. In the browser, /markets
 * pins it to the moment the server built the page (setMarketsClock), so a copy cached overnight redraws with the same
 * words ("9:11 AM ET", not "Nov 10, 9:11 AM ET") and React finds no mismatch.
 */
let pinnedClock: number | null = null;

export function setMarketsClock(iso: string | null): void {
  const at = iso ? Date.parse(iso) : NaN;
  pinnedClock = Number.isFinite(at) ? at : null;
}

function marketsNow(): Date {
  return pinnedClock === null ? new Date() : new Date(pinnedClock);
}

export function formatAsOf(iso: string | null | undefined, now: Date = marketsNow()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const at = etParts(date);
  const today = etParts(now);
  const time = `${at.hour}:${at.minute} ${at.dayPeriod} ET`;
  const sameDay = at.year === today.year && at.month === today.month && at.day === today.day;
  if (sameDay) return time;
  const day = `${at.month} ${at.day}`;
  return at.year === today.year ? `${day}, ${time}` : `${day}, ${at.year}`;
}

/**
 * When an asset's level is from. End-of-day series (Treasury yields, Cboe
 * statistics) carry a date, not a clock time, so they read "Nov 6 close".
 */
export function assetAsOfText(asset: Pick<MarketAsset, "as_of" | "daily_only" | "source">, now: Date = new Date()): string {
  if (asset.daily_only || asset.source === "treasury") {
    const day = formatDay(asset.as_of);
    return day ? `${day} close` : "";
  }
  return formatAsOf(asset.as_of, now);
}

/** "today" when the quote is from the current New York day, otherwise "on Nov 6". */
export function sessionWord(iso: string | null | undefined, now: Date = marketsNow()): string {
  if (!iso) return "in the latest session";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "in the latest session";
  const at = etParts(date);
  const today = etParts(now);
  if (at.year === today.year && at.month === today.month && at.day === today.day) return "today";
  return `on ${at.month} ${at.day}`;
}

/** The label for the one-day change: crypto never closes, so it is a rolling 24 hours. */
export function dayChangeLabel(asset: Pick<MarketAsset, "class" | "as_of">, now: Date = marketsNow()): string {
  if (asset.class === "crypto") return "24h";
  return sessionWord(asset.as_of, now) === "today" ? "today" : "last session";
}

/* ── series and change maths ────────────────────────────────────────────── */

export type ChartRange = "1W" | "1M" | "3M" | "6M" | "1Y";

export const CHART_RANGES: Array<{ id: ChartRange; days: number; label: string }> = [
  { id: "1W", days: 7, label: "1 week" },
  { id: "1M", days: 30, label: "1 month" },
  { id: "3M", days: 91, label: "3 months" },
  { id: "6M", days: 182, label: "6 months" },
  { id: "1Y", days: 365, label: "1 year" },
];

/** Percent change from one level to another. Null when it cannot be computed honestly. */
export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!isNumber(from) || !isNumber(to) || from <= 0) return null;
  return (to / from - 1) * 100;
}

/** How far before the start of a range a stored close may sit and still stand in for it (weekends, holidays). */
const RANGE_START_TOLERANCE_DAYS = 8;

/**
 * The part of a daily series inside the chosen range, counted back from its
 * last day. It starts at the last close on or before the first day of the
 * range, the same rule the data job uses for the stored 1 week, 1 month and
 * 1 year changes, so the chart and the figures beside it agree.
 */
export function sliceSeries(series: MarketSeries, range: ChartRange): MarketSeries {
  const count = Math.min(series.dates.length, series.values.length);
  if (count === 0) return { dates: [], values: [] };
  const days = CHART_RANGES.find((item) => item.id === range)?.days ?? 365;
  const last = Date.parse(`${series.dates[count - 1]}T00:00:00Z`);
  const cutoffMs = last - days * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  // First index inside the range.
  let start = 0;
  while (start < count - 1 && series.dates[start] < cutoff) start += 1;
  // Step back to the close just before the range when the range does not open on a trading day.
  if (start > 0 && series.dates[start] > cutoff) {
    const before = Date.parse(`${series.dates[start - 1]}T00:00:00Z`);
    if (cutoffMs - before <= RANGE_START_TOLERANCE_DAYS * 86_400_000) start -= 1;
  }
  return { dates: series.dates.slice(start, count), values: series.values.slice(start, count) };
}

/** First-to-last change of a run of values: percent for prices, basis points for yields. */
export function seriesChange(values: number[], mode: ChangeMode): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!isNumber(first) || !isNumber(last)) return null;
  if (mode === "bps") return (last - first) * 100;
  if (mode === "abs") return last - first;
  return pctChange(first, last);
}

/** SVG polyline points for a sparkline drawn in a `width` by `height` box. */
export function sparkPoints(values: number[], width = 100, height = 32, pad = 2): string {
  const clean = values.filter(isNumber);
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  return clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * width;
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/* ── plain readings: only what the numbers support ──────────────────────── */

function point(curve: TreasuryCurve, tenor: string): TreasuryCurvePoint | undefined {
  return curve.points.find((item) => item.tenor === tenor);
}

/**
 * The shape of the Treasury curve, from the 2-year and 10-year yields. Under the curve chart, which labels every
 * yield, `figures: false` says only the spread and the shape (owner rule 1, Nov 13: no number twice in one card).
 */
export function yieldCurveReading(curve: TreasuryCurve | null, { figures = true }: { figures?: boolean } = {}): string | null {
  if (!curve) return null;
  const two = point(curve, "2Y");
  const ten = point(curve, "10Y");
  if (!two || !ten) return null;
  const spread = Math.round((ten.value - two.value) * 100);
  const twoText = `${two.value.toFixed(2)}%`;
  const tenText = `${ten.value.toFixed(2)}%`;
  if (!figures) {
    if (spread < 0) return `The 2-year yields ${Math.abs(spread)} bps more than the 10-year: the curve is inverted.`;
    if (spread < 10) return "The 2-year and the 10-year yield almost the same: the curve is flat.";
    return `The 10-year yields ${spread} bps more than the 2-year: the curve slopes upward.`;
  }
  if (spread < 0) {
    return `The 2-year yields ${twoText}, more than the 10-year at ${tenText}: the curve is inverted by ${Math.abs(spread)} bps.`;
  }
  if (spread < 10) {
    return `The 2-year (${twoText}) and the 10-year (${tenText}) yield almost the same: the curve is flat.`;
  }
  return `The 10-year yields ${tenText}, ${spread} bps more than the 2-year at ${twoText}: the curve slopes upward.`;
}

/** How the whole curve moved over the last month, when it moved one way. */
export function yieldCurveShiftReading(curve: TreasuryCurve | null): string | null {
  if (!curve) return null;
  const moves = curve.points
    .filter((item) => isNumber(item.value_1m_ago))
    .map((item) => (item.value - (item.value_1m_ago as number)) * 100);
  if (moves.length < 4) return null;
  const average = moves.reduce((sum, move) => sum + move, 0) / moves.length;
  if (Math.abs(average) < 5) return "Yields are close to where they were a month ago.";
  const direction = average > 0 ? "higher" : "lower";
  const oneWay = moves.every((move) => (average > 0 ? move >= 0 : move <= 0));
  const scope = oneWay ? "Every maturity yields" : "Most maturities yield";
  return `${scope} ${direction} than a month ago, by ${Math.round(Math.abs(average))} bps on average.`;
}

/** "Dec 26" is a contract month and a two-digit year. Spell the year so it cannot be read as a day. */
function contractMonth(label: string): string {
  const match = /^([A-Z][a-z]{2}) (\d{2})$/.exec(label.trim());
  return match ? `${match[1]} 20${match[2]}` : label;
}

/**
 * Whether later contracts cost more or less, said plainly (no "contango" or "backwardation": owner rule 8). Pass
 * `subject` ("Gold") when the sentence stands on its own, away from the asset's name, so it says what it is about.
 */
export function structureReading(asset: Pick<MarketAsset, "structure">, subject?: string): string | null {
  const structure = asset.structure;
  if (!structure) return null;
  const gap = `${Math.abs(structure.spread_pct).toFixed(1)}%`;
  const later = contractMonth(structure.later_label);
  const front = contractMonth(structure.front_label);
  if (structure.state === "contango" || structure.state === "backwardation") {
    const shape = structure.state === "contango" ? "more than" : "less than";
    const delivery = subject ? `${subject} for ${later} delivery costs ${gap} ${shape} for ${front}` : `${later} delivery costs ${gap} ${shape} ${front}`;
    return `${delivery}.`;
  }
  return subject
    ? `${subject}'s ${front} and ${later} contracts trade within ${gap} of each other.`
    : `${front} and ${later} trade within ${gap} of each other.`;
}

/**
 * Where the level sits against its one-year high and low. Pass `subject`
 * ("The dollar index") when the sentence stands away from the asset's name:
 * "The dollar index is 0.3% below its one-year high of 102.58 (Oct 12)."
 */
export function rangeReading(
  asset: Pick<MarketAsset, "price" | "unit" | "change_mode" | "high_1y" | "high_1y_date" | "low_1y" | "low_1y_date">,
  subject?: string,
): string | null {
  const { price, high_1y: high, low_1y: low } = asset;
  if (!isNumber(price) || !isNumber(high) || !isNumber(low) || high <= low) return null;
  const say = (text: string) => (subject ? `${subject} is ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);
  const span = high - low;
  if (price >= high - span * 0.01) return say("At its highest level in a year.");
  if (price <= low + span * 0.01) return say("At its lowest level in a year.");
  const highText = formatLevel(high, asset.unit);
  const when = formatDay(asset.high_1y_date);
  const suffix = when ? ` (${when})` : "";
  if (asset.change_mode === "bps") {
    return say(`${Math.round((high - price) * 100)} bps below its one-year high of ${highText}${suffix}.`);
  }
  if (asset.change_mode === "abs") {
    return say(`${(high - price).toFixed(2)} below its one-year high of ${highText}${suffix}.`);
  }
  const below = pctChange(high, price);
  if (below === null) return null;
  return say(`${Math.abs(below).toFixed(1)}% below its one-year high of ${highText}${suffix}.`);
}

/**
 * The VIX is an annualised number. Dividing by the square root of 252 trading
 * days turns it into the daily S&P 500 move that options are priced for.
 */
export function vixReading(level: number, { figures = true }: { figures?: boolean } = {}): string | null {
  if (!isNumber(level) || level <= 0) return null;
  const daily = level / Math.sqrt(252);
  // Over a card whose VIX row shows the level, only the daily move it implies is new (owner rule 1, Nov 13).
  if (!figures) return `The VIX prices in S&P 500 moves of about ${daily.toFixed(1)}% a day.`;
  return `A VIX of ${level.toFixed(1)} prices in S&P 500 moves of about ${daily.toFixed(1)}% a day.`;
}

export function athReading(asset: Pick<MarketAsset, "price" | "ath" | "ath_date">): string | null {
  if (!isNumber(asset.ath) || !isNumber(asset.price) || asset.ath <= 0) return null;
  const below = (1 - asset.price / asset.ath) * 100;
  if (below < 1) return "At or near its all-time high.";
  const when = formatDay(asset.ath_date, true);
  return `${below.toFixed(0)}% below its all-time high of ${formatLevel(asset.ath, "USD")}${when ? ` (${when})` : ""}.`;
}

/**
 * The single line a tile shows under its numbers, when the data has one to
 * give. `subject` names the asset in range and futures-curve sentences, for a
 * card note that does not sit next to the asset's own name.
 */
export function assetReading(asset: MarketAsset, subject?: string): string | null {
  if (asset.id === "vix") return vixReading(asset.price);
  if (asset.unit === "ratio") return putCallReading(asset) ?? rangeReading(asset, subject);
  if (asset.class === "commodity") return structureReading(asset, subject) ?? rangeReading(asset, subject);
  if (asset.class === "crypto") return athReading(asset) ?? rangeReading(asset, subject);
  if (asset.id === "us2s10s") {
    return asset.price < 0
      ? "Below zero: the 2-year yields more than the 10-year."
      : "Above zero: the 10-year yields more than the 2-year.";
  }
  return rangeReading(asset, subject);
}

function strikeText(value: number, percent: boolean): string {
  if (percent) return `${value.toFixed(1)}%`;
  return grouped(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * What a prediction market is saying, in one sentence. `shown` are the outcome labels whose odds sit right above it:
 * a sentence that would only say those odds again is left out (owner rule 1, Nov 13); "Even odds sit between 3.7%
 * and 3.8%" is a new fact and stays.
 */
export function predictionReading(market: PredictionMarket, shown: string[] = []): string | null {
  const outcomes = market.outcomes.filter((outcome) => isNumber(outcome.probability));
  if (outcomes.length === 0) return null;
  const onCard = new Set(shown);
  if (market.kind === "binary") {
    const yes = outcomes.find((outcome) => outcome.label.toLowerCase() === "yes") ?? outcomes[0];
    if (onCard.has(yes.label)) return null;
    return `Traders put ${formatProbability(yes.probability)} on yes.`;
  }
  if (market.kind === "ladder" && market.implied_range) {
    const percent = outcomes.some((outcome) => outcome.label.includes("%"));
    const { low, high } = market.implied_range;
    return `Even odds sit between ${strikeText(low, percent)} and ${strikeText(high, percent)}.`;
  }
  const ranked = [...outcomes].sort((a, b) => b.probability - a.probability);
  const [top, next] = ranked;
  if (market.kind === "exclusive") {
    if (onCard.has(top.label) && (!next || next.probability < 0.05 || onCard.has(next.label))) return null;
    const tail = next && next.probability >= 0.05 ? `, then ${formatProbability(next.probability)} on ${next.label}` : "";
    return `Traders put ${formatProbability(top.probability)} on ${top.label}${tail}.`;
  }
  return null;
}

/** Volume in the venue's own terms: dollars on Polymarket, contracts on Kalshi. */
export function formatPredictionVolume(market: Pick<PredictionMarket, "volume" | "volume_unit">): string | null {
  if (!isNumber(market.volume) || market.volume <= 0) return null;
  if (market.volume_unit === "usd") return `${formatCompactUsd(market.volume)} traded`;
  return `${formatCompactNumber(market.volume)} contracts traded`;
}

export interface HeadlineReading {
  key: string;
  label: string;
  text: string;
  href: string;
  external?: boolean;
  /** Good or bad for stocks, in a word, when the sentence alone would not say ("the curve is inverted"). */
  verdict?: ToneWord | null;
}

/** The 10-year minus the 2-year yield, in basis points, the same figure `yieldCurveReading` describes. */
export function yieldCurveSpreadBps(curve: TreasuryCurve | null): number | null {
  if (!curve) return null;
  const two = point(curve, "2Y");
  const ten = point(curve, "10Y");
  if (!two || !ten) return null;
  return Math.round((ten.value - two.value) * 100);
}

/** One-month against three-month implied volatility, as a word: stressed, or the usual shape. */
export function volCurveVerdict(curve: VolCurve | null): ToneWord | null {
  if (!curve) return null;
  const near = curve.points.find((item) => item.symbol === "VIX");
  const far = curve.points.find((item) => item.symbol === "VIX3M");
  return near && far ? volCurveWord(near.value, far.value) : null;
}

function moveVerb(value: number, mode: ChangeMode): string {
  const tone = changeTone(value, mode);
  if (tone === "flat") return "is flat";
  const size =
    mode === "bps"
      ? `${Math.round(Math.abs(value))} bps`
      : mode === "abs"
        ? Math.abs(value).toFixed(2)
        : `${Math.abs(value).toFixed(2)}%`;
  return `is ${tone === "up" ? "up" : "down"} ${size}`;
}

/**
 * The eleven S&P 500 sector funds. SMH (chips) shares their heat grid but is a
 * sub-industry, so it is not counted: every sector count says "of 11 sectors".
 * lib/markets-insights.ts re-exports this list for sectorBreadth.
 */
export const SECTOR_IDS = ["xlk", "xlf", "xle", "xlv", "xli", "xly", "xlp", "xlu", "xlb", "xlre", "xlc"];

/**
 * The sectors that led and lagged in the latest session. Counts and order use
 * the same rule as sectorBreadth (raw sign, ties by id), so this line and the
 * Sectors card never disagree.
 */
export function sectorReading(assets: MarketAsset[], now: Date = new Date()): string | null {
  const sectors = SECTOR_IDS.map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is MarketAsset => asset !== undefined && isNumber(asset.change.d1))
    .sort((a, b) => (b.change.d1 ?? 0) - (a.change.d1 ?? 0) || a.id.localeCompare(b.id));
  if (sectors.length < 4) return null;
  const best = sectors[0];
  const worst = sectors[sectors.length - 1];
  const up = sectors.filter((asset) => (asset.change.d1 ?? 0) > 0).length;
  const down = sectors.filter((asset) => (asset.change.d1 ?? 0) < 0).length;
  const name = (asset: MarketAsset) => SECTOR_SHORT[asset.id] ?? asset.symbol;
  const when = sessionWord(best.as_of, now);
  const count =
    up === sectors.length ? `All ${up} sectors rose` : down === sectors.length ? `All ${down} sectors fell` : `${up} of ${sectors.length} sectors rose`;
  return `${count} ${when}. ${name(best)} (${best.symbol}) led at ${formatPct(best.change.d1 ?? 0)}; ${name(worst)} (${worst.symbol}) trailed at ${formatPct(worst.change.d1 ?? 0)}.`;
}

/**
 * Whether near-term implied volatility is above or below the three-month level. Under the chart that labels both,
 * `figures: false` says the gap without the two levels again (owner rule 1, Nov 13).
 */
export function volCurveReading(curve: VolCurve | null, { figures = true }: { figures?: boolean } = {}): string | null {
  if (!curve) return null;
  const near = curve.points.find((item) => item.symbol === "VIX");
  const far = curve.points.find((item) => item.symbol === "VIX3M");
  if (!near || !far) return null;
  const gap = Math.abs(near.value - far.value).toFixed(1);
  if (!figures) {
    return near.value > far.value
      ? `One-month implied volatility is ${gap} points above the three-month level: options price more movement now than later, which usually means stress.`
      : `One-month implied volatility is ${gap} points below the three-month level: the usual, calmer shape.`;
  }
  if (near.value > far.value) {
    return `One-month implied volatility (${near.value.toFixed(1)}) is ${gap} points above the three-month level (${far.value.toFixed(1)}): options price more movement now than later, which usually means stress.`;
  }
  return `One-month implied volatility (${near.value.toFixed(1)}) is ${gap} points below the three-month level (${far.value.toFixed(1)}): the usual, calmer shape.`;
}

/** A put/call ratio against its own 20-day average. */
export function putCallReading(
  asset: Pick<MarketAsset, "price" | "average_20d" | "unit">,
  { figures = true }: { figures?: boolean } = {},
): string | null {
  if (asset.unit !== "ratio" || !isNumber(asset.price) || !isNumber(asset.average_20d) || asset.average_20d <= 0) {
    return null;
  }
  const diff = asset.price - asset.average_20d;
  const average = asset.average_20d.toFixed(2);
  const now = asset.price.toFixed(2);
  // Over a card whose row already shows today's ratio, only the usual day is new (owner rule 1, Nov 13).
  if (!figures) {
    if (Math.abs(diff) < 0.03) return `Bets on a rise and on a fall traded in their usual mix, about ${average} bets on a fall for each bet on a rise.`;
    return `${diff > 0 ? "More" : "Fewer"} bets on a fall than usual: a usual day has ${average} for each bet on a rise.`;
  }
  // Puts are bets on a fall and calls bets on a rise, said as Market today's Options card says them (owner rule 8).
  if (Math.abs(diff) < 0.03) return `Bets on a rise and on a fall traded in their usual mix: ${now} bets on a fall for each bet on a rise, against ${average} on a usual day.`;
  return diff > 0
    ? `More bets on a fall than usual: ${now} for each bet on a rise, against ${average} on a usual day.`
    : `Fewer bets on a fall than usual: ${now} for each bet on a rise, against ${average} on a usual day.`;
}

/** The largest one-day percent moves across every priced asset, biggest first. */
export function biggestMoves(assets: MarketAsset[], limit = 6): MarketAsset[] {
  return assets
    .filter(
      (asset) =>
        asset.change_mode === "pct" &&
        asset.class !== "option" &&
        asset.id !== "vix" &&
        isNumber(asset.change.d1) &&
        changeTone(asset.change.d1) !== "flat",
    )
    .sort((a, b) => Math.abs(b.change.d1 ?? 0) - Math.abs(a.change.d1 ?? 0))
    .slice(0, limit);
}

/**
 * The few things worth saying first, built only from stored numbers. Each line
 * is skipped when its inputs are missing, so the list can be short or empty.
 */
export function headlineReadings(data: MarketsData, now: Date = new Date()): HeadlineReading[] {
  const byId = new Map(data.assets.map((asset) => [asset.id, asset]));
  const lines: HeadlineReading[] = [];

  const spx = byId.get("sp500");
  if (spx && isNumber(spx.change.d1)) {
    const range = rangeReading(spx);
    const tail = range ? ` ${range.charAt(0).toLowerCase()}${range.slice(1)}` : "";
    lines.push({
      key: "stocks",
      label: "Stocks",
      text: `The S&P 500 ${moveVerb(spx.change.d1, "pct")} ${sessionWord(spx.as_of, now)} at ${formatLevel(spx.price, spx.unit)}.${tail ? ` It is${tail}` : ""}`,
      href: "/markets/indices/sp500",
    });
  }

  const curve = yieldCurveReading(data.treasury);
  // Treasury and Cboe publish once a day, so these two lines say which close they describe.
  const closeOf = (date: string | undefined) => (date && formatDay(date) ? ` (${formatDay(date)} close)` : "");
  if (curve) {
    lines.push({
      key: "rates",
      label: "Rates",
      text: `${curve}${closeOf(data.treasury?.date)}`,
      href: "/markets/rates",
      verdict: yieldCurveWord(yieldCurveSpreadBps(data.treasury)),
    });
  }

  const commodities = data.assets.filter((asset) => asset.class === "commodity" && isNumber(asset.change.d1));
  const mover = [...commodities].sort((a, b) => Math.abs(b.change.d1 ?? 0) - Math.abs(a.change.d1 ?? 0))[0];
  if (mover && isNumber(mover.change.d1)) {
    const structure = structureReading(mover);
    lines.push({
      key: "commodities",
      label: "Commodities",
      text: `${mover.name} ${moveVerb(mover.change.d1, "pct")} ${sessionWord(mover.as_of, now)} at ${formatLevel(mover.price, mover.unit)}.${structure ? ` ${structure}` : ""}`,
      href: assetHref(mover),
    });
  }

  const dollar = byId.get("dxy");
  if (dollar && isNumber(dollar.change.m1)) {
    lines.push({
      key: "dollar",
      label: "Dollar",
      text: `The dollar index ${moveVerb(dollar.change.m1, "pct")} over the past month at ${formatLevel(dollar.price, dollar.unit)}.`,
      href: "/markets/fx/dxy",
    });
  }

  const bitcoin = byId.get("btc");
  if (bitcoin && isNumber(bitcoin.change.d1)) {
    const ath = athReading(bitcoin);
    lines.push({
      key: "crypto",
      label: "Crypto",
      text: `Bitcoin ${moveVerb(bitcoin.change.d1, "pct")} in 24 hours at ${formatLevel(bitcoin.price, bitcoin.unit)}.${ath ? ` It is ${ath.charAt(0).toLowerCase()}${ath.slice(1)}` : ""}`,
      href: "/markets/crypto/btc",
    });
  }

  const sectors = sectorReading(data.assets, now);
  if (sectors) lines.push({ key: "sectors", label: "Sectors", text: sectors, href: "/markets/etfs" });

  const vol = volCurveReading(data.volCurve);
  if (vol) {
    lines.push({
      key: "options",
      label: "Options",
      text: `${vol}${closeOf(data.volCurve?.date)}`,
      href: "/markets/options",
      verdict: volCurveVerdict(data.volCurve),
    });
  }

  const fed = data.predictions.find((market) => market.topic === "fed" && market.kind === "exclusive");
  if (fed) {
    const top = [...fed.outcomes].sort((a, b) => b.probability - a.probability)[0];
    if (top) {
      const when = formatDay(fed.close_time);
      lines.push({
        key: "odds",
        label: "Odds",
        text: `${fed.source_name} traders put ${formatProbability(top.probability)} on "${top.label}" for the next Fed decision${when ? `, due ${when}` : ""}.`,
        href: predictionHref(fed),
        verdict: fedMoveWord(top.label),
      });
    }
  }

  return lines;
}

/* ── the slim overview the landing page and the briefing read ───────────── */

export interface MarketsOverviewTile {
  id: string;
  class: MarketAssetClass;
  name: string;
  symbol: string;
  level: string;
  change: string | null;
  changeLabel: string;
  tone: Tone;
  spark: number[];
  href: string;
  source_name: string;
  as_of: string;
}

export interface MarketsOverview {
  as_of: string | null;
  tiles: MarketsOverviewTile[];
  readings: HeadlineReading[];
  prediction: PredictionMarket | null;
}

export const OVERVIEW_ASSET_IDS = ["sp500", "nasdaq100", "us10y", "gold", "wti", "dxy", "btc"];

/**
 * A strip tile's colour. A yield is coloured by what its day's move means for stocks (lib/market-verdict.ts
 * yieldDayVerdict, as the briefing strip does): "up 0.10 points" is red, a fall of as much is green, a move of 2 bps
 * or less is plain. Everything else is coloured by its sign.
 */
export function tileTone(asset: Pick<MarketAsset, "class" | "change" | "change_mode" | "unit">): Tone {
  // Only a yield itself ("%"): a spread between two yields ("pp", the 2s10s) widening is not dearer borrowing.
  if (asset.class === "rate" && asset.unit === "%") {
    const d1 = asset.change.d1;
    if (!isNumber(d1)) return "flat";
    // The verdict takes percentage points; a bps change is a hundredth of one. Rounded to whole bps first, as the
    // figure beside it is printed, so "+2 bps" (stored as 2.4) stays plain.
    const verdict = yieldDayVerdict(asset.change_mode === "bps" ? Math.round(d1) / 100 : d1)?.verdict;
    return verdict === "good" ? "up" : verdict === "bad" ? "down" : "flat";
  }
  return changeTone(asset.change.d1, asset.change_mode);
}

export function buildMarketsOverview(data: MarketsData, now: Date = new Date()): MarketsOverview {
  const byId = new Map(data.assets.map((asset) => [asset.id, asset]));
  const tiles: MarketsOverviewTile[] = [];
  for (const id of OVERVIEW_ASSET_IDS) {
    const asset = byId.get(id);
    if (!asset) continue;
    tiles.push({
      id: asset.id,
      class: asset.class,
      name: asset.name,
      symbol: asset.symbol,
      level: formatLevel(asset.price, asset.unit),
      // A yield's move in words ("up 0.10 points"), not "+10 bps"; prices and ratios keep their signed figure.
      change: asset.change_mode === "bps" && isNumber(asset.change.d1) ? formatBpsPlain(asset.change.d1) : formatChange(asset.change.d1, asset.change_mode),
      changeLabel: dayChangeLabel(asset, now),
      tone: tileTone(asset),
      spark: asset.spark,
      href: assetHref(asset),
      source_name: asset.source_name,
      as_of: asset.as_of,
    });
  }
  return {
    as_of: data.as_of,
    tiles,
    readings: headlineReadings(data, now),
    prediction: data.predictions.find((market) => market.topic === "fed") ?? data.predictions[0] ?? null,
  };
}

/* ── followed assets ────────────────────────────────────────────────────── */

export const MAX_FOLLOWED_MARKET_ASSETS = 60;
const ASSET_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isMarketAssetId(value: unknown): value is string {
  return typeof value === "string" && ASSET_ID.test(value);
}

/** A stored follow list, cleaned: valid ids only, no repeats, capped. */
export function normalizeFollowedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (isMarketAssetId(item)) seen.add(item);
    if (seen.size >= MAX_FOLLOWED_MARKET_ASSETS) break;
  }
  return [...seen];
}

/** The follow list after one change. Following puts the asset first. */
export function applyFollowChange(current: string[], id: string, follow: boolean): string[] {
  const rest = current.filter((item) => item !== id);
  const next = follow ? [id, ...rest] : rest;
  return next.slice(0, MAX_FOLLOWED_MARKET_ASSETS);
}
