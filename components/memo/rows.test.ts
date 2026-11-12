import { describe, expect, it } from "vitest";

import { memoGrid, wideColumns } from "./rows";

describe("memo card rows", () => {
  it("puts up to five in one row, else rows of four or three, and never stretches a card over the row", () => {
    expect([1, 2, 5, 6, 7, 8, 9].map(wideColumns)).toEqual([3, 3, 5, 3, 4, 4, 3]);
    expect(memoGrid(1)).toBe("grid grid-cols-2 gap-3 lg:grid-cols-3");
    expect(memoGrid(6)).toContain("lg:grid-cols-3");
    expect(memoGrid(13)).toContain("lg:grid-cols-4");
  });
});
