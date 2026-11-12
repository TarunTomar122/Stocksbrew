import { describe, expect, it } from "vitest";

import { caseWireHeadlines } from "./wire-casing";

describe("casing ordinary words after a name", () => {
  it("lowers Potential and Fallout in a scraped title", () => {
    const [row] = caseWireHeadlines([{ title: "AMD rallies after upgrades and Potential Nvidia Fallout", tickers: ["AMD"] }]);
    expect((row as { title: string }).title).toContain("potential Nvidia fallout");
  });
});
