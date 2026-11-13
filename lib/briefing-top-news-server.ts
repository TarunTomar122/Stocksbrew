import { tradingDayBefore } from "@/lib/briefing-face";
import { topMarketNews, type TopStory } from "@/lib/briefing-top-news";
import { getMarketSnapshot } from "@/lib/firestore";
import { etWallTimeToUtcMs } from "@/lib/market-session";
import { etDayOfStamp } from "@/lib/quote-time";
import { getMarketsData } from "@/lib/markets";
import { SECTOR_IDS } from "@/lib/markets-shared";
import { getScreenerRows } from "@/lib/screener";
import { sharedCache } from "@/lib/shared-cache";
import { loadWire } from "@/lib/wire";
import { caseWireHeadlines } from "@/lib/wire-casing";

/**
 * The briefing's top three market stories (lib/briefing-top-news.ts), worked out once for everyone and kept for two
 * minutes: the wire /news reads, the price snapshot, the market values of the stocks in the news, SPY's holdings, the
 * 10-year yield and the sector funds. All of them are cached reads already; this keeps the ranking off the page's path.
 */

/** Stories from at most the last day, anchored on the newest headline. */
const WINDOW_MS = 24 * 3_600_000;
/** Most stocks whose market value is looked up. */
const MAX_CAPS = 150;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

async function readTopNews(today: string): Promise<TopStory[]> {
  const now = Date.now();
  const [wire, snapshot, markets] = await Promise.all([loadWire({ now }), getMarketSnapshot("US"), getMarketsData()]);
  // Thrown, so an empty read is never kept as "no news" for everyone.
  if (wire.origin === "none" || wire.items.length === 0) throw new Error("top_news_wire_empty");
  const anchor = wire.freshness.newestAt ? Math.min(now, Date.parse(wire.freshness.newestAt)) : now;
  // Only news since the close before the prices' own day: older stories did not cause today's moves.
  const quoteDay = etDayOfStamp(wire.quotesAsOf) ?? today;
  const [y, m, d] = tradingDayBefore(quoteDay).split("-").map(Number);
  const sinceMs = Math.max(anchor - WINDOW_MS, etWallTimeToUtcMs(y!, m!, d!, 16, 0));

  const quotes: Record<string, { pct: number | null; price: number | null; name: string }> = {};
  for (const row of snapshot) {
    const symbol = String(row.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    quotes[symbol] = {
      pct: fin(row.price?.changePct) ? row.price.changePct : null,
      price: fin(row.price?.current) && row.price.current > 0 ? row.price.current : null,
      name: row.name || symbol,
    };
  }

  // Market values only for the stocks that moved and are in the day's news.
  const recent = wire.items.filter((item) => Date.parse(item.publishedAt) >= sinceMs);
  const moved = [...new Set(recent.flatMap((item) => item.tickers))]
    .filter((ticker) => fin(quotes[ticker]?.pct) && Math.abs(quotes[ticker]!.pct!) >= 1)
    .sort((a, b) => Math.abs(quotes[b]!.pct!) - Math.abs(quotes[a]!.pct!))
    .slice(0, MAX_CAPS);
  const rows = await getScreenerRows(moved).catch(() => new Map());
  const caps: Record<string, number> = {};
  for (const [symbol, row] of rows) if (fin(row.market_cap) && row.market_cap > 0) caps[symbol] = row.market_cap;

  const asset = (id: string) => markets.assets.find((entry) => entry.id === id);
  const indexWeights: Record<string, number> = {};
  for (const holding of asset("spy")?.holdings ?? []) {
    const symbol = holding.symbol?.toUpperCase().replace("-", ".");
    if (symbol && fin(holding.weight_pct)) indexWeights[symbol] = holding.weight_pct;
  }
  const sp = asset("sp500")?.change.d1;
  const ten = asset("us10y");
  const tenBps = ten && fin(ten.change.d1) ? (ten.change_mode === "bps" ? ten.change.d1 : ten.change_mode === "abs" ? ten.change.d1 * 100 : null) : null;
  const sectorMoves = SECTOR_IDS.map((id) => asset(id)?.change.d1).filter(fin);

  // Sentence case, as /news shows the same headlines (owner rule 8).
  const names = Object.fromEntries(Object.entries(quotes).map(([ticker, quote]) => [ticker, quote.name]));
  const items = caseWireHeadlines(recent, names, { key: `briefing-top|${wire.freshness.newestAt ?? ""}|${recent.length}` });

  return topMarketNews({
    items,
    quotes,
    caps,
    indexWeights,
    sp500: fin(sp) ? sp : null,
    sp500Level: asset("sp500")?.price ?? null,
    tenYear: ten && fin(ten.price) && tenBps !== null ? { level: ten.price, bps: tenBps } : null,
    sectors: sectorMoves.length >= 4 ? { up: sectorMoves.filter((move) => move > 0).length, down: sectorMoves.filter((move) => move < 0).length, total: sectorMoves.length } : null,
    sinceMs,
    today,
  });
}

const cachedTopNews = sharedCache(readTopNews, ["briefing-top-news-v2"], { revalidate: 120 });

/** Today's top three market stories, or none when the wire is down or fewer than three stories qualify. */
export async function loadTopNews(today: string): Promise<TopStory[]> {
  return cachedTopNews(today).catch((error) => {
    console.warn("[briefing] top news read failed:", error instanceof Error ? error.message : error);
    return [];
  });
}
