import { unstable_cache } from "next/cache";

import type { TheRead } from "@/lib/insights";
import { asSentence, firstFullSentence, shortCompanyName } from "@/lib/plain-copy";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings, type EarningsEvent } from "@/lib/earnings";
import { getFollowActivity, type FollowActivity } from "@/lib/follow";
import { getIpos, type IpoEvent } from "@/lib/ipos";
import { getMarketsOverview } from "@/lib/markets";
import type { MarketsData, MarketsOverview } from "@/lib/markets-shared";
import { getRedditCues } from "@/lib/reddit-cues";
import { hasRedditBrief } from "@/lib/reddit-cues-shared";
import { getLiveInvestmentThemes } from "@/lib/research-themes";
import { getThematicScreens } from "@/lib/screens";
import { addDays, weekStart } from "@/lib/calendar-shared";
import { loadCalendarRange, loadReportContext } from "@/lib/calendar";
import { buildCalendarRead, readTickers } from "@/lib/calendar-insights";
import { buildGiantsRead, screensTakeaway, type GiantForRead } from "@/lib/explore-insights";
import { etDayOf, quoteDay } from "@/lib/benchmark-day";
import { getScreenerSnapshot } from "@/lib/screener";
import { oneRowPerCompany } from "@/lib/share-class";
import { pickInsights } from "@/lib/insights";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead, FUND_TOPIC, SECTOR_IDS, sectorTakeaway } from "@/lib/markets-insights";
import { loadReddit } from "@/lib/signals";
import { buildMoversRead, buildRedditRead, moversHeadline } from "@/lib/signals-insights";
import { classifyMover } from "@/lib/signals-shared";
import { listStrategies, type StrategySummary } from "@/lib/strategies";
import { getTrumpLogic } from "@/lib/trump-logic";
import { sharedCache } from "@/lib/shared-cache";
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
  lead: { title: string; url: string; source: string; publishedAt: string };
};

export type DeskNews = { stocks: DeskStock[]; read: TheRead | null };

export type DeskData = {
  today: string;
  wire: DeskNews;
  movers: {
    up: DeskMover[];
    down: DeskMover[];
    asOf: string | null;
    thresholdPct: number | null;
    /** What the whole list adds up to, in one line (every mover, not just the ten shown). */
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
        lead: {
          title: row.lead.title,
          url: row.lead.url,
          source: row.lead.source,
          publishedAt: row.lead.publishedAt,
        },
      })),
      // Every line: the page's read picks the one about a stock it does not already name.
      read: reading.read,
    };
  },
  { stocks: [], read: null },
);

export const loadDeskMovers = section<DeskData["movers"]>(
  "movers",
  async () => {
    const anomalies = await getDailyAnomalies("US");
    const rows = (anomalies?.anomalies ?? []).filter((row) => row.ticker && Number.isFinite(row.day_change_pct));
    const toMover = (row: (typeof rows)[number]): DeskMover => ({
      ticker: row.ticker,
      name: row.name,
      price: Number.isFinite(row.price) && row.price > 0 ? row.price : null,
      changePct: row.day_change_pct,
      reason: row.narrative_status === "unverified" ? null : clip(row.move_explanation?.headline ?? row.headline),
    });
    return {
      up: rows.filter((row) => row.day_change_pct > 0).sort((a, b) => b.day_change_pct - a.day_change_pct).slice(0, 5).map(toMover),
      down: rows.filter((row) => row.day_change_pct < 0).sort((a, b) => a.day_change_pct - b.day_change_pct).slice(0, 5).map(toMover),
      asOf: anomalies?.enriched_at ?? anomalies?.generated_at ?? null,
      thresholdPct: anomalies?.threshold_pct ?? null,
      takeaway: moversHeadline(rows.map((row) => classifyMover(row))),
    };
  },
  { up: [], down: [], asOf: null, thresholdPct: null, takeaway: null },
);

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
 * stocks are priced. Market today shows these instead of the day's biggest
 * movers, which have their own page (Why stocks moved).
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
    const [markets, anomalies, calendar, reddit, giants] = await Promise.all([
      getMarketsData().catch(() => null),
      getDailyAnomalies("US").catch(() => null),
      loadCalendarRange(monday, addDays(monday, 4), today),
      loadReddit().catch(() => null),
      loadDeskGiants(today),
    ]);
    const movers = (anomalies?.anomalies ?? []).filter((row) => row.ticker && Number.isFinite(row.day_change_pct)).map((row) => classifyMover(row));
    const marketRead = markets && markets.assets.length ? buildMarketsRead(markets) : null;
    const moverRead = buildMoversRead(movers);
    const calendarItems = calendar.failed ? [] : calendar.items;
    const context = calendarItems.length ? await loadReportContext(readTickers(calendarItems, today, null), today) : {};
    const calendarRead = buildCalendarRead({ items: calendarItems, today, period: "this week", mine: null, context });
    const redditRead = reddit ? buildRedditRead(reddit.names) : null;
    if (!marketRead && !moverRead && !calendarRead && !redditRead) throw new Error("brief_empty");
    const calendarPick = calendarRead?.insights.find((insight) => insight.id === "biggest") ?? calendarRead?.insights[0];
    const read: TheRead | null = marketRead || moverRead
      ? {
          headline: marketRead?.headline ?? moverRead!.headline,
          // Market today reads the market: the biggest companies, not the day's biggest movers (Why stocks moved has those).
          insights: pickInsights([buildGiantsRead(giants.rows)?.insight ?? null, marketRead?.insights[0], calendarPick, redditRead?.insights[0]]),
          asOf: marketRead?.asOf ?? null,
        }
      : null;
    return {
      read,
      calendarLine: calendarRead?.headline ?? null,
      signalsLine: redditRead?.headline ?? null,
      marketsLine: markets ? sectorTakeaway(markets.assets) : null,
    };
  },
  { read: null, calendarLine: null, signalsLine: null, marketsLine: null },
);
