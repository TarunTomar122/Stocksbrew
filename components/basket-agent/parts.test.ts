import { describe, expect, it } from "vitest";

import { changeTitle, foldClass, foldOf, recordRows, replayTally } from "./parts";

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

describe("the replay tally", () => {
  const said = (counts: { propose: number; nothing: number; could_not_check: number }) =>
    replayTally({ sessions: counts.propose + counts.nothing + counts.could_not_check, counts }).join("");

  it("accounts for every day it checked", () => {
    expect(said({ propose: 3, nothing: 15, could_not_check: 2 })).toBe("Of 20 days, 3 had a change, 15 were quiet and 2 couldn't check.");
    expect(said({ propose: 5, nothing: 15, could_not_check: 0 })).toBe("Of 20 days, 5 had a change and 15 were quiet.");
    expect(said({ propose: 0, nothing: 1, could_not_check: 19 })).toBe("Of 20 days, 1 was quiet and 19 couldn't check.");
    expect(said({ propose: 0, nothing: 20, could_not_check: 0 })).toBe("All 20 days were quiet.");
    expect(said({ propose: 0, nothing: 0, could_not_check: 4 })).toBe("It couldn't check any of the 4 days.");
    expect(said({ propose: 0, nothing: 0, could_not_check: 0 })).toBe("No market days to check yet.");
    expect(said({ propose: 1, nothing: 0, could_not_check: 0 })).toBe("The one day it checked had a change.");
    expect(said({ propose: 0, nothing: 0, could_not_check: 1 })).toBe("It couldn't check the one day.");
    expect(replayTally({ sessions: 20, counts: { propose: 0, nothing: 0, could_not_check: 0 } }).join("")).toBe("20 days checked.");
    const longest = said({ propose: 13, nothing: 15, could_not_check: 12 });
    expect(longest.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it("names numbers that add up to the days checked", () => {
    for (const counts of [
      { propose: 3, nothing: 15, could_not_check: 2 },
      { propose: 1, nothing: 0, could_not_check: 1 },
    ]) {
      const parts = replayTally({ sessions: counts.propose + counts.nothing + counts.could_not_check, counts });
      const [total, ...rest] = parts.filter((part): part is number => typeof part === "number");
      expect(rest.reduce((sum, n) => sum + n, 0)).toBe(total);
    }
  });
});
