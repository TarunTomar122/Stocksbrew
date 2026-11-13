import Link from "next/link";
import * as React from "react";

import { TILE_BORDER, TileLabel, Treemap, tileClass, type TreemapLayout, type TreemapTileSize } from "@/components/oa/kit/treemap";
import { SectorIcon } from "@/components/oa/sector-icon";
import { StockLogo } from "@/components/stock-logo";
import type { SectorMover } from "@/lib/sector-day-shared";
import { CHIP_GAP, chipWidth, chipsThatFit } from "@/lib/treemap-fit-math";

/**
 * The day's sectors as a heatmap (owner, Nov 12: "this would better off being a heatmap with icons and names"): one
 * tile per sector with its icon, name and move, tinted green or red by how far it moved, each opening its sector.
 * Each tile sized by its move in a true treemap. Server-rendered, no hooks. Market today and the /markets sector card
 * both draw this one map. On Market today a tile also shows the sector's biggest movers of the day (owner, Nov 13: "can
 * we put some stock logos and stuff here"), as many as its size holds whole.
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
  /** The sector's biggest movers of the same day as `day`, biggest first; a tile shows as many as fit (none on a small one). */
  movers?: readonly SectorMover[];
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

/** A mover's move on its chip: "+4.2%", "−11%", one decimal under 10%. */
function chipPct(value: number): string {
  const size = Math.abs(value);
  const text = size >= 9.95 ? size.toFixed(0) : size.toFixed(1);
  return `${value > 0 ? "+" : value < 0 ? MINUS : ""}${text}%`;
}

/** "$41.30", "$1,234". */
function chipPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const digits = value >= 1000 ? 0 : 2;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** A row of mover chips, centred under the label, each chip a small pill of the card colour (CHIP_H tall). */
const CHIP_CLASS =
  "oa-mono flex max-w-full flex-wrap justify-center text-[11px] font-medium leading-4 tabular-nums text-oa-fg [&>span]:inline-flex [&>span]:h-[18px] [&>span]:items-center [&>span]:gap-[3px] [&>span]:whitespace-nowrap [&>span]:rounded [&>span]:bg-[color-mix(in_srgb,var(--oa-card)_78%,transparent)] [&>span]:px-1";

/**
 * The movers that fit whole under a tile's label at the size its layout drew it (the tile's box, less its gap and
 * border: the size container its label's type steps read), as logo, ticker, price and move chips. Every chip carries
 * its price (owner rule 4: a stock's move never shows without its price), so a mover with no price is left out rather
 * than shown bare, and the chips that fit are counted at their full width: a chip is whole or not there. Plain spans:
 * the tile is one link to its sector.
 */
function MoverChips({ movers, size, gap, move }: { movers: readonly SectorMover[]; size: TreemapTileSize; gap: number; move: string }) {
  const inner = { w: size.w - gap - TILE_BORDER, h: size.h - gap - TILE_BORDER };
  const priced = movers.filter((mover) => chipPrice(mover.price) !== "");
  const shown = priced.slice(0, chipsThatFit(inner, { move }, priced.map((mover) => chipWidth(mover.ticker, chipPct(mover.pct), chipPrice(mover.price)))));
  if (shown.length === 0) return null;
  // The chips' look is set once on the row (CHIP_CLASS), so each chip's markup is only its logo, ticker, price and move.
  return (
    <span className={CHIP_CLASS} style={{ gap: CHIP_GAP, marginTop: CHIP_GAP - 2 }}>
      {shown.map((mover) => (
        <span key={mover.ticker} title={`${mover.ticker} ${chipPrice(mover.price)} ${chipPct(mover.pct)}`}>
          <StockLogo ticker={mover.ticker} size={14} />
          {mover.ticker}
          <span className="font-normal text-oa-muted-fg">{chipPrice(mover.price)}</span>
          <span className={mover.pct > 0 ? "text-signal-bullish" : mover.pct < 0 ? "text-signal-bearish" : ""}>{chipPct(mover.pct)}</span>
        </span>
      ))}
    </span>
  );
}

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
      renderTile={(row, size) => {
        const words = wordsOf(row);
        const priced = (row.movers ?? []).filter((mover) => chipPrice(mover.price) !== "");
        const led = priced.length ? `, biggest movers ${priced.map((mover) => `${mover.ticker} ${chipPrice(mover.price)} ${chipPct(mover.pct)}`).join(", ")}` : "";
        return (
          <Link
            prefetch={false}
            href={rowHref(row)}
            aria-label={`${row.name}, ${words.move === "·" ? "no move yet" : `${words.move} today`}${led}`}
            title={`${row.title ?? row.name} ${words.move}`}
            style={{ background: tint(row.day) }}
            className={`oa-surface block h-full w-full border border-oa-border outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] dark:hover:brightness-110 ${tileClass(words)}`}
          >
            <TileLabel icon={<SectorIcon id={row.icon ?? row.id} size={14} />} words={words} moveClassName="text-oa-fg">
              {row.movers?.length ? <MoverChips movers={row.movers} size={size} gap={gap} move={words.move} /> : null}
            </TileLabel>
          </Link>
        );
      }}
    />
  );
}
