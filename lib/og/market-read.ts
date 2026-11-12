import { unstable_cache } from "next/cache";

import { buildCalendarRead, readTickers } from "@/lib/calendar-insights";
import { addDays, weekStart, type EarningsItem } from "@/lib/calendar-shared";
import { loadCalendarRange, loadReportContext } from "@/lib/calendar";
import { etDayOf, quoteDay } from "@/lib/benchmark-day";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings, type EarningsEvent } from "@/lib/earnings";
import { buildGiantsRead, callLeads, deskHeadline, withCallNext, type GiantForRead } from "@/lib/explore-insights";
import { pickInsights, type TheRead } from "@/lib/insights";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead, nextReports, reportCard, sectorTakeaway, withWatchNext } from "@/lib/markets-insights";
import { CALL_PLAIN, shortCompanyName } from "@/lib/plain-copy";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { oneRowPerCompany } from "@/lib/share-class";
import { sharedCache } from "@/lib/shared-cache";
import { loadReddit } from "@/lib/signals";
import { buildMoversRead, buildRedditRead } from "@/lib/signals-insights";
import { classifyMover } from "@/lib/signals-shared";
import { loadWire, modelLabel } from "@/lib/wire";
import { readTheWire } from "@/lib/wire-read";
import { parseWireFilters } from "@/lib/wire-shared";

/**
 * The market's day in a headline and three points, for the Market today share image (lib/og/data.ts) only: the page
 * itself no longer leads with a read (owner, Nov 12). Every source is cached by its own loader for a minute; one that
 * fails only drops its sentences, and the image goes without the read when all of them fail.
 */

const SOURCE_TIMEOUT_MS = 9000;

// The earnings calendar queries the store directly, so it is cached here.
const cachedEarnings = unstable_cache((from: string, to: string) => getEarnings("US", from, to), ["explore-earnings-v1"], { revalidate: 300 });

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

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

/** The wire's read of the news (lib/wire-read.ts), the fallback when the market brief has nothing. */
export const loadWireRead = section<TheRead | null>(
  "wire-read",
  async () => {
    const wire = await loadWire();
    // `loadWire` swallows a failed read into an empty list. Empty here must not be cached as the answer.
    if (wire.items.length === 0) throw new Error("wire_empty");
    return readTheWire(
      {
        items: wire.items,
        quotes: wire.quotes,
        labels: wire.labels,
        newestAt: wire.freshness.newestAt,
        labelledBy: modelLabel(wire.labelsMeta.model),
        labelledAt: wire.labelsMeta.updatedAt,
      },
      { nowMs: Date.now(), filters: parseWireFilters(undefined), buzzLimit: 7, themeLimit: 3 },
    ).read;
  },
  null,
);

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

/**
 * The ten biggest companies we follow and how each moved on the day most
 * stocks are priced: the read's first point.
 */
const loadGiants = section<{ rows: GiantForRead[]; line: string | null; day: string | null }>(
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

export type MarketBrief = {
  /** The desk's read: the market's day, the move that matters, the date to watch, the crowd. */
  read: TheRead | null;
  /** One line for each panel that shows a slice of the same data. */
  calendarLine: string | null;
  signalsLine: string | null;
  marketsLine: string | null;
};

/**
 * The market brief for the share image. Every source it uses is cached by its own
 * loader; one that fails only drops its sentences.
 */
export const loadMarketBrief = section<MarketBrief>(
  "brief",
  async (today) => {
    const monday = weekStart(today);
    const [markets, anomalies, calendar, reddit, giants, reports] = await Promise.all([
      getMarketsData().catch(() => null),
      getDailyAnomalies("US").catch(() => null),
      loadCalendarRange(monday, addDays(monday, 4), today),
      loadReddit().catch(() => null),
      loadGiants(today),
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
