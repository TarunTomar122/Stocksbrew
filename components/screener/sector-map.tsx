import * as React from "react";

import { Delta, NUM } from "@/components/oa/kit";
import {
  SECTOR_PERIODS,
  isFiniteNumber,
  squarify,
  type ScreenerRow,
  type SectorPeriod,
  type SectorStat,
} from "@/lib/screener-shared";

/**
 * The market map: every covered stock as a tile sized by market value and
 * coloured by its change over the chosen period, grouped into sector blocks.
 * A sector's header applies that sector as a screener filter; a tile opens
 * the stock. Laid out on the server, drawn as plain SVG.
 */

const W = 1200;
const H = 640;
const HEAD = 19;
const GAP = 2;

/** The move that gets the full colour, per period. */
const FULL_SCALE: Record<SectorPeriod, number> = { day_pct: 3, ret_1w: 6, ret_1m: 12, ret_ytd: 40 };

export function heatFill(change: number | null | undefined, period: SectorPeriod): string {
  if (!isFiniteNumber(change)) return "var(--oa-bg)";
  const strength = Math.min(1, Math.abs(change) / FULL_SCALE[period]);
  if (strength < 0.04) return "color-mix(in srgb, var(--oa-muted-fg) 12%, var(--oa-card))";
  const pct = Math.round(14 + strength * 46);
  return `color-mix(in srgb, var(${change > 0 ? "--signal-bullish" : "--signal-bearish"}) ${pct}%, var(--oa-card))`;
}

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function SectorMap({
  rows,
  stats,
  period,
  sectorHref,
}: {
  rows: readonly ScreenerRow[];
  stats: readonly SectorStat[];
  period: SectorPeriod;
  sectorHref: (slug: string) => string;
}) {
  const bySector = new Map<string, ScreenerRow[]>();
  for (const row of rows) {
    if (!row.sector || !isFiniteNumber(row.market_cap) || row.market_cap <= 0) continue;
    const list = bySector.get(row.sector) ?? [];
    list.push(row);
    bySector.set(row.sector, list);
  }
  const blocks = squarify(
    stats.filter((stat) => stat.marketCap > 0).map((stat) => ({ value: stat.marketCap, data: stat })),
    0,
    0,
    W,
    H,
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Market map: stocks sized by market value, coloured by change, grouped by sector" className="block h-auto w-full">
      {blocks.map((block) => {
        const stat = block.data;
        const inner = { x: block.x + GAP, y: block.y + GAP + HEAD, w: block.w - GAP * 2, h: block.h - GAP * 2 - HEAD };
        const tiles =
          inner.w > 8 && inner.h > 8
            ? squarify(
                (bySector.get(stat.name) ?? []).map((row) => ({ value: row.market_cap as number, data: row })),
                inner.x,
                inner.y,
                inner.w,
                inner.h,
              )
            : [];
        const change = stat.change[period];
        const headText = block.w > 150 ? stat.name : block.w > 84 ? stat.name.split(" ")[0]! : "";
        return (
          <g key={stat.slug}>
            <a href={sectorHref(stat.slug)}>
              <title>{`${stat.name}: ${stat.count} stocks${isFiniteNumber(change) ? `, ${signed(change, 2)}` : ""}. Screen this sector.`}</title>
              <rect x={block.x + GAP} y={block.y + GAP} width={Math.max(0, block.w - GAP * 2)} height={HEAD} fill="var(--oa-fg)" />
              {headText ? (
                <text x={block.x + GAP + 6} y={block.y + GAP + 13.5} fontSize="11" fontWeight="600" letterSpacing="0.05em" fill="var(--oa-page)" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)", textTransform: "uppercase" }}>
                  {headText}
                </text>
              ) : null}
              {isFiniteNumber(change) && block.w > (headText ? headText.length * 7.6 + 62 : 60) ? (
                <text x={block.x + block.w - GAP - 6} y={block.y + GAP + 13.5} fontSize="11" textAnchor="end" fill="var(--oa-page)" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
                  {signed(change)}
                </text>
              ) : null}
            </a>
            {tiles.map((tile) => {
              const row = tile.data;
              const value = row[period];
              const showSymbol = tile.w > 34 && tile.h > 17;
              const showChange = tile.w > 44 && tile.h > 33 && isFiniteNumber(value);
              const size = tile.w > 120 && tile.h > 70 ? 17 : tile.w > 70 && tile.h > 44 ? 13 : 10.5;
              const cx = tile.x + tile.w / 2;
              const cy = tile.y + tile.h / 2;
              return (
                <a key={row.symbol} href={`/stock/${encodeURIComponent(row.symbol)}`}>
                  <title>{`${row.symbol} ${row.name ?? ""}${isFiniteNumber(value) ? `: ${signed(value, 2)}` : ""}`}</title>
                  <rect
                    x={tile.x + 0.5}
                    y={tile.y + 0.5}
                    width={Math.max(0, tile.w - 1)}
                    height={Math.max(0, tile.h - 1)}
                    fill={heatFill(value, period)}
                    className="transition-opacity hover:opacity-75"
                  />
                  {showSymbol ? (
                    <text
                      x={cx}
                      y={showChange ? cy - 1 : cy + size * 0.35}
                      fontSize={size}
                      fontWeight="600"
                      textAnchor="middle"
                      fill="var(--oa-fg)"
                      pointerEvents="none"
                      style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
                    >
                      {row.symbol}
                    </text>
                  ) : null}
                  {showChange ? (
                    <text
                      x={cx}
                      y={cy + size * 0.95}
                      fontSize={Math.max(9.5, size - 3)}
                      textAnchor="middle"
                      fill="var(--oa-fg)"
                      opacity="0.8"
                      pointerEvents="none"
                      style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
                    >
                      {signed(value as number)}
                    </text>
                  ) : null}
                </a>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Phones get the sector level only: eleven tiles they can read and tap. */
export function SectorHeatGrid({ stats, period, sectorHref }: { stats: readonly SectorStat[]; period: SectorPeriod; sectorHref: (slug: string) => string }) {
  const total = stats.reduce((sum, stat) => sum + stat.marketCap, 0);
  return (
    <div className="grid grid-cols-2 gap-px bg-oa-border">
      {stats.map((stat) => {
        const change = stat.change[period];
        return (
          <a
            key={stat.slug}
            href={sectorHref(stat.slug)}
            className="flex min-h-[4.75rem] flex-col justify-between p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring"
            style={{ background: heatFill(change, period) }}
          >
            <span className="text-[13px] font-medium leading-4 text-oa-fg">{stat.name}</span>
            <span className="flex items-baseline justify-between gap-2">
              <Delta value={change} digits={2} className="!text-oa-fg text-[15px] font-medium" />
              <span className={`${NUM} text-[11px] text-oa-fg opacity-70`}>
                {total > 0 ? `${((stat.marketCap / total) * 100).toFixed(0)}% of cap` : ""}
              </span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function HeatLegend({ period }: { period: SectorPeriod }) {
  const full = FULL_SCALE[period];
  const stops = [-1, -0.5, -0.2, 0, 0.2, 0.5, 1];
  const label = SECTOR_PERIODS.find((item) => item.id === period)?.label ?? "";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-oa-muted-fg">
      <span className="flex items-center">
        {stops.map((stop) => (
          <span key={stop} className={`${NUM} flex h-5 w-11 items-center justify-center text-[10.5px] text-oa-fg`} style={{ background: heatFill(stop * full, period) }}>
            {stop === 0 ? "0" : `${stop > 0 ? "+" : "−"}${Math.abs(stop * full).toFixed(stop * full % 1 === 0 ? 0 : 1)}%`}
          </span>
        ))}
      </span>
      <span>Colour is the change over {label.toLowerCase()}. Size is market value.</span>
    </div>
  );
}
