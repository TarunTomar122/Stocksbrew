import { analyticsDb } from "@/lib/analytics/db";
import { agentsCreatedIn, funnel, proConversionsIn, signupsIn, stepRates, type FunnelStep, type RealFacts } from "@/lib/analytics/funnel";
import {
  avgSeconds,
  bounceRate,
  exitRate,
  hoursUpTo,
  liveView,
  mergeRollups,
  rollupDay,
  type DayRollup,
  type LiveView,
  type RangeTotals,
} from "@/lib/analytics/rollup";
import { utcDay } from "@/lib/analytics/visitor";

/**
 * What /admin/analytics shows, built from the daily rollups (past days are
 * read as one small document each, and folded from raw chunks only once) plus
 * today's chunks, and the real records for sign-ups, agents and Pro. Each
 * instance caches a range's answer for 60 seconds.
 */

export const RANGES = ["today", "7d", "30d", "90d"] as const;
export type RangeId = (typeof RANGES)[number];

export function parseRange(value: unknown): RangeId {
  return RANGES.includes(value as RangeId) ? (value as RangeId) : "7d";
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A day's rollup is final once the day has been over this long: until then it is folded again from the raw
 * chunks, so events that arrive late (a flush retried through a store outage, a spool sent after a restart) still count.
 */
export const FINAL_AFTER_MS = 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000;
const CACHE_MS = 60 * 1000;

export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** The days a range covers (oldest first), and the same number of days before them. */
export function rangeDays(range: RangeId, now: number): { current: string[]; previous: string[] } {
  const count = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const today = dayStart(utcDay(now));
  const current = Array.from({ length: count }, (_, i) => utcDay(today - (count - 1 - i) * DAY_MS));
  const previous = Array.from({ length: count }, (_, i) => utcDay(today - (2 * count - 1 - i) * DAY_MS));
  return { current, previous };
}

export type Metric = { value: number | null; previous: number | null; spark: number[] };
export type Ranked = { key: string; value: number; share: number };
export type PageStat = { key: string; views: number; visitors: number; exitRate: number | null };

export type Dashboard = {
  range: RangeId;
  generatedAt: string;
  /** Hourly points for "today", daily otherwise. */
  series: Array<{ label: string; at: string; visitors: number; pageviews: number }>;
  headline: {
    visitors: Metric;
    pageviews: Metric;
    sessions: Metric;
    bounce: Metric;
    avgSession: Metric;
    signups: Metric;
    pro: Metric;
  };
  signedIn: { pageviews: number; visitors: number };
  sources: { referrers: Ranked[]; utmSource: Ranked[]; utmMedium: Ranked[]; utmCampaign: Ranked[]; countries: Ranked[]; devices: Ranked[]; browsers: Ranked[]; screens: Ranked[] };
  pages: { paths: PageStat[]; routes: PageStat[] };
  stocks: Array<{ symbol: string; views: number; visitors: number }>;
  searches: Ranked[];
  searchMisses: Ranked[];
  events: Record<string, { n: number; v: number }>;
  proposals: { accepted: number; dismissed: number };
  created: { agents: number; baskets: number; theses: number };
  funnel: Array<FunnelStep & { rate: number | null }>;
  /** True when no beacon data exists for the range at all. */
  empty: boolean;
};

function ranked(counter: Record<string, number>, limit = 12): Ranked[] {
  const total = Object.values(counter).reduce((sum, n) => sum + n, 0);
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value, share: total > 0 ? value / total : 0 }));
}

function pageStats(record: RangeTotals["pages"], limit = 40): PageStat[] {
  return Object.entries(record)
    .sort((a, b) => b[1].pv - a[1].pv || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, row]) => ({ key, views: row.pv, visitors: row.v, exitRate: exitRate(row) }));
}

type Cut = { v: number; pv: number; s: number; b: number; d: number };

function cutOf(days: readonly DayRollup[]): Cut {
  return days.reduce((sum, day) => ({ v: sum.v + day.v, pv: sum.pv + day.pv, s: sum.s + day.s, b: sum.b + day.b, d: sum.d + day.d }), { v: 0, pv: 0, s: 0, b: 0, d: 0 });
}

/** Pure: the dashboard from rollups for the current and previous days, the real records and the clock. */
export function buildDashboard(input: { range: RangeId; now: number; current: DayRollup[]; previous: DayRollup[]; facts: RealFacts }): Dashboard {
  const { range, now, current, previous, facts } = input;
  const totals = mergeRollups(current);
  const today = range === "today";
  const hour = new Date(now).getUTCHours();
  // Like with like: the range ends partway through today, so the period before ends at the same hour of its last day
  // (today so far against yesterday by this hour; 7 days so far against the 7 days before, cut the same way).
  const cutWith = (days: readonly DayRollup[]): Cut => {
    const full = cutOf(days.slice(0, -1));
    const last = hoursUpTo(days[days.length - 1]!, hour);
    return { v: full.v + last.v, pv: full.pv + last.pv, s: full.s + last.s, b: full.b + last.b, d: full.d + last.d };
  };
  const cur: Cut = cutWith(current);
  const prev: Cut = cutWith(previous);

  const startCur = dayStart(current[0]!.day);
  const endCur = Math.min(now, dayStart(current[current.length - 1]!.day) + DAY_MS);
  const startPrev = dayStart(previous[0]!.day);
  const endPrev = startPrev + (endCur - startCur);

  // Sparklines: hours for today, days otherwise.
  const points = today
    ? current[0]!.hours.slice(0, hour + 1).map((row, h) => ({ ...row, start: startCur + h * 3600_000 }))
    : current.map((day) => ({ v: day.v, pv: day.pv, s: day.s, b: day.b, d: day.d, start: dayStart(day.day) }));
  const step = today ? 3600_000 : DAY_MS;
  const signupSpark = points.map((p) => signupsIn(facts, p.start, p.start + step).length);
  const proSpark = points.map((p) => proConversionsIn(facts, p.start, p.start + step));

  const metric = (value: number | null, previousValue: number | null, spark: number[]): Metric => ({ value, previous: previousValue, spark });
  const created = agentsCreatedIn(facts, startCur, endCur);
  const steps = funnel(facts, { start: startCur, end: endCur, visitors: totals.v, signinStarted: totals.events.signin_started?.v ?? 0 });
  const rates = stepRates(steps);

  return {
    range,
    generatedAt: new Date(now).toISOString(),
    series: points.map((p) => ({
      label: today ? `${String(new Date(p.start).getUTCHours()).padStart(2, "0")}:00` : new Date(p.start).toISOString().slice(0, 10),
      at: new Date(p.start).toISOString(),
      visitors: p.v,
      pageviews: p.pv,
    })),
    headline: {
      visitors: metric(cur.v, prev.v, points.map((p) => p.v)),
      pageviews: metric(cur.pv, prev.pv, points.map((p) => p.pv)),
      sessions: metric(cur.s, prev.s, points.map((p) => p.s)),
      bounce: metric(bounceRate(cur.s, cur.b), bounceRate(prev.s, prev.b), points.map((p) => bounceRate(p.s, p.b) ?? 0)),
      avgSession: metric(avgSeconds(cur.s, cur.d), avgSeconds(prev.s, prev.d), points.map((p) => avgSeconds(p.s, p.d) ?? 0)),
      signups: metric(signupsIn(facts, startCur, endCur).length, signupsIn(facts, startPrev, endPrev).length, signupSpark),
      pro: metric(proConversionsIn(facts, startCur, endCur), proConversionsIn(facts, startPrev, endPrev), proSpark),
    },
    signedIn: { pageviews: totals.si_pv, visitors: totals.si_v },
    sources: {
      referrers: ranked(totals.refs),
      utmSource: ranked(totals.utm_source, 8),
      utmMedium: ranked(totals.utm_medium, 8),
      utmCampaign: ranked(totals.utm_campaign, 8),
      countries: ranked(totals.countries, 16),
      devices: ranked(totals.devices, 3),
      browsers: ranked(totals.browsers, 8),
      screens: ranked(totals.screens, 6),
    },
    pages: { paths: pageStats(totals.pages), routes: pageStats(totals.routes) },
    stocks: Object.entries(totals.stocks)
      .sort((a, b) => b[1].pv - a[1].pv || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([symbol, row]) => ({ symbol, views: row.pv, visitors: row.v })),
    searches: ranked(totals.searches, 20),
    searchMisses: ranked(totals.search_misses, 10),
    events: totals.events,
    proposals: { accepted: totals.proposals.accepted ?? 0, dismissed: totals.proposals.dismissed ?? 0 },
    created: { agents: created.job, baskets: created.basket, theses: created.thesis },
    funnel: steps.map((stepRow, index) => ({ ...stepRow, rate: rates[index] ?? null })),
    empty: totals.pv === 0 && Object.keys(totals.events).length === 0,
  };
}

/* ── loading, with caches ──────────────────────────────────────────────── */

type CacheState = {
  /** Finished days never change: kept for the life of the process. */
  final: Map<string, DayRollup>;
  answers: Map<string, { at: number; value: Promise<Dashboard> }>;
  facts: { at: number; value: Promise<RealFacts> } | null;
};

const globalKey = "__sbAnalyticsDashboard" as const;
type GlobalWithCache = typeof globalThis & { [globalKey]?: CacheState };

function cache(): CacheState {
  const g = globalThis as GlobalWithCache;
  if (!g[globalKey]) g[globalKey] = { final: new Map(), answers: new Map(), facts: null };
  return g[globalKey]!;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await run(items[index]!);
      }
    }),
  );
  return out;
}

/**
 * Rollups for these days: finished days from memory or their stored rollup;
 * anything missing or not final is folded from its raw chunks, and stored once
 * the day is final so it is never folded again.
 */
export async function loadRollups(ns: string, days: readonly string[], now: number): Promise<DayRollup[]> {
  const c = cache();
  const db = analyticsDb();
  const key = (day: string) => `${ns}:${day}`;
  const missing = days.filter((day) => !c.final.has(key(day)));
  const stored = missing.length > 0 ? await db.readRollups(ns, missing) : new Map<string, DayRollup>();
  const toFold: string[] = [];
  for (const day of missing) {
    const rollup = stored.get(day);
    if (rollup?.complete) c.final.set(key(day), rollup);
    else toFold.push(day);
  }
  const folded = await mapLimit(toFold, 4, async (day) => {
    const final = now >= dayStart(day) + DAY_MS + FINAL_AFTER_MS;
    const chunks = await db.chunksForDay(ns, day);
    return rollupDay(day, chunks.flatMap((chunk) => chunk.events), { complete: final, now });
  });
  const finished = folded.filter((rollup) => rollup.complete);
  for (const rollup of finished) c.final.set(key(rollup.day), rollup);
  if (finished.length > 0) await db.writeRollups(ns, finished).catch((error) => console.warn("[analytics] rollup write failed:", (error as Error)?.message));
  const fresh = new Map(folded.map((rollup) => [rollup.day, rollup]));
  return days.map((day) => c.final.get(key(day)) ?? fresh.get(day)!);
}

function realFacts(now: number): Promise<RealFacts> {
  const c = cache();
  if (c.facts && now - c.facts.at < CACHE_MS) return c.facts.value;
  const value = analyticsDb().realFacts();
  c.facts = { at: now, value };
  value.catch(() => {
    if (c.facts?.value === value) c.facts = null;
  });
  return value;
}

export function loadDashboard(ns: string, range: RangeId, now = Date.now()): Promise<Dashboard> {
  const c = cache();
  const cacheKey = `${ns}:${range}`;
  const hit = c.answers.get(cacheKey);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = (async () => {
    const { current, previous } = rangeDays(range, now);
    const [rollups, facts] = await Promise.all([loadRollups(ns, [...previous, ...current], now), realFacts(now)]);
    return buildDashboard({ range, now, previous: rollups.slice(0, previous.length), current: rollups.slice(previous.length), facts });
  })();
  c.answers.set(cacheKey, { at: now, value });
  value.catch(() => {
    if (c.answers.get(cacheKey)?.value === value) c.answers.delete(cacheKey);
  });
  return value;
}

/** Who is on the site in the last five minutes, read from the store (both instances' chunks). */
export async function loadLive(ns: string, now = Date.now()): Promise<LiveView & { at: string }> {
  const chunks = await analyticsDb().chunksSince(ns, now - 5 * 60 * 1000);
  return { ...liveView(chunks.flatMap((chunk) => chunk.events), now), at: new Date(now).toISOString() };
}

/** Tests only. */
export function resetDashboardCacheForTests() {
  const g = globalThis as GlobalWithCache;
  delete g[globalKey];
}
