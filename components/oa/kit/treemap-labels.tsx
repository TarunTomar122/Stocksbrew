"use client";

import * as React from "react";

import { TreemapChips, type TreemapChip } from "@/components/oa/kit/treemap-chips";

/**
 * A map and the labels under it for every tile that is not showing all of its words (council, Nov 12: "when a tile
 * hides its name or its numbers, the chip list must list it"). The tiles hide their own parts with container queries
 * (treemap-fit.module.css), so only the rendered page knows which ones did: after layout, and again whenever the map
 * resizes, this looks at each visible tile (`data-tile`) and lists it when any of its needs (`data-need`) has no
 * visible element. Before that first look, the server's own estimate (`initial`) is shown, so the labels do not pop in.
 */
/** Half a pixel of rounding before a part counts as cut. */
const SLACK = 0.5;

/**
 * Is this part fully readable: drawn at all (no `display: none` on it or above it), not overflowing its own box, and
 * not reaching past the tile's edges, where the tile's `overflow: hidden` would cut it.
 */
function readable(part: HTMLElement, bounds: DOMRect): boolean {
  const rects = part.getClientRects();
  if (rects.length === 0) return false;
  if (part.clientWidth > 0 && part.scrollWidth > part.clientWidth + 1) return false;
  if (part.clientHeight > 0 && part.scrollHeight > part.clientHeight + 1) return false;
  const box = part.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  return box.left >= bounds.left - SLACK && box.right <= bounds.right + SLACK && box.top >= bounds.top - SLACK && box.bottom <= bounds.bottom + SLACK;
}

/** The keys of the visible tiles that are hiding or cutting any of their needs (a need is met by any one readable part). */
function unreadTiles(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const tile of root.querySelectorAll<HTMLElement>("[data-tile]")) {
    // A tile in a layout this screen does not show (display: none above it) has no boxes.
    if (tile.getClientRects().length === 0) continue;
    // The box that cuts the words: the tile's own `data-clip` inside (its padded, overflow-hidden body), else the tile.
    const bounds = (tile.querySelector<HTMLElement>("[data-clip]") ?? tile).getBoundingClientRect();
    const needs = new Map<string, boolean>();
    for (const part of tile.querySelectorAll<HTMLElement>("[data-need]")) {
      const need = part.dataset.need!;
      needs.set(need, (needs.get(need) ?? false) || readable(part, bounds));
    }
    if ([...needs.values()].some((met) => !met)) found.push(tile.dataset.tile!);
  }
  return found;
}

function sameKeys(current: readonly string[], next: readonly string[]): readonly string[] {
  return current.length === next.length && current.every((key, index) => key === next[index]) ? current : next;
}

export function TreemapLabelled({
  chips,
  initial,
  dense = false,
  chipsClassName = "",
  className = "",
  children,
}: {
  /** The wrapper's classes: "flex flex-1 flex-col" for a map that fills a card. */
  className?: string;
  /** One chip per tile that could need one, keyed like the tiles' `data-tile`. */
  chips: readonly TreemapChip[];
  /** The keys the server expects to need a label, shown until the page has measured. */
  initial: readonly string[];
  dense?: boolean;
  chipsClassName?: string;
  children: React.ReactNode;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const [keys, setKeys] = React.useState<readonly string[]>(initial);

  // Measured again whenever the tiles change (new data, another period: `chips` and `initial` are new then), not only
  // when the wrapper resizes; every tile is observed too, so a tile that changes size alone is caught.
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setKeys((current) => sameKeys(current, unreadTiles(el))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const tile of el.querySelectorAll<HTMLElement>("[data-tile]")) observer.observe(tile);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [chips, initial]);

  const byKey = new Map(chips.map((chip) => [chip.key, chip]));
  const shown = keys.map((key) => byKey.get(key)).filter((chip): chip is TreemapChip => Boolean(chip));
  return (
    <div ref={root} className={className}>
      {children}
      <TreemapChips chips={shown} dense={dense} className={chipsClassName} />
    </div>
  );
}
