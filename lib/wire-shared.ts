/**
 * Pure helpers for the wire (`/news`): topic tagging, URL filters, day
 * grouping and the right-rail tallies. No store access, so everything here is
 * unit tested and safe to import from a client component.
 */

import { capitalize, dayWords } from "@/lib/day-words";

export type WireTopic = "earnings" | "analyst" | "mna" | "macro" | "policy" | "product";

export const WIRE_TOPICS: Array<{ id: WireTopic; label: string }> = [
  { id: "earnings", label: "Earnings" },
  { id: "analyst", label: "Analyst actions" },
  { id: "mna", label: "M&A" },
  { id: "macro", label: "Macro" },
  { id: "policy", label: "Policy" },
  { id: "product", label: "Product" },
];

export type WireTone = "bullish" | "bearish" | "mixed";

export type WireItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  /** "publisher" | "official" | "press_release" | "" */
  sourceKind: string;
  /** ISO instant. */
  publishedAt: string;
  /** One line under the headline: the publisher's own excerpt, or our stored summary. */
  excerpt: string;
  /** Who wrote the excerpt, so the page can say so. */
  excerptOrigin: "publisher" | "summary" | "";
  tickers: string[];
  /** Only set when the stored label is a real, non-neutral one. */
  tone: WireTone | null;
  topics: WireTopic[];
};

/* ── Topics ────────────────────────────────────────────────────────────── */

const TOPIC_RULES: Array<{ topic: WireTopic; pattern: RegExp }> = [
  {
    topic: "earnings",
    pattern:
      /\b(earnings|quarterly results|q[1-4] (?:results|revenue|profit|sales|earnings)|(?:first|second|third|fourth)[- ]quarter|fiscal (?:20\d\d|q[1-4])|eps\b|guidance|outlook|forecast(?:s|ed)?|beats? (?:estimates|expectations|on)|miss(?:es|ed)? (?:estimates|expectations)|tops? estimates|revenue (?:rises|falls|jumps|grows|drops|beats|misses)|profit (?:rises|falls|jumps|drops|warning)|same-store sales)\b/i,
  },
  {
    topic: "analyst",
    pattern:
      /\b(upgrade[sd]?|downgrade[sd]?|price target|initiat(?:es|ed|ing) coverage|reiterat(?:es|ed)|overweight|underweight|outperform|underperform|(?:buy|sell|hold|neutral) rating|rated (?:buy|sell|hold)|analysts? (?:say|says|see|sees|cut|cuts|raise|raises|lift|lifts|warn|warns)|raises? (?:its )?target|cuts? (?:its )?target|street-high|top pick)\b/i,
  },
  {
    topic: "mna",
    pattern:
      /\b(acqui(?:re|res|red|ring|sition)|merger|merge[sd]?|takeover|buyout|to buy\b|agrees? to (?:buy|sell)|tender offer|spin[- ]?off|spins? off|divest(?:s|ed|iture)?|stake in|take[s]? private|going private|bid for|all-cash deal|all-stock deal|\$[\d.]+ ?(?:billion|bn|million) deal)\b/i,
  },
  {
    topic: "macro",
    pattern:
      /\b(fed\b|federal reserve|fomc|powell|rate (?:cut|hike|decision)|interest rates?|inflation|cpi\b|ppi\b|pce\b|jobs report|payrolls|unemployment|jobless claims|gdp\b|recession|treasur(?:y|ies)|bond yields?|yield curve|consumer (?:confidence|sentiment|spending)|retail sales|housing starts|ism\b|pmi\b|crude|oil prices?|the dollar|central bank|ecb\b|stocks (?:fall|rise|slide|rally|tumble|sink|surge)|wall street (?:falls|rises|slides|rallies|opens|closes)|s&p 500|nasdaq composite|dow jones)\b/i,
  },
  {
    topic: "policy",
    pattern:
      /\b(tariffs?|trade (?:war|deal|talks)|sanctions?|export (?:controls?|curbs?|ban)|antitrust|regulat(?:or|ors|ory|ion|ions)|sec (?:charges|sues|fines|probe)|ftc\b|doj\b|justice department|lawsuit|sues\b|sued\b|settle(?:s|ment)|congress|senate|house bill|white house|trump|executive order|supreme court|fda (?:approv|reject|clear)|subpoena|investigation|probe|fine[sd]?\b|ban(?:s|ned)?\b|shutdown)\b/i,
  },
  {
    topic: "product",
    pattern:
      /\b(launch(?:es|ed|ing)?|unveil(?:s|ed|ing)?|rolls? out|releases? (?:new|its)|new (?:model|chip|drug|product|feature|service|version|iphone|platform|data cent(?:er|re)s?)|recall(?:s|ed)?|fda approval|approved (?:by|for)|clinical trial|phase [123i]+\b|partnership|partners? with|contract (?:win|award)|wins? (?:\$|contract|order)|orders? for|supply (?:deal|agreement)|expands? (?:into|to))\b/i,
  },
];

/** Official sources always belong to one desk, whatever the headline says. */
const SOURCE_TOPICS: Record<string, WireTopic> = {
  "federal reserve": "macro",
  "bureau of labor statistics": "macro",
  "bureau of economic analysis": "macro",
  sec: "policy",
  ftc: "policy",
  "department of justice": "policy",
};

/** Topics a headline belongs to. A headline can sit on more than one desk, or none. */
export function classifyTopics(title: string, source = ""): WireTopic[] {
  const found = new Set<WireTopic>();
  const fromSource = SOURCE_TOPICS[source.trim().toLowerCase()];
  if (fromSource) found.add(fromSource);
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(title)) found.add(rule.topic);
  }
  return WIRE_TOPICS.map((entry) => entry.id).filter((id) => found.has(id));
}

/** A stored sentiment label is shown only when it says something. */
export function visibleTone(label: string | null | undefined): WireTone | null {
  const value = String(label ?? "").trim().toLowerCase();
  return value === "bullish" || value === "bearish" || value === "mixed" ? value : null;
}

/* ── Filters in the URL ────────────────────────────────────────────────── */

export type WireFilters = {
  topic: WireTopic | null;
  ticker: string | null;
  /** A story theme from the tone labels ("Nvidia CEO probe"). */
  theme: string | null;
  mine: boolean;
  q: string;
  /** How many rows to show. */
  limit: number;
};

export const WIRE_PAGE_SIZE = 80;
export const WIRE_MAX_ROWS = 480;

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function normalizeTicker(raw: string): string | null {
  const value = raw.trim().toUpperCase().replace(/^\$/, "");
  return /^[A-Z][A-Z0-9.\-]{0,7}$/.test(value) ? value : null;
}

export function parseWireFilters(params: Record<string, ParamValue> | undefined): WireFilters {
  const topicRaw = first(params?.topic).toLowerCase();
  const topic = WIRE_TOPICS.find((entry) => entry.id === topicRaw)?.id ?? null;
  const n = Number.parseInt(first(params?.n), 10);
  const theme = first(params?.theme).replace(/\s+/g, " ").trim().slice(0, 48);
  return {
    topic,
    ticker: normalizeTicker(first(params?.ticker)),
    theme: theme || null,
    mine: first(params?.mine) === "1",
    q: first(params?.q).trim().slice(0, 80),
    limit: Number.isFinite(n) ? Math.min(WIRE_MAX_ROWS, Math.max(WIRE_PAGE_SIZE, n)) : WIRE_PAGE_SIZE,
  };
}

/** The wire URL for these filters. Defaults are left out so links stay short. */
export function wireHref(filters: WireFilters, patch: Partial<WireFilters> = {}): string {
  const next = { ...filters, ...patch };
  const query = new URLSearchParams();
  if (next.topic) query.set("topic", next.topic);
  if (next.ticker) query.set("ticker", next.ticker);
  if (next.theme) query.set("theme", next.theme);
  if (next.mine) query.set("mine", "1");
  if (next.q) query.set("q", next.q);
  if (next.limit > WIRE_PAGE_SIZE) query.set("n", String(next.limit));
  const text = query.toString();
  return text ? `/news?${text}` : "/news";
}

export function hasActiveFilter(filters: WireFilters): boolean {
  return Boolean(filters.topic || filters.ticker || filters.theme || filters.mine || filters.q);
}

/** The comparison form of a theme name, so "Nvidia CEO probe" and "nvidia ceo  probe" are one theme. */
export function themeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Apply every filter. `mine` is the signed-in person's tickers (ignored when null).
 * `themes` maps a headline id to its theme name; without it a theme filter matches nothing.
 */
export function filterWire(
  items: WireItem[],
  filters: WireFilters,
  mine: ReadonlySet<string> | null = null,
  themes: Record<string, string | null | undefined> | null = null,
): WireItem[] {
  const wantTheme = filters.theme ? themeKey(filters.theme) : "";
  const words = filters.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((item) => {
    if (filters.topic && !item.topics.includes(filters.topic)) return false;
    if (filters.ticker && !item.tickers.includes(filters.ticker)) return false;
    if (wantTheme) {
      const theme = themes?.[item.id];
      if (!theme || themeKey(theme) !== wantTheme) return false;
    }
    if (filters.mine && mine && !item.tickers.some((ticker) => mine.has(ticker))) return false;
    if (words.length) {
      const haystack = `${item.title} ${item.source} ${item.tickers.join(" ")} ${item.excerpt}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/* ── Days and times (US Eastern) ───────────────────────────────────────── */

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** The New York calendar day of an instant, as YYYY-MM-DD. Empty when unreadable. */
export function etDay(iso: string | number | Date): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ET_DAY.format(date);
}

/** "4:05 PM" in New York. */
export function etTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ET_TIME.format(date);
}

/** "Today", "Yesterday", "Friday" within the week or "Nov 3" before, for a YYYY-MM-DD day relative to `today` (lib/day-words.ts). */
export function dayLabel(day: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Date unknown";
  return capitalize(dayWords(day, today)) || ET_LABEL.format(new Date(`${day}T00:00:00Z`));
}

export type WireDay = { day: string; label: string; items: WireItem[] };

/** Newest first, split into New York calendar days. */
export function groupByDay(items: WireItem[], now: number | Date = Date.now()): WireDay[] {
  const today = etDay(now);
  const sorted = [...items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  const groups: WireDay[] = [];
  for (const item of sorted) {
    const day = etDay(item.publishedAt) || "unknown";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, label: dayLabel(day, today), items: [item] });
  }
  return groups;
}

/* ── Freshness ─────────────────────────────────────────────────────────── */

export type WireFreshness = {
  state: "fresh" | "stale" | "empty";
  newestAt: string | null;
  ageHours: number | null;
};

/** Headlines older than this are not "the wire" any more. Long enough to cover a weekend. */
export const WIRE_FRESH_HOURS = 60;

export function assessFreshness(items: Array<{ publishedAt: string }>, now: number = Date.now()): WireFreshness {
  let newest = "";
  for (const item of items) if (item.publishedAt > newest) newest = item.publishedAt;
  const newestMs = Date.parse(newest);
  if (!newest || !Number.isFinite(newestMs)) return { state: "empty", newestAt: null, ageHours: null };
  const ageHours = Math.max(0, (now - newestMs) / 3_600_000);
  return { state: ageHours <= WIRE_FRESH_HOURS ? "fresh" : "stale", newestAt: newest, ageHours };
}
