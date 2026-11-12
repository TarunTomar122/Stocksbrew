/**
 * A squarified treemap layout (Bruls, Huizing and van Wijk): boxes whose AREA follows each item's weight, laid out
 * in rows and columns that keep the boxes as close to square as possible, filling the whole rectangle with no gaps.
 * Pure and deterministic, so a server component can place tiles by percent without measuring anything.
 * Owner, Nov 12: "this again is not looking like a true heat map; cards need to be the size depending on the
 * percentage change. Apply that across all the pages."
 */

export type TreemapInput = { key: string; weight: number };
/** A box in percent of the container: left, top, width and height, each 0 to 100. */
export type TreemapBox = { key: string; x: number; y: number; w: number; h: number };

type Rect = { x: number; y: number; w: number; h: number };

/** The worst aspect ratio in a row of areas laid along a side of length `side`. */
function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * Lays `items` out in a `width` x `height` rectangle (any units; the aspect matters). Weights are made positive with a
 * small floor so a flat item still gets a box to tap. The result is in percent of the rectangle, biggest first.
 */
export function squarify(items: readonly TreemapInput[], width: number, height: number, floorShare = 0.01): TreemapBox[] {
  const clean = items.filter((item) => Number.isFinite(item.weight)).map((item) => ({ key: item.key, weight: Math.abs(item.weight) }));
  if (clean.length === 0 || width <= 0 || height <= 0) return [];
  const total = clean.reduce((sum, item) => sum + item.weight, 0);
  // A flat item still gets a sliver (`floorShare` of the moves' total), kept small so a 0.04% move is not drawn as big
  // as a 0.4% one (council, Nov 12). A tile too small for its figure drops the words, never grows to fit them.
  const floor = total > 0 ? total * floorShare : 1;
  const weighted = clean.map((item) => ({ key: item.key, weight: Math.max(item.weight, floor) })).sort((a, b) => b.weight - a.weight);
  const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
  const scale = (width * height) / weightSum;
  const areas = weighted.map((item) => ({ key: item.key, area: item.weight * scale }));

  const out: TreemapBox[] = [];
  let rect: Rect = { x: 0, y: 0, w: width, h: height };
  let row: typeof areas = [];

  const layRow = (rowItems: typeof areas, r: Rect): Rect => {
    const sum = rowItems.reduce((a, b) => a + b.area, 0);
    if (r.w >= r.h) {
      // A column on the left, as tall as the rectangle.
      const colW = sum / r.h;
      let y = r.y;
      for (const item of rowItems) {
        const h = item.area / colW;
        out.push({ key: item.key, x: r.x, y, w: colW, h });
        y += h;
      }
      return { x: r.x + colW, y: r.y, w: r.w - colW, h: r.h };
    }
    // A row on top, as wide as the rectangle.
    const rowH = sum / r.w;
    let x = r.x;
    for (const item of rowItems) {
      const w = item.area / rowH;
      out.push({ key: item.key, x, y: r.y, w, h: rowH });
      x += w;
    }
    return { x: r.x, y: r.y + rowH, w: r.w, h: r.h - rowH };
  };

  for (const item of areas) {
    const side = Math.min(rect.w, rect.h);
    const next = [...row, item];
    if (row.length === 0 || worst(next.map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) {
      row = next;
    } else {
      rect = layRow(row, rect);
      row = [item];
    }
  }
  if (row.length) layRow(row, rect);

  return out.map((box) => ({
    key: box.key,
    x: (box.x / width) * 100,
    y: (box.y / height) * 100,
    w: (box.w / width) * 100,
    h: (box.h / height) * 100,
  }));
}
