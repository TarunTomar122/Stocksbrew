import Link from "next/link";
import * as React from "react";

import { TileLabel, Treemap, tileClass, type TreemapLayout } from "@/components/oa/kit/treemap";
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

/**
 * Short names for the long sectors, as traders say them (owner, Nov 12: every tile names its sector, "Health",
 * "Staples", "Tech", "Industrials", never an icon alone). A tile too narrow for the full name prints this one.
 */
const SHORT: Record<string, string> = {
  "communication services": "Communication",
  "consumer discretionary": "Discretionary",
  "consumer cyclical": "Discretionary",
  "consumer staples": "Staples",
  "consumer defensive": "Staples",
  "information technology": "Tech",
  technology: "Tech",
  "health care": "Health",
  healthcare: "Health",
  "financial services": "Financials",
  "basic materials": "Materials",
};

/** "Health" for "Health care": the trade's short name for a long sector, else the name itself. */
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

/**
 * A map with the page's width to itself, laid out at the narrowest width each is drawn at: a 320 phone, a tablet, the
 * content column beside the sidebar on a 1024 screen, and on a 1280 one (lib/treemap.ts sets each one's height).
 */
export const PAGE_LAYOUTS: TreemapLayout[] = [
  { width: 304, className: "sm:hidden", short: true },
  { width: 592, className: "hidden sm:block lg:hidden" },
  { width: 736, className: "hidden lg:block xl:hidden" },
  { width: 992, className: "hidden xl:block" },
];

function rowHref(row: HeatmapSector): string {
  return row.href ?? (row.slug ? `/sectors/${row.slug}` : "/sectors");
}

/**
 * A true treemap of the sectors (components/oa/kit/treemap.tsx): each tile's area by the size of its move, every tile
 * with its icon, its name (the short one when the full one does not fit) and its move, centred.
 */
export function SectorHeatmap({
  rows,
  layouts = PAGE_LAYOUTS,
  gap = 6,
  label = "Sectors sized by how far they moved today",
}: {
  rows: HeatmapSector[];
  layouts?: readonly TreemapLayout[];
  /** Space between tiles, in CSS pixels. */
  gap?: number;
  label?: string;
}) {
  if (rows.length === 0) return null;
  const wordsOf = (row: HeatmapSector) => ({ full: row.name, short: shortSectorName(row.name), mono: false, move: signedPct(row.day) });
  return (
    <Treemap
      items={rows}
      keyOf={(row) => row.id}
      moveOf={(row) => row.day}
      wordsOf={wordsOf}
      layouts={layouts}
      gap={gap}
      label={label}
      renderTile={(row) => {
        const words = wordsOf(row);
        return (
          <Link
            prefetch={false}
            href={rowHref(row)}
            aria-label={`${row.name}, ${words.move === "·" ? "no move yet" : `${words.move} today`}`}
            title={`${row.title ?? row.name} ${words.move}`}
            style={{ background: tint(row.day) }}
            className={`oa-surface block h-full w-full border border-oa-border outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] dark:hover:brightness-110 ${tileClass(words)}`}
          >
            <TileLabel icon={<SectorIcon id={row.icon ?? row.id} size={14} />} words={words} moveClassName="text-oa-fg" />
          </Link>
        );
      }}
    />
  );
}
