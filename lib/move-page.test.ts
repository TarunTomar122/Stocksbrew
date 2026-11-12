import { describe, expect, it } from "vitest";

import { closeOn, sinceClose } from "@/lib/move-page";

const series = [
  { date: "2026-11-06", close: 100 },
  { date: "2026-11-09", close: 105 },
  { date: "2026-11-10", close: 110 },
];

describe("move page numbers", () => {
  it("reads the close on a day and what came after", () => {
    expect(closeOn(series, "2026-11-09")).toEqual({ close: 105, pct: 5.000000000000004 });
    expect(closeOn(series, "2026-11-06")).toBeNull();
    expect(closeOn(series, "2026-11-11")).toBeNull();
    expect(sinceClose(series, "2026-11-09")?.date).toBe("2026-11-10");
    expect(sinceClose(series, "2026-11-10")).toBeNull();
  });
});
