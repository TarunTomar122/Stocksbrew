/**
 * The app's treemaps (owner, Nov 12: "cards need to be the size depending on the percentage change", then "why did u
 * give so much height to some of these and why some are as chips below wtf"):
 *
 * - squarify: a squarified layout (Bruls, Huizing and van Wijk), boxes whose AREA follows each weight, as close to
 *   square as they can be, filling the rectangle with no gaps;
 * - moveWeights: a move's tile size, compressed a little (the move to the power MOVE_EXPONENT) so one big day never
 *   eats the map, with a low floor and a cap, and never out of order (a bigger move never gets a smaller tile);
 * - mapHeight and planTreemap: a map's height from how many tiles it holds and how wide it is, so tiles come out near
 *   square rather than as tall slabs, and every tile big enough for its own label. A map grows taller before its
 *   smallest tiles are raised toward the biggest (owner, Nov 13: "i thought u fixed this to be size dependent on the
 *   change percent"); a map with more items than that keeps its biggest moves.
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

/**
 * How far a `w` x `h` tile is from `target` width over height, a tall tile counting worse than a wide one; past
 * `band` it counts far worse, and under its `need` it can never be chosen.
 */
function shapeCost(w: number, h: number, target: number, need?: { w: number; h: number }, band?: readonly [number, number]): number {
  if (need && (w < need.w - 0.01 || h < need.h - 0.01)) return Number.POSITIVE_INFINITY;
  const aspect = w / h;
  const ratio = aspect / target;
  const cost = ratio >= 1 ? ratio : Math.pow(1 / ratio, 1.6);
  return band && (aspect < band[0] || aspect > band[1]) ? cost + 100 : cost;
}

/**
 * The items, finite, by size, biggest first, every weight at least a millionth of the total, so a zero weight still
 * divides cleanly (its tile is a sliver, never NaN). With no weight at all, every item alike.
 */
function sortedWeights(items: readonly TreemapInput[]): Array<{ key: string; weight: number }> {
  const clean = items.filter((item) => Number.isFinite(item.weight)).map((item) => ({ key: item.key, weight: Math.abs(item.weight) }));
  const total = clean.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return clean.map((item) => ({ key: item.key, weight: 1 })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return clean.map((item) => ({ key: item.key, weight: Math.max(item.weight, total * 1e-6) })).sort((a, b) => b.weight - a.weight);
}

/** The most tiles a strip holds: enough for any map's widest row, and it keeps stripLayout quick on a big book. */
const STRIP_MAX = 16;

/**
 * The same areas in strips, rows across the map (or columns down it, `vertical`), biggest first, each strip as tall
 * as its share and each tile as wide as its share of its strip. Unlike rowLayout, each strip holds as many items as
 * suits them: the breaks are chosen (by dynamic programming over the sorted items) so the worst tile is as close to
 * `target` width over height as it can be, a tall tile counting worse than a wide one, never under its `needs` where
 * the breaks can help it, and inside `band` (width over height) where they can. A map of a few big moves and many
 * small ones gets short strips of big tiles on top and longer strips of small ones under them, all near the target.
 */
export function stripLayout(
  items: readonly TreemapInput[],
  width: number,
  height: number,
  target: number,
  needs?: ReadonlyMap<string, { w: number; h: number }>,
  band?: readonly [number, number],
  vertical = false,
): TreemapBox[] {
  if (width <= 0 || height <= 0) return [];
  const sorted = sortedWeights(items);
  if (sorted.length === 0) return [];
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  const prefix = [0];
  for (const item of sorted) prefix.push(prefix[prefix.length - 1]! + item.weight);
  // Strips run along `across` (the width, or the height in columns) and stack along `down`.
  const across = vertical ? height : width;
  const down = vertical ? width : height;
  // A strip of items i..j-1: how far its worst tile is from the target, judged the way up the map is drawn (a tall tile
  // is tall in columns too), past the band counting far worse.
  const stripCost = (i: number, j: number): number => {
    const sum = prefix[j]! - prefix[i]!;
    const thick = (down * sum) / total;
    let cost = 0;
    for (let k = i; k < j; k += 1) {
      const item = sorted[k]!;
      const along = (across * item.weight) / sum;
      const need = needs?.get(item.key);
      cost = Math.max(cost, vertical ? shapeCost(thick, along, target, need, band) : shapeCost(along, thick, target, need, band));
      if (cost === Number.POSITIVE_INFINITY) return cost;
    }
    return cost;
  };
  const n = sorted.length;
  const best: number[] = [0];
  const from: number[] = [0];
  for (let j = 1; j <= n; j += 1) {
    best[j] = Number.POSITIVE_INFINITY;
    from[j] = j - 1;
    for (let i = Math.max(0, j - STRIP_MAX); i < j; i += 1) {
      // The worst strip decides.
      const cost = Math.max(best[i]!, stripCost(i, j));
      if (cost < best[j]! - 1e-9) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }
  const breaks: number[] = [];
  for (let j = n; j > 0; j = from[j]!) breaks.unshift(j);
  const out: TreemapBox[] = [];
  let start = 0;
  let offset = 0;
  for (const end of breaks) {
    const sum = prefix[end]! - prefix[start]!;
    const thick = (sum / total) * 100;
    let along = 0;
    for (let k = start; k < end; k += 1) {
      const size = (sorted[k]!.weight / sum) * 100;
      const key = sorted[k]!.key;
      out.push(vertical ? { key, x: offset, y: along, w: thick, h: size } : { key, x: along, y: offset, w: size, h: thick });
      along += size;
    }
    offset += thick;
    start = end;
  }
  return out;
}

/** The most items sliceLayout searches every arrangement of; a bigger map is squarified. */
const SLICE_MAX = 12;

/**
 * The same areas sliced as squarify slices them, a strip of the biggest items along one side, then the next strip in
 * what is left, but with every strip's length and side tried (a search, pruned by the best arrangement so far) rather
 * than chosen greedily: the arrangement whose worst tile is closest to `target`, a tall tile counting worse than a
 * wide one, every tile at least its `needs` and inside `band` where any arrangement can manage it. Greedy squarify
 * leaves the smallest tiles whatever room is left; this finds room for them, so a map can keep small moves small.
 * Over SLICE_MAX items it is squarify.
 */
export function sliceLayout(
  items: readonly TreemapInput[],
  width: number,
  height: number,
  target: number,
  needs?: ReadonlyMap<string, { w: number; h: number }>,
  band?: readonly [number, number],
): TreemapBox[] {
  if (width <= 0 || height <= 0) return [];
  const sorted = sortedWeights(items);
  if (sorted.length === 0) return [];
  if (sorted.length > SLICE_MAX) return squarify(sorted, width, height, 0, target, needs);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  const n = sorted.length;
  const areas = sorted.map((item) => (item.weight / total) * width * height);
  const tileCost = (key: string, w: number, h: number): number => shapeCost(w, h, target, needs?.get(key), band);
  type Strip = { end: number; column: boolean };
  let best = Number.POSITIVE_INFINITY;
  let bestPlan: Strip[] | null = null;
  const plan: Strip[] = [];
  const search = (start: number, rect: Rect, worst: number): void => {
    if (start === n) {
      if (worst < best - 1e-9) {
        best = worst;
        bestPlan = plan.slice();
      }
      return;
    }
    // Along the shorter side first (as squarify does), so a good arrangement is found early and prunes the rest.
    for (const column of rect.w >= rect.h ? [true, false] : [false, true]) {
      const side = column ? rect.h : rect.w;
      const room = column ? rect.w : rect.h;
      let sum = 0;
      for (let end = start + 1; end <= n; end += 1) {
        sum += areas[end - 1]!;
        const thick = sum / side;
        const last = end === n;
        // A strip before the last must leave room; the last one fills what is left.
        if (!last && thick >= room - 0.5) break;
        let cost = worst;
        for (let k = start; k < end && cost < best; k += 1) {
          const along = areas[k]! / thick;
          cost = Math.max(cost, column ? tileCost(sorted[k]!.key, thick, along) : tileCost(sorted[k]!.key, along, thick));
        }
        if (cost >= best) continue;
        plan.push({ end, column });
        search(end, column ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h } : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick }, cost);
        plan.pop();
      }
    }
  };
  search(0, { x: 0, y: 0, w: width, h: height }, 0);
  const chosen = bestPlan as Strip[] | null;
  if (!chosen) return squarify(sorted, width, height, 0, target, needs);
  const out: TreemapBox[] = [];
  let rect: Rect = { x: 0, y: 0, w: width, h: height };
  let start = 0;
  for (const { end, column } of chosen) {
    const sum = areas.slice(start, end).reduce((a, b) => a + b, 0);
    const thick = end === n ? (column ? rect.w : rect.h) : sum / (column ? rect.h : rect.w);
    let along = column ? rect.y : rect.x;
    for (let k = start; k < end; k += 1) {
      const size = (areas[k]! / sum) * (column ? rect.h : rect.w);
      out.push(column ? { key: sorted[k]!.key, x: rect.x, y: along, w: thick, h: size } : { key: sorted[k]!.key, x: along, y: rect.y, w: size, h: thick });
      along += size;
    }
    rect = column ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h } : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick };
    start = end;
  }
  return out.map((box) => ({ key: box.key, x: (box.x / width) * 100, y: (box.y / height) * 100, w: (box.w / width) * 100, h: (box.h / height) * 100 }));
}

/* ── a move's tile size ─────────────────────────────────────────────────── */

/** The most of a map one tile may take, however big its move against the rest (owner, Nov 12: Energy took 55%). */
export const MAX_SHARE = 0.38;
/** The smallest tile's weight against the biggest, before a layout raises it to fit a label. */
export const BASE_FLOOR = 0.1;
/**
 * How much a move's size is compressed into its tile's area. The square root (0.5) made an 8% day only about four
 * times a 0.4% one's tile, and the floors flattened the rest (owner, Nov 13); at 0.75 the 8% tile is about seven times
 * the 0.4% one before the floor, and the cap still keeps one huge day from eating the map.
 */
export const MOVE_EXPONENT = 0.75;

/**
 * Each move's weight: its size, up or down, to the power MOVE_EXPONENT, so a 1.79% day against a 0.1% one is a tile
 * about eight times the area, not eighteen. Every weight is at least `floor` times the biggest (a flat or missing move still gets
 * a tile), and no tile takes more than `maxShare` of the total (a map of two or three a little more). Order is kept:
 * a bigger move never gets a smaller weight; the floor and the cap only make neighbours equal.
 */
export function moveWeights(moves: readonly (number | null | undefined)[], floor = BASE_FLOOR, maxShare = MAX_SHARE): number[] {
  const roots = moves.map((move) => (typeof move === "number" && Number.isFinite(move) ? Math.pow(Math.abs(move), MOVE_EXPONENT) : 0));
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

/**
 * The tile shapes a map aims to stay within, width over height: no tall slabs, no slivers. A tile a little wider than
 * 2.3 still reads well (its label is wider than tall), and allowing it lets small moves keep small tiles (Nov 13).
 */
const TILE_ASPECT = [0.8, 3] as const;
/** A phone's: two columns of named tiles, compact. */
const PHONE_ASPECT = [0.8, 2.7] as const;
/** The shapes a map of a set height settles for before its tiles stop differing by their moves. */
const LOOSE_ASPECT = [0.65, 3.2] as const;

/**
 * The floors a well-shaped map uses, lowest first, each with what it costs in map heights: a map takes the lowest floor
 * unless a higher one saves it more than the difference in height. A map 30% taller keeps a floor of 0.1 rather than
 * 0.15; one 60% taller, rather than 0.2 (owner, Nov 13: "i thought u fixed this to be size dependent on the change
 * percent": a map a little taller whose small moves differ beats a short one whose small moves are all one size). Past
 * the last (0.56) the tiles come out nearly alike and the map stops showing which moved most, so a map that would
 * need more keeps fewer, bigger moves instead.
 */
const SHAPELY_STEPS: ReadonlyArray<{ floor: number; cost: number }> = [
  { floor: BASE_FLOOR, cost: 0 },
  { floor: 0.15, cost: 0.3 },
  { floor: 0.2, cost: 0.6 },
  { floor: 0.3, cost: 0.95 },
  { floor: 0.42, cost: 1.35 },
  { floor: 0.56, cost: 1.8 },
];
const SHAPELY_FLOORS = SHAPELY_STEPS.map((step) => step.floor);
/** The floors tried, lowest first: the smallest tiles grow, toward all tiles alike, before an item is left off. */
const FLOORS = [...SHAPELY_FLOORS, 0.72, 0.86, 1];
/**
 * How far past its count's height a map that keeps every item may grow for a lower floor (a holdings map). A big book
 * (past BIG_BOOK holdings) is already tall; it grows only a little, so one huge day among many flat ones never doubles
 * a page-long map.
 */
const GROW_FIRST = 2;
const GROW_BIG_BOOK = 1.25;
const BIG_BOOK = 24;
/** How far past its count's height any other map may grow for a lower floor, within its shape's limit. */
const GROW_PAGE = 1.8;

/**
 * Lays a map out at `width`: its height from how many tiles it holds (mapHeight) unless `height` is given (a map that
 * fills a card), each tile's area by its compressed move (moveWeights), every tile at least its label's `need` and
 * between TILE_ASPECT's shapes. Where the smallest tiles are too small, the map grows and the floor rises (smaller
 * moves catch up, never pass a bigger one), each as far as it is worth (SHAPELY_STEPS: a map grows before its floor
 * rises), up to the shape's height limit; then looser shapes are allowed; only then is the smallest move left off and
 * the map tried again. The items are taken biggest move first, then by key, so the same items always give the same map.
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
  const layout = (kept: readonly PlanItem[], height: number, shapely: boolean, floors?: readonly number[]): TreemapBox[] | null => {
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
    for (const floor of floors ?? (shapely ? SHAPELY_FLOORS : FLOORS)) {
      const weights = moveWeights(kept.map((item) => item.move), floor);
      const weighted = kept.map((item, index) => ({ key: item.key, weight: weights[index]! }));
      // Squarified first; then the same areas in rows, then in columns: about as many as tiles of the aimed shape
      // would make, one more and one fewer.
      const rows = Math.max(1, Math.round(Math.sqrt((kept.length * height * shape.aspect) / width)));
      const columns = Math.max(1, Math.round(Math.sqrt((kept.length * width) / (height * shape.aspect))));
      const band = shapely ? aspectRange : LOOSE_ASPECT;
      const candidates: Array<() => TreemapBox[]> = [
        () => squarify(weighted, width, height, 0, shape.aspect, needs),
        // Past SLICE_MAX sliceLayout is squarify again: not worth a second run.
        ...(kept.length <= SLICE_MAX ? [() => sliceLayout(weighted, width, height, shape.aspect, needs, band)] : []),
        () => stripLayout(weighted, width, height, shape.aspect, needs, band),
        () => stripLayout(weighted, width, height, shape.aspect, needs, band, true),
      ];
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
  // Well-shaped tiles at the lowest floor worth its height: every height from `first` to `limit` and every well-shaped
  // floor, scored by the height over `first` plus the floor's cost (SHAPELY_STEPS), the lowest score kept (the first found on a
  // tie, so the shorter map). Heights run upward and floors lowest first, so the search stops as soon as nothing left
  // can score lower.
  const growFirst = (kept: readonly PlanItem[], first: number, limit: number): { height: number; boxes: TreemapBox[] } | null => {
    const tall: number[] = [first];
    for (let next = first * 1.08; next < limit * 1.0001; next *= 1.08) tall.push(Math.round(next));
    if (tall[tall.length - 1]! < Math.round(limit)) tall.push(Math.round(limit));
    let best: { height: number; boxes: TreemapBox[]; score: number } | null = null;
    for (const height of tall) {
      const grow = height / first;
      if (best && grow >= best.score) break;
      for (const step of SHAPELY_STEPS) {
        const score = grow + step.cost;
        if (best && score >= best.score) break;
        const boxes = layout(kept, height, true, [step.floor]);
        if (boxes) {
          best = { height, boxes, score };
          break;
        }
      }
    }
    return best;
  };
  // A map that may never leave an item off (a person's holdings) grows as tall as it takes, with no limit: well-shaped
  // tiles at each height first, then looser shapes, and at the very last every tile alike in a plain grid. (A map of
  // a set height cannot grow, so `keepAll` does nothing there.)
  if (options.keepAll && options.height === undefined && ordered.length > 0) {
    const start = Math.max(base, mapHeight(ordered.length, width, { ...shape, maxHeight: Number.POSITIVE_INFINITY }));
    // Up to twice its count's height (or the shape's limit, if taller) for a lower floor, then as tall as it takes. A
    // map given a `minHeight` (one drawn beside a column it should end level with) does not grow for a floor: its
    // floor rises first, and it grows only when no well-shaped floor fits at all.
    const big = ordered.length > BIG_BOOK;
    const limit = options.minHeight !== undefined ? start : big ? start * GROW_BIG_BOOK : Math.max(start * GROW_FIRST, shape.maxHeight);
    const grown = growFirst(ordered, start, limit);
    if (grown) return { width, height: grown.height, boxes: grown.boxes, dropped: [] };
    // growFirst tried every well-shaped floor up to `limit`: well-shaped tiles go on from there, looser ones from the
    // start.
    const from = (first: number) => {
      const list: number[] = [];
      for (let next = first, step = 0; step < 25; step += 1, next = Math.round(next * 1.15)) list.push(next);
      return list;
    };
    for (const [shapely, heights] of [[true, from(Math.round(limit))], [false, from(start)]] as const) {
      for (const height of heights) {
        const boxes = layout(ordered, height, shapely);
        if (boxes) return { width, height, boxes, dropped: [] };
      }
    }
    return gridPlan(ordered, width);
  }
  // A map that can grow tries every item in well-shaped tiles first, at the floor worth its height, up to the shape's
  // height limit (growFirst).
  if (options.height === undefined && ordered.length > 0) {
    const grown = growFirst(ordered, base, Math.max(base, Math.min(shape.maxHeight, base * GROW_PAGE)));
    if (grown) return { width, height: grown.height, boxes: grown.boxes, dropped: [] };
  }
  // Then every item in well-shaped tiles (no slabs, no slivers) at each height, the map growing; then in the looser
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
