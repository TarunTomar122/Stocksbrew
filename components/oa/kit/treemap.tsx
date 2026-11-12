import * as React from "react";

import { TreemapLabelled } from "@/components/oa/kit/treemap-labels";
import type { TreemapChip } from "@/components/oa/kit/treemap-chips";
import { squarify, type TreemapBox } from "@/lib/treemap";

export { TreemapChips, type TreemapChip } from "@/components/oa/kit/treemap-chips";

/**
 * A true treemap (owner, Nov 12: "cards need to be the size depending on the percentage change. Apply that across all
 * the pages"): each tile's AREA follows its weight, laid out by lib/treemap.ts so the tiles fill the whole box with no
 * gaps. HTML boxes placed by percent, so their text is real pixels at every width.
 *
 * One layout per screen shape from the same items (a wide screen's proportions and a phone's), each shown by its own
 * `className`, so neither is squashed. Each tile decides what it shows from its rendered size (treemap-fit.ts and its
 * stylesheet); with `labels`, the tiles that hide their name or numbers are listed under the map (treemap-labels.tsx).
 */

export type TreemapLayout = {
  /** The layout's proportions, in the units `renderTile` is told (roughly CSS pixels at that screen width). */
  width: number;
  height: number;
  /** Which screens show this layout ("hidden sm:block", "sm:hidden"), plus any height classes when `fill`. */
  className?: string;
  /**
   * Fill the parent's height (a flex child beside taller cards) instead of keeping the layout's proportions. The tiles'
   * areas still follow their weights; only their shape stretches. Give `className` a min height.
   */
  fill?: boolean;
};

export type TreemapTileSize = {
  /** The tile's size in its layout's units, for a first guess only: the tile itself decides from its rendered size. */
  w: number;
  h: number;
  box: TreemapBox;
};

export function Treemap<T>({
  items,
  keyOf,
  weightOf,
  layouts,
  renderTile,
  gap = 3,
  floorShare,
  label,
  className = "",
  labels,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Any signed number; the size of it (a −2% move as big as a +2% one). A missing value gets the smallest tile. */
  weightOf: (item: T) => number | null | undefined;
  layouts: readonly TreemapLayout[];
  renderTile: (item: T, size: TreemapTileSize) => React.ReactNode;
  /** Space between tiles, in CSS pixels. */
  gap?: number;
  /** The smallest share of the area a tile gets, so a flat move is still a tile you can read (lib/treemap.ts). */
  floorShare?: number;
  /** What the map shows, for a screen reader. */
  label?: string;
  className?: string;
  /**
   * The labels under the map: a chip per item, and which items the first layout is expected to leave without all
   * their words (`guess`, from its layout-unit size). The page then lists exactly the tiles it finds hiding words.
   */
  labels?: {
    chip: (item: T) => TreemapChip;
    guess: (item: T, size: TreemapTileSize) => boolean;
    dense?: boolean;
    className?: string;
    /** The wrapper around the map and its labels: "flex flex-1 flex-col" when a layout fills a card. */
    rootClassName?: string;
  };
}) {
  if (items.length === 0) return null;
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const weights = [...byKey].map(([key, item]) => {
    const weight = weightOf(item);
    return { key, weight: typeof weight === "number" && Number.isFinite(weight) ? weight : 0 };
  });
  let initial: string[] = [];
  const maps = layouts.map((layout, index) => {
    const boxes = squarify(weights, layout.width, layout.height, floorShare);
    const placed = boxes.flatMap((box) => {
      const item = byKey.get(box.key);
      return item === undefined ? [] : [{ box, item, size: { w: (box.w / 100) * layout.width, h: (box.h / 100) * layout.height, box } }];
    });
    if (index === 0 && labels) initial = placed.filter((tile) => labels.guess(tile.item, tile.size)).map((tile) => tile.box.key);
    return (
      <ul
        key={index}
        aria-label={label}
        className={`relative w-full ${layout.className ?? ""} ${className}`}
        style={layout.fill ? undefined : { aspectRatio: `${layout.width} / ${layout.height}` }}
      >
        {placed.map(({ box, item, size }) => (
          <li
            key={box.key}
            data-tile={box.key}
            className="absolute"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, padding: gap / 2 }}
          >
            {renderTile(item, size)}
          </li>
        ))}
      </ul>
    );
  });
  if (!labels) return <>{maps}</>;
  return (
    <TreemapLabelled chips={items.map(labels.chip)} initial={initial} dense={labels.dense} chipsClassName={labels.className} className={labels.rootClassName}>
      {maps}
    </TreemapLabelled>
  );
}
