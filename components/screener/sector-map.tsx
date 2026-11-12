import * as React from "react";

import { shortSectorName } from "@/components/markets/sector-heatmap";
import { NUM } from "@/components/oa/kit";
import { TileLabel, Treemap, tileClass, type TreemapLayout } from "@/components/oa/kit/treemap";
import { barClass, part } from "@/components/oa/kit/treemap-fit";
import { SectorIcon } from "@/components/oa/sector-icon";
import { StockLogo } from "@/components/stock-logo";
import { MAP_GAP, MAP_HEAD, marketMapLayout, signedMove } from "@/lib/market-map";
import { SECTOR_PERIODS, isFiniteNumber, type ScreenerRow, type SectorPeriod, type SectorStat } from "@/lib/screener-shared";
import Link from "next/link";

/**
 * The market map: each sector's biggest movers over the chosen period as tiles sized by how far they moved and
 * coloured by it, grouped into sector blocks, every tile with its ticker, price and move. A sector's bar applies that
 * sector as a screener filter; a tile opens the stock; one link under the map opens every stock. Laid out on the
 * server (lib/market-map.ts), drawn as HTML boxes placed by percent, so the words are real pixels.
 */

/** The move that gets the full colour, per period. */
const FULL_SCALE: Record<SectorPeriod, number> = { day_pct: 3, ret_1w: 6, ret_1m: 12, ret_ytd: 40 };

export function heatFill(change: number | null | undefined, period: SectorPeriod): string {
  if (!isFiniteNumber(change)) return "var(--oa-bg)";
  const strength = Math.min(1, Math.abs(change) / FULL_SCALE[period]);
  if (strength < 0.04) return "color-mix(in srgb, var(--oa-muted-fg) 12%, var(--oa-card))";
  const pct = Math.round(14 + strength * 46);
  return `color-mix(in srgb, var(${change > 0 ? "--signal-bullish" : "--signal-bearish"}) ${pct}%, var(--oa-card))`;
}

/**
 * A tile's size: the square root of its move, up or down (lib/treemap.ts moveWeights), so a 30% mover is about twice
 * a 7% one's area rather than four times, and no tile becomes a slab. A flat stock, or one with no figure for the
 * period, keeps the size of a small move (2% of the full-colour move: 0.06% on a day) so it is still on the map.
 */
export function moveWeight(change: number | null | undefined, period: SectorPeriod): number {
  const floor = FULL_SCALE[period] * 0.02;
  return Math.sqrt(isFiniteNumber(change) ? Math.max(Math.abs(change), floor) : floor);
}


export function SectorMap({
  rows,
  stats,
  period,
  sectorHref,
  allHref,
}: {
  rows: readonly ScreenerRow[];
  stats: readonly SectorStat[];
  period: SectorPeriod;
  sectorHref: (slug: string) => string;
  /** The screen with every stock, for the ones the map leaves out. */
  allHref: string;
}) {
  // Each stock's tile is sized by its move over the period (owner, Nov 12), compressed. The layout draws each sector's
  // biggest movers whose tiles hold their logo, ticker and move at the narrowest width each layout is shown at, and
  // every sector's bar holds its name (lib/market-map.ts); nothing is listed under the map. The rest are one link away.
  const weight = (row: ScreenerRow) => moveWeight(row[period], period);
  const layouts = DESK_LAYOUTS.map((layout) => ({ ...layout, map: marketMapLayout(rows, stats, period, weight, layout.width, shortSectorName) }));
  const total = layouts[0]?.map.total ?? 0;
  const drawn = Math.min(...layouts.map(({ map }) => map.drawn));

  return (
    <>
      {layouts.map(({ map, className }) => (
        <div
          key={map.width}
          role="group"
          aria-label="Market map: each sector's biggest movers, sized by how far they moved and coloured by it"
          className={`oa-type-fixed relative w-full ${className}`}
          style={{ aspectRatio: `${map.width} / ${map.height}` }}
        >
          {map.blocks.map((block) => {
            const stat = block.stat;
            const change = stat.change[period];
            const moved = isFiniteNumber(change) ? signedMove(change) : "";
            const short = shortSectorName(stat.name);
            const pct = (x: number, y: number, w: number, h: number) => ({
              left: `${(x / map.width) * 100}%`,
              top: `${(y / map.height) * 100}%`,
              width: `${(w / map.width) * 100}%`,
              height: `${(h / map.height) * 100}%`,
            });
            return (
              <React.Fragment key={stat.slug}>
                {/* The sector's bar: icon and name, the full one and the move where the bar is wide enough. */}
                <Link
                  prefetch={false}
                  href={sectorHref(stat.slug)}
                  title={`${stat.name}: ${stat.count} stocks${moved ? `, ${signedMove(change as number, 2)}` : ""}. Screen this sector.`}
                  style={pct(block.x + MAP_GAP, block.y + MAP_GAP, Math.max(0, block.w - MAP_GAP * 2), MAP_HEAD)}
                  className={`absolute bg-oa-fg text-[12px] font-semibold leading-none text-oa-page outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring ${barClass({ full: stat.name, short, move: moved })}`}
                >
                  <span className={part.barBody}>
                    <SectorIcon id={stat.name} size={12} className="![color:var(--oa-page)] !opacity-100" />
                    {stat.name !== short ? (
                      <>
                        <span className={part.full}>{stat.name}</span>
                        <span className={part.short}>{short}</span>
                      </>
                    ) : (
                      <span>{short}</span>
                    )}
                    {moved ? <span className={`oa-mono font-normal ${part.barMove}`}>{moved}</span> : null}
                  </span>
                </Link>
                {block.tiles.map((tile) => {
                  const row = tile.row;
                  const value = row[period];
                  const { symbol, price, move } = tile.text;
                  const words = { full: symbol, short: symbol, mono: true, move, price: price || undefined };
                  return (
                    <div key={row.symbol} className="absolute p-px" style={pct(tile.x, tile.y, tile.w, tile.h)} data-tile={`s:${row.symbol}`}>
                      <Link
                        prefetch={false}
                        href={`/stock/${encodeURIComponent(row.symbol)}`}
                        title={`${row.symbol} ${row.name ?? ""}${price ? `, ${price}` : ""}${isFiniteNumber(value) ? `: ${signedMove(value, 2)}` : ""}`}
                        style={{ background: heatFill(value, period) }}
                        className={`block h-full w-full text-oa-fg outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring dark:hover:brightness-110 ${tileClass(words)}`}
                      >
                        <TileLabel icon={<StockLogo ticker={row.symbol} size={14} atOnce />} words={words} priceClassName="text-oa-fg" />
                      </Link>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      ))}
      {/* One way to the rest, not a link per sector (owner rule 1): the full screen, every stock. */}
      {drawn < total ? (
        <p className="mt-1.5 flex justify-end px-1 text-[13px]">
          <Link prefetch={false} href={allHref} className="rounded font-medium text-oa-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring">
            See all {rows.length} stocks →
          </Link>
        </p>
      ) : null}
    </>
  );
}

/**
 * The desktop map's two layouts, each laid out for the narrowest width it is shown at (the content column on a
 * 1024px and a 1280px screen), so a tile only grows on a wider one. Below 1024px the sector map takes over.
 */
const DESK_LAYOUTS = [
  { width: 700, className: "hidden lg:block xl:hidden" },
  { width: 940, className: "hidden xl:block" },
];

/**
 * Phones and tablets get the sector level only, as a treemap: each sector's tile sized by its move over the period
 * (owner, Nov 12), coloured by it, every tile with its icon, name and move (components/oa/kit/treemap.tsx).
 */
export function SectorHeatGrid({ stats, period, sectorHref }: { stats: readonly SectorStat[]; period: SectorPeriod; sectorHref: (slug: string) => string }) {
  const wordsOf = (stat: SectorStat) => {
    const change = stat.change[period];
    return { full: stat.name, short: shortSectorName(stat.name), mono: false, move: isFiniteNumber(change) ? signedMove(change, 2) : "·" };
  };
  return (
    <div className="p-1">
      <Treemap
        items={stats}
        keyOf={(stat) => stat.slug}
        moveOf={(stat) => stat.change[period]}
        wordsOf={wordsOf}
        layouts={NARROW_LAYOUTS}
        gap={3}
        label="Sectors sized and coloured by how far they moved"
        renderTile={(stat) => {
          const words = wordsOf(stat);
          return (
            <Link
              prefetch={false}
              href={sectorHref(stat.slug)}
              aria-label={`${stat.name}, ${words.move === "·" ? "no move yet" : words.move}`}
              title={`${stat.name} ${words.move}`}
              className={`block h-full w-full border border-oa-border outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring ${tileClass(words)}`}
              style={{ background: heatFill(stat.change[period], period) }}
            >
              <TileLabel icon={<SectorIcon id={stat.name} size={14} />} words={words} moveClassName="text-oa-fg" />
            </Link>
          );
        }}
      />
    </div>
  );
}

/** A phone's and a tablet's widths for the sector treemap, in the panel's padding (below 1024px the stock map is off). */
const NARROW_LAYOUTS: TreemapLayout[] = [
  { width: 294, className: "sm:hidden", short: true },
  { width: 582, className: "hidden sm:block" },
];

export function HeatLegend({ period }: { period: SectorPeriod }) {
  const full = FULL_SCALE[period];
  const stops = [-1, -0.5, -0.2, 0, 0.2, 0.5, 1];
  const label = SECTOR_PERIODS.find((item) => item.id === period)?.label ?? "";
  return (
    <div className="oa-type-fixed flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-oa-muted-fg">
      <span className="flex items-center">
        {stops.map((stop) => (
          <span key={stop} className={`${NUM} flex h-5 w-11 items-center justify-center text-[10.5px] text-oa-fg`} style={{ background: heatFill(stop * full, period) }}>
            {stop === 0 ? "0" : `${stop > 0 ? "+" : "−"}${Math.abs(stop * full).toFixed(stop * full % 1 === 0 ? 0 : 1)}%`}
          </span>
        ))}
      </span>
      <span>Colour is the change over {label.toLowerCase()}. Size is the move.</span>
    </div>
  );
}
