import Link from "next/link";
import * as React from "react";

import { SectorIcon } from "@/components/oa/sector-icon";

/**
 * The day's sectors as a heatmap (owner, Nov 12: "this would better off being a heatmap with icons and names"): one
 * tile per sector with its icon, name and move, tinted green or red by how far it moved, each opening its sector.
 * Equal tiles, best first, and the last tile spans what its row leaves so the grid has no holes: two across on a
 * phone, three on a tablet, four on a wide screen. Server-rendered, no hooks.
 */

export type HeatmapSector = { id: string; name: string; slug: string; day: number };

const MINUS = "−";

/** Short names for the long sectors, as traders say them. */
const SHORT: Record<string, string> = {
  "communication services": "Communication",
  "consumer discretionary": "Discretionary",
  "consumer staples": "Staples",
  "information technology": "Tech",
};

/** "+1.32%", "−0.40%", "0.00%". */
function signedPct(value: number): string {
  const rounded = Number(value.toFixed(2));
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(2)}%`;
}

/**
 * The tile's background: the app's up or down colour mixed into the card colour, stronger for a bigger move (a 3%
 * day or more is the strongest). Mixed with the card colour rather than drawn see-through, so the text keeps its
 * contrast in light and dark mode.
 */
function tint(day: number): string {
  const strength = Math.min(Math.abs(day) / 3, 1);
  if (Math.abs(day) < 0.005) return "var(--oa-card)";
  const share = Math.round(8 + strength * 30);
  return `color-mix(in srgb, var(${day > 0 ? "--signal-bullish" : "--signal-bearish"}) ${share}%, var(--oa-card))`;
}

export function SectorHeatmap({ rows }: { rows: HeatmapSector[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            prefetch={false}
            href={row.slug ? `/sectors/${row.slug}` : "/sectors"}
            aria-label={`${row.name}, ${signedPct(row.day)} today`}
            style={{ background: tint(row.day) }}
            className="oa-surface flex h-full min-h-[5.5rem] flex-col justify-between gap-2 border border-oa-border px-3 py-2.5 outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] dark:hover:brightness-110"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-[18px] text-oa-fg">
              <SectorIcon id={row.id} />
              {/* A phone's half-width tile has no room for "Communication services": the trade's short name, whole. */}
              <span className="min-w-0 truncate sm:hidden">{SHORT[row.name.toLowerCase()] ?? row.name}</span>
              <span className="hidden min-w-0 truncate sm:inline">{row.name}</span>
            </span>
            <span className="oa-mono text-[22px] font-semibold leading-7 tracking-[-0.01em] tabular-nums text-oa-fg">{signedPct(row.day)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
