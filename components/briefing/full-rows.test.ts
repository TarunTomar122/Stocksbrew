import { describe, expect, it } from "vitest";

import { wholeRows } from "./full-rows";

describe("wholeRows", () => {
  it("shows whole rows only, and everything when the cards make whole rows or less than one", () => {
    expect(wholeRows(5, 3)).toBe(3);
    expect(wholeRows(7, 4)).toBe(4);
    expect(wholeRows(8, 4)).toBe(8);
    expect(wholeRows(2, 3)).toBe(2);
    expect(wholeRows(5, 1)).toBe(5);
  });
});
