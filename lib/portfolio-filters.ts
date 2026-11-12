import { nearCallLevel } from "@/lib/portfolio-attention";
import { FUNDS_SECTOR, type PortfolioPosition } from "@/lib/portfolio-shared";
import { canonicalSectorSlug } from "@/lib/screener-shared";
import { callWord } from "@/lib/stock-chart";

/**
 * The Holdings and Watching filters (owner, Nov 12: "filters to filter by sector u know and other things"). Pure, so
 * the page filters the rows it already has and the rules can be tested. Within one group the choices are alternatives
 * (Technology or Energy); across groups they all have to hold (Technology and Buy more). The choice lives in the URL
 * (?sector=technology,energy&call=buy), so a link shares it and a reload keeps it.
 */

export type CallChoice = "buy" | "keep" | "sell";
export type SizeChoice = "small" | "mid" | "large";
export type TypeChoice = "stock" | "fund";

export type PositionFilters = {
  /** Sector keys ("health-care"), as sectorKey makes them. */
  sectors: string[];
  calls: CallChoice[];
  sizes: SizeChoice[];
  types: TypeChoice[];
  /** Price within NEAR_LEVEL_PCT of its call's level, or through it. */
  near: boolean;
  /** Reports within REPORT_WINDOW_DAYS. */
  reports: boolean;
  /** Moved MOVING_PCT or more either way today. */
  moving: boolean;
};

export const NO_FILTERS: PositionFilters = { sectors: [], calls: [], sizes: [], types: [], near: false, reports: false, moving: false };

/** "Reports in 14 days". */
export const REPORT_WINDOW_DAYS = 14;
/** "Moving today": the day's move, either way, in percent. */
export const MOVING_PCT = 3;

export const CALL_CHOICES: Array<{ value: CallChoice; label: string }> = [
  { value: "buy", label: "Buy more" },
  { value: "keep", label: "Keep" },
  { value: "sell", label: "Sell some" },
];
export const SIZE_CHOICES: Array<{ value: SizeChoice; label: string }> = [
  { value: "small", label: "Small" },
  { value: "mid", label: "Mid" },
  { value: "large", label: "Large" },
];
export const TYPE_CHOICES: Array<{ value: TypeChoice; label: string }> = [
  { value: "stock", label: "Stocks" },
  { value: "fund", label: "Funds" },
];

/** The URL keys this module owns, so a tab switch can clear them. */
export const FILTER_PARAMS = ["sector", "call", "size", "type", "near", "reports", "moving"] as const;

/** Names the watchlist rows use that the screener's own map does not fold. */
const MORE_SECTOR_SLUGS: Record<string, string> = { financial: "financials" };

/**
 * One key per sector, whichever source named it ("Financial", "Financial Services" and "Financials" are one sector),
 * matching the screener's ?sector= slugs.
 */
export function sectorKey(sector: string): string {
  const slug = canonicalSectorSlug(sector);
  return MORE_SECTOR_SLUGS[slug] ?? slug;
}

/** The name a sector chip shows for each key, so one sector never shows under two names. */
const SECTOR_LABELS: Record<string, string> = {
  technology: "Technology",
  "health-care": "Health Care",
  financials: "Financials",
  "consumer-discretionary": "Consumer Discretionary",
  "consumer-staples": "Consumer Staples",
  "communication-services": "Communication Services",
  industrials: "Industrials",
  energy: "Energy",
  utilities: "Utilities",
  materials: "Materials",
  "real-estate": "Real Estate",
};

export function isFund(position: Pick<PortfolioPosition, "sector">): boolean {
  return position.sector === FUNDS_SECTOR;
}

export function callOf(position: Pick<PortfolioPosition, "stance">): CallChoice | null {
  const word = callWord(position.stance);
  return word === "Add" ? "buy" : word === "Hold" ? "keep" : word === "Trim" ? "sell" : null;
}

/** Small (micro included), mid, or large (mega included); null when the size is unknown, and for funds. */
export function sizeOf(position: Pick<PortfolioPosition, "capTier" | "sector">): SizeChoice | null {
  if (isFund(position)) return null;
  switch (position.capTier) {
    case "micro":
    case "small":
      return "small";
    case "mid":
      return "mid";
    case "large":
    case "mega":
      return "large";
    default:
      return null;
  }
}

function daysFrom(today: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The next report is today or within REPORT_WINDOW_DAYS. */
export function reportsWithin(position: Pick<PortfolioPosition, "nextEarnings">, today: string, days = REPORT_WINDOW_DAYS): boolean {
  const date = position.nextEarnings?.date;
  if (!date) return false;
  const gap = daysFrom(today, date);
  return Number.isFinite(gap) && gap >= 0 && gap <= days;
}

export function movingToday(position: Pick<PortfolioPosition, "dayPct">): boolean {
  return position.dayPct !== null && Number.isFinite(position.dayPct) && Math.abs(position.dayPct) >= MOVING_PCT;
}

/* ── what the bar offers ────────────────────────────────────────────────── */

export type Choice<T extends string> = { value: T; label: string; count: number };

export type FilterOptions = {
  /** Sectors in the rows, most rows first, funds left out (they are a type, not a sector). */
  sectors: Array<Choice<string>>;
  calls: Array<Choice<CallChoice>>;
  sizes: Array<Choice<SizeChoice>>;
  types: Array<Choice<TypeChoice>>;
  /** Rows that pass each yes/no filter; 0 when the filter is not offered. */
  near: number;
  reports: number;
  moving: number;
};

/** A choice is worth offering when it keeps some rows and drops others: a strict, non-empty part of the list. */
function splits(count: number, total: number): boolean {
  return count > 0 && count < total;
}

function tally<T extends string>(choices: Array<{ value: T; label: string }>, counts: Map<T, number>, total: number): Array<Choice<T>> {
  return choices
    .filter((choice) => splits(counts.get(choice.value) ?? 0, total))
    .map((choice) => ({ ...choice, count: counts.get(choice.value)! }));
}

function bump<T>(counts: Map<T, number>, key: T | null): void {
  if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Only a choice that would change the list is offered: one that some rows match and some do not. So one known sector
 * beside rows with no sector (or funds) is still offered, and a sector every row shares is not.
 */
export function filterOptions(rows: PortfolioPosition[], today: string): FilterOptions {
  const sectorLabels = new Map<string, string>();
  const sectorCounts = new Map<string, number>();
  const calls = new Map<CallChoice, number>();
  const sizes = new Map<SizeChoice, number>();
  const types = new Map<TypeChoice, number>();
  let near = 0;
  let reports = 0;
  let moving = 0;
  for (const row of rows) {
    if (row.sector && !isFund(row)) {
      const slug = sectorKey(row.sector);
      if (slug) {
        if (!sectorLabels.has(slug)) sectorLabels.set(slug, SECTOR_LABELS[slug] ?? row.sector);
        bump(sectorCounts, slug);
      }
    }
    bump(calls, callOf(row));
    bump(sizes, sizeOf(row));
    bump(types, isFund(row) ? "fund" : "stock");
    if (nearCallLevel(row)) near += 1;
    if (reportsWithin(row, today)) reports += 1;
    if (movingToday(row)) moving += 1;
  }
  const total = rows.length;
  const flag = (count: number) => (splits(count, total) ? count : 0);
  const sectors = [...sectorCounts]
    .filter(([, count]) => splits(count, total))
    .map(([slug, count]) => ({ value: slug, label: sectorLabels.get(slug)!, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    sectors,
    calls: tally(CALL_CHOICES, calls, total),
    sizes: tally(SIZE_CHOICES, sizes, total),
    types: tally(TYPE_CHOICES, types, total),
    near: flag(near),
    reports: flag(reports),
    moving: flag(moving),
  };
}

export function anyOptions(options: FilterOptions): boolean {
  return options.sectors.length > 0 || options.calls.length > 0 || options.sizes.length > 0 || options.types.length > 0 || options.near > 0 || options.reports > 0 || options.moving > 0;
}

/** The filters with every choice the rows no longer offer dropped, so a stale link never hides everything silently. */
export function usableFilters(filters: PositionFilters, options: FilterOptions): PositionFilters {
  const offered = <T extends string>(values: T[], choices: Array<Choice<T>>) => values.filter((value) => choices.some((choice) => choice.value === value));
  return {
    sectors: offered(filters.sectors, options.sectors),
    calls: offered(filters.calls, options.calls),
    sizes: offered(filters.sizes, options.sizes),
    types: offered(filters.types, options.types),
    near: filters.near && options.near > 0,
    reports: filters.reports && options.reports > 0,
    moving: filters.moving && options.moving > 0,
  };
}

export function activeCount(filters: PositionFilters): number {
  return filters.sectors.length + filters.calls.length + filters.sizes.length + filters.types.length + Number(filters.near) + Number(filters.reports) + Number(filters.moving);
}

export function applyFilters<T extends PortfolioPosition>(rows: T[], filters: PositionFilters, today: string): T[] {
  if (activeCount(filters) === 0) return rows;
  return rows.filter((row) => {
    if (filters.sectors.length > 0 && (!row.sector || isFund(row) || !filters.sectors.includes(sectorKey(row.sector)))) return false;
    if (filters.calls.length > 0) {
      const call = callOf(row);
      if (!call || !filters.calls.includes(call)) return false;
    }
    if (filters.sizes.length > 0) {
      const size = sizeOf(row);
      if (!size || !filters.sizes.includes(size)) return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(isFund(row) ? "fund" : "stock")) return false;
    if (filters.near && !nearCallLevel(row)) return false;
    if (filters.reports && !reportsWithin(row, today)) return false;
    if (filters.moving && !movingToday(row)) return false;
    return true;
  });
}

/* ── the URL ────────────────────────────────────────────────────────────── */

type ParamReader = { get(name: string): string | null } | null | undefined;

function list<T extends string>(raw: string | null, allowed?: readonly T[]): T[] {
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const out = allowed ? values.filter((value): value is T => (allowed as readonly string[]).includes(value)) : (values as T[]);
  return [...new Set(out)];
}

function flag(raw: string | null): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

export function parseFilters(params: ParamReader): PositionFilters {
  if (!params) return NO_FILTERS;
  return {
    sectors: [...new Set(list(params.get("sector")).map(sectorKey).filter(Boolean))],
    calls: list(params.get("call"), CALL_CHOICES.map((choice) => choice.value)),
    sizes: list(params.get("size"), SIZE_CHOICES.map((choice) => choice.value)),
    types: list(params.get("type"), TYPE_CHOICES.map((choice) => choice.value)),
    near: flag(params.get("near")),
    reports: flag(params.get("reports")),
    moving: flag(params.get("moving")),
  };
}

/** Writes the filters into `params` in place: every filter key is cleared first, then the active ones are set. */
export function writeFilters(params: URLSearchParams, filters: PositionFilters): void {
  for (const key of FILTER_PARAMS) params.delete(key);
  if (filters.sectors.length > 0) params.set("sector", filters.sectors.join(","));
  if (filters.calls.length > 0) params.set("call", filters.calls.join(","));
  if (filters.sizes.length > 0) params.set("size", filters.sizes.join(","));
  if (filters.types.length > 0) params.set("type", filters.types.join(","));
  if (filters.near) params.set("near", "1");
  if (filters.reports) params.set("reports", "1");
  if (filters.moving) params.set("moving", "1");
}

/** A query string with the commas in the filter keys left readable (?sector=energy,technology); other keys untouched. */
export function readableQuery(search: string): string {
  const keys = FILTER_PARAMS.join("|");
  return search.replace(new RegExp(`(^|[?&])(${keys})=([^&]*)`, "g"), (_match, lead: string, key: string, value: string) => `${lead}${key}=${value.replace(/%2C/gi, ",")}`);
}
