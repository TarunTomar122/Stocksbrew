import type { Metadata } from "next";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { BriefingFace } from "@/components/briefing/briefing-face";
import { BriefingLockedMoves } from "@/components/briefing/locked-moves";
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
  marketMoved,
  marketStrip,
  marketWeek,
  positionsFromBriefing,
  sinceLastOpened,
  stockItems,
  tradingDayBefore,
  whyItMoved,
  type MarketExtra,
} from "@/lib/briefing-face";
import { briefingPremarket, within } from "@/lib/briefing-premarket-server";
import { getViewer } from "@/lib/entitlements-server";
import { getMarketSessionState } from "@/lib/market-session";
import { getMarketsData } from "@/lib/markets";
import { noteDegradedRender } from "@/lib/next-render";
import { ogImage } from "@/lib/og/url";
import { etDayOfStamp, etClock, newestStamp, oldestStamp } from "@/lib/quote-time";
import { resultsFor } from "@/lib/results/server";
import type { ResultRead } from "@/lib/results/types";
import { briefingResultFact } from "@/lib/results/words";

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

/** The 10-year yield and the VIX for the strip, from the cached markets read the briefing's indices already came from. */
async function marketExtras(): Promise<MarketExtra[]> {
  const data = await within(getMarketsData(), SIDE_READ_MS);
  const out: MarketExtra[] = [];
  for (const id of ["us10y", "vix"] as const) {
    const asset = data?.assets.find((entry) => entry.id === id);
    if (asset && Number.isFinite(asset.price)) out.push({ id, price: asset.price, change: asset.change.d1 ?? null, changeMode: asset.change_mode, monthChange: asset.change.m1 ?? null });
  }
  return out;
}

export default async function BriefingPage({ searchParams }: { searchParams?: { day?: string | string[] } }) {
  // Signed out, the briefing is the example portfolio's (lib/briefing-example.ts): what a member's morning read looks
  // like, from real prices. The cached signed-out copy (app/(app)/anon/[v]/briefing) reads no cookie, so it lands here.
  const user = await getSessionUser().catch(() => null);
  const signedIn = Boolean(user);
  // Earlier days are a member's own saved briefings; signed out, ?day= shows today's example with everything on it.
  const day = signedIn && typeof searchParams?.day === "string" ? searchParams.day : null;
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

  // All cached reads, side by side; each fails soft.
  const [locked, results, premarket, extras] = await Promise.all([
    lockedSlot(data),
    live && personal ? weekResults(tickers, today, data.since) : Promise.resolve([] as ResultRead[]),
    live ? briefingPremarket(personal ? tickers : ["SPY"], now).catch(() => null) : Promise.resolve(null),
    live ? marketExtras() : Promise.resolve([] as MarketExtra[]),
  ]);

  const session = getMarketSessionState(now);
  const mode = live ? faceMode(session.kind, premarket != null) : "close";
  // The one clock: the oldest quote time on the newest price day, so every figure on the page is at least that fresh.
  const stamps = positions.map((position) => position.price_as_of).concat(briefing.market.indices.map((index) => index.as_of ?? null));
  const priceDay = etDayOfStamp(newestStamp(stamps));
  const pricesAt = priceDay ? oldestStamp(stamps.filter((stamp) => etDayOfStamp(stamp) === priceDay)) : null;
  const clock = clockWords(mode, etDayOfStamp(pricesAt), etClock(pricesAt));
  const pre = mode === "premarket" ? premarket?.stocks ?? null : null;
  const resultFact = (read: ResultRead) => briefingResultFact(read, today);
  const items = stockItems(briefing);

  const strip = marketStrip({ briefing, positions, mode, premarket, extras });
  // Each stock shows once, in the first module that wants it: Do today, then Why it moved, then the levels.
  // A saved earlier day keeps its decision cards, but never says "Nothing needs you today" about that day.
  const decided = personal ? doToday({ items, positions, degraded: data.archived ? [] : data.degraded, premarket: pre }) : null;
  const todo = data.archived && decided?.kind !== "cards" ? null : decided;
  const shown = new Set(todo?.kind === "cards" ? todo.cards.map((card) => card.ticker) : []);
  const moved = personal ? whyItMoved({ items, positions, results, exclude: shown, today, resultFact }) : marketMoved(briefing.market);
  for (const card of moved) shown.add(card.ticker);
  const levels = personal ? atYourLevels(positions, shown, pre) : [];
  for (const row of levels) shown.add(row.ticker);
  // The week is a calendar: only a report Do today already names ("Reports today after the close") is left out of it.
  const reportsInDo = new Set(todo?.kind === "cards" ? todo.cards.filter((card) => card.reason === "earnings").map((card) => card.ticker) : []);
  const week = (personal ? earningsWeek({ positions, items, results, today }) : marketWeek([...briefing.needs_you, ...briefing.also_today], today))
    .map((entry) => ({ ...entry, stocks: entry.stocks.filter((stock) => !reportsInDo.has(stock.ticker)) }))
    .filter((entry) => entry.stocks.length > 0);
  const since =
    live && personal && data.viewer.kind === "member"
      ? sinceLastOpened({ since: data.since ?? null, callChanges: data.callChanges ?? [], results, positions, exclude: shown, resultFact })
      : null;

  return (
    <AppPage>
      <MarketingSchema path="/briefing" name={TITLE} description={DESCRIPTION} breadcrumbLabel="Briefing" />
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
        doToday={todo}
        heat={personal ? heatCells(positions, pre) : []}
        levels={levels}
        moved={moved}
        week={week}
        since={since}
        agentFindings={live ? agentFindingCount([...briefing.needs_you, ...briefing.also_today]) : 0}
        locked={locked}
      />
      {askHint(data)}
    </AppPage>
  );
}
