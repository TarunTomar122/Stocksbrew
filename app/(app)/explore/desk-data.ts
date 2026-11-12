import { unstable_cache } from "next/cache";

import type { TheRead } from "@/lib/insights";
import { CALL_PLAIN, asSentence, firstFullSentence, shortCompanyName } from "@/lib/plain-copy";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings, type EarningsEvent } from "@/lib/earnings";
import { getFollowActivity, type FollowActivity } from "@/lib/follow";
import { getIpos, type IpoEvent } from "@/lib/ipos";
import { getMarketsOverview } from "@/lib/markets";
import type { MarketsData, MarketsOverview } from "@/lib/markets-shared";
import { realReason } from "@/lib/reason-quality";
import { moveReason } from "@/lib/briefing";
import { moveLine } from "@/lib/move-line";
import { getRedditCues } from "@/lib/reddit-cues";
import { hasRedditBrief } from "@/lib/reddit-cues-shared";
import { getLiveInvestmentThemes } from "@/lib/research-themes";
import { getThematicScreens } from "@/lib/screens";
import { addDays, weekStart, type EarningsItem } from "@/lib/calendar-shared";
import { loadCalendarRange, loadReportContext } from "@/lib/calendar";
import { buildCalendarRead, readTickers } from "@/lib/calendar-insights";
import { buildGiantsRead, callLeads, deskHeadline, screensTakeaway, withCallNext, type GiantForRead } from "@/lib/explore-insights";
import { etDayOf, quoteDay } from "@/lib/benchmark-day";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { etDayOfStamp, oldestStamp } from "@/lib/quote-time";
import { oneRowPerCompany } from "@/lib/share-class";
import { pickInsights } from "@/lib/insights";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead, FUND_TOPIC, nextReports, reportCard, SECTOR_IDS, sectorTakeaway, withWatchNext, type UpcomingReport } from "@/lib/markets-insights";
import { loadReddit } from "@/lib/signals";
import { buildMoversRead, buildRedditRead, moversHeadline } from "@/lib/signals-insights";
import { classifyMover } from "@/lib/signals-shared";
import { listStrategies, type StrategySummary } from "@/lib/strategies";
import { getTrumpLogic } from "@/lib/trump-logic";
import { sharedCache } from "@/lib/shared-cache";
import { moveFacts, type CloseSeries } from "@/lib/briefing-move-facts";
import { adminFirestore } from "@/lib/firebase-admin";
import { isTrumpMentionRecent } from "@/lib/trump-logic-format";
import { loadWire, modelLabel } from "@/lib/wire";
import { readTheWire, type ToneCounts } from "@/lib/wire-read";
import { parseWireFilters } from "@/lib/wire-shared";

/**
 * Everything the Explore desk shows, one loader per panel so each panel can
 * arrive on its own. A source that is slow or down becomes an empty section,
 * never a broken page and never a placeholder number.
 */

const SOURCE_TIMEOUT_MS = 9000;

// The calendar loaders query the store directly. The desk is rendered on every visit, so they are cached here.
const cachedEarnings = unstable_cache((from: string, to: string) => getEarnings("US", from, to), ["explore-earnings-v1"], { revalidate: 300 });
const cachedIpos = unstable_cache((from: string, to: string) => getIpos(from, to), ["explore-ipos-v1"], { revalidate: 900 });

async function soft<T>(name: string, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.error("explore_source_timeout", name);
      resolve(fallback);
    }, SOURCE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work.catch((error) => (console.error("explore_source_failed", name, error), fallback)), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type DeskMover = {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number;
  /** One line on why, only when the explanation was confirmed against a source. */
  reason: string | null;
  /** When `changePct` was priced (the live quote the feed was re-priced from, lib/daily-anomalies.ts). */
  priceAsOf: string | null;
};

export type DeskScreen = { id: string; title: string; tagline: string; matchCount: number; top: Array<{ ticker: string; changePct: number | null }> };
export type DeskTheme = { slug: string; name: string; description: string; tickers: string[] };
export type DeskReddit = { ticker: string; mentions: number; sentiment: string; summary: string };
export type DeskPost = {
  ticker: string;
  said: string;
  publishedAt: string;
  url: string;
  sinceChangePct: number | null;
  /** The post's lean for the market as the feed read it: bullish, bearish, mixed or neutral. */
  sentiment: string | null;
};

/** A stock in the news: how much is being said, how it leans, and the one headline to read. */
export type DeskStock = {
  ticker: string;
  name: string | null;
  pct: number | null;
  count: number;
  share: number;
  tones: ToneCounts;
  /** Null when every story about it is bait (lib/wire-companies.ts `plainStory`). */
  lead: { title: string; url: string; source: string; publishedAt: string } | null;
};

export type DeskNews = { stocks: DeskStock[]; read: TheRead | null };

export type DeskData = {
  today: string;
  wire: DeskNews;
  movers: {
    /** Every unusual move up, largest first: Market today is the one list of the day's moves, so none is cut. */
    up: DeskMover[];
    down: DeskMover[];
    asOf: string | null;
    /** The New York day the moves were priced on (feed.date is a UTC date, a day ahead after 7 PM New York time). */
    day: string | null;
    thresholdPct: number | null;
    /** What the whole list adds up to, in one line. */
    takeaway?: string | null;
  };
  earnings: { today: EarningsEvent[]; next: EarningsEvent[]; weekCount: number; asOf: string | null };
  ipos: IpoEvent[];
  markets: MarketsOverview | null;
  screens: { items: DeskScreen[]; asOf: string | null; takeaway?: string | null };
  themes: DeskTheme[];
  reddit: { items: DeskReddit[]; asOf: string | null; mood: string | null };
  posts: { items: DeskPost[]; asOf: string | null };
  follow: FollowActivity[];
  strategies: StrategySummary[];
};

/** The market's calendar day, so "today" does not flip at midnight UTC in the middle of the US evening. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A summary the reader can finish: the complete first sentence (never cut
 * mid-word with an ellipsis), Title Case headlines written as sentences.
 */
function clip(text: string | null | undefined, options: { quote?: boolean } = {}): string | null {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value || !/[a-z]{3}/i.test(value)) return null;
  return asSentence(firstFullSentence(value), options);
}

/**
 * One panel's data, cached for a minute for everyone. Nothing here changes
 * faster than that, and some sources do live price joins that cost seconds.
 * The loader throws when its source fails, so only a real answer is cached;
 * the failure (or a source that takes too long) becomes `fallback` for this
 * request alone.
 */
function section<T>(name: string, load: (today: string) => Promise<T>, fallback: T): (today: string) => Promise<T> {
  const cached = sharedCache(load, [`explore-desk-${name}-v2`], { revalidate: 60 });
  return (today) => soft(name, cached(today), fallback);
}

export const loadDeskWire = section<DeskData["wire"]>(
  "stocks-in-news",
  async () => {
    const wire = await loadWire();
    // `loadWire` swallows a failed read into an empty list. Empty here must not be cached as the answer.
    if (wire.items.length === 0) throw new Error("wire_empty");
    const reading = readTheWire(
      {
        items: wire.items,
        quotes: wire.quotes,
        labels: wire.labels,
        newestAt: wire.freshness.newestAt,
        labelledBy: modelLabel(wire.labelsMeta.model),
        labelledAt: wire.labelsMeta.updatedAt,
      },
      { nowMs: Date.now(), filters: parseWireFilters(undefined), buzzLimit: 7, themeLimit: 3 },
    );
    return {
      stocks: reading.buzz.map((row) => ({
        ticker: row.ticker,
        name: row.name,
        pct: row.pct,
        count: row.count,
        share: row.share,
        tones: row.tones,
        lead: row.lead
          ? {
              title: row.lead.title,
              url: row.lead.url,
              source: row.lead.source,
              publishedAt: row.lead.publishedAt,
            }
          : null,
      })),
      // Every line: the page's read picks the one about a stock it does not already name.
      read: reading.read,
    };
  },
  { stocks: [], read: null },
);

export const loadDeskMovers = section<DeskData["movers"]>(
  // Its own cache key since the list stopped at ten: an older cached copy has neither every move nor their times.
  "movers-all",
  async () => {
    const anomalies = await getDailyAnomalies("US");
    const rows = (anomalies?.anomalies ?? []).filter((row) => row.ticker && Number.isFinite(row.day_change_pct));
    const toMover = (row: (typeof rows)[number]): DeskMover => ({
      ticker: row.ticker,
      name: row.name,
      price: Number.isFinite(row.price) && row.price > 0 ? row.price : null,
      changePct: row.day_change_pct,
      // The briefing's rule for a confirmed reason (lib/briefing.ts moveReason: researched, with a source, more than the
      // price action), worded the way the home page words it (lib/move-line.ts). A reason that only says the move
      // again ("reverses recent gains") is none: the stock goes with the chips.
      reason: moveReason(row).status === "confirmed" ? realReason(moveLine(row), row.ticker, row.name) : null,
      priceAsOf: row.price_as_of ?? null,
    });
    const priced = oldestStamp(rows.map((row) => row.price_as_of));
    return {
      up: rows.filter((row) => row.day_change_pct > 0).sort((a, b) => b.day_change_pct - a.day_change_pct).map(toMover),
      down: rows.filter((row) => row.day_change_pct < 0).sort((a, b) => a.day_change_pct - b.day_change_pct).map(toMover),
      asOf: anomalies?.enriched_at ?? anomalies?.generated_at ?? null,
      day: etDayOfStamp(priced) ?? etDayOfStamp(anomalies?.generated_at ?? null),
      thresholdPct: anomalies?.threshold_pct ?? null,
      takeaway: moversHeadline(rows.map((row) => classifyMover(row))),
    };
  },
  { up: [], down: [], asOf: null, day: null, thresholdPct: null, takeaway: null },
);

/* ── Price facts for moves with no confirmed reason ─────────────────────── */

/** About three years of sessions: enough for "its biggest gain since …" and a stock's normal day. */
const FACT_SESSIONS = 760;
/** Most moves read for one page; the smallest moves past it go without a fact (and so are not shown). */
const FACT_MAX_STOCKS = 30;
/** How long the moves wait for the closes before the moves without a reason show as before. */
const FACT_BUDGET_MS = 1500;
/** The most cards one kind of fact sentence may lead, while a stock has another fact to give. */
const FACT_KIND_MAX = 3;

async function readClosesUncached(ticker: string): Promise<CloseSeries | null> {
  const snap = await adminFirestore.collection("tm_price_history_daily").doc(ticker.replace(/\//g, "-")).get();
  if (!snap.exists) return null;
  const raw = snap.data() as { dates?: unknown; closes?: unknown };
  const dates = Array.isArray(raw.dates) ? raw.dates : [];
  const closes = Array.isArray(raw.closes) ? raw.closes : [];
  const n = Math.min(dates.length, closes.length);
  const out: CloseSeries = { dates: [], closes: [] };
  for (let index = Math.max(0, n - FACT_SESSIONS); index < n; index += 1) {
    const date = dates[index];
    const close = closes[index];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.dates.push(date.slice(0, 10));
      out.closes.push(close);
    }
  }
  return out;
}

// The series gains one close a day; a few hours of staleness changes nothing a card says.
const readCloses = sharedCache(readClosesUncached, ["explore-move-closes-v1"], { revalidate: 6 * 3600 });

/**
 * One measured price fact for each move with no confirmed reason ("Its biggest gain since Sep 9", "About three
 * times a normal 1.1% day"; lib/briefing-move-facts.ts), the most telling one no other move already says, so each
 * card on Market today carries a fact of its own (owner rule 3) and never a reason we could not confirm (rule 7).
 * Within FACT_BUDGET_MS: a stock whose closes are slow or missing has no entry. Null when none came back at all, so
 * the page keeps its moves as chips rather than dropping every one.
 */
export async function loadMoveFacts(rows: DeskMover[], fallbackDay: string): Promise<Record<string, string> | null> {
  const picked = rows.slice(0, FACT_MAX_STOCKS);
  if (picked.length === 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), FACT_BUDGET_MS);
  });
  try {
    const series = await Promise.all(
      picked.map((row) =>
        Promise.race([
          readCloses(row.ticker).catch((error) => {
            console.warn(`[explore] closes for ${row.ticker} failed:`, error instanceof Error ? error.message : error);
            return null;
          }),
          late,
        ]),
      ),
    );
    const said = new Set<string>();
    // How many cards already use each kind of sentence ("About # times a normal #% day"): a kind used FACT_KIND_MAX
    // times gives way to the stock's next fact, so the cards do not read as one sentence with new numbers (owner rule 1).
    const kinds = new Map<string, number>();
    const kindOf = (line: string) => line.replace(/\d[\d.,]*%?/g, "#").replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) #(?:, #)?/g, "D");
    const out: Record<string, string> = {};
    picked.forEach((row, index) => {
      const closes = series[index];
      if (!closes || closes === "late") return;
      const quoted = etDayOfStamp(row.priceAsOf);
      const unsaid = moveFacts(row.changePct, closes, quoted ?? fallbackDay, { exactDay: quoted !== null }).filter((line) => !said.has(line));
      const fact = unsaid.find((line) => (kinds.get(kindOf(line)) ?? 0) < FACT_KIND_MAX) ?? unsaid[0];
      if (!fact) return;
      said.add(fact);
      kinds.set(kindOf(fact), (kinds.get(kindOf(fact)) ?? 0) + 1);
      out[row.ticker] = fact;
    });
    return Object.keys(out).length > 0 ? out : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The reports on the calendar in the next three weeks, for a read's "Watch next" line on News and Signals (the same
 * cached earnings read as Market today). Empty on a failed or slow read: the line is left out, never guessed.
 */
export const loadUpcomingReports = section<UpcomingReport[]>(
  "upcoming-reports",
  async (today) => {
    const events = await cachedEarnings(today, shiftDay(today, 21));
    return events.map((event) => ({ ticker: event.ticker, date: event.event_date, time: event.time }));
  },
  [],
);

/**
 * A read whose cards about one stock end with that stock's next report, when the calendar has one within three
 * weeks ("Watch next: NVDA reports on Nov 19 after the close."). Nothing is added without a real report.
 */
export function withReports(read: TheRead, reports: UpcomingReport[], today: string): TheRead {
  if (reports.length === 0 || read.insights.length === 0) return read;
  return { ...read, insights: withWatchNext(read.insights, nextReports(reports, today), today, new Set(), { singleStock: true }) };
}

/** How long a read waits for the calls on its stocks before it goes without the "Our call" line. */
const CALL_TIMEOUT_MS = 1500;

/**
 * Our call on each stock, in the reader's words ("Buy more", "Keep", "Sell some"), from the screener's rows (the call
 * is open to everyone). A slow or failed read gives an empty map: the read then goes without the line, never guessed.
 */
export async function loadCallWords(tickers: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tickers.length === 0) return out;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Map<string, ScreenerRow>>((resolve) => {
    timer = setTimeout(() => resolve(new Map()), CALL_TIMEOUT_MS);
  });
  try {
    const rows = await Promise.race([getScreenerRows(tickers).catch((error) => (console.error("explore_source_failed", "calls", error), new Map<string, ScreenerRow>())), timeout]);
    for (const [ticker, row] of rows) {
      const word = row.call ? CALL_PLAIN[row.call as keyof typeof CALL_PLAIN] : undefined;
      if (word) out.set(ticker, word);
    }
    return out;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Earnings and IPOs share a panel, so they load together. Either one failing leaves the other standing. */
export const loadDeskCalendar = section<Pick<DeskData, "earnings" | "ipos">>(
  "calendar",
  async (today) => {
    const [earningsResult, iposResult] = await Promise.allSettled([
      cachedEarnings(today, shiftDay(today, 6)),
      cachedIpos(today, shiftDay(today, 21)),
    ]);
    // Both down is a failed read, not an empty week: throw so it is not cached.
    if (earningsResult.status === "rejected" && iposResult.status === "rejected") throw earningsResult.reason;
    if (earningsResult.status === "rejected") console.error("explore_source_failed", "earnings", earningsResult.reason);
    if (iposResult.status === "rejected") console.error("explore_source_failed", "ipos", iposResult.reason);
    const earnings = earningsResult.status === "fulfilled" ? earningsResult.value : [];
    const ipos = iposResult.status === "fulfilled" ? iposResult.value : [];
    const sessionOrder: Record<string, number> = { bmo: 0, during: 1, amc: 2 };
    const todays = earnings.filter((event) => event.event_date === today).sort((a, b) => (sessionOrder[a.time] ?? 1) - (sessionOrder[b.time] ?? 1));
    const later = earnings.filter((event) => event.event_date > today);
    return {
      earnings: { today: todays.slice(0, 8), next: later.slice(0, 6), weekCount: earnings.length, asOf: earnings[0]?.captured_at ?? null },
      ipos: ipos.slice(0, 4),
    };
  },
  { earnings: { today: [], next: [], weekCount: 0, asOf: null }, ipos: [] },
);

export const loadDeskMarkets = section<DeskData["markets"]>(
  "markets",
  async () => {
    // `getMarketsOverview` returns an empty overview when the store read fails; never cache that.
    const markets = await getMarketsOverview();
    if (!markets || markets.tiles.length === 0) throw new Error("markets_empty");
    return markets;
  },
  null,
);

const NO_MARKETS: MarketsData = { as_of: null, assets: [], predictions: [], treasury: null, volCurve: null };

/**
 * Every market Market today draws below its read. `getMarketsData` is cached and never throws, but a
 * store that hangs would keep those sections on their ghost, so it gets the same time limit as the rest.
 */
export function loadDeskMarketsData(): Promise<MarketsData> {
  return soft("markets-data", getMarketsData(), NO_MARKETS);
}

export type DeskSector = { id: string; name: string; slug: string; day: number; month: number | null };

/**
 * The 11 sectors and how each did on the day, from the sector funds, best
 * first. Market today leads with this: the whole market before single stocks.
 */
export const loadDeskSectors = section<{ rows: DeskSector[]; takeaway: string | null; asOf: string | null }>(
  "sectors",
  async () => {
    const data = await getMarketsData();
    const rows = SECTOR_IDS.map((id) => data.assets.find((asset) => asset.id === id))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset) && typeof asset!.change.d1 === "number" && Number.isFinite(asset!.change.d1))
      .map((asset) => {
        const name = FUND_TOPIC[asset.id] ?? asset.name;
        const slug = SECTOR_SLUG[asset.id] ?? "";
        const month = asset.change.m1;
        return { id: asset.id, name, slug, day: asset.change.d1 as number, month: typeof month === "number" && Number.isFinite(month) ? month : null };
      })
      .sort((a, b) => b.day - a.day || a.name.localeCompare(b.name));
    if (rows.length < 4) throw new Error("sectors_empty");
    return { rows, takeaway: sectorTakeaway(data.assets), asOf: data.assets.find((asset) => asset.id === "xlk")?.as_of ?? null };
  },
  { rows: [], takeaway: null, asOf: null },
);

/**
 * The ten biggest companies we follow and how each moved on the day most
 * stocks are priced. Market today's read leads with these; the day's biggest
 * movers are its list under the read (#moves).
 */
export const loadDeskGiants = section<{ rows: GiantForRead[]; line: string | null; day: string | null }>(
  "giants",
  async () => {
    const snapshot = await getScreenerSnapshot();
    if (!snapshot) throw new Error("giants_empty");
    const day = quoteDay(snapshot.rows, snapshot.meta.price_history_to ?? null);
    const priced = snapshot.rows
      .filter((row) => typeof row.market_cap === "number" && row.market_cap > 0 && typeof row.day_pct === "number" && Number.isFinite(row.day_pct))
      .filter((row) => !day || etDayOf(row.price_at) === day)
      .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    const rows = oneRowPerCompany(priced, (row) => row.symbol)
      .rows.slice(0, 10)
      .map((row) => ({ symbol: row.symbol, name: shortCompanyName(row.name) || row.symbol, day: row.day_pct as number, cap: row.market_cap as number }));
    if (rows.length < 5) throw new Error("giants_empty");
    return { rows, line: buildGiantsRead(rows)?.line ?? null, day };
  },
  { rows: [], line: null, day: null },
);

/** Sector fund -> our sector page. */
const SECTOR_SLUG: Record<string, string> = {
  xlk: "technology",
  xlf: "financials",
  xle: "energy",
  xlv: "health-care",
  xli: "industrials",
  xly: "consumer-discretionary",
  xlp: "consumer-staples",
  xlu: "utilities",
  xlb: "materials",
  xlre: "real-estate",
  xlc: "communication-services",
};

export const loadDeskScreens = section<DeskData["screens"]>(
  "screens",
  async () => {
    const screens = await getThematicScreens("US");
    const live = (screens?.screens ?? []).filter((screen) => screen.match_count > 0).slice(0, 5);
    return {
      takeaway: screensTakeaway(
        live.map((screen) => ({
          title: screen.title,
          matches: screen.matches.map((row) => ({ ticker: row.ticker, changePct: typeof row.day_change_pct === "number" ? row.day_change_pct : null })),
        })),
      ),
      items: (screens?.screens ?? [])
        .filter((screen) => screen.match_count > 0)
        .slice(0, 5)
        .map((screen) => ({
          id: screen.id,
          title: screen.title,
          tagline: screen.tagline,
          matchCount: screen.match_count,
          top: screen.matches.slice(0, 4).map((row) => ({ ticker: row.ticker, changePct: typeof row.day_change_pct === "number" ? row.day_change_pct : null })),
        })),
      asOf: screens?.generated_at ?? null,
    };
  },
  { items: [], asOf: null, takeaway: null },
);

export const loadDeskThemes = section<DeskData["themes"]>(
  "themes",
  async () =>
    (await getLiveInvestmentThemes()).slice(0, 6).map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      description: theme.cardDescription,
      tickers: theme.candidates.slice(0, 5).map((candidate) => candidate.ticker),
    })),
  [],
);

/** Reddit and policy posts share a panel. Either one failing leaves the other standing. */
export const loadDeskSignals = section<Pick<DeskData, "reddit" | "posts">>(
  "signals",
  async () => {
    const [redditResult, trumpResult] = await Promise.allSettled([getRedditCues("US"), getTrumpLogic("US")]);
    if (redditResult.status === "rejected" && trumpResult.status === "rejected") throw redditResult.reason;
    if (redditResult.status === "rejected") console.error("explore_source_failed", "reddit", redditResult.reason);
    if (trumpResult.status === "rejected") console.error("explore_source_failed", "trump", trumpResult.reason);
    const reddit = redditResult.status === "fulfilled" ? redditResult.value : null;
    const trump = trumpResult.status === "fulfilled" ? trumpResult.value : null;
    const recentPosts = (trump?.mentions ?? [])
      .filter((mention) => isTrumpMentionRecent(mention.published_at) && mention.tickers.length > 0)
      .sort((a, b) => b.published_at.localeCompare(a.published_at))
      .slice(0, 3);
    return {
      reddit: {
        items: (reddit?.tickers ?? [])
          .filter(hasRedditBrief)
          .sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0))
          .slice(0, 4)
          .map((row) => ({ ticker: row.ticker, mentions: row.mention_count, sentiment: row.sentiment, summary: clip(row.summary) ?? "" })),
        asOf: reddit?.generated_at ?? null,
        mood: clip(reddit?.market_mood),
      },
      posts: {
        items: recentPosts.map((mention) => ({
          ticker: mention.tickers[0]!,
          said: clip(mention.said, { quote: true }) ?? "",
          publishedAt: mention.published_at,
          url: mention.truth_url,
          sinceChangePct: mention.ticker_moves?.[0]?.change_since_pct ?? null,
          sentiment: mention.sentiment || null,
        })),
        asOf: trump?.generated_at ?? null,
      },
    };
  },
  { reddit: { items: [], asOf: null, mood: null }, posts: { items: [], asOf: null } },
);

export const loadDeskFollow = section<DeskData["follow"]>("follow", async () => (await getFollowActivity(8)).slice(0, 5), []);

export const loadDeskStrategies = section<DeskData["strategies"]>("strategies", async () => (await listStrategies()).slice(0, 4), []);

export type DeskBrief = {
  /** The desk's read: the market's day, the move that matters, the date to watch, the crowd. */
  read: TheRead | null;
  /** One line for each panel that shows a slice of the same data. */
  calendarLine: string | null;
  signalsLine: string | null;
  marketsLine: string | null;
};

/**
 * The read at the top of the desk. Every source it uses is cached by its own
 * loader; one that fails only drops its sentences.
 */
export const loadDeskBrief = section<DeskBrief>(
  "brief",
  async (today) => {
    const monday = weekStart(today);
    const [markets, anomalies, calendar, reddit, giants, reports] = await Promise.all([
      getMarketsData().catch(() => null),
      getDailyAnomalies("US").catch(() => null),
      loadCalendarRange(monday, addDays(monday, 4), today),
      loadReddit().catch(() => null),
      loadDeskGiants(today),
      // The next three weeks of reports, for each card's "watch next" line. A failed read only drops those lines.
      cachedEarnings(today, shiftDay(today, 21)).catch(() => [] as EarningsEvent[]),
    ]);
    const movers = (anomalies?.anomalies ?? []).filter((row) => row.ticker && Number.isFinite(row.day_change_pct)).map((row) => classifyMover(row));
    const marketRead = markets && markets.assets.length ? buildMarketsRead(markets) : null;
    const moverRead = buildMoversRead(movers);
    const calendarItems = calendar.failed ? [] : calendar.items;
    const context = calendarItems.length ? await loadReportContext(readTickers(calendarItems, today, null), today) : {};
    const calendarRead = buildCalendarRead({ items: calendarItems, today, period: "this week", mine: null, context });
    const redditRead = reddit ? buildRedditRead(reddit.names) : null;
    if (!marketRead && !moverRead && !calendarRead && !redditRead) throw new Error("brief_empty");
    const biggest = calendarRead?.insights.find((insight) => insight.id === "biggest");
    // The biggest report still to come, short: its last move as the figure and one sentence (owner rules 3 and 8).
    const biggestItem = biggest?.tickers?.[0]
      ? calendarItems.find((item): item is EarningsItem => item.kind === "earnings" && item.ticker === biggest.tickers![0])
      : undefined;
    const calendarPick =
      biggest && biggestItem
        ? reportCard(
            biggest,
            // What analysts expect, only while the report is still to come.
            { ticker: biggestItem.ticker, date: biggestItem.date, time: biggestItem.session, epsEstimate: biggestItem.epsActual === null ? biggestItem.epsEstimate : null },
            context[biggestItem.ticker],
            today,
          )
        : biggest ?? calendarRead?.insights[0];
    const read: TheRead | null = marketRead || moverRead
      ? {
          headline: (marketRead && markets ? deskHeadline(markets) : null) ?? marketRead?.headline ?? moverRead!.headline,
          // The read is about the market: the biggest companies, not the day's biggest movers (the list under it has those).
          // Each card ends with the next real thing to watch on its stocks, when there is one (owner rule 7).
          insights: withWatchNext(
            // The biggest companies only when their prices are from the session the market read is about.
            pickInsights([buildGiantsRead(giants.rows, { day: giants.day, session: etDayOf(marketRead?.asOf) })?.insight ?? null, marketRead?.insights[0], calendarPick, redditRead?.insights[0]]),
            nextReports(reports.map((event) => ({ ticker: event.ticker, date: event.event_date, time: event.time })), today),
            today,
          ),
          asOf: marketRead?.asOf ?? null,
        }
      : null;
    // A card with no report to watch ends with our call on its stock (owner rule 7: each insight says what to do).
    const calls = read ? await loadCallWords(callLeads(read)) : new Map<string, string>();
    return {
      read: read ? withCallNext(read, calls) : null,
      calendarLine: calendarRead?.headline ?? null,
      signalsLine: redditRead?.headline ?? null,
      marketsLine: markets ? sectorTakeaway(markets.assets) : null,
    };
  },
  { read: null, calendarLine: null, signalsLine: null, marketsLine: null },
);
