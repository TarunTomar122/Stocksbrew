import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { getInstruments, getLatestPriceQuotes } from "@/lib/firestore";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getStockSummary, type StockSummary } from "@/lib/stock";

type Market = "US" | "IN";

const GRID = "grid grid-cols-[minmax(0,1fr)_96px_88px] items-center sm:grid-cols-[minmax(140px,0.9fr)_minmax(0,1.3fr)_110px_100px_minmax(0,1.6fr)]";

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectorTableRow({
  stock,
  signal,
  showSignal,
}: {
  stock: StockSummary;
  signal: string | null;
  showSignal: boolean;
}) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className={`group gap-3 border-t border-oa-border px-5 py-3 transition-colors first:border-t-0 hover:bg-oa-accent ${GRID}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={stock.ticker} size={22} circle />
        <span className="oa-mono shrink-0 text-[13px] font-medium text-oa-fg">{stock.ticker}</span>
        <span className="hidden min-w-0 truncate text-[13px] text-oa-muted-fg sm:block">
          {stock.name}
        </span>
      </div>
      <span className="hidden min-w-0 truncate text-[13px] text-oa-muted-fg sm:block">
        {stock.industry ?? ""}
      </span>
      <span className="text-right text-[13px] tabular-nums text-oa-fg">
        {typeof stock.price === "number" ? fmtPrice(stock.price) : "—"}
      </span>
      <span className={`text-right text-[13px] font-medium tabular-nums ${hasPct ? (positive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400") : "text-oa-muted-fg"}`}>
        {hasPct ? `${positive ? "+" : "−"}${Math.abs(pct!).toFixed(2)}%` : "—"}
      </span>
      {showSignal ? (
        <span className="col-span-3 min-w-0 truncate text-[12px] text-oa-fg/70 sm:col-span-1">
          {signal ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full bg-oa-primary" aria-hidden />
              <span className="truncate">{signal}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}

function QuickTile({ stock }: { stock: StockSummary }) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="group flex flex-col gap-2.5 rounded-[18px] bg-oa-bg p-3.5 transition-colors hover:bg-oa-accent"
    >
      <div className="flex items-center gap-2">
        <StockLogo ticker={stock.ticker} size={20} circle />
        <span className="oa-mono text-xs font-medium text-oa-fg">{stock.ticker}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tabular-nums text-oa-fg">
          {typeof stock.price === "number" ? fmtPrice(stock.price) : "—"}
        </span>
        {hasPct && (
          <span className={`text-xs font-medium tabular-nums ${positive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            {positive ? "+" : "−"}{Math.abs(pct!).toFixed(2)}%
          </span>
        )}
      </div>
    </Link>
  );
}

export async function SectorConstituentsStream({
  market,
  tickers,
}: {
  market: Market;
  tickers: string[];
}) {
  if (tickers.length === 0) return null;

  const tickerOrder = new Map(tickers.map((t, index) => [String(t).toUpperCase(), index]));
  const instrumentIds = [...tickerOrder.keys()].map((ticker) => `${market}_${ticker}`);
  const [instruments, prices, anomalies] = await Promise.all([
    getInstruments(instrumentIds).catch(() => new Map()),
    getLatestPriceQuotes(instrumentIds).catch(() => new Map()),
    getDailyAnomalies(market).catch(() => null),
  ]);

  let constituents: StockSummary[] = [...tickerOrder.entries()]
    .map<StockSummary | null>(([ticker], index) => {
      const id = instrumentIds[index];
      const instrument = instruments.get(id);
      const quote = prices.get(id)?.quote;
      if (!instrument || typeof quote?.current !== "number") return null;
      return {
        instrument_id: id,
        ticker: instrument.ticker || ticker,
        name: instrument.name || ticker,
        industry: instrument.industry,
        price: quote.current,
        day_change_abs: quote.day_change_abs,
        day_change_pct: quote.day_change_pct,
        previous_close: quote.previous_close,
        source: "snapshot" as const,
        fundamentals: null,
      };
    })
    .filter((row): row is StockSummary => row !== null);

  if (constituents.length === 0) {
    constituents = (
      await Promise.all(tickers.map((t) => getStockSummary(t, market).catch(() => null)))
    ).filter((x): x is StockSummary => !!x);
  }

  if (constituents.length === 0) return null;

  const signalByTicker = new Map(
    (anomalies?.anomalies ?? []).map((row) => [
      String(row.ticker || "").toUpperCase(),
      row.move_explanation?.headline || row.headline || row.catalyst || row.visual_summary?.what_changed || null,
    ]),
  );
  const signals = constituents.map(
    (stock) => signalByTicker.get(stock.ticker.toUpperCase()) ?? null,
  );
  const showSignal = signals.some(Boolean);

  return (
    <>
      <section aria-labelledby="sector-names">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="sector-names" className="text-[17px] font-medium tracking-tight text-oa-fg">
              Tracked names in this sector
            </h2>
            <p className="mt-1 text-sm text-oa-muted-fg">
              Live prices, plus today&apos;s read when we have one.
            </p>
          </div>
          <span className="text-xs tabular-nums text-oa-muted-fg">
            {constituents.length} names
          </span>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className={`hidden gap-3 border-b border-oa-border bg-oa-bg px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-oa-muted-fg sm:grid ${GRID}`}>
            <span>Ticker</span>
            <span className="hidden sm:block">Company</span>
            <span className="text-right">Price</span>
            <span className="text-right">Day</span>
            {showSignal ? <span>Today&apos;s read</span> : null}
          </div>
          <div>
            {constituents.map((stock, i) => (
              <SectorTableRow
                key={stock.instrument_id}
                stock={stock}
                signal={signals[i]}
                showSignal={showSignal}
              />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="sector-tiles">
        <h2 id="sector-tiles" className="mb-4 text-[17px] font-medium tracking-tight text-oa-fg">Quick tiles</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {constituents.map((s) => (
            <QuickTile key={s.instrument_id} stock={s} />
          ))}
        </div>
      </section>
    </>
  );
}
