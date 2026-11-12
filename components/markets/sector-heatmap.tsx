import Link from "next/link";
import * as React from "react";

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

// Written out whole so Tailwind finds every class.
const SPAN = ["", "col-span-1", "col-span-2", "col-span-3", "col-span-4"];
const SM_SPAN = ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3", "sm:col-span-4"];
const LG_SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4"];

/** How many columns the last tile spans so its row is full. */
function lastSpan(count: number, cols: number): number {
  const rest = count % cols;
  return rest === 0 ? 1 : cols - rest + 1;
}

/** The last tile's span classes at each width (2, 3 and 4 columns). */
export function heatmapLastSpan(count: number): string {
  return [SPAN[lastSpan(count, 2)], SM_SPAN[lastSpan(count, 3)], LG_SPAN[lastSpan(count, 4)]].filter(Boolean).join(" ");
}

export function SectorHeatmap({ rows }: { rows: HeatmapSector[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row, index) => (
        <li key={row.id} className={index === rows.length - 1 ? heatmapLastSpan(rows.length) : ""}>
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

/* ── the icons: simple line drawings, one per sector fund ─────────────────── */

const ICON_PATHS: Record<string, React.ReactNode> = {
  // Technology: a chip.
  xlk: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  // Financials: a bank.
  xlf: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  // Energy: a lightning bolt.
  xle: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  // Health care: a cross.
  xlv: <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" />,
  // Industrials: a factory.
  xli: <path d="M3 20V10l5 3V10l5 3V6h4l1 14H3zM3 20h18" />,
  // Consumer discretionary: a shopping bag.
  xly: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  // Consumer staples: a basket.
  xlp: <path d="M3 10h18l-2 9H5l-2-9zM8 10l3-6M16 10l-3-6M9 13v3M15 13v3" />,
  // Utilities: a light bulb.
  xlu: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  // Materials: a cube.
  xlb: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  // Real estate: a house.
  xlre: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  // Communication services: a speech bubble.
  xlc: <path d="M4 5h16v11H9l-5 4V5z" />,
};

function SectorIcon({ id }: { id: string }) {
  const paths = ICON_PATHS[id];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-oa-fg opacity-80"
    >
      {paths}
    </svg>
  );
}
