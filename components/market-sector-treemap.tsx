import Link from "next/link";

import type { MarketTile } from "@/lib/market-tiles";
import type { SectorSlugMap } from "@/lib/sector";
import { resolveSectorId, sectorSlug } from "@/lib/sector";
import {
  layoutChangeTreemap,
  TREEMAP_EXTREME_PCT,
  treemapCellStyle,
} from "@/lib/sector-treemap-layout";

type TreemapNode = {
  id: string;
  label: string;
  changePct: number;
  href: string | null;
  mocked?: boolean;
};

function sectorHref(tile: MarketTile, slugMap: SectorSlugMap): string | null {
  const fromMap =
    resolveSectorId(tile.label, slugMap) ??
    resolveSectorId(tile.id, slugMap);
  const slug = fromMap || sectorSlug(tile.label) || sectorSlug(tile.id);
  if (!slug) return null;
  return `/sector/${encodeURIComponent(slug)}`;
}

type Props = {
  tiles: MarketTile[];
  sectorSlugMap: SectorSlugMap;
  /** Tighter padding + shorter treemap when nested inside another card */
  embedded?: boolean;
};

export function MarketSectorTreemap({ tiles, sectorSlugMap, embedded }: Props) {
  const nodes: TreemapNode[] = tiles.map((tile) => ({
    id: tile.id,
    label: tile.label,
    changePct: tile.changePct,
    href: sectorHref(tile, sectorSlugMap),
    mocked: tile.mocked,
  }));

  const layoutTiles = layoutChangeTreemap(nodes);

  if (layoutTiles.length === 0) {
    return (
      <p
        className={`text-sm text-on-surface-variant ${embedded ? "py-4" : "px-2 py-6"}`}
      >
        No sector performance data yet.
      </p>
    );
  }

  return (
    <div className={embedded ? "pb-1" : "px-2 pb-4"}>
      <div
        className={`relative rounded-lg border border-outline-variant/30 bg-surface-container-low/30 ${
          embedded ? "mx-0 w-full min-h-[220px] lg:min-h-[260px]" : "mx-2 w-[calc(100%-1rem)] min-h-[300px]"
        }`}
      >
        {layoutTiles.map((t) => {
          const style = treemapCellStyle(t.node.changePct);
          const arrow = t.node.changePct >= 0 ? "▲" : "▼";
          const showPct = t.w > 8 && t.h > 10;
          const showLabel = t.w > 10 && t.h > 8;
          const className = `absolute flex flex-col justify-between overflow-hidden p-1.5 transition-transform hover:-translate-y-0.5 ${
            t.node.mocked ? "ring-1 ring-inset ring-outline-variant" : ""
          }`;
          const styleProps = {
            left: `${t.x}%`,
            top: `${t.y}%`,
            width: `${t.w}%`,
            height: `${t.h}%`,
            background: style.background,
            color: style.color,
            outline: "1px solid color-mix(in srgb, var(--surface-container-lowest) 60%, transparent)",
          } as const;

          const body = (
            <>
              {showLabel ? (
                <span className="line-clamp-2 text-left text-[10px] font-bold leading-tight tracking-tight">
                  {t.node.label}
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
            </>
          );

          const title = `${t.node.label} · ${t.node.changePct >= 0 ? "+" : ""}${t.node.changePct.toFixed(2)}%`;

          if (!t.node.href) {
            return (
              <div
                key={t.node.id}
                className={className}
                style={styleProps}
                title={title}
              >
                {body}
              </div>
            );
          }

          return (
            <Link
              key={t.node.id}
              href={t.node.href}
              className={className}
              style={styleProps}
              title={title}
            >
              {body}
            </Link>
          );
        })}
      </div>

      <div
        className={`mt-2 flex items-center justify-between text-[10px] text-on-surface-variant ${
          embedded ? "mx-0 px-0" : "mx-2 mt-3 px-2"
        }`}
      >
        <span>
          {nodes.length} sector{nodes.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-3"
              style={{
                background: "color-mix(in srgb, var(--signal-bearish) 80%, transparent)",
              }}
            />
            −{TREEMAP_EXTREME_PCT}%+
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-3"
              style={{
                background: "color-mix(in srgb, var(--signal-bullish) 80%, transparent)",
              }}
            />
            +{TREEMAP_EXTREME_PCT}%+
          </span>
        </div>
      </div>
    </div>
  );
}
