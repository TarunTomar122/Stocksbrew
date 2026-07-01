import { RedditBuzzPageView } from "@/components/reddit-buzz-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { enrichRedditTickers } from "@/lib/reddit-buzz-enrich";
import { getCurrentMarket } from "@/lib/market";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function RedditBuzzPageStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [data, anomaliesDoc, snapshotRows, userDoc] = await Promise.all([
    getRedditCues(market).catch(() => null),
    getDailyAnomalies(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const enrichedData = data
    ? {
        ...data,
        tickers: enrichRedditTickers(data.tickers ?? [], anomaliesDoc?.anomalies ?? [], snapshotRows),
      }
    : null;

  return <RedditBuzzPageView data={enrichedData} isSubscribed={isSubscribed} />;
}
