/**
 * Squarified treemap layout (Bruls et al. 2000) + shared cell coloring.
 * Used by sector stock treemap (per-ticker) and market sector treemap (home).
 */

export type TreemapTile<T extends { changePct: number }> = {
  x: number;
  y: number;
  w: number;
  h: number;
  node: T;
};

type Node<T extends { changePct: number }> = T & { area: number };

function worstAspect<T extends { changePct: number }>(row: Node<T>[], side: number): number {
  if (row.length === 0) return Infinity;
  const sum = row.reduce((s, n) => s + n.area, 0);
  if (sum === 0) return Infinity;
  const thickness = sum / side;
  let worst = 0;
  for (const item of row) {
    const other = item.area / thickness;
    const ratio = Math.max(other / thickness, thickness / other);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

/** Layout nodes by |changePct| area into a width×height percentage box. */
export function layoutChangeTreemap<T extends { changePct: number }>(
  items: T[],
  width = 100,
  height = 100,
): TreemapTile<T>[] {
  if (items.length === 0) return [];
  const totalWeight = items.reduce((s, n) => s + Math.max(0.15, Math.abs(n.changePct)), 0);
  if (totalWeight === 0) return [];
  const scale = (width * height) / totalWeight;
  const scaled: Node<T>[] = items
    .map((n) => ({ ...n, area: Math.max(0.15, Math.abs(n.changePct)) * scale }))
    .sort((a, b) => b.area - a.area);

  const tiles: TreemapTile<T>[] = [];
  let rect = { x: 0, y: 0, w: width, h: height };
  let queue = [...scaled];

  while (queue.length > 0) {
    const shortSide = Math.min(rect.w, rect.h);
    let row: Node<T>[] = [];
    let bestRatio = Infinity;

    for (const item of queue) {
      const testRow = [...row, item];
      const ratio = worstAspect(testRow, shortSide);
      if (row.length > 0 && ratio > bestRatio) break;
      row = testRow;
      bestRatio = ratio;
    }

    const rowArea = row.reduce((s, n) => s + n.area, 0);
    const thickness = rowArea / shortSide;

    if (rect.w >= rect.h) {
      let y = rect.y;
      for (const item of row) {
        const h = item.area / thickness;
        tiles.push({ x: rect.x, y, w: thickness, h, node: item });
        y += h;
      }
      rect = { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h };
    } else {
      let x = rect.x;
      for (const item of row) {
        const w = item.area / thickness;
        tiles.push({ x, y: rect.y, w, h: thickness, node: item });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness };
    }

    queue = queue.slice(row.length);
  }

  return tiles;
}

export const TREEMAP_EXTREME_PCT = 3;

export function treemapCellStyle(changePct: number): { background: string; color: string } {
  const intensity = Math.min(1, Math.abs(changePct) / TREEMAP_EXTREME_PCT);
  const alpha = 0.15 + intensity * 0.75;
  const base = changePct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return {
    background: `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`,
    color: intensity > 0.55 ? "var(--surface-container-lowest)" : "var(--on-surface)",
  };
}
