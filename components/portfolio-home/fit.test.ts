import { describe, expect, it } from "vitest";

import { COLS, holdingsShown, planFlow, showAt } from "./fit";

describe("holdingsShown", () => {
  it("shows exactly the cards that need a look, folding every quiet one", () => {
    // The owner's book: 11 holdings, 5 or 6 need a look.
    expect(COLS.map((cols) => holdingsShown(11, 6, cols))).toEqual([6, 6, 6, 6]);
    expect(COLS.map((cols) => holdingsShown(11, 5, cols))).toEqual([5, 5, 5, 5]);
    expect(COLS.map((cols) => holdingsShown(9, 1, cols))).toEqual([1, 1, 1, 1]);
  });

  it("shows two rows when nothing needs a look, and every card of a short book", () => {
    expect(COLS.map((cols) => holdingsShown(40, 0, cols))).toEqual([4, 4, 6, 8]);
    expect(COLS.map((cols) => holdingsShown(3, 0, cols))).toEqual([3, 3, 3, 3]);
    expect(COLS.map((cols) => holdingsShown(1, 1, cols))).toEqual([1, 1, 1, 1]);
    expect(COLS.map((cols) => holdingsShown(0, 0, cols))).toEqual([0, 0, 0, 0]);
  });

  it("shows all of a book that all needs a look", () => {
    expect(COLS.map((cols) => holdingsShown(40, 40, cols))).toEqual([40, 40, 40, 40]);
  });
});

describe("planFlow", () => {
  const memo = { facts: 1, movers: 5 };
  const agents = { lines: 4, quiet: 2 };

  it("fills the owner's page at every width: 5 or 6 need a look, the memo, four agents", () => {
    for (const cols of COLS) expect(planFlow(holdingsShown(11, 6, cols), memo, agents, cols).empty).toBe(0);
    for (const cols of COLS) expect(planFlow(holdingsShown(11, 5, cols), memo, agents, cols).empty).toBe(0);
    // Three across: two rows of memo under the holdings, then the agents with the two quiet ones in one card.
    expect(planFlow(6, memo, agents, 3)).toEqual({ memo: { cells: 6, inline: false }, agents: { merged: true, inline: false }, empty: 0 });
  });

  it("starts the memo beside a lone holding, so its row ends full", () => {
    const plan = planFlow(1, { facts: 1, movers: 2 }, agents, 3);
    expect(plan.memo).toEqual({ cells: 2, inline: true });
    expect(plan.agents).toEqual({ merged: true, inline: false });
    expect(plan.empty).toBe(0);
  });

  it("fills every row after 0 to 12 holdings when the memo has its main risk and two or more movers", () => {
    const misses: string[] = [];
    for (let holdings = 0; holdings <= 12; holdings++) {
      for (let movers = 2; movers <= 6; movers++) {
        for (let lines = 0; lines <= 6; lines++) {
          for (let quiet = 0; quiet <= lines; quiet++) {
            for (const cols of COLS) {
              const plan = planFlow(holdings, { facts: 1, movers }, lines > 0 ? { lines, quiet } : null, cols);
              if (plan.empty > 0) misses.push(`${holdings} holdings, ${movers} movers, ${lines}/${quiet} agents at ${cols}`);
              expect(plan.empty).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
    // Only a memo of three cards (the main risk and exactly two movers), four across, can leave one cell.
    expect(misses.every((miss) => / 2 movers,/.test(miss) && miss.endsWith("at 4"))).toBe(true);
  });

  it("keeps the memo to two rows from where it starts, three cards on a phone", () => {
    expect(planFlow(0, { facts: 1, movers: 6 }, null, 1).memo!.cells).toBe(3);
    for (const cols of [2, 3, 4]) {
      for (let holdings = 0; holdings <= 8; holdings++) {
        const plan = planFlow(holdings, { facts: 1, movers: 9 }, null, cols);
        expect((holdings % cols) + plan.memo!.cells).toBeLessThanOrEqual(cols * 2);
      }
    }
  });

  it("shows nothing for no memo and no agents, and a memo with more figures than fit", () => {
    expect(planFlow(3, null, null, 3)).toEqual({ memo: null, agents: null, empty: 0 });
    for (const cols of COLS) expect(planFlow(0, { facts: 9, movers: 0 }, null, cols).memo!.cells).toBeGreaterThan(0);
  });
});

describe("classes", () => {
  it("writes a class only where it changes, and the open state from the phone up", () => {
    expect(showAt([true, true, true, true])).toBe("");
    expect(showAt([true, true, false, true])).toBe("block xl:hidden 2xl:block");
    expect(showAt([false, false, false, true], "flex")).toBe("hidden 2xl:flex");
    expect(showAt([true, false, false, false], "block", [true, true, true, true])).toBe(
      "block sm:hidden group-data-[open=true]/fold:block",
    );
  });
});
