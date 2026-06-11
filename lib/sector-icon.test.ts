import { describe, expect, it } from "vitest";

import { resolveSectorIcon } from "@/lib/sector-icon";

describe("resolveSectorIcon", () => {
  it("maps known sector labels", () => {
    expect(resolveSectorIcon("Semiconductors").icon).toBe("memory");
    expect(resolveSectorIcon("Software").icon).toBe("code");
    expect(resolveSectorIcon("Oil & Gas").icon).toBe("local_gas_station");
  });

  it("matches keywords in AI bucket names", () => {
    expect(resolveSectorIcon("Semiconductor Equipment & Materials").icon).toBe("memory");
    expect(resolveSectorIcon("Cloud Software").icon).toBe("code");
  });

  it("falls back for unknown labels", () => {
    expect(resolveSectorIcon("Miscellaneous Themes").icon).toBe("category");
  });
});
