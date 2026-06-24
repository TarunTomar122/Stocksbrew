import { cache } from "react";
import { LandingHeroCommand } from "@/components/landing-hero-command";
import { LandingScannerReddit } from "@/components/landing-scanner-reddit";
import { LandingSectorHeat } from "@/components/landing-sector-heat";
import { LandingTape } from "@/components/landing-tape";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { anomalyTag, buildLandingSectorCards, pickBiggestMover } from "@/lib/landing-sector-data";
import { getCurrentMarket } from "@/lib/market";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const getLandingUserContext = cache(async () => {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return { isSubscribed: false, trackedIds: [] as string[] };
  }
  const userDoc = await getUserDoc(session.uid).catch(() => null);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  return {
    isSubscribed: resolveIsSubscribed(userDoc),
    trackedIds,
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

export async function LandingTapeStream() {
  const anomalies = await getLandingAnomalies();
  return <div className="landing-stream-in"><LandingTape anomalies={anomalies} /></div>;
}

export async function LandingHeroCommandStream() {
  const [anomalies, user] = await Promise.all([getLandingAnomalies(), getLandingUserContext()]);
  const featured = pickBiggestMover(anomalies);
  if (!featured) return null;

  const tier = resolveStockTier(featured.instrument_id, user.trackedIds);
  const featuredTracked = user.trackedIds.includes(featured.instrument_id);

  return (
    <div className="landing-stream-in">
      <LandingHeroCommand
      featured={{
        instrument_id: featured.instrument_id,
        ticker: featured.ticker,
        name: featured.name,
        price: featured.price,
        day_change_pct: featured.day_change_pct,
        overall_score: featured.overall_score,
        overall_label: featured.overall_label,
        key_points: featured.key_points ?? [],
      }}
      isSubscribed={user.isSubscribed}
      isTracked={featuredTracked}
      tier={tier}
    />
    </div>
  );
}

export async function LandingScannerRedditStream() {
  const market = getCurrentMarket();
  const [anomaliesDoc, redditData] = await Promise.all([
    getLandingAnomaliesDoc(),
    getRedditCues(market).catch(() => null),
  ]);
  const anomalies = anomaliesDoc?.anomalies ?? [];
  if (anomalies.length === 0) return null;

  const redditPicks = (redditData?.tickers ?? [])
    .filter((t) => t.summary?.trim())
    .slice(0, 6)
    .map((t) => ({
      ticker: t.ticker,
      sentiment: t.sentiment,
      summary: t.summary,
      mention_count: t.mention_count,
    }));

  return (
    <div className="landing-stream-in">
      <LandingScannerReddit
      scannerItems={anomalies.map((a) => ({
        ticker: a.ticker,
        price: a.price,
        changePct: a.day_change_pct,
        tag: anomalyTag(a),
      }))}
      redditPicks={redditPicks}
      dataAsOf={anomaliesDoc?.date ?? anomaliesDoc?.generated_at}
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
