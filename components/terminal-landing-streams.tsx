import { cache } from "react";
import { LandingHeroCommand } from "@/components/landing-hero-command";
import { LandingScannerReddit } from "@/components/landing-scanner-reddit";
import { LandingSectorHeat } from "@/components/landing-sector-heat";
import { LandingTape } from "@/components/landing-tape";
import { TerminalLandingHeroCopy } from "@/components/terminal-landing-hero-copy";
import { TerminalLandingProSection } from "@/components/terminal-landing-pro-section";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { enrichRedditTickers } from "@/lib/reddit-buzz-enrich";
import { resolveFeedAccess } from "@/lib/feed-access";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { anomalyTag, buildLandingSectorCards } from "@/lib/landing-sector-data";
import {
  findLandingHeroAnomaly,
  mergeLandingHeroAnomaly,
  shuffledLandingHeroBrewTickers,
  stockSummaryToAnomaly,
} from "@/lib/landing-hero-featured";
import { buildLandingHeroCallData } from "@/lib/landing-hero-call";
import { buildLandingHeroMetrics } from "@/lib/landing-hero-metrics";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { anomalyDetail, anomalyHeadline, hasUnverifiedNarrative, isWeakMoveExplanation } from "@/components/daily-anomalies-shared";
import { getCurrentMarket } from "@/lib/market";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getSessionUser } from "@/lib/auth-server";
import { getStockFacts, getStockIntelligenceDoc, getStockPriceHistory, getStockSummary } from "@/lib/stock";
import type { PriceHistoryPoint } from "@/lib/price-history-chart";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function shortHeadline(text: string | null | undefined, maxLen = 110): string | null {
  if (!text?.trim()) return null;
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

export const getLandingUserContext = cache(async () => {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return {
      signedIn: false,
      isSubscribed: false,
      trackedIds: [] as string[],
      fullItemLimit: resolveFeedAccess({ signedIn: false, isSubscribed: false }).fullItemLimit,
    };
  }
  const userDoc = await getUserDoc(session.uid).catch(() => null);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  return {
    signedIn: true,
    isSubscribed,
    trackedIds,
    fullItemLimit: resolveFeedAccess({ signedIn: true, isSubscribed }).fullItemLimit,
  };
});

const getLandingAnomaliesDoc = cache(async () => {
  const market = getCurrentMarket();
  return getDailyAnomalies(market).catch(() => null);
});

const getLandingAnomalies = cache(async () => {
  const doc = await getLandingAnomaliesDoc();
  return doc?.anomalies ?? [];
});

async function resolveLandingHeroFeatured(
  anomalies: AnomalyItem[],
): Promise<{ anomaly: AnomalyItem; priceHistory: PriceHistoryPoint[] } | null> {
  const market = getCurrentMarket();

  for (const ticker of shuffledLandingHeroBrewTickers()) {
    const summary = await getStockSummary(ticker, market).catch(() => null);
    if (!summary) continue;

    const priceHistory = await getStockPriceHistory(summary.instrument_id).catch(() => []);

    const fromAnomalies = findLandingHeroAnomaly(anomalies, ticker);
    const anomaly = fromAnomalies
      ? mergeLandingHeroAnomaly(fromAnomalies, summary)
      : stockSummaryToAnomaly(summary);

    return { anomaly, priceHistory };
  }

  return null;
}

export async function LandingTapeStream() {
  const anomalies = await getLandingAnomalies();
  return <div className="landing-stream-in"><LandingTape anomalies={anomalies} /></div>;
}

export async function LandingHeroStream() {
  const market = getCurrentMarket();
  const user = await getLandingUserContext();
  const anomalies = await getLandingAnomalies();
  const featuredPick = await resolveLandingHeroFeatured(anomalies);

  const commandCard = featuredPick
    ? await buildLandingHeroCommandProps(featuredPick.anomaly, market, user, featuredPick.priceHistory)
    : null;

  return (
    <div className="landing-stream-in grid w-full gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-12">
      <TerminalLandingHeroCopy
        market={market}
        trackedIds={user.trackedIds}
        isSubscribed={user.isSubscribed}
        align="left"
      />
      {commandCard ? (
        <div className="w-full">
          <LandingHeroCommand {...commandCard} />
        </div>
      ) : null}
    </div>
  );
}

async function buildLandingHeroCommandProps(
  featured: AnomalyItem,
  market: ReturnType<typeof getCurrentMarket>,
  user: Awaited<ReturnType<typeof getLandingUserContext>>,
  preloadedPriceHistory?: PriceHistoryPoint[],
) {
  const [priceHistory, intelligence, stockFacts] = await Promise.all([
    preloadedPriceHistory != null
      ? Promise.resolve(preloadedPriceHistory)
      : getStockPriceHistory(featured.instrument_id).catch(() => []),
    getStockIntelligenceDoc(featured.instrument_id, market).catch(() => null),
    getStockFacts(featured.instrument_id).catch(() => null),
  ]);

  const tier = resolveStockTier(featured.instrument_id, user.trackedIds);
  const featuredTracked = user.trackedIds.includes(featured.instrument_id);
  const directive = normalizeDirectiveForUi(intelligence?.directive_v2 ?? null);
  const moveHeadline =
    featured.move_explanation?.headline?.trim() ||
    featured.headline?.trim() ||
    featured.catalyst?.trim() ||
    featured.visual_summary?.what_changed?.trim() ||
    null;
  const analystTarget = stockFacts?.analyst?.target_price ?? null;
  const heroMetrics = buildLandingHeroMetrics(directive, featured.price, analystTarget);
  const call = buildLandingHeroCallData(
    featured,
    intelligence,
    heroMetrics,
    analystTarget,
    shortHeadline(moveHeadline || directive?.text),
    stockFacts?.returns ?? null,
  );

  return {
    featured: {
      instrument_id: featured.instrument_id,
      ticker: featured.ticker,
      name: featured.name,
      price: featured.price,
      day_change_pct: featured.day_change_pct,
      sector: featured.sector,
      catalyst: featured.catalyst?.trim() || null,
      analyst: stockFacts?.analyst ?? null,
      price_history: priceHistory.slice(-252),
    },
    call,
    isSubscribed: user.isSubscribed,
    isTracked: featuredTracked,
    tier,
  };
}

export async function LandingHeroCommandStream() {
  const market = getCurrentMarket();
  const [anomalies, user] = await Promise.all([getLandingAnomalies(), getLandingUserContext()]);
  const featuredPick = await resolveLandingHeroFeatured(anomalies);
  if (!featuredPick) return null;

  const props = await buildLandingHeroCommandProps(
    featuredPick.anomaly,
    market,
    user,
    featuredPick.priceHistory,
  );

  return (
    <div className="landing-stream-in">
      <LandingHeroCommand {...props} />
    </div>
  );
}

export async function LandingScannerRedditStream() {
  const market = getCurrentMarket();
  const [anomaliesDoc, redditData, snapshotRows, user] = await Promise.all([
    getLandingAnomaliesDoc(),
    getRedditCues(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    getLandingUserContext(),
  ]);
  const anomalies = (anomaliesDoc?.anomalies ?? []).filter(
    (a) => !isWeakMoveExplanation(a) && !hasUnverifiedNarrative(a),
  );
  if (anomalies.length === 0) return null;

  const redditPicks = enrichRedditTickers(
    (redditData?.tickers ?? [])
      .filter((t) => t.summary?.trim())
      .slice(0, 3),
    anomalies,
    snapshotRows,
  );

  return (
    <div className="landing-stream-in">
      <LandingScannerReddit
      scannerItems={anomalies.map((a) => ({
        ticker: a.ticker,
        instrument_id: a.instrument_id,
        price: a.price,
        changePct: a.day_change_pct,
        tag: anomalyTag(a),
        headline: anomalyHeadline(a),
        whyItMatters: anomalyDetail(a) || undefined,
        confidence: a.move_explanation?.confidence,
      }))}
      redditPicks={redditPicks}
      dataAsOf={anomaliesDoc?.date ?? anomaliesDoc?.generated_at}
      signedIn={user.signedIn}
      isSubscribed={user.isSubscribed}
      trackedIds={user.trackedIds}
    />
    </div>
  );
}

export async function LandingSectorHeatStream() {
  const market = getCurrentMarket();
  const [snapshotRows, user] = await Promise.all([
    getMarketSnapshot(market).catch(() => []),
    getLandingUserContext(),
  ]);
  const sectorCards = buildLandingSectorCards(snapshotRows);
  if (sectorCards.length === 0) return null;

  return (
    <div className="landing-stream-in">
      <LandingSectorHeat
        sectors={sectorCards}
        trackedIds={user.trackedIds}
        isSubscribed={user.isSubscribed}
      />
    </div>
  );
}

export async function LandingProSectionStream() {
  const user = await getLandingUserContext();
  if (user.isSubscribed) return null;
  return <TerminalLandingProSection />;
}
