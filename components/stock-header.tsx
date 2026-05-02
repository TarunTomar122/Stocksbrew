import type { StockSummary } from "@/lib/stock";

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function StockHeader({ stock }: { stock: StockSummary }) {
  const pct = stock.day_change_pct ?? 0;
  const positive = pct >= 0;
  const arrow = positive ? "↑" : "↓";
  const colorClass = positive ? "text-signal-bullish" : "text-signal-bearish";
  const sign = positive ? "+" : "";

  const metaBits = [stock.sector, stock.industry].filter(Boolean) as string[];
  const indices = stock.index_memberships ?? [];

  return (
    <section className="px-0 py-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex items-start gap-4 min-w-0">
          {stock.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stock.logo_url}
              alt=""
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-surface-container-low object-contain flex-shrink-0 border border-outline-variant/30 shadow-sm"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-3xl md:text-[42px] font-black tracking-tighter text-on-surface leading-none">
                {stock.ticker}
              </h1>
              {stock.exchange && (
                <span className="px-2 py-0.5 bg-surface-container-high border border-outline-variant/40 text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant rounded-md">
                  {stock.exchange}
                </span>
              )}
            </div>
            <div className="mt-1.5 text-[13px] md:text-[14px] font-semibold text-on-surface-variant truncate">
              {stock.name}
            </div>
            {(metaBits.length > 0 || indices.length > 0) && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {metaBits.length > 0 && (
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline">
                    {metaBits.join(" · ")}
                  </span>
                )}
                {metaBits.length > 0 && indices.length > 0 && (
                  <span className="text-outline text-[11px]">·</span>
                )}
                {indices.map((idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 bg-primary/8 text-primary text-[10px] font-bold tracking-[0.08em] uppercase rounded-md"
                  >
                    {idx}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <div className="text-3xl md:text-[42px] font-black tracking-tighter text-on-surface tabular-nums leading-none">
            {formatPrice(stock.price)}
          </div>
          {typeof stock.day_change_pct === "number" && (
            <div className={`mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold tabular-nums ${colorClass} bg-surface-container-high px-2 py-0.5 rounded-md`}>
              {arrow} {sign}{stock.day_change_pct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
