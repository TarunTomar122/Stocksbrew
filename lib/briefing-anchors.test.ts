import { describe, expect, it } from "vitest";

import { anchorGroups, briefingAnchorTickers } from "@/lib/briefing-anchors";
import type { BriefingGroup } from "@/lib/briefing-groups";

const group = (ticker: string | null, key = ticker ?? "MARKET") => ({ key, ticker }) as unknown as BriefingGroup;

describe("anchorGroups", () => {
  it("gives each stock one anchor, on its first card in page order", () => {
    const first = group("NVDA");
    const again = group("NVDA");
    const amd = group("AMD");
    const market = group(null);
    const out = anchorGroups([first, market, amd, again]);
    expect(out.has(first)).toBe(true);
    expect(out.has(again)).toBe(false);
    expect(out.has(amd)).toBe(true);
    expect(out.has(market)).toBe(false);
  });
});

describe("briefingAnchorTickers", () => {
  it("is empty for the market view", () => {
    expect(briefingAnchorTickers({ mode: "market", needs_you: [], also_today: [] }, {})).toEqual([]);
  });
});
