import { OaExplore } from "@/components/oa/oa-explore";
import type { TrendingStock } from "@/components/trending-now";
import { getInstruments, getLatestPriceQuotes } from "@/lib/firestore";
import { getHeatList } from "@/lib/heat";
import { getCurrentMarket } from "@/lib/market";
import { getNear52WeekLists } from "@/lib/near-52-week";
import { getTrumpLogic } from "@/lib/trump-logic";
import { isTrumpMentionRecent } from "@/lib/trump-logic-format";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getLiveInvestmentThemes } from "@/lib/research-themes";

// ponytail: hardcoded "most traded" list for now, swap for a real ranking source later
const TRENDING_TICKERS = [
  "NVDA",
  "TSM",
  "MSFT",
  "GOOGL",
  "AAPL",
  "PLTR",
  "MU",
  "AMZN",
  "TSLA",
  "AMD",
  "COIN",
];

export async function ExploreStream() {
  const market = getCurrentMarket();
  const [session, heatList, near52, trumpLogic, themes] =
    await Promise.all([
      getSessionUser(),
      getHeatList(market).catch(() => null),
      getNear52WeekLists(market, 20).catch(() => ({
        nearHighs: [],
        nearLows: [],
      })),
      getTrumpLogic(market).catch(() => null),
      getLiveInvestmentThemes(),
    ]);
  const targetedTickers = [
    ...TRENDING_TICKERS,
    ...(trumpLogic?.tickers ?? []).map((row) => row.ticker),
  ];
  const targetedIds = [...new Set(targetedTickers.map((ticker) => `${market}_${ticker.toUpperCase()}`))];
  const userDocPromise = session ? getUserDoc(session.uid) : Promise.resolve(null);
  const [instrumentsById, pricesById, userDoc] = await Promise.all([
    getInstruments(targetedIds),
    getLatestPriceQuotes(targetedIds),
    userDocPromise,
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc!.tracked_stocks!
    : [];

  const bySymbol = new Map(
    targetedIds.map((id) => {
      const instrument = instrumentsById.get(id);
      const latest = pricesById.get(id);
      const price = latest?.quote;
      const ticker = instrument?.ticker ?? latest?.ticker ?? id.split("_").slice(1).join("_");
      return [ticker.toUpperCase(), {
        name: instrument?.name ?? ticker,
        price: { current: price?.current, changePct: price?.day_change_pct },
      }];
    }),
  );
  const trending: TrendingStock[] = TRENDING_TICKERS.map((ticker) => {
    const row = bySymbol.get(ticker);
    if (!row) return null;
    return {
      ticker,
      name: row.name,
      price: row.price.current,
      changePct: row.price.changePct ?? 0,
    };
  }).filter((row): row is TrendingStock => row !== null);

  // "Hot" = top overall heat score across every setup type (the same ranking /heat leads with).
  const hotStocks = [...(heatList?.rows ?? [])]
    .sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0))
    .slice(0, 20);
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
  const catalystStocks = (heatList?.rows ?? [])
    .filter((row) => (row.setup_type ?? "momentum_watch") === "catalyst_watch")
    .slice(0, 20);
  const dipStocks = (heatList?.rows ?? [])
    .filter((row) => (row.setup_type ?? "momentum_watch") === "dip_setup")
    .slice(0, 20);
  const now = Date.now();
  const trumpMentions = (trumpLogic?.tickers ?? [])
    .filter((row) => isTrumpMentionRecent(row.latest_published_at, now))
    .sort((a, b) =>
      String(b.latest_published_at).localeCompare(
        String(a.latest_published_at),
      ),
    )
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
      isSubscribed={isSubscribed}
      trackedIds={trackedIds}
      trackedCount={trackedIds.length}
      themes={themes}
    />
  );
}
