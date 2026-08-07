import type { RecentEarningsCard } from "@/components/pulse-hub";
import { PulseHub } from "@/components/pulse-hub";
import { getSessionUser } from "@/lib/auth-server";
import { buildPulsePageData, epsTagFromReported } from "@/lib/pulse-data";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { listAllEarningsIntelDocs } from "@/lib/earnings-intel";
import { mergeIntelScenarios } from "@/lib/earnings-scenario-weights";
import { redactScannerItemsAfterLimit, resolveFeedAccess } from "@/lib/feed-access";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function PulseHubStream() {
  const market = getCurrentMarket();
  const [anomaliesData, redditData, premarketDoc, premarketReport, earningsIntelDocs, session] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getRedditCues(market).catch(() => null),
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
  const feedAccess = resolveFeedAccess({
    signedIn: Boolean(session),
    isSubscribed: resolveIsSubscribed(userDoc),
  });

  const data = buildPulsePageData({
    market,
    anomalies: anomaliesData?.anomalies ?? [],
    redditTickers: redditData?.tickers ?? [],
    snapshotRows: [],
    earningsEvents: [],
    predBy: new Map(),
    recentIntelDocs: [],
    premarketDoc: null,
  });

  return (
    <div className="landing-stream-in">
      <PulseHub
        items={redactScannerItemsAfterLimit(data.items, feedAccess.fullItemLimit, { preservePreview: true })}
        premarketMovers={premarketLive ? premarketDoc : null}
        premarketReport={premarketLive ? premarketReport : null}
        isSubscribed={feedAccess.isSubscribed}
        recentEarnings={recentEarnings}
      />
    </div>
  );
}
