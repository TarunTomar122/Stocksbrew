import Link from "next/link";

import { getMarketSnapshot } from "@/lib/firestore";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getStockSummary, type StockSummary } from "@/lib/stock";

type Market = "US" | "IN";

function ConstituentCard({ stock }: { stock: StockSummary }) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  const arrow = positive ? "▲" : "▼";
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";
  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="group bg-surface-container-low p-4 brutalist-border hover:-translate-y-0.5 transition-transform"
    >
      <div className="text-[14px] font-bold text-on-surface group-hover:text-primary transition-colors">
        {stock.ticker}
      </div>
      <div className="text-[11px] font-semibold text-on-surface-variant truncate">
        {stock.name}
      </div>
      {typeof stock.price === "number" && (
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-on-surface tabular-nums">
            {stock.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {hasPct && (
            <span className={`text-[12px] font-bold tabular-nums ${color}`}>
              {arrow} {Math.abs(pct!).toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function SectorTableRow({
  stock,
  signal,
}: {
  stock: StockSummary;
  signal: string | null;
}) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="grid gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-container sm:grid-cols-[96px_minmax(0,1.4fr)_120px_120px_minmax(0,2fr)] sm:items-center"
      style={{ borderColor: "var(--outline-variant)" }}
    >
      <div className="font-mono text-[13px] font-bold text-on-surface">{stock.ticker}</div>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-on-surface">{stock.name}</p>
        {stock.industry ? (
          <p className="truncate text-[11px] text-on-surface-variant">{stock.industry}</p>
        ) : null}
      </div>
      <div className="font-mono text-[13px] tabular-nums text-on-surface">
        {typeof stock.price === "number"
          ? stock.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "—"}
      </div>
      <div className={`font-mono text-[13px] font-bold tabular-nums ${hasPct ? color : "text-on-surface-variant"}`}>
        {hasPct ? `${positive ? "▲" : "▼"} ${Math.abs(pct!).toFixed(2)}%` : "—"}
      </div>
      <div className="min-w-0 text-[12px] text-on-surface-variant">
        <p className="truncate">{signal || "No standout anomaly read today."}</p>
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
  const [snapshotRows, anomalies] = await Promise.all([
    getMarketSnapshot(market).catch(() => []),
    getDailyAnomalies(market).catch(() => null),
  ]);

  let constituents: StockSummary[] = snapshotRows
    .filter((row) => tickerOrder.has(String(row.symbol ?? "").toUpperCase()))
    .sort(
      (a, b) =>
        (tickerOrder.get(String(a.symbol ?? "").toUpperCase()) ?? 0) -
        (tickerOrder.get(String(b.symbol ?? "").toUpperCase()) ?? 0),
    )
    .map((row) => ({
      instrument_id: row.instrumentId,
      ticker: row.symbol,
      name: row.name || row.symbol,
      price: row.price.current,
      day_change_abs: row.price.change,
      day_change_pct: row.price.changePct,
      previous_close: row.price.previousClose,
      source: "snapshot" as const,
      fundamentals: null,
    }));

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

  return (
    <>
      <section className="bg-surface-container-lowest brutalist-border p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold text-on-surface">
              Tracked names in this sector
            </h2>
            <p className="mt-1 text-[12px] text-on-surface-variant">
              Live price action plus today&apos;s anomaly read when we have one.
            </p>
          </div>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {constituents.length} tracked names
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--outline-variant)" }}>
          <div
            className="hidden bg-surface-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant sm:grid sm:grid-cols-[96px_minmax(0,1.4fr)_120px_120px_minmax(0,2fr)]"
          >
            <span>Ticker</span>
            <span>Company</span>
            <span>Price</span>
            <span>Day</span>
            <span>Signal</span>
          </div>
          <div>
            {constituents.map((stock) => (
              <SectorTableRow
                key={stock.instrument_id}
                stock={stock}
                signal={signalByTicker.get(stock.ticker.toUpperCase()) ?? null}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface-container-lowest brutalist-border p-6">
        <h2 className="mb-4 text-[14px] font-semibold text-on-surface">Quick tiles</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {constituents.map((s) => (
            <ConstituentCard key={s.instrument_id} stock={s} />
          ))}
        </div>
      </section>
    </>
  );
}
