import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PriceChart } from "@/components/price-chart";
import { formatCurrency, formatPct, pctClass } from "@/components/primitives";
import {
  AnalystRatingsCard,
  DeltaCardsSection,
  DriversChallengesCards,
  KeyMetricsCard,
  NewsCard,
  SimilarStocksCard,
  StockScorecard,
  StockSummaryCard,
} from "@/components/stock-cards";
import { Shell } from "@/components/shell";
import { getMarketPageContext, getStock } from "@/lib/api";
import { LOCAL_USER } from "@/lib/local-user";
import { buildStockScopedCards } from "@/lib/build-cards";
import { fetchStockMarketData } from "@/lib/yahoo-finance";

export const revalidate = 60;

type PageProps = {
  params: Promise<{ symbol: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const [{ symbol }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(undefined),
  ]);
  const marketParam = readString(sp?.market) || "us";
  const market: "us" | "india" = marketParam === "india" ? "india" : "us";

  const [stock, ctx] = await Promise.all([
    getStock(symbol, marketParam),
    getMarketPageContext(marketParam),
  ]);

  if (!stock) {
    return (
      <Shell activeNav="stock">
        <EmptyState
          title="Stock not found"
          body={`No data available for ${symbol.toUpperCase()}. This stock isn't being tracked yet.`}
        />
      </Shell>
    );
  }

  const currentMarket: "us" | "india" = stock.market === "india" ? "india" : "us";

  const { chart: initialChart, fundamentals } = await fetchStockMarketData(
    stock.symbol,
    currentMarket,
    "1Y",
  );

  const stockSector =
    ctx.sectors.find((s) =>
      s.stocks.some((t) => t.toUpperCase() === stock.symbol.toUpperCase()),
    ) ?? null;

  const peers = stockSector
    ? ctx.stocks.filter((s) =>
        stockSector.stocks
          .map((t) => t.toUpperCase())
          .includes(s.symbol.toUpperCase()),
      )
    : [];

  const watchlistStocks = LOCAL_USER.watchlist
    .map((ticker) =>
      ctx.stocks.find((s) => s.symbol.toUpperCase() === ticker.toUpperCase()),
    )
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const ribbonStocks =
    watchlistStocks.length > 0 ? watchlistStocks : ctx.stocks.slice(0, 12);

  const cards = buildStockScopedCards(stock);
  const absChange = stock.price.current - stock.price.previousClose;

  const fallbackCloses =
    stock.recentCloses && stock.recentCloses.length >= 2
      ? stock.recentCloses
      : [stock.price.previousClose, stock.price.open, stock.price.current];

  return (
    <Shell
      activeNav="stock"
      ribbonStocks={ribbonStocks}
      searchStocks={ctx.stocks}
      indices={ctx.view?.indices ?? []}
    >
      {/* ─── Breadcrumb ─── */}
      <nav className="mb-5 flex items-center gap-2 text-[11px] text-[#8C94A8]">
        <Link
          href={`/dashboard${market === "india" ? "?market=india" : ""}`}
          className="transition-colors hover:text-[#F5F6F8]"
        >
          Dashboard
        </Link>
        <span className="text-[#555E75]">/</span>
        {stockSector && (
          <>
            <Link
              href={`/sector/${stockSector.id}`}
              className="transition-colors hover:text-[#F5F6F8]"
            >
              {stockSector.name}
            </Link>
            <span className="text-[#555E75]">/</span>
          </>
        )}
        <span className="text-[#F5F6F8]">{stock.symbol}</span>
      </nav>

      {/* ─── Hero header ─── */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-[#1F2738] pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold tracking-tight text-[#F5F6F8]">
              {stock.symbol}
            </h1>
            <span className="text-[14px] text-[#8C94A8]">{stock.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8C94A8]">
            <span className="rounded-[4px] bg-[#1A2130] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F5F6F8]">
              {currentMarket === "india" ? "NSE" : stock.exchange || "US"}
            </span>
            <span>{stock.sector}</span>
            {stock.cap && (
              <>
                <span className="text-[#555E75]">·</span>
                <span>{stock.cap}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-[32px] font-bold tabular-nums leading-none text-[#F5F6F8]">
            {formatCurrency(stock.price.current, stock.currency)}
          </span>
          <span
            className={`font-mono text-[14px] font-medium tabular-nums ${pctClass(stock.price.changePct)}`}
          >
            {absChange >= 0 ? "+" : ""}
            {formatCurrency(absChange, stock.currency)} {formatPct(stock.price.changePct)}
          </span>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-[#8C94A8]">
            <span>
              Day: {formatCurrency(stock.price.low, stock.currency)} –{" "}
              {formatCurrency(stock.price.high, stock.currency)}
            </span>
            <span className="text-[#555E75]">·</span>
            <span>Vol {(stock.price.volume / 1_000_000).toFixed(1)}M</span>
          </div>
        </div>
      </header>

      {/* ─── Main two-column layout ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT: chart + drivers + summary + cards (wide) */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          <PriceChart
            symbol={stock.symbol}
            market={currentMarket}
            currency={stock.currency}
            initialChart={initialChart}
            fallbackCloses={fallbackCloses}
          />
          <DriversChallengesCards stock={stock} />
          <StockSummaryCard stock={stock} />
          <DeltaCardsSection cards={cards} />
          <NewsCard stock={stock} />
        </div>

        {/* RIGHT: scorecard, key metrics, analyst ratings, peers (narrow) */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <StockScorecard stock={stock} fundamentals={fundamentals} />
          <KeyMetricsCard stock={stock} fundamentals={fundamentals} />
          <AnalystRatingsCard stock={stock} fundamentals={fundamentals} />
          <SimilarStocksCard stock={stock} peers={peers} />
        </div>
      </div>
    </Shell>
  );
}
