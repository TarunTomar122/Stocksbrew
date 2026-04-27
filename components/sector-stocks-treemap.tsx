import Link from "next/link";

import {
  layoutChangeTreemap,
  TREEMAP_EXTREME_PCT,
  treemapCellStyle,
} from "@/lib/sector-treemap-layout";

export type SectorStock = {
  instrument_id: string;
  ticker: string;
  name: string;
  changePct: number;
};

type Props = {
  stocks: SectorStock[];
  currentInstrumentId: string;
  sectorLabel: string;
};

export function SectorStocksTreemap({ stocks, currentInstrumentId, sectorLabel }: Props) {
  const tiles = layoutChangeTreemap(stocks);

  if (tiles.length === 0) {
    return (
      <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col">
        <h3 className="text-[14px] font-semibold text-on-surface">Sector heatmap</h3>
        <p className="mt-4 text-sm text-on-surface-variant">
          No sector peers with price data available right now.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col h-full">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h3 className="text-[14px] font-semibold text-on-surface">
          {sectorLabel ? `${sectorLabel} today` : "Sector today"}
        </h3>
        <p className="text-[11px] text-on-surface-variant leading-snug">
          Size = magnitude of today&apos;s move. Green = up, red = down.
        </p>
      </div>

      <div className="relative w-full flex-1 min-h-[320px]">
        {tiles.map((t) => {
          const style = treemapCellStyle(t.node.changePct);
          const isSelf = t.node.instrument_id === currentInstrumentId;
          const arrow = t.node.changePct >= 0 ? "▲" : "▼";
          const showPct = t.w > 8 && t.h > 10;
          const showTicker = t.w > 5 && t.h > 6;

          return (
            <Link
              key={t.node.instrument_id}
              href={`/stock/${encodeURIComponent(t.node.ticker)}`}
              className={`absolute flex flex-col justify-between p-1.5 overflow-hidden transition-transform hover:-translate-y-0.5 ${
                isSelf ? "ring-2 ring-primary ring-inset z-10" : ""
              }`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.w}%`,
                height: `${t.h}%`,
                background: style.background,
                color: style.color,
                outline: "1px solid color-mix(in srgb, var(--surface-container-lowest) 60%, transparent)",
              }}
              title={`${t.node.ticker} · ${t.node.name} · ${t.node.changePct >= 0 ? "+" : ""}${t.node.changePct.toFixed(2)}%`}
            >
              {showTicker ? (
                <span className="text-[11px] font-bold leading-tight tracking-tight truncate">
                  {t.node.ticker}
                </span>
              ) : (
                <span />
              )}
              {showPct && (
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[8px] font-bold opacity-80">{arrow}</span>
                  <span className="text-[11px] font-bold tabular-nums">
                    {t.node.changePct >= 0 ? "+" : ""}
                    {t.node.changePct.toFixed(2)}%
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-on-surface-variant shrink-0">
        <span>{stocks.length} stock{stocks.length === 1 ? "" : "s"} in sector</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3"
              style={{ background: "color-mix(in srgb, var(--signal-bearish) 80%, transparent)" }}
            />
            −{TREEMAP_EXTREME_PCT}%+
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3"
              style={{ background: "color-mix(in srgb, var(--signal-bullish) 80%, transparent)" }}
            />
            +{TREEMAP_EXTREME_PCT}%+
          </span>
        </div>
      </div>
    </section>
  );
}
