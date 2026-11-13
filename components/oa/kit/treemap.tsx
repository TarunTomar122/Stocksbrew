import * as React from "react";

import { part, tileClass, type TileWords } from "@/components/oa/kit/treemap-fit";
import { planTreemap, type MapShape, type TreemapBox } from "@/lib/treemap";
import { tileNeed } from "@/lib/treemap-fit-math";

/**
 * A true treemap (owner, Nov 12: "cards need to be the size depending on the percentage change", then "why did u give
 * so much height to some of these and why some are as chips below wtf"): every item is a tile, its area by its move,
 * a little compressed (lib/treemap.ts moveWeights), in a map as tall as its tile count needs at that width (taller
 * where that keeps small moves small), so the tiles come out near square or a little wide. Every tile prints its icon and name, its move, and its price where
 * it has room (TileLabel); a map with more items than tiles that size holds keeps its biggest moves.
 *
 * One layout per screen width, each laid out at the narrowest width it is drawn at and shown by its own `className`,
 * so a tile only ever grows from the size its label was checked at. Server rendered, no measuring, no layout shift.
 * The map is `oa-type-fixed`: the page's small-text bump (app/globals.css) leaves its labels at the sizes measured here.
 */

/** A tile's 1px border on both sides: its container queries measure inside it. */
export const TILE_BORDER = 2;

export type TreemapLayout = {
  /** The narrowest width this layout is drawn at, in CSS pixels. */
  width: number;
  /** Which screens show this layout ("hidden sm:block", "sm:hidden"), plus any height classes when `fill`. */
  className?: string;
  /** A set height (a map that fills a card beside others), instead of the height its tile count asks for. */
  height?: number;
  /**
   * Fill the parent's height (a flex child beside taller cards), never shorter than the layout's height. The tiles'
   * areas still follow their moves; only their shape stretches.
   */
  fill?: boolean;
  /** Print every tile's short name, never the full one (a phone's map: "Staples", not "Consumer staples"). */
  short?: boolean;
  /** Never leave an item off (a person's holdings): the map grows as tall as that takes. Not with a set `height`. */
  keepAll?: boolean;
  /** How much taller than laid out the map may grow on a wider screen, before its tiles only grow wider. */
  grow?: number;
  shape?: MapShape;
};

export type TreemapTileSize = {
  /** The tile's size in its layout's units (CSS pixels at the layout's width). */
  w: number;
  h: number;
  box: TreemapBox;
};

/** What a tile prints: its icon, its name (full and short) or ticker, its move, and its price. */
export type TreemapWords = TileWords & { move: string };

export function Treemap<T>({
  items,
  keyOf,
  moveOf,
  wordsOf,
  layouts,
  renderTile,
  gap = 3,
  label,
  className = "",
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Any signed number; the size of it sizes the tile (a −2% move as big as a +2% one). Missing: the smallest tile. */
  moveOf: (item: T) => number | null | undefined;
  /** The tile's words, for the size its label needs. */
  wordsOf: (item: T) => TreemapWords;
  layouts: readonly TreemapLayout[];
  renderTile: (item: T, size: TreemapTileSize) => React.ReactNode;
  /** Space between tiles, in CSS pixels. */
  gap?: number;
  /** What the map shows, for a screen reader. */
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const plans = [...byKey].map(([key, item]) => {
    const words = wordsOf(item);
    // A tile with a price keeps it: its need counts the price line (owner rule 4).
    const need = tileNeed({ name: words.short, mono: words.mono, move: words.move, price: words.price });
    // The gap is inside each tile's box, and every kit tile has a 1px border its size container does not count, so the
    // label needs both.
    return { key, move: moveOf(item), need: { w: need.w + gap + TILE_BORDER, h: need.h + gap + TILE_BORDER } };
  });
  return (
    <>
      {layouts.map((layout, index) => {
        const plan = planTreemap(plans, layout.width, { ...layout.shape, height: layout.height, keepAll: layout.keepAll });
        const style: React.CSSProperties = layout.fill
          ? { minHeight: plan.height }
          : { aspectRatio: `${plan.width} / ${plan.height}`, maxHeight: Math.round(plan.height * (layout.grow ?? 1.2)) };
        return (
          <ul key={index} aria-label={label} className={`oa-type-fixed relative w-full ${layout.fill ? "h-full" : ""} ${layout.short ? part.shortOnly : ""} ${layout.className ?? ""} ${className}`} style={style}>
            {plan.boxes.map((box) => {
              const item = byKey.get(box.key);
              if (item === undefined) return null;
              const size = { w: (box.w / 100) * plan.width, h: (box.h / 100) * plan.height, box };
              return (
                <li
                  key={box.key}
                  data-tile={box.key}
                  className="absolute"
                  style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, padding: gap / 2 }}
                >
                  {renderTile(item, size)}
                </li>
              );
            })}
          </ul>
        );
      })}
    </>
  );
}

/**
 * A tile's label, centred: the icon or logo with the name or ticker on one line (the full name where it fits, else the
 * short one), the move as the big figure, and the price small under it where the tile has room. Put it inside a box
 * carrying `tileClass(words)` (the size container its stylesheet reads).
 */
export function TileLabel({
  icon,
  words,
  moveClassName = "",
  priceClassName = "text-oa-muted-fg",
  children,
}: {
  icon: React.ReactNode;
  words: TreemapWords;
  moveClassName?: string;
  priceClassName?: string;
  /** Anything under the label, inside the same centred body (a sector's movers); the caller sizes it to fit. */
  children?: React.ReactNode;
}) {
  return (
    <span className={part.body}>
      <span className={`${part.head} text-oa-fg ${words.mono ? "oa-mono" : ""}`}>
        <span className={part.icon}>{icon}</span>
        {words.full !== words.short ? (
          <>
            <span className={part.full}>{words.full}</span>
            <span className={part.short}>{words.short}</span>
          </>
        ) : (
          <span>{words.full}</span>
        )}
      </span>
      {words.move ? <span className={`oa-mono tabular-nums ${part.move} ${moveClassName}`}>{words.move}</span> : null}
      {words.price ? <span className={`oa-mono tabular-nums ${part.price} ${priceClassName}`}>{words.price}</span> : null}
      {children}
    </span>
  );
}

export { tileClass };
