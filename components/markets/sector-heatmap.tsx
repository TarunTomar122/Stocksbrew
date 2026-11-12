import Link from "next/link";
import * as React from "react";

import { Treemap, type TreemapLayout } from "@/components/oa/kit/treemap";
import { part, sectorTileClass } from "@/components/oa/kit/treemap-fit";
import { SectorIcon } from "@/components/oa/sector-icon";

/**
 * The day's sectors as a heatmap (owner, Nov 12: "this would better off being a heatmap with icons and names"): one
 * tile per sector with its icon, name and move, tinted green or red by how far it moved, each opening its sector.
 * Each tile sized by its move in a true treemap. Server-rendered, no hooks. Market today and the /markets sector card
 * both draw this one map.
 */

export type HeatmapSector = {
  id: string;
  name: string;
  /** Opens /sectors/[slug] unless `href` says otherwise. */
  slug: string;
  /** The day's move in percent; null before there is one (the smallest tile, no colour). */
  day: number | null;
  href?: string;
  /** The SectorIcon id when it is not `id` (a fund such as SMH borrows Tech's chip). */
  icon?: string;
  /** The hover title's name when it says more than `name` ("Tech, XLK"). */
  title?: string;
};

const MINUS = "−";

/** Short names for the long sectors, as traders say them. */
const SHORT: Record<string, string> = {
  "communication services": "Communication",
  "consumer discretionary": "Discretionary",
  "consumer staples": "Staples",
  "information technology": "Tech",
};

/** "Discretionary" for "Consumer Discretionary": the trade's short name for a long sector, else the name itself. */
export function shortSectorName(name: string): string {
  return SHORT[name.toLowerCase()] ?? name;
}

/** "+1.32%", "−0.40%", "0.00%", and "·" with no move yet. */
function signedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "·";
  const rounded = Number(value.toFixed(2));
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(2)}%`;
}

/**
 * The tile's background: the app's up or down colour mixed into the card colour, stronger for a bigger move (a 3%
 * day or more is the strongest). Mixed with the card colour rather than drawn see-through, so the text keeps its
 * contrast in light and dark mode.
 */
function tint(day: number | null): string {
  if (day === null || !Number.isFinite(day)) return "var(--oa-card)";
  const strength = Math.min(Math.abs(day) / 3, 1);
  if (Math.abs(day) < 0.005) return "var(--oa-card)";
  const share = Math.round(8 + strength * 30);
  return `color-mix(in srgb, var(${day > 0 ? "--signal-bullish" : "--signal-bearish"}) ${share}%, var(--oa-card))`;
}

/** A wide screen's proportions and a phone's, for a map with the page's width to itself. */
const PAGE_LAYOUTS: TreemapLayout[] = [
  { width: 1000, height: 340, className: "hidden sm:block" },
  { width: 360, height: 440, className: "sm:hidden" },
];

/** The shortest tile that prints a name. */
const NAMED_H = 48;
/**
 * A first guess, from a layout's own units, at the name a tile prints whole: the full name, else the short one, else
 * none. Only the server's guess at which tiles the labels list before the page measures; the tile itself decides
 * from its rendered size (components/oa/kit/treemap-fit.ts).
 */
export function tileName(name: string, w: number, h: number): string | null {
  if (h < NAMED_H) return null;
  return [name, shortSectorName(name)].find((text) => text.length * 6.9 + 42 <= w) ?? null;
}
/** The smallest tile that still prints its move; a smaller one shows only its icon. */
const FIGURE_W = 58;
const FIGURE_H = 38;

function rowHref(row: HeatmapSector): string {
  return row.href ?? (row.slug ? `/sectors/${row.slug}` : "/sectors");
}

/**
 * A true treemap (owner, Nov 12: "not looking like a true heat map; cards need to be the size depending on the
 * percentage change"): each tile's AREA follows the size of its move (components/oa/kit/treemap.tsx), so the boxes fill
 * the whole map. A small tile keeps its move and drops the name (it stays in the label and the hover title); a big one
 * spells the sector out in full and prints its move large.
 */
export function SectorHeatmap({
  rows,
  layouts = PAGE_LAYOUTS,
  gap = 6,
  label = "Sectors sized by how far they moved today",
  floorShare,
  denseLabels = false,
  rootClassName,
}: {
  rows: HeatmapSector[];
  layouts?: readonly TreemapLayout[];
  /** Space between tiles, in CSS pixels. */
  gap?: number;
  label?: string;
  /** The smallest tile's share of the map (lib/treemap.ts); a small map raises it so a flat sector stays readable. */
  floorShare?: number;
  /** Smaller label chips, for a map in a narrow card where most tiles are too small for their name. */
  denseLabels?: boolean;
  /** The wrapper around the map and its labels: "flex flex-1 flex-col" when the map fills a card. */
  rootClassName?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Treemap
      items={rows}
      keyOf={(row) => row.id}
      weightOf={(row) => row.day}
      layouts={layouts}
      gap={gap}
      floorShare={floorShare}
      label={label}
      labels={{
        dense: denseLabels,
        className: "mt-1 px-[3px]",
        rootClassName,
        chip: (row) => ({
          key: row.id,
          href: rowHref(row),
          icon: <SectorIcon id={row.icon ?? row.id} size={13} />,
          name: shortSectorName(row.name),
          figure: signedPct(row.day),
          background: tint(row.day),
        }),
        guess: (row, { w, h }) => tileName(row.name, w, h) === null || w < FIGURE_W || h < FIGURE_H,
      }}
      renderTile={(row) => {
        // The tile decides from its rendered size what it shows (components/oa/kit/treemap-fit.ts): the full name and
        // a big figure, then the short name, then the icon and the move, then the icon alone; the icon always stays
        // (owner VISUALS CHECK). A tile without its name or move is listed in the labels under the map.
        const move = signedPct(row.day);
        const short = shortSectorName(row.name);
        return (
          <Link
            prefetch={false}
            href={rowHref(row)}
            aria-label={`${row.name}, ${move === "·" ? "no move yet" : `${move} today`}`}
            title={`${row.title ?? row.name} ${move}`}
            style={{ background: tint(row.day) }}
            className={`oa-surface block h-full w-full border border-oa-border outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] dark:hover:brightness-110 ${sectorTileClass({ name: row.name, short, move })}`}
          >
            <span data-clip className={part.body}>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-[18px] text-oa-fg">
                <SectorIcon id={row.icon ?? row.id} size={14} />
                <span data-need="name" className={`whitespace-nowrap ${part.name}`}>
                  {row.name}
                </span>
                <span data-need="name" className={`whitespace-nowrap ${part.short}`}>
                  {short}
                </span>
              </span>
              <span data-need="move" className={`oa-mono whitespace-nowrap font-semibold tracking-[-0.01em] tabular-nums text-oa-fg ${part.move}`}>
                {move}
              </span>
            </span>
          </Link>
        );
      }}
    />
  );
}
