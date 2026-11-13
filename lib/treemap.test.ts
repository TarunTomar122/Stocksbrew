import { describe, expect, it } from "vitest";

import { MAX_SHARE, columnLayout, gridPlan, mapHeight, moveWeights, planTreemap, sliceLayout, squarify, stripLayout, type PlanItem } from "@/lib/treemap";
import { PRICED_H, tileNeed } from "@/lib/treemap-fit-math";

describe("squarify", () => {
  it("fills the rectangle exactly, with areas following the weights", () => {
    const boxes = squarify(
      [
        { key: "A", weight: 6 },
        { key: "B", weight: 6 },
        { key: "C", weight: 4 },
        { key: "D", weight: 3 },
        { key: "E", weight: 2 },
        { key: "F", weight: 2 },
        { key: "G", weight: 1 },
      ],
      600,
      400,
      0,
    );
    const area = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
    expect(area).toBeCloseTo(100 * 100, 3);
    const a = boxes.find((box) => box.key === "A")!;
    const g = boxes.find((box) => box.key === "G")!;
    expect((a.w * a.h) / (g.w * g.h)).toBeCloseTo(6, 3);
    for (const box of boxes) {
      expect(box.x + box.w).toBeLessThanOrEqual(100.0001);
      expect(box.y + box.h).toBeLessThanOrEqual(100.0001);
    }
  });

  it("uses the size of a move, up or down, and gives a flat item a floor", () => {
    const boxes = squarify(
      [
        { key: "UP", weight: 1.1 },
        { key: "DOWN", weight: -1.1 },
        { key: "FLAT", weight: 0 },
      ],
      300,
      100,
    );
    const up = boxes.find((box) => box.key === "UP")!;
    const down = boxes.find((box) => box.key === "DOWN")!;
    const flat = boxes.find((box) => box.key === "FLAT")!;
    expect(up.w * up.h).toBeCloseTo(down.w * down.h, 3);
    expect(flat.w * flat.h).toBeGreaterThan(0);
  });

  it("keeps the floor small, so a 0.04% move is not drawn as big as a 0.4% one", () => {
    const boxes = squarify(
      [
        { key: "BIG", weight: 1.6 },
        { key: "MID", weight: 1.1 },
        { key: "SMALL", weight: 0.4 },
        { key: "TINY", weight: 0.04 },
        { key: "FLAT", weight: 0 },
      ],
      320,
      250,
    );
    const area = (key: string) => {
      const box = boxes.find((item) => item.key === key)!;
      return box.w * box.h;
    };
    expect(area("SMALL") / area("TINY")).toBeGreaterThan(4);
    expect(area("FLAT")).toBeGreaterThan(0);
    expect(area("FLAT") / (100 * 100)).toBeLessThan(0.02);
  });

  it("returns nothing for no items", () => {
    expect(squarify([], 100, 100)).toEqual([]);
  });
});

/** The owner's Nov 12 sector day: Energy +1.79% against moves of 0.38% and under. */
const SECTOR_DAY: Array<[string, number | null]> = [
  ["Energy", 1.79],
  ["Utilities", 0.38],
  ["Materials", -0.38],
  ["Real estate", -0.2],
  ["Health", 0.16],
  ["Communication", 0.12],
  ["Discretionary", 0.1],
  ["Financials", -0.09],
  ["Staples", 0.06],
  ["Tech", 0],
  ["Industrials", -0.02],
];
/** The owner's Nov 12 book: NVDA −5.4% down to CBRS −0.4%. */
const BOOK: Array<[string, number]> = [
  ["NVDA", -5.4],
  ["AVGO", 5.1],
  ["ASTS", -3.6],
  ["SMR", -3.1],
  ["GOOGL", 2.7],
  ["MRVL", -2.6],
  ["TSM", -1.8],
  ["MSFT", 1.5],
  ["AMZN", 1.2],
  ["ORCL", -0.8],
  ["CBRS", -0.4],
];

const sectors = (): PlanItem[] => SECTOR_DAY.map(([name, move]) => ({ key: name, move, need: tileNeed({ name, mono: false, move: "+0.38%" }) }));
const book = (): PlanItem[] => BOOK.map(([ticker, move]) => ({ key: ticker, move, need: tileNeed({ name: ticker, mono: true, move: "−5.4%" }) }));

describe("moveWeights", () => {
  it("compresses the moves: a 1.79% day against 0.1% days is nowhere near most of the map", () => {
    const weights = moveWeights(SECTOR_DAY.map(([, move]) => move));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    expect(weights[0]! / total).toBeLessThanOrEqual(MAX_SHARE + 1e-9);
    // Less compressed than a square root: an 8% day is at least six times a 0.4% one before any floor.
    const [big, small] = moveWeights([8, 0.4], 0, 1);
    expect(big! / small!).toBeGreaterThan(6);
  });

  it("keeps the order: a bigger move never gets a smaller weight, up or down", () => {
    const moves = [3.2, -3.2, 1.1, -0.4, 0.04, 0, null, 12, -0.9];
    const weights = moveWeights(moves);
    const size = (move: number | null) => Math.abs(move ?? 0);
    moves.forEach((a, i) => moves.forEach((b, j) => {
      if (size(a) > size(b)) expect(weights[i]!).toBeGreaterThanOrEqual(weights[j]!);
    }));
    expect(weights[0]).toBeCloseTo(weights[1]!, 9);
  });

  it("caps one huge move's share, and gives a flat or missing move a floor", () => {
    const weights = moveWeights([40, 0.1, 0.1, 0.1, 0, null]);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    expect(weights[0]! / total).toBeLessThanOrEqual(MAX_SHARE + 1e-9);
    expect(Math.min(...weights)).toBeGreaterThan(0);
    // Two items cannot both stay under the cap, but they still differ, by at most three to one.
    const two = moveWeights([9, 1]);
    expect(two[0]! / (two[0]! + two[1]!)).toBeGreaterThan(0.6);
    expect(two[0]! / (two[0]! + two[1]!)).toBeLessThanOrEqual(0.75 + 1e-9);
    expect(moveWeights([0, 0, null])).toEqual([1, 1, 1]);
    expect(moveWeights([])).toEqual([]);
  });
});

describe("mapHeight", () => {
  it("sizes a desktop book of 8 to 12 to about 200-260px, and grows with the count", () => {
    for (const count of [8, 10, 12]) {
      const height = mapHeight(count, 992);
      expect(height).toBeGreaterThanOrEqual(150);
      expect(height).toBeLessThanOrEqual(270);
    }
    expect(mapHeight(20, 992)).toBeGreaterThan(mapHeight(10, 992));
    expect(mapHeight(400, 992)).toBeLessThanOrEqual(Math.round(992 * 0.55));
  });
});

describe("planTreemap", () => {
  const share = (plan: ReturnType<typeof planTreemap>, key: string) => {
    const box = plan.boxes.find((item) => item.key === key)!;
    return (box.w * box.h) / (100 * 100);
  };
  const aspect = (plan: ReturnType<typeof planTreemap>, key: string) => {
    const box = plan.boxes.find((item) => item.key === key)!;
    return ((box.w / 100) * plan.width) / ((box.h / 100) * plan.height);
  };

  for (const width of [304, 344, 592, 736, 992]) {
    it(`gives every item a tile its label fits, with no tall slabs, at ${width}px`, () => {
      for (const items of [sectors(), book()]) {
        const plan = planTreemap(items, width);
        expect(plan.dropped).toEqual([]);
        expect(plan.boxes).toHaveLength(items.length);
        for (const item of items) {
          const box = plan.boxes.find((entry) => entry.key === item.key)!;
          expect((box.w / 100) * plan.width).toBeGreaterThanOrEqual(item.need.w - 0.01);
          expect((box.h / 100) * plan.height).toBeGreaterThanOrEqual(item.need.h - 0.01);
          expect(aspect(plan, item.key)).toBeGreaterThanOrEqual(0.8);
          expect(aspect(plan, item.key)).toBeLessThanOrEqual(width < 500 ? 2.7 : 3);
        }
        const area = plan.boxes.reduce((sum, box) => sum + box.w * box.h, 0);
        expect(area).toBeCloseTo(100 * 100, 3);
      }
    });
  }

  it("keeps the 1.79% sector under 40% of the map and in order with the rest", () => {
    const plan = planTreemap(sectors(), 992);
    expect(share(plan, "Energy")).toBeLessThan(0.4);
    for (const [name, move] of SECTOR_DAY) {
      for (const [other, otherMove] of SECTOR_DAY) {
        if (Math.abs(move ?? 0) > Math.abs(otherMove ?? 0)) expect(share(plan, name)).toBeGreaterThanOrEqual(share(plan, other) - 1e-9);
      }
    }
  });

  it("sizes today's book by its moves at every width: strictly in order, the 8% day at least three times the 0.4% one", () => {
    // The owner's Nov 13 book, priced, as the briefing's money map asks (its 4px gap and the tile's 2px border).
    const today: Array<[string, number, string]> = [
      ["SMR", -8, "$11.20"],
      ["ASTS", -5.8, "$52.10"],
      ["AVGO", 5.5, "$362.40"],
      ["NVDA", -4.4, "$183.10"],
      ["CBRS", -3.2, "$41.30"],
      ["MRVL", -2.6, "$88.20"],
      ["TSM", -1.9, "$290.50"],
      ["GOOGL", 1.8, "$281.00"],
      ["ORCL", -1, "$215.30"],
      ["MSFT", 0.4, "$505.20"],
    ];
    const items: PlanItem[] = today.map(([ticker, move, price]) => {
      const need = tileNeed({ name: ticker, mono: true, move: `${move > 0 ? "+" : "−"}${Math.abs(move).toFixed(1)}%`, price });
      return { key: ticker, move, need: { w: need.w + 6, h: need.h + 6 } };
    });
    for (const width of [304, 482, 592, 653, 736, 992]) {
      const plan = planTreemap(items, width, { keepAll: true });
      expect(plan.dropped).toEqual([]);
      // Strictly in order: a bigger move never gets a smaller tile.
      for (let index = 1; index < today.length; index += 1) {
        expect(share(plan, today[index - 1]![0])).toBeGreaterThanOrEqual(share(plan, today[index]![0]) - 1e-9);
      }
      expect(share(plan, "SMR") / share(plan, "MSFT")).toBeGreaterThanOrEqual(3);
      for (const item of items) {
        const box = plan.boxes.find((entry) => entry.key === item.key)!;
        expect((box.w / 100) * plan.width).toBeGreaterThanOrEqual(item.need.w - 0.01);
        expect((box.h / 100) * plan.height).toBeGreaterThanOrEqual(item.need.h - 0.01);
      }
    }
    // On a desktop the map grows a little rather than make the small moves one size: the 1% and 0.4% days differ,
    // and the 8% day is over five times the 0.4% one (Nov 13, the old square-root map: 14.6% against 8.2%).
    const desk = planTreemap(items, 992, { keepAll: true });
    expect(share(desk, "SMR") / share(desk, "MSFT")).toBeGreaterThan(5);
    expect(share(desk, "ORCL") / share(desk, "MSFT")).toBeGreaterThan(1.2);
    expect(desk.height).toBeLessThanOrEqual(2 * mapHeight(items.length, 992));
  });

  it("ends level with the column beside it: a map given a minHeight raises its floor before it grows", () => {
    for (const width of [482, 653]) {
      const plan = planTreemap(book(), width, { keepAll: true, minHeight: 260 });
      expect(plan.height).toBe(260);
      expect(plan.dropped).toEqual([]);
    }
  });

  it("never doubles a big book's map for one huge day among flat ones", () => {
    const many: PlanItem[] = Array.from({ length: 120 }, (_, index) => ({
      key: `K${String(index).padStart(3, "0")}`,
      move: index === 0 ? 40 : (index % 7) * 0.05,
      need: { w: 80, h: 70 },
    }));
    const plan = planTreemap(many, 992, { keepAll: true });
    expect(plan.boxes).toHaveLength(120);
    // The grid of 120 labels alone is about 2,300px tall at 992 wide; the map stays within a third of that.
    expect(plan.height).toBeLessThan(3100);
  });

  it("makes a desktop book of eleven about 200-260px tall", () => {
    const plan = planTreemap(book(), 992);
    expect(plan.height).toBeGreaterThanOrEqual(200);
    expect(plan.height).toBeLessThanOrEqual(260);
  });

  it("keeps the biggest moves when there are more items than labelled tiles fit, the same way every time", () => {
    const many: PlanItem[] = Array.from({ length: 60 }, (_, index) => ({
      key: `S${String(index).padStart(2, "0")}`,
      move: ((index * 37) % 50) / 10 - 2.5,
      need: tileNeed({ name: "ABCDE", mono: true, move: "−2.5%" }),
    }));
    const plan = planTreemap(many, 344);
    expect(plan.dropped.length).toBeGreaterThan(0);
    expect(plan.boxes.length + plan.dropped.length).toBe(60);
    const kept = new Set(plan.boxes.map((box) => box.key));
    const size = (key: string) => Math.abs(many.find((item) => item.key === key)!.move as number);
    const smallestKept = Math.min(...[...kept].map(size));
    for (const key of plan.dropped) expect(size(key)).toBeLessThanOrEqual(smallestKept);
    expect(planTreemap([...many].reverse(), 344)).toEqual(plan);
  });

  it("keeps every sector in a short card map (at most 340 tall) and on a tablet", () => {
    const card = planTreemap(sectors(), 344, { maxHeight: 340 });
    expect(card.dropped).toEqual([]);
    expect(card.boxes).toHaveLength(SECTOR_DAY.length);
    expect(card.height).toBeLessThanOrEqual(340);
    const tablet = planTreemap(sectors(), 592);
    expect(tablet.dropped).toEqual([]);
    expect(tablet.boxes).toHaveLength(SECTOR_DAY.length);
  });

  it("keeps a phone's sector map compact", () => {
    expect(planTreemap(sectors(), 344).height).toBeLessThanOrEqual(430);
  });

  it("never leaves a holding off a map allowed to grow, even a book of 25 beside Do today", () => {
    const many: PlanItem[] = Array.from({ length: 25 }, (_, index) => ({
      key: `H${String(index).padStart(2, "0")}`,
      move: ((index * 37) % 50) / 10 - 2.5,
      need: tileNeed({ name: "GOOGL", mono: true, move: "−2.5%" }),
    }));
    for (const width of [344, 482, 653, 992]) {
      const plan = planTreemap(many, width, { minHeight: 180, maxHeight: 2400 });
      expect(plan.dropped).toEqual([]);
      expect(plan.boxes).toHaveLength(25);
    }
  });

  it("keeps every holding's price on the narrowest phone (a 320 screen, 304 inside its gutters)", () => {
    const priced = BOOK.map(([ticker, move]) => ({
      key: ticker,
      move,
      // As the kit asks: the label, the 4px gap and the tile's 2px border.
      need: (({ w, h }) => ({ w: w + 6, h: h + 6 }))(tileNeed({ name: ticker, mono: true, move: "−5.4%", price: "$406.10" })),
    }));
    const plan = planTreemap(priced, 304, { keepAll: true });
    expect(plan.dropped).toEqual([]);
    for (const item of priced) {
      const box = plan.boxes.find((entry) => entry.key === item.key)!;
      expect((box.w / 100) * plan.width).toBeGreaterThanOrEqual(item.need.w - 0.01);
      expect((box.h / 100) * plan.height).toBeGreaterThanOrEqual(item.need.h - 0.01);
      expect(item.need.h).toBeGreaterThanOrEqual(PRICED_H);
    }
  });

  it("keeps all 120 holdings of a big book on a 344 phone, every tile big enough for its price", () => {
    const holdings: PlanItem[] = Array.from({ length: 120 }, (_, index) => ({
      key: `H${String(index).padStart(3, "0")}`,
      move: ((index * 37) % 90) / 10 - 4.5,
      // As the kit asks: the label, the money map's 4px gap and the tile's 2px border.
      need: (({ w, h }) => ({ w: w + 6, h: h + 6 }))(tileNeed({ name: "GOOGL", mono: true, move: "−4.5%", price: "$1,234" })),
    }));
    for (const width of [304, 344]) {
      const plan = planTreemap(holdings, width, { keepAll: true });
      expect(plan.dropped).toEqual([]);
      expect(plan.boxes).toHaveLength(120);
      for (const box of plan.boxes) {
        expect((box.w / 100) * plan.width).toBeGreaterThanOrEqual(holdings[0]!.need.w - 0.01);
        expect((box.h / 100) * plan.height).toBeGreaterThanOrEqual(holdings[0]!.need.h - 0.01);
        // What is left inside the gap and border still holds the price line.
        expect((box.h / 100) * plan.height - 6).toBeGreaterThanOrEqual(PRICED_H - 0.01);
      }
    }
  });

  it("never hangs on a zero height", () => {
    expect(planTreemap(book(), 482, { height: 0 }).boxes.length).toBeGreaterThan(0);
  });

  it("takes a set height for a map that fills a card, and still keeps every holding", () => {
    for (const height of [180, 300, 520]) {
      const plan = planTreemap(book(), 482, { height });
      expect(plan.height).toBe(height);
      expect(plan.dropped).toEqual([]);
    }
    expect(planTreemap([], 482).boxes).toEqual([]);
  });
});

describe("sliceLayout and stripLayout", () => {
  const weights = [9, 7, 6, 5, 4, 3, 2, 1.5, 1, 0.6].map((weight, index) => ({ key: `K${index}`, weight }));
  for (const [name, lay] of [
    ["sliceLayout", (w: number, h: number) => sliceLayout(weights, w, h, 1.5, undefined, [0.8, 3])],
    ["stripLayout", (w: number, h: number) => stripLayout(weights, w, h, 1.5, undefined, [0.8, 3])],
    ["stripLayout in columns", (w: number, h: number) => stripLayout(weights, w, h, 1.5, undefined, [0.8, 3], true)],
  ] as const) {
    it(`${name} fills the map exactly, every area by its weight`, () => {
      for (const [w, h] of [[992, 300], [304, 520]] as const) {
        const boxes = lay(w, h);
        expect(boxes).toHaveLength(weights.length);
        const total = weights.reduce((sum, item) => sum + item.weight, 0);
        for (const item of weights) {
          const box = boxes.find((entry) => entry.key === item.key)!;
          expect((box.w * box.h) / (100 * 100)).toBeCloseTo(item.weight / total, 6);
          expect(box.x).toBeGreaterThanOrEqual(-1e-9);
          expect(box.y).toBeGreaterThanOrEqual(-1e-9);
          expect(box.x + box.w).toBeLessThanOrEqual(100 + 1e-6);
          expect(box.y + box.h).toBeLessThanOrEqual(100 + 1e-6);
        }
      }
    });
  }

  it("never draws a NaN or loses an item over zero weights", () => {
    const zeros = [{ key: "A", weight: 3 }, { key: "B", weight: 0 }, { key: "C", weight: 0 }];
    for (const boxes of [sliceLayout(zeros, 400, 300, 1.5), stripLayout(zeros, 400, 300, 1.5), stripLayout(zeros, 400, 300, 1.5, undefined, undefined, true), sliceLayout([{ key: "Z", weight: 0 }, { key: "Y", weight: 0 }], 400, 300, 1.5)]) {
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) for (const value of [box.x, box.y, box.w, box.h]) expect(Number.isFinite(value)).toBe(true);
    }
    expect(stripLayout(zeros, 400, 300, 1.5)).toHaveLength(3);
  });

  it("judges a column's tiles the way up the map is drawn: no tall slabs in columns either", () => {
    // A wide map laid in columns: each column is short and wide, so a tall tile there is a real slab, and costs more.
    const four = [4, 3, 2, 1].map((weight, index) => ({ key: `C${index}`, weight }));
    const boxes = stripLayout(four, 600, 200, 1.5, undefined, [0.8, 3], true);
    for (const box of boxes) {
      const aspect = ((box.w / 100) * 600) / ((box.h / 100) * 200);
      expect(aspect).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it("sliceLayout finds room for every tile's label, the smallest too", () => {
    const needs = new Map(weights.map((item) => [item.key, { w: 76, h: 69 }]));
    const fits = (boxes: ReturnType<typeof squarify>, w: number, h: number) =>
      boxes.every((box) => (box.w / 100) * w >= 75.99 && (box.h / 100) * h >= 68.99);
    expect(fits(sliceLayout(weights, 992, 400, 1.5, needs, [0.8, 3]), 992, 400)).toBe(true);
    expect(sliceLayout([], 100, 100, 1.5)).toEqual([]);
    expect(stripLayout([], 100, 100, 1.5)).toEqual([]);
  });
});

describe("columnLayout", () => {
  it("deals the items into balanced columns and keeps every area exactly by its weight", () => {
    const items = [5, 4, 3, 3, 2, 2, 1].map((weight, index) => ({ key: `K${index}`, weight }));
    const boxes = columnLayout(items, 340, 400, 2);
    expect(new Set(boxes.map((box) => box.x)).size).toBe(2);
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    for (const item of items) {
      const box = boxes.find((entry) => entry.key === item.key)!;
      expect((box.w * box.h) / (100 * 100)).toBeCloseTo(item.weight / total, 9);
      expect(box.x + box.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(100 + 1e-9);
    }
    expect(columnLayout([], 340, 400, 2)).toEqual([]);
  });
});

describe("gridPlan", () => {
  it("gives every item a cell at least its label's size, even with a short last row", () => {
    const items: PlanItem[] = Array.from({ length: 7 }, (_, index) => ({ key: `G${index}`, move: index, need: { w: 100, h: 60 } }));
    const plan = gridPlan(items, 320);
    expect(plan.boxes).toHaveLength(7);
    for (const box of plan.boxes) {
      expect((box.w / 100) * plan.width).toBeGreaterThanOrEqual(100);
      expect((box.h / 100) * plan.height).toBeGreaterThanOrEqual(60);
      expect(box.x + box.w).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
});
