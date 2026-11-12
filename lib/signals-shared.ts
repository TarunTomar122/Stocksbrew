/**
 * Pure helpers for `/signals`: what counts as an explained move, how Reddit
 * mention velocity is measured against a name's own baseline, which companies
 * a policy post really names, and the market's move since a post. No store
 * access here, so all of it is unit tested.
 */

import { firstFullSentence } from "@/lib/plain-copy";
import { isCircularReason } from "@/lib/reason-quality";

/** Signals is what people say about stocks: Reddit and the President. The day's moves live on Market today (/explore#moves). */
export type SignalsTab = "today" | "reddit" | "policy";

export const SIGNALS_TABS: Array<{ id: SignalsTab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "reddit", label: "Reddit" },
  { id: "policy", label: "Policy" },
];

export type SignalsFilters = {
  tab: SignalsTab;
  /** Policy: "all" | "named". */
  show: string;
  limit: number;
};

export const POLICY_PAGE_SIZE = 40;
const POLICY_SHOWS = ["all", "named"];

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** What every tab shows before anyone picks a filter. */
const DEFAULT_SHOW = "all";

export function parseSignalsFilters(params: Record<string, ParamValue> | undefined): SignalsFilters {
  const tabRaw = first(params?.tab).toLowerCase();
  const tab = SIGNALS_TABS.find((entry) => entry.id === tabRaw)?.id ?? "today";
  const showRaw = first(params?.show).toLowerCase();
  const allowed = tab === "policy" ? POLICY_SHOWS : [];
  const n = Number.parseInt(first(params?.n), 10);
  return {
    tab,
    show: allowed.includes(showRaw) ? showRaw : DEFAULT_SHOW,
    limit: Number.isFinite(n) ? Math.min(400, Math.max(POLICY_PAGE_SIZE, n)) : POLICY_PAGE_SIZE,
  };
}

export function signalsHref(filters: SignalsFilters, patch: Partial<SignalsFilters> = {}): string {
  const next = { ...filters, ...patch };
  // A filter belongs to its tab; switching tabs starts clean.
  if (patch.tab && patch.tab !== filters.tab) {
    next.show = DEFAULT_SHOW;
    next.limit = POLICY_PAGE_SIZE;
  }
  const query = new URLSearchParams();
  if (next.tab !== "today") query.set("tab", next.tab);
  if (next.show !== DEFAULT_SHOW) query.set("show", next.show);
  if (next.limit > POLICY_PAGE_SIZE) query.set("n", String(next.limit));
  const text = query.toString();
  return text ? `/signals?${text}` : "/signals";
}

/* ── Movers ────────────────────────────────────────────────────────────── */

export type MoverInput = {
  ticker: string;
  name?: string | null;
  industry?: string | null;
  price?: number | null;
  day_change_pct: number;
  volume?: number | null;
  price_as_of?: string | null;
  narrative_as_of?: string | null;
  move_explanation?: {
    cause_type?: string;
    headline?: string;
    why_it_matters?: string;
    confidence?: string;
    searched_externally?: boolean;
    evidence?: Array<{ title?: string; url?: string }>;
  } | null;
};

export type Mover = {
  ticker: string;
  name: string | null;
  /** The industry the data feed gives, when it gives one ("Aerospace & Defense"). */
  industry: string | null;
  pct: number;
  price: number | null;
  volume: number | null;
  /** True only when a specific, dated cause was found. */
  explained: boolean;
  /** Short label for the cause ("Earnings miss"), or null when unexplained. */
  cause: string | null;
  headline: string | null;
  why: string | null;
  confidence: "high" | "medium" | "low" | null;
  /** Whether sources outside our own data were searched before giving up. */
  searched: boolean;
  evidence: Array<{ title: string; url: string }>;
  priceAsOf: string | null;
  explainedAsOf: string | null;
};

/** Cause types that mean "we looked and found nothing specific". */
const NO_CAUSE = new Set(["", "no_verified_catalyst", "price_action", "unknown", "unresolved", "none"]);

function isPlaceholder(text: string): boolean {
  return !text || /^[-–—.\s]*$/.test(text);
}

/** "earnings_and_guidance" -> "Earnings and guidance". */
export function causeLabel(raw: string | null | undefined): string | null {
  const text = String(raw ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || NO_CAUSE.has(String(raw ?? "").trim().toLowerCase())) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function classifyMover(input: MoverInput): Mover {
  const explanation = input.move_explanation ?? null;
  const causeType = String(explanation?.cause_type ?? "").trim().toLowerCase();
  const headline = String(explanation?.headline ?? "").trim();
  const why = String(explanation?.why_it_matters ?? "").trim();
  // A headline that only says the move again ("Semiconductor rally drives SOXL higher") is no reason (owner rules 7, 8).
  const explained = Boolean(explanation) && !NO_CAUSE.has(causeType) && !isPlaceholder(headline) && !isCircularReason(headline, input.ticker, input.name);
  const confidence = String(explanation?.confidence ?? "").toLowerCase();
  const evidence = (explanation?.evidence ?? [])
    .map((row) => ({ title: String(row?.title ?? "").trim(), url: String(row?.url ?? "").trim() }))
    .filter((row) => row.title && /^https?:\/\//.test(row.url));
  const name = String(input.name ?? "").trim();
  return {
    ticker: input.ticker.toUpperCase(),
    name: name && name.toUpperCase() !== input.ticker.toUpperCase() ? name : null,
    industry: String(input.industry ?? "").trim() || null,
    pct: input.day_change_pct,
    price: typeof input.price === "number" && Number.isFinite(input.price) ? input.price : null,
    volume: typeof input.volume === "number" && Number.isFinite(input.volume) ? input.volume : null,
    explained,
    cause: explained ? causeLabel(causeType) : null,
    headline: isPlaceholder(headline) ? null : headline,
    why: isPlaceholder(why) ? null : why,
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : null,
    searched: explanation?.searched_externally === true,
    evidence,
    priceAsOf: input.price_as_of ?? null,
    explainedAsOf: input.narrative_as_of ?? null,
  };
}

export function filterMovers(movers: Mover[], show: string): Mover[] {
  const rows = movers.filter((mover) => {
    if (show === "explained") return mover.explained;
    if (show === "unexplained") return !mover.explained;
    if (show === "up") return mover.pct > 0;
    if (show === "down") return mover.pct < 0;
    return true;
  });
  return rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.ticker.localeCompare(b.ticker));
}

export function moverCounts(movers: Mover[]): { all: number; explained: number; unexplained: number; up: number; down: number } {
  return {
    all: movers.length,
    explained: movers.filter((mover) => mover.explained).length,
    unexplained: movers.filter((mover) => !mover.explained).length,
    up: movers.filter((mover) => mover.pct > 0).length,
    down: movers.filter((mover) => mover.pct < 0).length,
  };
}

/* ── Reddit ────────────────────────────────────────────────────────────── */

export type RedditPostLite = { id: string; title: string; text: string; subreddit: string; published: string; url: string };

/**
 * Does a post name this ticker? A cashtag always counts. A bare symbol counts
 * only in capitals as a whole word and only for symbols of two letters or
 * more, so "A" or "ON" in a sentence never does... except two-letter symbols
 * that are everyday words, which need the cashtag.
 */
const COMMON_WORDS = new Set(["ON", "IT", "SO", "GO", "BE", "DO", "OR", "AN", "AT", "BY", "IF", "IS", "NO", "UP", "US", "WE", "ALL", "ARE", "CAN", "FOR", "HAS", "NOW", "ONE", "OUT", "SEE", "TWO", "YOU", "NEW", "ANY", "BIG", "DAY", "CEO", "IPO", "ETF", "USA", "ATH", "DD", "AI", "EV", "PM", "AM"]);

export function postNamesTicker(post: Pick<RedditPostLite, "title" | "text">, ticker: string): boolean {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return false;
  const haystack = `${post.title}\n${post.text}`;
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\$${escaped}(?![A-Za-z0-9])`, "i").test(haystack)) return true;
  if (symbol.length < 2 || COMMON_WORDS.has(symbol)) return false;
  return new RegExp(`(?<![A-Za-z0-9$])${escaped}(?![A-Za-z0-9])`).test(haystack);
}

export type MentionVelocity = {
  /** Posts naming it per 24-hour bucket, oldest first; the last bucket ends at `now`. */
  daily: number[];
  last24h: number;
  /** Mean posts per day over the earlier buckets. */
  baselinePerDay: number;
  /** last24h / baseline. Null when there is no baseline to compare with. */
  ratio: number | null;
  /** How the last day compares, in words. */
  state: "new" | "rising" | "steady" | "fading" | "quiet";
};

export const VELOCITY_DAYS = 7;

export function mentionVelocity(
  posts: RedditPostLite[],
  ticker: string,
  now: number,
  days: number = VELOCITY_DAYS,
): MentionVelocity {
  const daily = new Array<number>(days).fill(0);
  for (const post of posts) {
    const at = Date.parse(post.published);
    if (!Number.isFinite(at) || at > now) continue;
    const bucket = days - 1 - Math.floor((now - at) / 86_400_000);
    if (bucket < 0) continue;
    if (postNamesTicker(post, ticker)) daily[bucket] = (daily[bucket] ?? 0) + 1;
  }
  const last24h = daily[days - 1] ?? 0;
  const earlier = daily.slice(0, days - 1);
  const baselinePerDay = earlier.length ? earlier.reduce((sum, count) => sum + count, 0) / earlier.length : 0;
  const ratio = baselinePerDay > 0 ? last24h / baselinePerDay : null;
  let state: MentionVelocity["state"];
  if (last24h === 0) state = baselinePerDay > 0 ? "fading" : "quiet";
  else if (ratio === null) state = "new";
  else if (ratio >= 1.5) state = "rising";
  else if (ratio <= 0.6) state = "fading";
  else state = "steady";
  return { daily, last24h, baselinePerDay, ratio, state };
}

export type Stance = "bullish" | "bearish" | "mixed" | "neutral";

export function normalizeStance(raw: string | null | undefined): Stance {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "bullish" || value === "bearish" || value === "mixed" ? value : "neutral";
}

export type RedditName = {
  ticker: string;
  company: string | null;
  /** Posts naming it in the scan window, as the scan counted them. */
  mentions: number;
  stance: Stance;
  /** True when a model read the posts; false when only the count is known. */
  stanceRead: boolean;
  summary: string | null;
  catalysts: string[];
  latestPostAt: string | null;
  subreddits: string[];
  velocity: MentionVelocity;
  dayPct: number | null;
};

/** What is being said about a name, as one line: its first catalyst, else the summary's first sentence. */
export function redditHighlight(
  name: Pick<RedditName, "catalysts" | "summary">,
  /** Today's move by ticker and by the first word of the company's name, for dropping a clause today contradicts. */
  movesToday?: ReadonlyMap<string, number>,
): string | null {
  const said = name.catalysts.find((line) => line.trim()) ?? (name.summary ? firstFullSentence(name.summary) : null);
  const clean = withoutContradictedClause(said ? said.trim().replace(/[.!]+$/, "") : "", movesToday);
  // The line keeps its own capitals ("CEO", "AI", "Nvidia"); only the first letter is raised.
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.` : null;
}

const FELL = /^(?:declined|declines|fell|falls|dropped|drops|slid|slides|sank|sinks|slumped|slumps|tumbled|tumbles|weakened)$/i;
const ROSE = /^(?:rose|rises|rallied|rallies|gained|gains|climbed|climbs|jumped|jumps|surged|surges|soared|soars|strengthened)$/i;
// A trailing comparison with another stock: "Relative strength while Nvidia declined", "…, as AMD rallied".
const COMPARED = /,?\s+(?:while|as|after|despite)\s+([A-Z][\w.&-]*)(?:'s|’s)?(?:\s+(?:stock|shares))?\s+([a-z]+)\b[^,;]*$/;

// Keys too common to stand for one stock: first words many companies share ("American", "Energy", "The"), and tickers
// that are also words ("AI", "ON", "IT").
const GENERIC_KEYS = new Set(
  (
    "the american america energy first general united global international national new advanced applied digital " +
    "southern northern western eastern pacific atlantic royal bank capital financial health healthcare real " +
    "ai it on all are can now one see big low key run out any has was"
  ).split(" "),
);

/**
 * A highlight's closing comparison with another stock, dropped when today's move says the opposite (owner rule 7:
 * nothing stale shown as news). The posts were read days ago; "while Nvidia declined" on a day NVDA is up 2.9% is no
 * longer true. Kept when we do not know that stock's move today.
 */
export function withoutContradictedClause(text: string, movesToday?: ReadonlyMap<string, number>): string {
  if (!text || !movesToday?.size) return text;
  const match = COMPARED.exec(text);
  if (!match || match.index === 0) return text;
  const who = match[1]!.toLowerCase();
  const verb = match[2]!;
  const move = movesToday.get(who);
  if (move === undefined) return text;
  const contradicted = (FELL.test(verb) && move > 0) || (ROSE.test(verb) && move < 0);
  return contradicted ? text.slice(0, match.index) : text;
}

/** Today's moves keyed for withoutContradictedClause: by ticker and by the first word of the company's name. */
export function redditMovesToday(names: ReadonlyArray<Pick<RedditName, "ticker" | "company" | "dayPct">>): Map<string, number> {
  const moves = new Map<string, number>();
  // Which tickers each key stands for: META's own ticker and "Meta Platforms" are one stock, not a clash.
  const owners = new Map<string, Set<string>>();
  const add = (key: string, ticker: string, pct: number) => {
    if (!key || GENERIC_KEYS.has(key)) return;
    const set = owners.get(key) ?? new Set<string>();
    set.add(ticker);
    owners.set(key, set);
    if (!moves.has(key)) moves.set(key, pct);
  };
  for (const name of names) {
    if (name.dayPct === null || !Number.isFinite(name.dayPct)) continue;
    const ticker = name.ticker.toUpperCase();
    add(ticker.toLowerCase(), ticker, name.dayPct);
    const first = name.company?.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9&-]/g, "");
    if (first && first.length > 3) add(first, ticker, name.dayPct);
  }
  // A key two different stocks share names neither of them.
  for (const [key, tickers] of owners) if (tickers.size > 1) moves.delete(key);
  return moves;
}

/** Loudest first: posts in the scan, then how hard it is accelerating. */
export function rankReddit(names: RedditName[]): RedditName[] {
  return [...names].sort(
    (a, b) =>
      b.mentions - a.mentions ||
      (b.velocity.ratio ?? 0) - (a.velocity.ratio ?? 0) ||
      b.velocity.last24h - a.velocity.last24h ||
      a.ticker.localeCompare(b.ticker),
  );
}

export function velocityLabel(velocity: MentionVelocity): string {
  const days = velocity.daily.length - 1;
  if (velocity.state === "new") return `${velocity.last24h} in 24h, none in the ${days} days before`;
  if (velocity.state === "quiet") return "no posts in the last week of our cache";
  if (velocity.state === "fading" && velocity.last24h === 0) return `none in 24h, ${velocity.baselinePerDay.toFixed(1)}/day before`;
  return `${velocity.last24h} in 24h vs ${velocity.baselinePerDay.toFixed(1)}/day`;
}

/* ── Policy ────────────────────────────────────────────────────────────── */

const NAME_NOISE = new Set([
  "the", "inc", "incorporated", "corp", "corporation", "company", "co", "ltd", "limited", "plc", "holdings", "holding", "group",
  "class", "common", "stock", "and", "of", "sa", "nv", "ag", "se", "llc", "lp", "trust", "international", "global", "technologies",
  "technology", "industries", "enterprises", "systems", "new", "american", "united", "national", "first", "general", "federal",
]);

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !NAME_NOISE.has(word));
}

/**
 * Is `mentioned` (a company name pulled from a post) the same company as
 * `listed` (the name on the ticker)? Every distinctive word of the shorter
 * name has to appear in the other, in order, starting from the first. So
 * "Boeing" matches "The Boeing Company", while "The New York Times" does not
 * match "New Horizon Aircraft" and "Federal Reserve" does not match "Federal
 * Realty Investment Trust".
 */
export function sameCompany(mentioned: string, listed: string): boolean {
  const a = nameWords(mentioned);
  const b = nameWords(listed);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((word, index) => long[index] === word);
}

/** The tickers on a post whose listed company is actually named in it. */
export function confirmedTickers(
  tickers: string[],
  companyNames: string[],
  listedNames: ReadonlyMap<string, string>,
): string[] {
  const out: string[] = [];
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    const listed = listedNames.get(ticker);
    if (!listed || out.includes(ticker)) continue;
    if (companyNames.some((name) => sameCompany(name, listed))) out.push(ticker);
  }
  return out;
}

const ET_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** New York's day and hour for an instant. */
export function etDayHour(iso: string): { day: string; hour: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(ET_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export type SinceMove = { pct: number; fromDate: string; toDate: string };

/**
 * The move from the last close before a post to the latest stored price.
 * A post after 4 PM New York time on a trading day is measured from that
 * day's close; anything earlier from the previous close.
 */
export function moveSince(dates: string[], closes: number[], publishedAt: string): SinceMove | null {
  const at = etDayHour(publishedAt);
  const size = Math.min(dates.length, closes.length);
  if (!at || size < 2) return null;
  let base = -1;
  for (let index = 0; index < size; index += 1) {
    const day = dates[index]!;
    if (day < at.day || (day === at.day && at.hour >= 16)) base = index;
    else break;
  }
  const last = size - 1;
  if (base < 0 || base >= last) return null;
  const from = closes[base]!;
  const to = closes[last]!;
  if (!(from > 0) || !(to > 0)) return null;
  return { pct: Math.round(((to - from) / from) * 10_000) / 100, fromDate: dates[base]!, toDate: dates[last]! };
}

export type PolicyName = { ticker: string; company: string; since: SinceMove | null };

export type PolicyPost = {
  id: string;
  publishedAt: string;
  /** A model's one-line summary of the post. The link goes to the post itself. */
  summary: string;
  stance: Stance;
  url: string;
  archiveUrl: string | null;
  names: PolicyName[];
  /** S&P 500 (SPY) since the post. */
  market: SinceMove | null;
};

export function filterPolicy(posts: PolicyPost[], show: string): PolicyPost[] {
  const rows = show === "named" ? posts.filter((post) => post.names.length > 0) : posts;
  return [...rows].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

/* ── Today ─────────────────────────────────────────────────────────────── */

export type TodayPick = { movers: Mover[]; unexplained: Mover[]; reddit: RedditName[]; policy: PolicyPost[] };

/**
 * The strongest few of each stream: the biggest explained moves, the biggest
 * moves nobody could explain, the names Reddit is loudest about, and the
 * newest policy posts (those that name a company first when they are recent).
 */
export function pickToday(movers: Mover[], reddit: RedditName[], policy: PolicyPost[], now: number): TodayPick {
  const bySize = filterMovers(movers, "all");
  const recentNamed = policy.filter((post) => post.names.length > 0 && now - Date.parse(post.publishedAt) <= 7 * 86_400_000);
  const newest = filterPolicy(policy, "all");
  const picked: PolicyPost[] = [];
  for (const post of [...filterPolicy(recentNamed, "all"), ...newest]) {
    if (picked.length >= 8) break;
    if (!picked.some((row) => row.id === post.id)) picked.push(post);
  }
  return {
    movers: bySize.filter((mover) => mover.explained).slice(0, 5),
    unexplained: bySize.filter((mover) => !mover.explained).slice(0, 4),
    reddit: rankReddit(reddit).slice(0, 20),
    policy: picked.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)),
  };
}
