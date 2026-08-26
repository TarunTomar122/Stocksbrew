import { OaExplore } from "@/components/oa/oa-explore";
import type { TrendingStock } from "@/components/trending-now";
import { AI_CAPEX_BENEFICIARIES, AI_CAPEX_WATCHLIST } from "@/lib/ai-capex";
import { getMarketSnapshot } from "@/lib/firestore";
import { getHeatList } from "@/lib/heat";
import { getCurrentMarket } from "@/lib/market";
import { getNear52WeekLists } from "@/lib/near-52-week";
import { getTrumpLogic } from "@/lib/trump-logic";
import { isTrumpMentionRecent } from "@/lib/trump-logic-format";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

// ponytail: hardcoded "most traded" list for now, swap for a real ranking source later
const TRENDING_TICKERS = ["NVDA", "TSM", "MSFT", "GOOGL", "AAPL", "PLTR", "MU", "AMZN", "TSLA", "AMD", "COIN"];

export async function ExploreStream() {
  const market = getCurrentMarket();
  const [session, snapshotRows, heatList, near52, trumpLogic] = await Promise.all([
    getSessionUser(),
    getMarketSnapshot(market).catch(() => []),
    getHeatList(market).catch(() => null),
    getNear52WeekLists(market, 20).catch(() => ({ nearHighs: [], nearLows: [] })),
    getTrumpLogic(market).catch(() => null),
  ]);
  const userDoc = session ? await getUserDoc(session.uid) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];

  const bySymbol = new Map(snapshotRows.map((row) => [row.symbol.toUpperCase(), row]));
  const trending: TrendingStock[] = TRENDING_TICKERS.map((ticker) => {
    const row = bySymbol.get(ticker);
    if (!row) return null;
    return { ticker, name: row.name, price: row.price.current, changePct: row.price.changePct ?? 0 };
  }).filter((row): row is TrendingStock => row !== null);

  // "Hot" = top overall heat score across every setup type (the same ranking /heat leads with).
  const hotStocks = [...(heatList?.rows ?? [])].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0)).slice(0, 20);
  const momentumStocks = [...(heatList?.rows ?? [])]
    .filter((row) => typeof row.momentum_score === "number")
    .sort((a, b) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
    .slice(0, 20);
  // "Elevated" mentions = today's mention velocity running well above baseline.
  const newsSpikes = [...(heatList?.rows ?? [])]
    .filter((row) => row.multiplier > 1.5 && row.mention_count_7d > 0)
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, 20);
  // Same setup buckets the /heat page tabs use.
  const catalystStocks = (heatList?.rows ?? []).filter((row) => (row.setup_type ?? "momentum_watch") === "catalyst_watch").slice(0, 20);
  const dipStocks = (heatList?.rows ?? []).filter((row) => (row.setup_type ?? "momentum_watch") === "dip_setup").slice(0, 20);
  const quoteFor = (ticker: string) => {
    const snapshot = bySymbol.get(ticker);
    return { price: snapshot?.price.current, changePct: snapshot?.price.changePct };
  };
  const aiCapexRows = AI_CAPEX_BENEFICIARIES.map((row) => ({ ...row, ...quoteFor(row.ticker) }));
  const aiCapexWatchlist = AI_CAPEX_WATCHLIST.map((row) => ({ ...row, ...quoteFor(row.ticker) }));
  const now = Date.now();
  const trumpMentions = (trumpLogic?.tickers ?? [])
    .filter((row) => isTrumpMentionRecent(row.latest_published_at, now))
    .sort((a, b) => String(b.latest_published_at).localeCompare(String(a.latest_published_at)))
    .map((row) => {
      const snap = bySymbol.get(row.ticker.toUpperCase());
      return {
        ticker: row.ticker,
        name: snap?.name ?? row.ticker,
        price: snap?.price.current,
        changePct: snap?.price.changePct,
        sentiment: row.latest_sentiment,
        latestSaid: row.latest_said,
        latestPublishedAt: row.latest_published_at,
        mentionCount: row.mention_count,
      };
    });

  return (
    <OaExplore
      trending={trending}
      hotStocks={hotStocks}
      nearHighs={near52.nearHighs}
      nearLows={near52.nearLows}
      momentumStocks={momentumStocks}
      newsSpikes={newsSpikes}
      catalystStocks={catalystStocks}
      dipStocks={dipStocks}
      trumpMentions={trumpMentions}
      aiCapexRows={aiCapexRows}
      aiCapexWatchlist={aiCapexWatchlist}
      isSubscribed={isSubscribed}
      trackedIds={trackedIds}
      trackedCount={trackedIds.length}
    />
  );
}
