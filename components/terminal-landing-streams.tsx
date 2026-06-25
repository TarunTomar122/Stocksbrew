import { cache } from "react";
import { LandingHeroCommand } from "@/components/landing-hero-command";
import { LandingScannerReddit } from "@/components/landing-scanner-reddit";
import { LandingSectorHeat } from "@/components/landing-sector-heat";
import { LandingTape } from "@/components/landing-tape";
import { TerminalLandingProSection } from "@/components/terminal-landing-pro-section";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { anomalyTag, buildLandingSectorCards, pickBiggestMover } from "@/lib/landing-sector-data";
import { directiveZonePrice } from "@/lib/directive-ui";
import { getCurrentMarket } from "@/lib/market";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getSessionUser } from "@/lib/auth-server";
import type { DirectiveZone } from "@/lib/stock";
import { getStockFacts, getStockIntelligenceDoc, getStockPriceHistory } from "@/lib/stock";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function formatLevelLabel(zone: DirectiveZone | undefined, kind: "add" | "trim"): string | null {
  const price = directiveZonePrice(zone);
  if (price == null) return null;
  const money = price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === "add") {
    return zone?.trigger_type === "price_above" ? `Add above $${money}` : `Add below $${money}`;
  }
  return zone?.trigger_type === "price_below" ? `Trim below $${money}` : `Trim above $${money}`;
}

function shortHeadline(text: string | null | undefined, maxLen = 110): string | null {
  if (!text?.trim()) return null;
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

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
  const market = getCurrentMarket();
  const [anomalies, user] = await Promise.all([getLandingAnomalies(), getLandingUserContext()]);
  const featured = pickBiggestMover(anomalies);
  if (!featured) return null;

  const [priceHistory, intelligence, stockFacts] = await Promise.all([
    getStockPriceHistory(featured.instrument_id).catch(() => []),
    getStockIntelligenceDoc(featured.instrument_id, market).catch(() => null),
    getStockFacts(featured.instrument_id).catch(() => null),
  ]);

  const tier = resolveStockTier(featured.instrument_id, user.trackedIds);
  const featuredTracked = user.trackedIds.includes(featured.instrument_id);
  const directive = intelligence?.directive;
  const moveHeadline =
    featured.move_explanation?.headline?.trim() ||
    featured.headline?.trim() ||
    featured.catalyst?.trim() ||
    featured.visual_summary?.what_changed?.trim() ||
    null;
  const headline = shortHeadline(moveHeadline || directive?.text);
  const analystTarget = stockFacts?.analyst?.target_price ?? null;
  const analystUpside =
    typeof analystTarget === "number" && Number.isFinite(analystTarget) && featured.price > 0
      ? ((analystTarget - featured.price) / featured.price) * 100
      : null;

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
        sector: featured.sector,
        catalyst: featured.catalyst?.trim() || null,
        headline,
        add_level: formatLevelLabel(directive?.add_on, "add"),
        trim_level: formatLevelLabel(directive?.trim_on, "trim"),
        analyst_target: analystTarget,
        analyst_upside_pct: analystUpside,
        price_history: priceHistory.slice(-63),
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
    .slice(0, 5)
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

export async function LandingProSectionStream() {
  const user = await getLandingUserContext();
  if (user.isSubscribed) return null;
  return <TerminalLandingProSection />;
}
