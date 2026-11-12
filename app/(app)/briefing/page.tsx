import type { Metadata } from "next";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { BriefingFace } from "@/components/briefing/briefing-face";
import { BriefingLockedMoves } from "@/components/briefing/locked-moves";
import { SinceVisit } from "@/components/briefing/since-visit";
import { VisitBeacon } from "@/components/briefing/since-visit-beacon";
import { withoutCircularReasons } from "@/components/briefing/real-reasons";
import { AppPage } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { getSessionUser } from "@/lib/auth-server";
import type { BriefingPosition } from "@/lib/briefing";
import { loadBriefingPage, type BriefingPageData } from "@/lib/briefing-data";
import { loadExampleBriefing, type ExampleBriefingExtras } from "@/lib/briefing-example";
import {
  agentFindingCount,
  atYourLevels,
  clockWords,
  doToday,
  earningsWeek,
  faceMode,
  heatCells,
  levelCandidates,
  marketMoved,
  marketStrip,
  marketWeek,
  sessionOpened,
  shownPct,
  shownPrice,
  positionsFromBriefing,
  stockItems,
  tradingDayBefore,
  whyItMoved,
  type LevelFact,
  type MarketExtra,
} from "@/lib/briefing-face";
import { loadLevelFacts } from "@/lib/briefing-level-reasons";
import { briefingPremarket, within } from "@/lib/briefing-premarket-server";
import type { TopStory } from "@/lib/briefing-top-news";
import { loadTopNews } from "@/lib/briefing-top-news-server";
import { getViewer } from "@/lib/entitlements-server";
import { getMarketSessionState } from "@/lib/market-session";
import { getMarketSeries, getMarketsData } from "@/lib/markets";
import { getDailySeries } from "@/lib/screener-series";
import { noteDegradedRender } from "@/lib/next-render";
import { ogImage } from "@/lib/og/url";
import { etDayOfStamp, etClock, newestStamp, oldestStamp } from "@/lib/quote-time";
import { resultsFor } from "@/lib/results/server";
import type { ResultRead } from "@/lib/results/types";
import { briefingResultFact } from "@/lib/results/words";
import { buildSinceVisit, sinceShows, toldElsewhere } from "@/lib/since-visit";
import { loadSinceVisit, type SinceVisitResult } from "@/lib/since-visit-server";

export const dynamic = "force-dynamic";

/** Signed out, the page is the example portfolio's briefing; the market's day has its own page (/explore). */
const TITLE = "A Daily Briefing on Your Own Stocks";
const DESCRIPTION =
  "An example of the daily read members get on their own stocks: each move, the reason when we could confirm one, our call and what is coming up.";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "briefing"], "Your stocks, explained every morning", { daily: true });
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/briefing" },
    openGraph: { title: `${TITLE} · stocksbrew`, description: DESCRIPTION, url: "https://www.stocksbrew.online/briefing", images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description: DESCRIPTION, images: [shareImage] },
  };
}

/**
 * No Ask box on the page (owner rule 1): the shell's Ask is the page's one Ask. Signed in, it starts from the
 * person's stocks (or nothing, when they track none); signed out it is the market's day, which the panel works out
 * from the address, so the cached signed-out page (app/(app)/anon/[v]/briefing) carries no hint and reads no cookie.
 */
function askHint(data: BriefingPageData): React.ReactNode {
  if (data.viewer.kind === "signed_out") return null;
  return <AskPageHint context={data.viewer.kind === "empty" ? null : "portfolio"} />;
}

/** Free: the moves on stocks the agent does not cover, named with no explanation (lib/briefing.ts locked_moves). */
async function lockedSlot(data: BriefingPageData) {
  const moves = data.briefing.locked_moves ?? [];
  if (moves.length === 0 || data.viewer.kind !== "member") return null;
  const viewer = await getViewer();
  return <BriefingLockedMoves moves={moves} plan={viewer.plan} trialEligible={viewer.trialEligible} archived={data.archived} />;
}

/** How long the page waits for a side read (results, the 10-year and the VIX) before going on without it. */
const SIDE_READ_MS = 1500;

/**
 * This week's results reads for the tracked stocks (lib/results), from the last trading day, or the last visit when
 * that is earlier (at most ten days back, the reads' own window). Today's personal briefing only; cached shared
 * reads, and a failed read leaves the modules without results.
 */
async function weekResults(tickers: string[], today: string, since: string | null | undefined): Promise<ResultRead[]> {
  if (tickers.length === 0) return [];
  const visitDay = etDayOfStamp(since ?? null);
  const from = visitDay && visitDay < tradingDayBefore(today) ? visitDay : tradingDayBefore(today);
  const reads = await within(
    resultsFor(tickers, { since: from, today }).catch((error) => {
      console.warn("[briefing] results read failed:", error instanceof Error ? error.message : error);
      return [] as ResultRead[];
    }),
    SIDE_READ_MS,
  );
  return reads ?? [];
}

/** Daily levels on a strip tile's line: about a month. */
const TILE_SESSIONS = 22;

/**
 * The 10-year yield and the VIX for the strip, from the cached markets read the briefing's indices already came from,
 * each with its last month of daily levels for the tile's line (the stored series, ending on today's level). A missing
 * series leaves the tile with its figure and no line.
 */
async function marketExtras(): Promise<MarketExtra[]> {
  const ids = ["us10y", "vix"] as const;
  const [data, ...series] = await Promise.all([within(getMarketsData(), SIDE_READ_MS), ...ids.map((id) => within(getMarketSeries(id), SIDE_READ_MS))]);
  const out: MarketExtra[] = [];
  ids.forEach((id, index) => {
    const asset = data?.assets.find((entry) => entry.id === id);
    if (!asset || !Number.isFinite(asset.price)) return;
    const stored = series[index];
    const today = etDayOfStamp(asset.as_of);
    let spark: number[] | null = null;
    if (stored && stored.dates.length === stored.values.length && today) {
      // The stored days before today, then today's level, so the line ends on the figure beside it.
      const before = stored.values.filter((_, at) => stored.dates[at]!.slice(0, 10) < today);
      spark = [...before.slice(-(TILE_SESSIONS - 1)), asset.price];
    }
    out.push({ id, price: asset.price, change: asset.change.d1 ?? null, changeMode: asset.change_mode, spark });
  });
  return out;
}

/** Daily closes for the holdings and SPY, for the strip's you-against-the-S&P line; null when the read is slow or fails. */
async function stripSeries(tickers: string[]): Promise<Record<string, Array<{ date: string; close: number }>> | null> {
  if (tickers.length === 0) return null;
  // SPY first: the read keeps the first 40 symbols.
  const set = await within(getDailySeries(["SPY", ...tickers]), SIDE_READ_MS);
  return set?.series ?? null;
}

export default async function BriefingPage({ searchParams }: { searchParams?: { day?: string | string[] } }) {
  // Signed out, the briefing is the example portfolio's (lib/briefing-example.ts): what a member's morning read looks
  // like, from real prices. The cached signed-out copy (app/(app)/anon/[v]/briefing) reads no cookie, so it lands here.
  const user = await getSessionUser().catch(() => null);
  const signedIn = Boolean(user);
  // Earlier days are a member's own saved briefings; signed out, ?day= shows today's example with everything on it.
  const day = signedIn && typeof searchParams?.day === "string" ? searchParams.day : null;
  // "Since you last looked" starts reading now, beside the briefing's own load (it needs only the user doc first).
  // Today's briefing only: a saved earlier day is read as it was.
  const sinceRead: Promise<SinceVisitResult | null> = user && !day ? loadSinceVisit(user.uid).catch((): SinceVisitResult => ({ kind: "failed" })) : Promise.resolve(null);
  const data: BriefingPageData & { example?: ExampleBriefingExtras | null } = signedIn
    ? await loadBriefingPage({ day, persist: true })
    : await loadExampleBriefing();
  // A briefing missing a source is not kept as the cached signed-out copy for long (lib/next-render.ts).
  if (data.degraded.length > 0) noteDegradedRender();

  const now = new Date();
  const briefing = withoutCircularReasons(data.briefing);
  const personal = briefing.mode === "personal";
  // Today's briefing, also when it is opened as ?day=<today>; a saved earlier day is read as it was.
  const live = !data.archived;
  // A saved earlier day has no positions of its own: what its cards and quiet names said.
  const positions: BriefingPosition[] = data.positions ?? (personal ? positionsFromBriefing(briefing) : []);
  const tickers = [...new Set(positions.map((position) => position.ticker.toUpperCase()))];
  const today = briefing.date;

  const session = getMarketSessionState(now);
  // The measured reason behind each name at its own call's price, read only for the few that can show (before the
  // open, a few percent wider, since this morning's price decides).
  const levelReads = live && personal ? levelCandidates(positions, session.kind === "premarket") : [];

  const holdingTickers = [...new Set(positions.filter((position) => position.relation === "holding").map((position) => position.ticker.toUpperCase()))];

  // All cached reads, side by side; each fails soft.
  const [locked, results, premarket, extras, levelFacts, series, marketNews, sinceLoad] = await Promise.all([
    lockedSlot(data),
    live && personal ? weekResults(tickers, today, data.since) : Promise.resolve([] as ResultRead[]),
    live ? briefingPremarket(personal ? tickers : ["SPY"], now).catch(() => null) : Promise.resolve(null),
    live ? marketExtras() : Promise.resolve([] as MarketExtra[]),
    loadLevelFacts(levelReads, today).catch(() => ({}) as Record<string, LevelFact[]>),
    live && personal ? stripSeries(holdingTickers) : Promise.resolve(null),
    // The market's top stories are the same for everyone: one cached read, a few seconds at most when it is cold.
    live ? within(loadTopNews(today), SIDE_READ_MS).then((stories) => stories ?? []) : Promise.resolve([] as TopStory[]),
    sinceRead,
  ]);

  const mode = live ? faceMode(session.kind, premarket != null) : "close";
  // The one clock: the oldest quote time on the newest price day, so every figure on the page is at least that fresh.
  const stamps = positions.map((position) => position.price_as_of).concat(briefing.market.indices.map((index) => index.as_of ?? null));
  const priceDay = etDayOfStamp(newestStamp(stamps));
  const pricesAt = priceDay ? oldestStamp(stamps.filter((stamp) => etDayOfStamp(stamp) === priceDay)) : null;
  const clock = clockWords(mode, etDayOfStamp(pricesAt), etClock(pricesAt));
  const pre = mode === "premarket" ? premarket?.stocks ?? null : null;
  const prePrices = mode === "premarket" ? premarket?.prices ?? null : null;
  const resultFact = (read: ResultRead) => briefingResultFact(read, today);
  const items = stockItems(briefing);

  // Before the open the strip's figures are this morning's, for the market's day; later, for the prices' own day.
  const stripDay = mode === "premarket" ? today : priceDay ?? today;
  const strip = marketStrip({ briefing, positions, mode, premarket, extras, series, today: stripDay });
  // Each stock shows once, in the first module that wants it: Do today, then Why it moved, then the levels.
  // A saved earlier day keeps its decision cards, but never says "Nothing needs you today" about that day.
  const decided = personal ? doToday({ items, positions, degraded: data.archived ? [] : data.degraded, premarket: pre, premarketPrices: prePrices }) : null;
  const todo = data.archived && decided?.kind !== "cards" ? null : decided;
  const shown = new Set(todo?.kind === "cards" ? todo.cards.map((card) => card.ticker) : []);
  // A stock whose story leads the market's top news is told there, not again under Why it moved.
  // A story on a stock the page already prices shows the page's own price and move, so one stock never shows two.
  // Before the open the story keeps the move its headline was matched to (the last session's): this morning's
  // premarket move beside "jumps on…" could say the opposite of the headline.
  const topNews = marketNews.map((story) => {
    const position = story.ticker && mode !== "premarket" ? positions.find((entry) => entry.ticker.toUpperCase() === story.ticker) : undefined;
    const pct = position ? shownPct(position, null, pre) : null;
    const price = position ? shownPrice(position, null, prePrices) : null;
    return pct != null && price != null ? { ...story, reaction: { ...story.reaction, pct, price } } : story;
  });
  const inTopNews = new Set(topNews.flatMap((story) => (story.ticker ? [story.ticker] : [])));
  const explained = (personal ? whyItMoved({ items, positions, results, exclude: new Set([...shown, ...inTopNews]), today, resultFact }) : marketMoved(briefing.market)).filter(
    (card) => !inTopNews.has(card.ticker),
  );
  // The week is a calendar: only a report Do today already names ("Reports today after the close") is left out of it.
  const reportsInDo = new Set(todo?.kind === "cards" ? todo.cards.filter((card) => card.reason === "earnings").map((card) => card.ticker) : []);
  const week = (personal ? earningsWeek({ positions, items, results, today, premarket: pre, premarketPrices: prePrices }) : marketWeek([...briefing.needs_you, ...briefing.also_today], today))
    .map((entry) => ({ ...entry, stocks: entry.stocks.filter((stock) => !reportsInDo.has(stock.ticker)) }))
    .filter((entry) => entry.stocks.length > 0);
  // "Since you last looked" goes first: it skips Do today's stocks, and the stocks it shows are not repeated below.
  const sinceView =
    live && personal && data.viewer.kind === "member" && sinceLoad?.kind === "ready"
      ? buildSinceVisit({
          ...sinceLoad.load,
          positions,
          exclude: shown,
          // Every stock the other modules would show before this one takes any ("Buy more levels" is worked out again below).
          told: toldElsewhere({
            topNews: inTopNews,
            moved: explained,
            levels: atYourLevels(positions, new Set([...shown, ...explained.map((card) => card.ticker)]), levelFacts, pre, prePrices),
            week,
          }),
          now,
        })
      : null;
  for (const card of sinceView?.cards ?? []) shown.add(card.ticker);
  const moved = explained.filter((card) => !shown.has(card.ticker));
  for (const card of moved) shown.add(card.ticker);
  const levels = personal ? atYourLevels(positions, shown, levelFacts, pre, prePrices) : [];
  for (const row of levels) shown.add(row.ticker);

  return (
    <AppPage width="dash">
      <MarketingSchema path="/briefing" name={TITLE} description={DESCRIPTION} breadcrumbLabel="Briefing" />
      {/* A view whose reads missed something is not recorded, so the next view still covers what this one could not. */}
      {live && signedIn && !day && sinceLoad?.kind !== "failed" && sinceView?.complete !== false ? <VisitBeacon /> : null}
      <BriefingFace
        mode={briefing.mode}
        viewer={data.viewer.kind}
        pendingTracked={data.viewer.kind === "pending" ? data.viewer.tracked : 0}
        date={briefing.date}
        clock={clock}
        days={data.days.map((entry) => ({ day: entry.day }))}
        archived={data.archived}
        degraded={data.degraded.length > 0}
        example={Boolean(data.example)}
        strip={strip}
        topNews={topNews}
        doToday={todo}
        heat={personal ? heatCells(positions, pre, prePrices) : []}
        levels={levels}
        moved={moved}
        week={week}
        top={sinceShows(sinceView) ? <SinceVisit view={sinceView} /> : null}
        agentFindings={live ? agentFindingCount([...briefing.needs_you, ...briefing.also_today]) : 0}
        locked={locked}
        sessionOpened={!live || sessionOpened(today, now.getTime())}
      />
      {askHint(data)}
    </AppPage>
  );
}
