import { PulseHub } from "@/components/pulse-hub";
import { PulseHubHero } from "@/components/pulse-hub-header";
import { buildPulsePageData } from "@/lib/pulse-data";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings } from "@/lib/earnings";
import { listAllEarningsIntelDocs } from "@/lib/earnings-intel";
import { getMarketSnapshot } from "@/lib/firestore";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUpcomingPreEarnings } from "@/lib/pre-earnings-intel";

export async function PulseHubStream() {
  const market = getCurrentMarket();
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [anomaliesData, redditData, snapshotRows, earningsEvents, preEarnings, premarketDoc, recentIntelDocs] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getRedditCues(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    getEarnings(market, undefined, weekOut).catch(() => []),
    getUpcomingPreEarnings(market).catch(() => []),
    getPremarketMovers(market).catch(() => null),
    listAllEarningsIntelDocs().catch(() => []),
  ]);

  const predBy = new Map<string, { epsOutlook?: string; reaction?: string }>();
  for (const p of preEarnings) {
    if (p.ticker) {
      predBy.set(p.ticker.toUpperCase(), {
        epsOutlook: p.report?.call?.eps_outlook,
        reaction: p.report?.call?.post_print_move,
      });
    }
  }

  const data = buildPulsePageData({
    market,
    anomalies: anomaliesData?.anomalies ?? [],
    redditTickers: redditData?.tickers ?? [],
    snapshotRows,
    earningsEvents,
    predBy,
    recentIntelDocs,
    premarketDoc: isPremarketLive(premarketDoc, market) ? premarketDoc : null,
  });

  return (
    <div className="landing-stream-in">
      <PulseHubHero topline={data.topline} />
      <PulseHub
        items={data.items}
        reddit={data.reddit}
        sectors={data.sectors}
        earnings={data.earnings}
        recentEarnings={data.recentEarnings}
        premarketItems={data.premarketItems}
      />
    </div>
  );
}
