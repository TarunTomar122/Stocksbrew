import type { RecentEarningsCard } from "@/components/pulse-hub";
import { PulseHub } from "@/components/pulse-hub";
import { getSessionUser } from "@/lib/auth-server";
import { buildPulsePageData, epsTagFromReported } from "@/lib/pulse-data";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { listAllEarningsIntelDocs } from "@/lib/earnings-intel";
import { mergeIntelScenarios } from "@/lib/earnings-scenario-weights";
import { getMarketSnapshot } from "@/lib/firestore";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { enrichRedditTickers } from "@/lib/reddit-buzz-enrich";
import { getRedditCues, hasRedditBrief } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function PulseHubStream() {
  const market = getCurrentMarket();
  const [anomaliesData, redditData, snapshotRows, premarketDoc, premarketReport, earningsIntelDocs, session] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getRedditCues(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    getPremarketMovers(market).catch(() => null),
    getPremarketOpeningReport().catch(() => null),
    listAllEarningsIntelDocs().catch(() => []),
    getSessionUser().catch(() => null),
  ]);
  const premarketLive = isPremarketLive(premarketDoc, market);
  const recentEarnings: RecentEarningsCard[] = earningsIntelDocs
    .filter((doc) => doc.market === market && (doc.report?.headline?.trim() || doc.report?.summary?.trim()))
    .slice(0, 6)
    .map((doc) => {
      const scenarios = mergeIntelScenarios(doc);
      const lead = [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0] ?? null;
      return {
        ticker: doc.ticker,
        eventDate: doc.event_date,
        headline: doc.report?.headline?.trim() || doc.report?.summary?.trim() || `${doc.ticker} earnings report`,
        epsTag: epsTagFromReported(doc.report?.facts?.reported_vs_expected),
        leadCase: lead?.case ?? null,
        leadPct: lead?.probability_pct ?? null,
      };
    });
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const redditTickers = enrichRedditTickers(
    (redditData?.tickers ?? []).filter(hasRedditBrief),
    anomaliesData?.anomalies ?? [],
    snapshotRows,
  )
    .sort((a, b) => b.mention_count - a.mention_count)
    .slice(0, 6);

  const data = buildPulsePageData({
    market,
    anomalies: anomaliesData?.anomalies ?? [],
    redditTickers,
    snapshotRows,
    earningsEvents: [],
    predBy: new Map(),
    recentIntelDocs: [],
    premarketDoc: null,
  });

  return (
    <div className="landing-stream-in">
      <PulseHub
        nowIso={new Date().toISOString()}
        items={data.items}
        premarketMovers={premarketLive ? premarketDoc : null}
        premarketReport={premarketLive ? premarketReport : null}
        isSubscribed={isSubscribed}
        recentEarnings={recentEarnings}
        redditTickers={redditTickers}
        redditPostCount={redditData?.post_count}
      />
    </div>
  );
}
