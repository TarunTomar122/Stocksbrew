import type { Metadata } from "next";
import { Fragment } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { BiggestThings } from "@/components/biggest/biggest-things";
import { BriefingFace, casedMoved, sourceWords } from "@/components/briefing/briefing-face";
import { Desk } from "@/components/briefing/desk";
import { BriefingLockedMoves } from "@/components/briefing/locked-moves";
import { OvernightStrip } from "@/components/briefing/overnight-strip";
import { SinceVisit } from "@/components/briefing/since-visit";
import { VisitBeacon } from "@/components/briefing/since-visit-beacon";
import { withoutCircularReasons } from "@/components/briefing/real-reasons";
import { AppPage } from "@/components/oa/kit";
import { ThesisStrip } from "@/components/thesis-monitor/thesis-strip";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { getSessionUser } from "@/lib/auth-server";
import { marketDay, type BriefingPosition } from "@/lib/briefing";
import { briefingBiggest } from "@/lib/briefing-biggest";
import { buildDesk, type Desk as DeskData } from "@/lib/briefing-desk";
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
import { loadOvernightQuotes } from "@/lib/briefing-overnight-server";
import { overnightStrip, type OvernightStrip as OvernightStripData } from "@/lib/briefing-overnight";
import { briefingPremarket, within } from "@/lib/briefing-premarket-server";
import type { TopStory } from "@/lib/briefing-top-news";
import { loadTopNews } from "@/lib/briefing-top-news-server";
import { getViewer } from "@/lib/entitlements-server";
import { getMarketSessionState } from "@/lib/market-session";
import { getMarketSeries, getMarketsData } from "@/lib/markets";
import { getRecentDailySeries } from "@/lib/screener-series";
import { noteDegradedRender } from "@/lib/next-render";
import { ogImage } from "@/lib/og/url";
import { capitalize, dayWords } from "@/lib/day-words";
import { toCard, type WatchSummary } from "@/lib/proposals";
import { proposalsBrief } from "@/lib/proposals-brief";
import { etDayOfStamp, etClock, newestStamp, oldestStamp } from "@/lib/quote-time";
import { resultsFor } from "@/lib/results/server";
import type { ResultRead } from "@/lib/results/types";
import { briefingResultFact, resultCardsByTicker, resultSentence } from "@/lib/results/words";
import { buildSinceVisit, sinceShows, toldElsewhere } from "@/lib/since-visit";
import { loadSinceVisit, type SinceVisitResult } from "@/lib/since-visit-server";
import { readStripSource, startStripCalendar, stripFrom, withinStrip, type StripSource } from "@/lib/thesis-monitor/strip-server";
import type { ThesisStripData } from "@/lib/thesis-monitor/strip";

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
const EXTRA_IDS = ["us10y", "vix"] as const;

type MarketExtraReads = {
  data: ReturnType<typeof getMarketsData>;
  series: Array<ReturnType<typeof getMarketSeries>>;
};

/**
 * The strip's market reads. The signed-out page starts them before its example briefing loads (they are the same for
 * everyone); a failure is handled where they are read, each failing soft there.
 */
function startMarketExtraReads(): MarketExtraReads {
  const reads: MarketExtraReads = { data: getMarketsData(), series: EXTRA_IDS.map((id) => getMarketSeries(id)) };
  for (const read of [reads.data, ...reads.series]) read.catch(() => {});
  return reads;
}

async function marketExtras(reads: MarketExtraReads = startMarketExtraReads()): Promise<MarketExtra[]> {
  const ids = EXTRA_IDS;
  // The wait is counted from here, as before the reads started early: a head start never shortens it.
  const [data, ...series] = await Promise.all([within(reads.data, SIDE_READ_MS), ...reads.series.map((read) => within(read, SIDE_READ_MS))]);
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

/**
 * Daily closes for the holdings and SPY, for the strip's you-against-the-S&P line; null when the read is slow or fails.
 * The line only reaches back a few sessions (lib/briefing-face.ts PATH_SESSIONS), so the recent read (the ~14 KB tails,
 * lib/price-tail.ts) gives it exactly the closes the whole ~60 KB histories would.
 */
async function stripSeries(tickers: string[]): Promise<Record<string, Array<{ date: string; close: number }>> | null> {
  if (tickers.length === 0) return null;
  // SPY first: the read keeps the first 40 symbols.
  const set = await within(getRecentDailySeries(["SPY", ...tickers]), SIDE_READ_MS);
  return set?.series ?? null;
}

/**
 * The slot under the header: the biggest things on the person's stocks (lib/briefing-biggest.ts), the agent's desk
 * (what it proposes and what the person decided, lib/briefing-desk.ts), then the Overnight strip (before the open),
 * then "Since you last looked"; nothing when none shows.
 */
function briefingTop(parts: React.ReactNode[]): React.ReactNode {
  const shown = parts.filter(Boolean);
  if (shown.length === 0) return null;
  return shown.length === 1 ? shown[0] : <div className="flex min-w-0 flex-col gap-6">{shown}</div>;
}

/** How long the page waits, at most, for the thesis strip once the briefing is ready (its reads started early). */
const STRIP_WAIT_MS = 400;

/**
 * The thesis strip's data (lib/thesis-monitor/strip.ts). Its reads start with the page, beside the briefing's own, so
 * they are done by the time the briefing is (measured: the page is no slower); a slow read leaves the strip out
 * rather than holding the page. Awaited here rather than streamed, so the slot under the header never holds an empty
 * box. Report days come from the briefing's own positions, the cached calendar only for the rest.
 */
async function thesisStripFor(
  source: Promise<StripSource | null> | null,
  calendar: Promise<Record<string, string>> | null,
  reports: Record<string, string>,
  today: string,
): Promise<ThesisStripData | null> {
  if (!source) return null;
  const read = await withinStrip(source, STRIP_WAIT_MS);
  return read ? withinStrip(stripFrom(read, { today, reports, calendar: calendar ?? undefined }), 900) : null;
}

/**
 * The report day behind each stock's report finding this week: its results read's day, else a report day on its
 * position from the last few days. A finding pairs with a results proposal only on this day (lib/briefing-desk.ts).
 */
function pastReportDays(positions: readonly BriefingPosition[], results: readonly ResultRead[], today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const position of positions) {
    const day = position.earnings_date?.slice(0, 10);
    if (day && day <= today && day >= tradingDayBefore(tradingDayBefore(tradingDayBefore(today)))) out[position.ticker.toUpperCase()] = day;
  }
  for (const read of results) if (read.reportDate) out[read.ticker.toUpperCase()] = read.reportDate.slice(0, 10);
  return out;
}

/** The desk's cards and line, rendered (components/briefing/desk.tsx); null when it has nothing. */
function deskNode(desk: DeskData | null, positions: readonly BriefingPosition[], watch: WatchSummary | null, today: string): React.ReactNode {
  if (!desk) return null;
  const byTicker = new Map(positions.map((position) => [position.ticker.toUpperCase(), position]));
  // Each card's price and day from the briefing's own positions (no quote read); a stock the briefing does not price
  // keeps the price stored with the proposal.
  const cards = desk.waiting.map((proposal) => {
    const position = proposal.ticker ? byTicker.get(proposal.ticker.toUpperCase()) : undefined;
    const quote = position && typeof position.price === "number" && position.price > 0 ? { price: position.price, dayPct: position.day_change_pct ?? null, at: position.price_as_of } : null;
    return toCard(proposal, quote);
  });
  // The agent's status fills an odd row of proposals as a tile (components/proposals compact), never as a strip.
  if (cards.length + desk.answered.length + desk.checked.length === 0) return null;
  return <Desk proposals={cards} watch={watch && watch.stocks > 0 ? watch : null} today={today} answered={desk.answered} checked={desk.checked} />;
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
  // The agent's proposals waiting for an answer: one line under the header. lib/proposals-brief.ts also works them out
  // (throttled, as on /agent and /inbox) and shows the stored ones if that runs long.
  const proposalsRead = user && !day ? proposalsBrief(user.uid) : Promise.resolve(null);
  // The thesis strip's reads (the theses and their checks) start now too, beside the briefing's load.
  const stripRead: Promise<StripSource | null> | null = user && !day ? readStripSource(user.uid).catch(() => null) : null;
  // And the calendar's report days for the strip's companies, as soon as the source is in: the strip needs them only
  // for companies the briefing has no report day for, which it knows at the end, but reading them then was the last
  // thing the page waited on (~0.3 s, Nov 13).
  const stripCalendar = stripRead ? stripRead.then(startStripCalendar).catch(() => ({})) : null;
  // Signed out, the market's top stories and the 10-year and VIX tiles start now, beside the example briefing's own
  // load, instead of after it (they are the same for everyone). Signed in they still start after the briefing: the
  // member's own reads come first, and running these beside them was measured no faster (Nov 12) since the store
  // answers concurrent reads more slowly.
  const earlyDay = marketDay(new Date());
  const topNewsEarly = !user ? loadTopNews(earlyDay) : null;
  const extrasEarly = !user ? startMarketExtraReads() : undefined;
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
  const [locked, results, premarket, extras, levelFacts, series, marketNews, sinceLoad, overnightQuotes] = await Promise.all([
    lockedSlot(data),
    live && personal ? weekResults(tickers, today, data.since) : Promise.resolve([] as ResultRead[]),
    live ? briefingPremarket(personal ? tickers : ["SPY"], now).catch(() => null) : Promise.resolve(null),
    live ? marketExtras(extrasEarly) : Promise.resolve([] as MarketExtra[]),
    loadLevelFacts(levelReads, today).catch(() => ({}) as Record<string, LevelFact[]>),
    live && personal ? stripSeries(holdingTickers) : Promise.resolve(null),
    // The market's top stories are the same for everyone: one cached read, a few seconds at most when it is cold.
    // Started early under the market's day; a briefing dated another day reads its own.
    live ? within(topNewsEarly && today === earlyDay ? topNewsEarly : loadTopNews(today), SIDE_READ_MS).then((stories) => stories ?? []) : Promise.resolve([] as TopStory[]),
    sinceRead,
    // Holdings and watched stocks that moved big after hours or pre-market, before the open (lib/briefing-overnight.ts).
    live && personal ? within(loadOvernightQuotes(tickers, now), SIDE_READ_MS) : Promise.resolve(null),
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
  // The Overnight strip comes next, under the header: its stocks are told there, not again further down. A stock Do
  // today already decides on stays there.
  const overnight = overnightQuotes ? overnightStrip(positions, overnightQuotes, now.getTime(), shown) : null;
  for (const card of overnight?.cards ?? []) shown.add(card.ticker);
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
  const movedAll = explained.filter((card) => !shown.has(card.ticker));
  for (const card of movedAll) shown.add(card.ticker);

  // The biggest things lead the page (owner, Nov 13: "I would have just liked the biggest things"), taken from the
  // Overnight strip, Why it moved and Since you last looked, which then leave those stocks out (a stock shows once).
  // Today's personal briefing only.
  const biggest =
    live && personal
      ? briefingBiggest({
          positions,
          overnight: overnight?.cards ?? [],
          moved: casedMoved(movedAll),
          since: sinceView?.cards ?? [],
          priceDay: priceDay ?? today,
          sourceOf: sourceWords,
          // The report in one sentence, its move left to the card's figure.
          reportDays: pastReportDays(positions, results, today),
          reports: Object.fromEntries(results.map((read) => [read.ticker.toUpperCase(), resultSentence({ ...read, move: null }, read.ticker.toUpperCase(), today)])),
          // Results night's figures (empty unless RESULTS_NIGHT is on): EPS, revenue, the outlook and the usual move.
          cards: resultCardsByTicker(results),
          reads: results,
          today,
        })
      : [];
  const big = new Set(biggest.map((thing) => thing.ticker));
  const moved = movedAll.filter((card) => !big.has(card.ticker.toUpperCase()));
  const overnightLeft = overnight ? overnight.cards.filter((card) => !big.has(card.ticker.toUpperCase())) : [];
  const sinceLeft = sinceView ? sinceView.cards.filter((card) => !big.has(card.ticker.toUpperCase())) : [];
  // quiet_ok ("Nothing changed") already needs no cards, so a view whose cards all went to the top stays hidden.
  const sinceShown = sinceView ? { ...sinceView, cards: sinceLeft } : null;
  const levels = personal ? atYourLevels(positions, shown, levelFacts, pre, prePrices) : [];
  for (const row of levels) shown.add(row.ticker);

  const reportDays = Object.fromEntries(positions.flatMap((position) => (position.earnings_date ? [[position.ticker.toUpperCase(), position.earnings_date.slice(0, 10)] as const] : [])));
  const [proposals, thesis] = await Promise.all([proposalsRead, live ? thesisStripFor(stripRead, stripCalendar, reportDays, today) : Promise.resolve(null)]);

  // The agent's desk: each of the day's findings with what the agent did or proposes (lib/briefing-desk.ts). Today's
  // briefing only; signed out it is the example's, which has no proposals, so its findings can only be "checked".
  const doCards = todo?.kind === "cards" ? todo.cards : [];
  const desk: DeskData | null =
    live && personal
      ? buildDesk(
          {
            today,
            now,
            waiting: signedIn ? proposals?.waiting ?? null : [],
            all: signedIn ? proposals?.all ?? [] : [],
            // Signed out the example has no queue to miss: its findings are checked against its own calls.
            fresh: signedIn ? Boolean(proposals?.fresh) : true,
            reportDays: pastReportDays(positions, results, today),
            prices: prePrices,
            moved: casedMoved(moved),
            overnight: overnightLeft,
            overnightDropAt: overnight?.dropAt ?? null,
            levels,
            doCards,
            positions,
            items,
            sourceOf: sourceWords,
          },
          (day) => capitalize(dayWords(day, today)),
        )
      : null;
  // The stocks the desk now tells leave the modules below (a stock shows once).
  const taken = desk?.taken ?? new Set<string>();
  const shownMoved = moved.filter((card) => !taken.has(card.ticker));
  const shownLevels = levels.filter((row) => !taken.has(row.ticker));
  const keptDo = doCards.filter((card) => !taken.has(card.ticker));
  const shownTodo = todo?.kind === "cards" && keptDo.length !== doCards.length ? (keptDo.length > 0 ? { kind: "cards" as const, cards: keptDo } : { kind: "quiet" as const }) : todo;
  const keptOvernight = overnightLeft.filter((card) => !taken.has(card.ticker));
  const shownOvernight = overnight && keptOvernight.length > 0 ? { ...overnight, cards: keptOvernight } : null;
  const deskView = deskNode(desk, positions, proposals?.watch ?? null, today);

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
        doToday={shownTodo}
        heat={personal ? heatCells(positions, pre, prePrices) : []}
        levels={shownLevels}
        moved={shownMoved}
        week={week}
        top={briefingTop([
          biggest.length > 0 ? <BiggestThings key="biggest" things={biggest} today={today} /> : null,
          deskView ? <Fragment key="desk">{deskView}</Fragment> : null,
          shownOvernight ? <OvernightStrip key="overnight" strip={shownOvernight} /> : null,
          sinceShows(sinceShown) ? <SinceVisit key="since" view={sinceShown} /> : null,
        ])}
        afterBand={thesis ? <ThesisStrip strip={thesis} today={today} compact /> : null}
        agentFindings={live ? agentFindingCount([...briefing.needs_you, ...briefing.also_today]) : 0}
        locked={locked}
        sessionOpened={!live || sessionOpened(today, now.getTime())}
      />
      {askHint(data)}
    </AppPage>
  );
}
