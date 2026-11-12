import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => ({ get: () => undefined }) }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));

import { exampleMarketLine } from "@/lib/briefing-example";

const at = "2026-11-11T21:00:00.000Z";
const sector = (id: string, d1: number, as_of = at) => ({ id, change: { d1 }, as_of });
const sectors = [sector("xlk", 3.23), sector("xle", 1.86), sector("xlf", 0.58), sector("xlu", -0.4), sector("xlv", -1.1)];

describe("exampleMarketLine", () => {
  it("names the S&P 500 and the sector that led its way", () => {
    expect(exampleMarketLine([{ id: "sp500", change: { d1: 1.31 }, as_of: at }, ...sectors], "2026-11-11")).toEqual({ pct: 1.31, day: "2026-11-11", leader: "tech" });
    expect(exampleMarketLine([{ id: "sp500", change: { d1: -0.8 }, as_of: at }, ...sectors], "2026-11-11")).toEqual({ pct: -0.8, day: "2026-11-11", leader: "health care" });
  });

  it("leaves the leader out when no sector went the index's way or there are too few sectors", () => {
    const up = sectors.map((row) => ({ ...row, change: { d1: Math.abs(row.change.d1) } }));
    expect(exampleMarketLine([{ id: "sp500", change: { d1: -0.5 }, as_of: at }, ...up], "2026-11-11")?.leader).toBeNull();
    expect(exampleMarketLine([{ id: "sp500", change: { d1: 1 }, as_of: at }, sector("xlk", 2)], "2026-11-11")?.leader).toBeNull();
  });

  it("is null when the index is from another day than the example's prices", () => {
    expect(exampleMarketLine([{ id: "sp500", change: { d1: 1.31 }, as_of: "2026-11-10T21:00:00.000Z" }, ...sectors], "2026-11-11")).toBeNull();
    expect(exampleMarketLine([{ id: "sp500", change: { d1: 1.31 }, as_of: at }], null)).toBeNull();
    expect(exampleMarketLine([], "2026-11-11")).toBeNull();
  });
});
