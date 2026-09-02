import { RedditBuzzPageView } from "@/components/reddit-buzz-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { enrichRedditTickersWithQuotes } from "@/lib/reddit-buzz-enrich";
import { getCurrentMarket } from "@/lib/market";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function RedditBuzzPageStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [data, anomaliesDoc, userDoc] = await Promise.all([
    getRedditCues(market).catch(() => null),
    getDailyAnomalies(market).catch(() => null),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const cutoff = Date.now() - 72 * 60 * 60 * 1000;
  const quoteIds = [...new Set((data?.tickers ?? []).map((item) => `${market}_${item.ticker.toUpperCase()}`))];
  const quotes = await getLatestPriceQuotes(quoteIds).catch(() => new Map());
  const quoteByTicker = new Map(
    [...quotes.entries()].map(([id, row]) => [
      row.ticker?.toUpperCase() ?? id.split("_").slice(1).join("_"),
      {
        company: row.ticker,
        price: row.quote?.current,
        changePct: row.quote?.day_change_pct,
        volume: row.quote?.volume,
      },
    ]),
  );
  const enrichedData = data
    ? {
        ...data,
        tickers: enrichRedditTickersWithQuotes(
          data.tickers ?? [],
          anomaliesDoc?.anomalies ?? [],
          quoteByTicker,
        ).filter((item) => {
          if (!item.latest_post_at) return true;
          const latestPostAt = Date.parse(item.latest_post_at);
          return Number.isNaN(latestPostAt) || latestPostAt >= cutoff;
        }),
        window_hours: 72,
      }
    : null;

  return <RedditBuzzPageView data={enrichedData} isSubscribed={isSubscribed} />;
}
