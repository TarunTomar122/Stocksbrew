/**
 * The app's treemaps (owner, Nov 12: "cards need to be the size depending on the percentage change", then "why did u
 * give so much height to some of these and why some are as chips below wtf"):
 *
 * - squarify: a squarified layout (Bruls, Huizing and van Wijk), boxes whose AREA follows each weight, as close to
 *   square as they can be, filling the rectangle with no gaps;
 * - moveWeights: a move's tile size, compressed (the square root of the move) so one big day never eats the map, with
 *   a floor and a cap, and never out of order (a bigger move never gets a smaller tile);
 * - mapHeight and planTreemap: a map's height from how many tiles it holds and how wide it is, so tiles come out near
 *   square rather than as tall slabs, and every tile big enough for its own label; a map with more items than that
 *   keeps its biggest moves.
 *
 * Pure and deterministic, so a server component can place tiles by percent without measuring anything.
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
 * The worst tile in a row, by how far its width over height is from `target`, a tall tile counting worse than a wide
 * one (owner, Nov 12: "why did u give so much height to some of these"). `vertical` is a column: the row's items are
 * stacked along a side of length `side`, each as wide as the column.
 */
function worstShape(row: ReadonlyArray<{ area: number; need?: { w: number; h: number } }>, side: number, vertical: boolean, target: number): number {
  const sum = row.reduce((a, b) => a + b.area, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const thick = sum / side;
  let cost = 0;
  for (const { area, need } of row) {
    const along = area / thick;
    const w = vertical ? thick : along;
    const h = vertical ? along : thick;
    // A tile its label does not fit is the worst row of all, so the row stops before it squeezes one.
    if (need && (w < need.w - 0.01 || h < need.h - 0.01)) return Infinity;
    const ratio = w / h / target;
    cost = Math.max(cost, ratio >= 1 ? ratio : Math.pow(1 / ratio, 1.6));
  }
  return cost;
}

/**
 * Lays `items` out in a `width` x `height` rectangle (any units; the aspect matters). Weights are made positive with a
 * small floor so a flat item still gets a box to tap. The result is in percent of the rectangle, biggest first. With
 * `target`, rows are chosen for tiles near that width over height, wide over tall, instead of plain squareness, and
 * never squeeze a tile under its `needs` (its label's width and height, in the rectangle's units) when they can help it.
 */
export function squarify(
  items: readonly TreemapInput[],
  width: number,
  height: number,
  floorShare = 0.01,
  target?: number,
  needs?: ReadonlyMap<string, { w: number; h: number }>,
): TreemapBox[] {
  const clean = items.filter((item) => Number.isFinite(item.weight)).map((item) => ({ key: item.key, weight: Math.abs(item.weight) }));
  if (clean.length === 0 || width <= 0 || height <= 0) return [];
  const total = clean.reduce((sum, item) => sum + item.weight, 0);
  // A flat item still gets a sliver (`floorShare` of the moves' total), kept small so a 0.04% move is not drawn as big
  // as a 0.4% one (council, Nov 12). A tile too small for its figure drops the words, never grows to fit them.
  const floor = total > 0 ? total * floorShare : 1;
  const weighted = clean.map((item) => ({ key: item.key, weight: Math.max(item.weight, floor) })).sort((a, b) => b.weight - a.weight);
  const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
  const scale = (width * height) / weightSum;
  const areas = weighted.map((item) => ({ key: item.key, area: item.weight * scale, need: needs?.get(item.key) }));

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

  const cost = (row: typeof areas, r: Rect) =>
    target ? worstShape(row, r.w >= r.h ? r.h : r.w, r.w >= r.h, target) : worst(row.map((item) => item.area), Math.min(r.w, r.h));
  for (const item of areas) {
    const next = [...row, item];
    if (row.length === 0 || cost(next, rect) <= cost(row, rect)) {
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

/**
 * The same areas in `columns` columns: biggest first, each item into the lightest column so far that has fewer than
 * its share of the items, each column as wide as its share of the total and each tile as tall as its share of its
 * column, so every area still follows its weight exactly. A narrow map's odd last tile never ends up alone across the
 * whole width this way.
 */
export function columnLayout(items: readonly TreemapInput[], width: number, height: number, columns: number): TreemapBox[] {
  const clean = items.filter((item) => Number.isFinite(item.weight)).map((item) => ({ key: item.key, weight: Math.abs(item.weight) }));
  if (clean.length === 0 || width <= 0 || height <= 0) return [];
  const sorted = [...clean].sort((a, b) => b.weight - a.weight);
  const count = Math.max(1, Math.min(Math.floor(columns), sorted.length));
  const cols: Array<{ items: typeof sorted; sum: number }> = Array.from({ length: count }, () => ({ items: [], sum: 0 }));
  // Into the lightest column that still has room for its share of the items, so no column ends up two tall tiles.
  const most = Math.ceil(sorted.length / count);
  for (const item of sorted) {
    const lightest = cols.filter((col) => col.items.length < most).reduce((best, col) => (col.sum < best.sum ? col : best));
    lightest.items.push(item);
    lightest.sum += item.weight;
  }
  const total = cols.reduce((sum, col) => sum + col.sum, 0);
  const out: TreemapBox[] = [];
  let x = 0;
  for (const col of cols) {
    const w = total > 0 ? (col.sum / total) * 100 : 100 / count;
    let y = 0;
    for (const item of col.items) {
      const h = col.sum > 0 ? (item.weight / col.sum) * 100 : 100 / col.items.length;
      out.push({ key: item.key, x, y, w, h });
      y += h;
    }
    x += w;
  }
  return out;
}

/** The same areas in `rows` rows, each as tall as its share and each tile as wide as its share of its row. */
export function rowLayout(items: readonly TreemapInput[], width: number, height: number, rows: number): TreemapBox[] {
  return columnLayout(items, height, width, rows).map((box) => ({ key: box.key, x: box.y, y: box.x, w: box.h, h: box.w }));
}

/* ── a move's tile size ─────────────────────────────────────────────────── */

/** The most of a map one tile may take, however big its move against the rest (owner, Nov 12: Energy took 55%). */
export const MAX_SHARE = 0.38;
/** The smallest tile's weight against the biggest, before a layout raises it to fit a label. */
export const BASE_FLOOR = 0.2;

/**
 * Each move's weight: the square root of its size, up or down, so a 1.79% day against a 0.1% one is a tile about four
 * times the area, not eighteen. Every weight is at least `floor` times the biggest (a flat or missing move still gets
 * a tile), and no tile takes more than `maxShare` of the total (a map of two or three a little more). Order is kept:
 * a bigger move never gets a smaller weight; the floor and the cap only make neighbours equal.
 */
export function moveWeights(moves: readonly (number | null | undefined)[], floor = BASE_FLOOR, maxShare = MAX_SHARE): number[] {
  const roots = moves.map((move) => (typeof move === "number" && Number.isFinite(move) ? Math.sqrt(Math.abs(move)) : 0));
  if (roots.length === 0) return [];
  const top = Math.max(...roots);
  if (top <= 0) return roots.map(() => 1);
  const floored = roots.map((root) => Math.max(root, top * Math.min(Math.max(floor, 0), 1)));
  // The cap: the k biggest share one value c, with c / (k·c + rest) = cap, for the smallest k that leaves the next
  // weight at or under c. A map of two or three is allowed more, so its tiles can still differ.
  const cap = roots.length <= 1 ? 1 : Math.max(maxShare, Math.min(0.75, 1.5 / roots.length));
  const sorted = [...floored].sort((a, b) => b - a);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (sorted[0]! / total <= cap + 1e-9) return floored;
  let rest = total;
  for (let k = 1; k <= sorted.length; k += 1) {
    rest -= sorted[k - 1]!;
    const c = (cap * rest) / (1 - k * cap);
    const next = sorted[k];
    if (k * cap >= 1 || next === undefined) return floored.map(() => 1);
    if (next <= c) return floored.map((value) => Math.min(value, c));
  }
  return floored;
}

/* ── a map's height and plan ────────────────────────────────────────────── */

/**
 * Every item alike, in as many columns as the widest label allows and as tall as the tallest label needs: the plan a
 * map that may not leave an item off falls back to, which always fits (a label wider than the whole map aside).
 */
export function gridPlan(items: readonly PlanItem[], width: number): TreemapPlan {
  const needW = Math.max(...items.map((item) => item.need.w));
  const needH = Math.max(...items.map((item) => item.need.h));
  const columns = Math.max(1, Math.min(items.length, Math.floor(width / Math.max(needW, 1))));
  const rows = Math.ceil(items.length / columns);
  const height = Math.max(1, rows * needH);
  // Equal cells, row by row: every one as wide as the map allows and as tall as the tallest label needs.
  const w = 100 / columns;
  const h = 100 / rows;
  const boxes = items.map((item, index) => ({ key: item.key, x: (index % columns) * w, y: Math.floor(index / columns) * h, w, h }));
  return { width, height, boxes, dropped: [] };
}

export type MapShape = {
  /** The tile width the map aims for, in the layout's units; by default about a sixth of a wide map. */
  tile?: number;
  /** The tile's width over its height the map aims for: a little wider than square. */
  aspect?: number;
  /** The map's height range, in the layout's units. */
  minHeight?: number;
  maxHeight?: number;
};

/** The shape a map aims for at `width`: a phone's tiles about a third of the width, a wide map's about a sixth. */
function shapeFor(width: number, shape: MapShape = {}): Required<MapShape> {
  const phone = width < 500;
  return {
    tile: shape.tile ?? Math.min(170, Math.max(104, width / 5.8)),
    aspect: shape.aspect ?? (phone ? 1.45 : 1.5),
    minHeight: shape.minHeight ?? (phone ? 150 : 140),
    maxHeight: shape.maxHeight ?? Math.round(phone ? width * 1.9 : width * 0.55),
  };
}

/**
 * How tall a map of `count` tiles is at `width`: the area of `count` tiles of the aimed shape, spread over the width,
 * within the shape's height range. A book of 11 at 992 wide is about 240 tall; on a 344 phone, about 300.
 */
export function mapHeight(count: number, width: number, shape: MapShape = {}): number {
  const { tile, aspect, minHeight, maxHeight } = shapeFor(width, shape);
  const height = (Math.max(count, 1) * tile * (tile / aspect)) / Math.max(width, 1);
  return Math.round(Math.min(maxHeight, Math.max(minHeight, height)));
}

export type PlanItem = {
  key: string;
  /** The move that sizes the tile, signed or not; null or missing gets the smallest tile. */
  move: number | null | undefined;
  /** The smallest width and height the tile's label fits in, in the layout's units (lib/treemap-fit-math.ts). */
  need: { w: number; h: number };
};

export type TreemapPlan = {
  width: number;
  height: number;
  /** The tiles, in percent of the map, biggest first. */
  boxes: TreemapBox[];
  /** The keys left off, smallest moves: only when the map could not hold every item at a size its label fits. */
  dropped: string[];
};

/** The tile shapes a map aims to stay within, width over height: no tall slabs, no slivers. */
const TILE_ASPECT = [0.8, 2.3] as const;
/** A phone's: two columns of named tiles, compact. */
const PHONE_ASPECT = [0.8, 2.7] as const;
/** The shapes a map of a set height settles for before its tiles stop differing by their moves. */
const LOOSE_ASPECT = [0.65, 3.2] as const;

/** The floors tried, lowest first: the smallest tiles grow, toward all tiles alike, before an item is left off. */
const FLOORS = [BASE_FLOOR, 0.3, 0.42, 0.56, 0.72, 0.86, 1];
/**
 * The highest floor a well-shaped map uses: past it the tiles come out nearly alike and the map stops showing which
 * moved most, so a map that would need more keeps fewer, bigger moves instead.
 */
const SHAPELY_FLOOR = 0.56;

/**
 * Lays a map out at `width`: its height from how many tiles it holds (mapHeight) unless `height` is given (a map that
 * fills a card), each tile's area by its compressed move (moveWeights), every tile at least its label's `need` and
 * between TILE_ASPECT's shapes. Where the smallest tiles are too small, the floor rises (smaller moves catch up, never
 * pass a bigger one); then the map grows, up to the shape's height limit; then looser shapes are allowed; only then is
 * the smallest move left off and the map tried again. The items are taken biggest move first, then by key, so the same items always give the same map.
 */
export function planTreemap(items: readonly PlanItem[], width: number, options: MapShape & { height?: number; keepAll?: boolean } = {}): TreemapPlan {
  const size = (move: PlanItem["move"]) => (typeof move === "number" && Number.isFinite(move) ? Math.abs(move) : -1);
  const ordered = [...items].sort((a, b) => size(b.move) - size(a.move) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const shape = shapeFor(width, options);
  // A phone's two columns of named tiles come out wide; it allows a little wider, so its map stays short.
  const aspectRange = width < 500 ? PHONE_ASPECT : TILE_ASPECT;
  // The heights tried: the one the count asks for, then taller, up to the shape's limit, before an item is left off.
  // A map that fills a card has the one height it is given.
  const base = Math.max(1, options.height ?? mapHeight(ordered.length, width, shape));
  const heights = [base];
  if (options.height === undefined) for (let next = base * 1.15; next < shape.maxHeight * 1.0001; next *= 1.15) heights.push(Math.round(next));
  if (options.height === undefined && heights[heights.length - 1]! < shape.maxHeight) heights.push(shape.maxHeight);
  const layout = (kept: readonly PlanItem[], height: number, shapely: boolean): TreemapBox[] | null => {
    // Not even the tiles' combined needs fit: no floor can help.
    if (kept.reduce((sum, item) => sum + item.need.w * item.need.h, 0) > width * height) return null;
    const byKey = new Map(kept.map((item) => [item.key, item]));
    const needs = new Map(kept.map((item) => [item.key, item.need]));
    const fits = (laid: readonly TreemapBox[]) =>
      laid.every((box) => {
        const need = byKey.get(box.key)!.need;
        const w = (box.w / 100) * width;
        const h = (box.h / 100) * height;
        return w >= need.w - 0.01 && h >= need.h - 0.01 && (!shapely || (w / h >= aspectRange[0] && w / h <= aspectRange[1]));
      });
    const within = (laid: readonly TreemapBox[], [low, high]: readonly [number, number]) =>
      laid.every((box) => {
        const aspect = ((box.w / 100) * width) / ((box.h / 100) * height);
        return aspect >= low && aspect <= high;
      });
    // How far the worst tile is from the aimed shape, a tall one counting worse (as squarify weighs a row).
    const misshape = (laid: readonly TreemapBox[]) =>
      Math.max(
        ...laid.map((box) => {
          const ratio = ((box.w / 100) * width) / ((box.h / 100) * height) / shape.aspect;
          return ratio >= 1 ? ratio : Math.pow(1 / ratio, 1.6);
        }),
      );
    let best: { boxes: TreemapBox[]; cost: number } | null = null;
    // A well-shaped map still shows the moves: its smallest tile stays well under its biggest (SHAPELY_FLOOR).
    for (const floor of shapely ? FLOORS.filter((value) => value <= SHAPELY_FLOOR) : FLOORS) {
      const weights = moveWeights(kept.map((item) => item.move), floor);
      const weighted = kept.map((item, index) => ({ key: item.key, weight: weights[index]! }));
      // Squarified first; then the same areas in rows, then in columns: about as many as tiles of the aimed shape
      // would make, one more and one fewer.
      const rows = Math.max(1, Math.round(Math.sqrt((kept.length * height * shape.aspect) / width)));
      const columns = Math.max(1, Math.round(Math.sqrt((kept.length * width) / (height * shape.aspect))));
      const candidates: Array<() => TreemapBox[]> = [() => squarify(weighted, width, height, 0, shape.aspect, needs)];
      for (const count of [rows, rows + 1, rows - 1]) if (count >= 1 && count <= kept.length) candidates.push(() => rowLayout(weighted, width, height, count));
      for (const count of [columns, columns + 1, columns - 1]) if (count >= 1 && count <= kept.length) candidates.push(() => columnLayout(weighted, width, height, count));
      let atFloor: { boxes: TreemapBox[]; cost: number } | null = null;
      for (const candidate of candidates) {
        const laid = candidate();
        if (!fits(laid)) continue;
        // Well shaped: the first that fits, at the lowest floor, so the tiles differ most by their moves.
        if (shapely) return laid;
        const cost = misshape(laid);
        if (!atFloor || cost < atFloor.cost - 1e-9) atFloor = { boxes: laid, cost };
      }
      // Otherwise the best shaped at the lowest floor that keeps every tile within the looser shapes, else the best
      // shaped of all.
      if (atFloor && within(atFloor.boxes, LOOSE_ASPECT)) return atFloor.boxes;
      if (atFloor && (!best || atFloor.cost < best.cost - 1e-9)) best = atFloor;
    }
    return best?.boxes ?? null;
  };
  // A map that may never leave an item off (a person's holdings) grows as tall as it takes, with no limit: well-shaped
  // tiles at each height first, then looser shapes, and at the very last every tile alike in a plain grid. (A map of
  // a set height cannot grow, so `keepAll` does nothing there.)
  if (options.keepAll && options.height === undefined && ordered.length > 0) {
    const tall: number[] = [];
    const start = Math.max(base, mapHeight(ordered.length, width, { ...shape, maxHeight: Number.POSITIVE_INFINITY }));
    for (let next = start, step = 0; step < 25; step += 1, next = Math.round(next * 1.15)) tall.push(next);
    for (const shapely of [true, false]) {
      for (const height of tall) {
        const boxes = layout(ordered, height, shapely);
        if (boxes) return { width, height, boxes, dropped: [] };
      }
    }
    return gridPlan(ordered, width);
  }
  // Every item first: in well-shaped tiles (no slabs, no slivers) at each height, the map growing; then in the looser
  // shapes at each height. Only when neither fits is the smallest move left off.
  for (let count = ordered.length; count >= 1; count -= 1) {
    const kept = ordered.slice(0, count);
    for (const shapely of [true, false]) {
      for (const height of heights) {
        const boxes = layout(kept, height, shapely);
        if (boxes) return { width, height, boxes, dropped: ordered.slice(count).map((item) => item.key) };
      }
    }
  }
  // Not even the biggest move alone fits its label: it still gets the whole map.
  const first = ordered.slice(0, 1);
  return {
    width,
    height: base,
    boxes: first.length ? squarify([{ key: first[0]!.key, weight: 1 }], width, base, 0) : [],
    dropped: ordered.slice(1).map((item) => item.key),
  };
}
