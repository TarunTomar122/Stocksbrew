import { describe, expect, it } from "vitest";

import { findNearestTechnicalLevels } from "@/lib/technical-levels";

const points = (closes: number[]) =>
  closes.map((close, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, close }));

describe("nearest technical levels", () => {
  it("uses the nearest recent reversal below and above the current price", () => {
    const result = findNearestTechnicalLevels(
      points([100, 102, 99, 101, 105, 103, 107, 104, 108, 106, 109]),
      104,
    );

    expect(result?.support).toBe(103);
    expect(result?.resistance).toBe(105);
  });

  it("uses the recent range when a trending series has no reversal on one side", () => {
    const result = findNearestTechnicalLevels(
      points([90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]),
      101,
    );

    expect(result?.support).toBe(90);
    expect(result?.resistance).toBeNull();
  });

  it("does not publish levels from a thin history", () => {
    expect(findNearestTechnicalLevels(points([10, 11, 12]), 12)).toBeNull();
  });
});
