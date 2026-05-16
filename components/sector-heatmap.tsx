import Link from "next/link";
import type { MarketTile } from "@/lib/market-tiles";

type Props = {
  tiles: MarketTile[];
  sectorSlugMap?: Record<string, string>;
  highlightLabel?: string; // label of the stock's sector - gets a ring
};

/**
 * Saturate the fill based on how big the move is. ±3% is our "extreme" cap
 * because sector moves beyond that on a single session are rare and we don't
 * want the whole grid blasting neon when the index gaps up 1% and everything
 * goes with it.
 */
const EXTREME_PCT = 3;

function cellStyle(changePct: number): { background: string; color: string } {
  const intensity = Math.min(1, Math.abs(changePct) / EXTREME_PCT);
  // Ease the ramp so small moves don't wash out.
  const alpha = 0.12 + intensity * 0.78;
  if (changePct >= 0) {
    return {
      background: `color-mix(in srgb, var(--signal-bullish) ${Math.round(alpha * 100)}%, transparent)`,
      color: intensity > 0.5 ? "var(--surface-container-lowest)" : "var(--on-surface)",
    };
  }
  return {
    background: `color-mix(in srgb, var(--signal-bearish) ${Math.round(alpha * 100)}%, transparent)`,
    color: intensity > 0.5 ? "var(--surface-container-lowest)" : "var(--on-surface)",
  };
}

export function SectorHeatmap({ tiles, sectorSlugMap = {}, highlightLabel }: Props) {
  const hl = highlightLabel?.trim().toLowerCase();
  const sectors = tiles
    .filter((t) => t.kind === "sector")
    .sort((a, b) => b.changePct - a.changePct);

  if (sectors.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3">
        <h3 className="text-[14px] font-semibold text-on-surface">
          Sector heatmap
        </h3>
        <p className="text-[11px] text-on-surface-variant leading-snug">
          Color shows today's move; deeper = bigger. Best for spotting rotation at a glance.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {sectors.map((tile) => {
          const style = cellStyle(tile.changePct);
          const arrow = tile.changePct >= 0 ? "▲" : "▼";
          const slug = sectorSlugMap[tile.id] || sectorSlugMap[tile.label];
          const isHighlighted = hl
            ? tile.label.toLowerCase().includes(hl) || hl.includes(tile.label.toLowerCase())
            : false;
          const inner = (
            <div
              className={`relative aspect-[4/3] p-3 flex flex-col justify-between overflow-hidden transition-transform hover:-translate-y-0.5 ${isHighlighted ? "ring-2 ring-primary ring-offset-1" : ""}`}
              style={style}
            >
              <span className="text-[11px] font-bold leading-tight line-clamp-2">
                {tile.label}
              </span>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] font-bold tracking-[0.12em] opacity-80">
                  {arrow}
                </span>
                <span className="text-[16px] font-bold tabular-nums">
                  {tile.changePct >= 0 ? "+" : ""}
                  {tile.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          );
          return slug ? (
            <Link key={tile.id} href={`/sector/${slug}`} className="block">
              {inner}
            </Link>
          ) : (
            <div key={tile.id}>{inner}</div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 text-[10px] text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3" style={{ background: "color-mix(in srgb, var(--signal-bearish) 85%, transparent)" }} />
          −{EXTREME_PCT}%+
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3" style={{ background: "color-mix(in srgb, var(--signal-bearish) 25%, transparent)" }} />
          flat
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3" style={{ background: "color-mix(in srgb, var(--signal-bullish) 25%, transparent)" }} />
          flat
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3" style={{ background: "color-mix(in srgb, var(--signal-bullish) 85%, transparent)" }} />
          +{EXTREME_PCT}%+
        </span>
      </div>
    </section>
  );
}
