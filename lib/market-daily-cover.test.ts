import { describe, expect, it } from "vitest";

import { marketDailyCoverIndex, marketDailyCoverQuery } from "@/lib/market-daily-cover";

describe("market daily covers", () => {
  it("chooses a stable but different image for consecutive editions", () => {
    const query = marketDailyCoverQuery("AI spending hits chipmakers", "Data centers are in focus.");
    const first = marketDailyCoverIndex("2026-07-28", query, 20);

    expect(marketDailyCoverIndex("2026-07-28", query, 20)).toBe(first);
    expect(marketDailyCoverIndex("2026-07-29", query, 20)).not.toBe(first);
  });

  it("varies the visual subject for consecutive editions on the same theme", () => {
    const headline = "AI spending hits chipmakers";
    const dek = "Data centers are in focus.";

    expect(marketDailyCoverQuery(headline, dek, "2026-07-28")).not.toBe(
      marketDailyCoverQuery(headline, dek, "2026-07-29"),
    );
  });
});
