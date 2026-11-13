import { describe, expect, it } from "vitest";

import { changeTitle, foldClass, foldOf, recordRows } from "./parts";

describe("the basket card grid", () => {
  it("shows whole rows only: about eight cards, rounded down to full rows, every card needing attention kept", () => {
    for (const total of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const attention of [0, 1, 2, 4, 7]) {
        if (attention > total) continue;
        const fold = foldOf(total, attention);
        const perRow = { two: 2, three: fold.cols };
        for (const [width, count] of [
          ["two", fold.two],
          ["three", fold.three],
        ] as const) {
          expect(
            count,
            `${total}/${attention}/${width}`,
          ).toBeGreaterThanOrEqual(attention);
          // Every row ends full, unless nothing is folded away and the count cannot be split evenly.
          if (count < total)
            expect(
              count % perRow[width],
              `${total}/${attention}/${width}`,
            ).toBe(0);
        }
        if (total > 8)
          expect(Math.min(fold.two, fold.three)).toBeLessThanOrEqual(
            Math.max(6, attention + 2),
          );
      }
    }
    expect(foldOf(4, 0).cols).toBe(2);
    expect(foldOf(9, 1)).toMatchObject({ two: 6, three: 6, cols: 3 });
    expect(foldOf(6, 0)).toMatchObject({ two: 6, three: 6 });
  });

  it("hides the cards past the fold at each width and shows them all when opened", () => {
    const fold = foldOf(10, 1);
    expect(foldClass(fold, 0)).not.toContain("hidden ");
    expect(foldClass(fold, 7)).toContain(
      "[@container(min-width:52rem)]:hidden",
    );
    expect(foldClass(fold, 7)).toContain("group-data-[open=true]/fold:!flex");
  });
});

describe("the run record", () => {
  it("says what accepting a change does", () => {
    expect(changeTitle({ op: "add", ticker: "CEG" }, 9)).toBe(
      "Add CEG, keep all 9",
    );
    expect(changeTitle({ op: "drop", ticker: "NVDA" }, 9)).toBe(
      "Drop NVDA, keep the other 8",
    );
  });

  it("folds days that decided the same 'nothing to change' into one dated line", () => {
    const run = (
      day: string,
      decision: "nothing" | "propose",
      summary: string,
    ) => ({ day, decision, summary, changes: [] });
    const rows = recordRows([
      run("2026-11-12", "nothing", "a"),
      run("2026-11-11", "nothing", "a"),
      run("2026-11-10", "propose", "b"),
    ]);
    expect(rows.map((row) => row.days)).toEqual([
      ["2026-11-12", "2026-11-11"],
      ["2026-11-10"],
    ]);
  });
});

describe("the short card lines", () => {
  it("fit one card line: at most 37 characters, one sentence each, for every theme company", async () => {
    const { SHORT_REASONS } = await import("@/lib/basket-agent/short-reasons");
    const { INVESTMENT_THEMES } = await import("@/lib/investment-themes");
    for (const [ticker, line] of Object.entries(SHORT_REASONS)) {
      expect(line.length, ticker).toBeLessThanOrEqual(37);
      expect(line, ticker).toMatch(/^[A-Z].*\.$/);
    }
    const tickers = new Set(
      INVESTMENT_THEMES.flatMap((theme) =>
        [...theme.candidates, ...theme.watchlist].map((candidate) =>
          candidate.ticker.trim().toUpperCase(),
        ),
      ),
    );
    for (const ticker of tickers)
      expect(SHORT_REASONS[ticker], ticker).toBeTruthy();
  });
});
