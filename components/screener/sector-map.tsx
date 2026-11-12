import * as React from "react";

import { shortSectorName, tileName } from "@/components/markets/sector-heatmap";
import { Delta, NUM } from "@/components/oa/kit";
import { Treemap, type TreemapChip, type TreemapLayout } from "@/components/oa/kit/treemap";
import { part, sectorBarClass, sectorTileClass, stockTileClass } from "@/components/oa/kit/treemap-fit";
import { TreemapLabelled } from "@/components/oa/kit/treemap-labels";
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
 * A tile's size: the size of its move, up or down. A flat stock, or one with no figure for the period, keeps a sliver
 * (2% of the full-colour move: 0.06% on a day) so it is still on the map, small, rather than drawn as big as a mover.
 */
export function moveWeight(change: number | null | undefined, period: SectorPeriod): number {
  const floor = FULL_SCALE[period] * 0.02;
  return isFiniteNumber(change) ? Math.max(Math.abs(change), floor) : floor;
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
  // Each stock's tile is as big as its move over the period (owner, Nov 12). The layout draws each sector's biggest
  // movers that hold their ticker, price and move at the narrowest width each layout is shown at (lib/market-map.ts);
  // the tiles then decide from their rendered size what they show (components/oa/kit/treemap-fit.ts), and any tile or
  // bar hiding words is listed under the map. The rest of the stocks are one link away.
  const weight = (row: ScreenerRow) => moveWeight(row[period], period);
  const layouts = DESK_LAYOUTS.map((layout) => ({ ...layout, map: marketMapLayout(rows, stats, period, weight, layout.width) }));
  const chips: TreemapChip[] = [];
  const seen = new Set<string>();
  for (const { map } of layouts) {
    for (const block of map.blocks) {
      const change = block.stat.change[period];
      const barKey = `b:${block.stat.slug}`;
      if (!seen.has(barKey)) {
        seen.add(barKey);
        chips.push({
          key: barKey,
          href: sectorHref(block.stat.slug),
          icon: <SectorIcon id={block.stat.name} size={13} />,
          name: shortSectorName(block.stat.name),
          figure: isFiniteNumber(change) ? signedMove(change) : "",
          background: "var(--oa-card)",
        });
      }
      for (const tile of block.tiles) {
        const key = `s:${tile.row.symbol}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chips.push({
          key,
          href: `/stock/${encodeURIComponent(tile.row.symbol)}`,
          icon: <StockLogo ticker={tile.row.symbol} size={14} />,
          name: tile.text.symbol,
          figure: [tile.text.price, tile.text.move].filter(Boolean).join(" "),
          background: heatFill(tile.row[period], period),
        });
      }
    }
  }
  const total = layouts[0]?.map.total ?? 0;
  const drawn = Math.min(...layouts.map(({ map }) => map.drawn));

  return (
    <>
      <TreemapLabelled chips={chips} initial={[]} chipsClassName="mt-1.5 px-0.5">
        {layouts.map(({ map, className }) => (
          <div
            key={map.width}
            role="group"
            aria-label="Market map: each sector's biggest movers, sized by how far they moved and coloured by it"
            className={`relative w-full ${className}`}
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
                  {/* The sector's bar: icon, then its name and move as they fit, decided from its rendered width. */}
                  <Link
                    prefetch={false}
                    href={sectorHref(stat.slug)}
                    data-tile={`b:${stat.slug}`}
                    title={`${stat.name}: ${stat.count} stocks${moved ? `, ${signedMove(change as number, 2)}` : ""}. Screen this sector.`}
                    style={pct(block.x + MAP_GAP, block.y + MAP_GAP, Math.max(0, block.w - MAP_GAP * 2), MAP_HEAD)}
                    className={`absolute bg-oa-fg text-[12px] font-semibold uppercase leading-none tracking-[0.04em] text-oa-page outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring ${sectorBarClass({ name: stat.name, short, move: moved })}`}
                  >
                    <span data-clip className={`${part.body} oa-mono`}>
                      <SectorIcon id={stat.name} size={12} className="![color:var(--oa-page)] !opacity-100" />
                      <span data-need="name" className={part.name}>
                        {stat.name}
                      </span>
                      <span data-need="name" className={part.short}>
                        {short}
                      </span>
                      {moved ? (
                        <span data-need="move" className={`font-normal normal-case ${part.move}`}>
                          {moved}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  {block.tiles.map((tile) => {
                    const row = tile.row;
                    const value = row[period];
                    const { symbol, price, move } = tile.text;
                    return (
                      <div key={row.symbol} className="absolute p-px" style={pct(tile.x, tile.y, tile.w, tile.h)} data-tile={`s:${row.symbol}`}>
                        <Link
                          prefetch={false}
                          href={`/stock/${encodeURIComponent(row.symbol)}`}
                          title={`${row.symbol} ${row.name ?? ""}${price ? `, ${price}` : ""}${isFiniteNumber(value) ? `: ${signedMove(value, 2)}` : ""}`}
                          style={{ background: heatFill(value, period) }}
                          className={`block h-full w-full text-oa-fg outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring dark:hover:brightness-110 ${stockTileClass(tile.text)}`}
                        >
                          <span data-clip className={`${part.body} oa-mono tabular-nums`}>
                            {/* The logo rides with the ticker on every tile (owner rule 4); a tile too small for both is listed under the map. */}
                            <span data-need="tick" className={`whitespace-nowrap ${part.tick}`}>
                              <StockLogo ticker={row.symbol} size={13} />
                              {symbol}
                            </span>
                            {price ? (
                              <span data-need="price" className={`whitespace-nowrap ${part.price}`}>
                                {price}
                              </span>
                            ) : null}
                            {move ? (
                              <span data-need="move" className={`whitespace-nowrap font-semibold ${part.move}`}>
                                {move}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </TreemapLabelled>
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
 * Phones and tablets get the sector level only, as a treemap: each sector's tile as big as its move over the period
 * (owner, Nov 12), coloured by it. Each tile decides from its rendered size what it shows (the full name, then the
 * short one, then the icon and move, then the icon alone; components/oa/kit/treemap-fit.ts), and any tile hiding its
 * name or move is listed under the map.
 */
export function SectorHeatGrid({ stats, period, sectorHref }: { stats: readonly SectorStat[]; period: SectorPeriod; sectorHref: (slug: string) => string }) {
  return (
    <div className="p-1">
      <Treemap
        items={stats}
        keyOf={(stat) => stat.slug}
        weightOf={(stat) => stat.change[period]}
        layouts={NARROW_LAYOUTS}
        gap={3}
        label="Sectors sized and coloured by how far they moved"
        labels={{
          className: "mt-1 px-[1.5px]",
          chip: (stat) => {
            const change = stat.change[period];
            return {
              key: stat.slug,
              href: sectorHref(stat.slug),
              icon: <SectorIcon id={stat.name} size={13} />,
              name: shortSectorName(stat.name),
              figure: isFiniteNumber(change) ? signedMove(change, 2) : "·",
              background: heatFill(change, period),
            };
          },
          guess: (stat, { w, h }) => tileName(stat.name, w, h) === null,
        }}
        renderTile={(stat) => {
          const change = stat.change[period];
          const move = isFiniteNumber(change) ? signedMove(change, 2) : "";
          const short = shortSectorName(stat.name);
          return (
            <Link
              prefetch={false}
              href={sectorHref(stat.slug)}
              aria-label={`${stat.name}, ${move || "no move yet"}`}
              title={`${stat.name} ${move}`}
              className={`block h-full w-full border border-oa-border outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring ${sectorTileClass({ name: stat.name, short, move })}`}
              style={{ background: heatFill(change, period) }}
            >
              <span data-clip className={part.body}>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-4 text-oa-fg">
                  <SectorIcon id={stat.name} size={14} />
                  <span data-need="name" className={`whitespace-nowrap ${part.name}`}>
                    {stat.name}
                  </span>
                  <span data-need="name" className={`whitespace-nowrap ${part.short}`}>
                    {short}
                  </span>
                </span>
                {move ? (
                  <span data-need="move" className={`oa-mono whitespace-nowrap font-medium tabular-nums text-oa-fg ${part.move}`}>
                    {move}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        }}
      />
    </div>
  );
}

/** A phone's proportions and a tablet's for the sector treemap (below 1024px, where the stock map takes over). */
const NARROW_LAYOUTS: TreemapLayout[] = [
  { width: 360, height: 420, className: "md:hidden" },
  { width: 700, height: 380, className: "hidden md:block" },
];

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
      <span>Colour is the change over {label.toLowerCase()}. Size is the move.</span>
    </div>
  );
}
