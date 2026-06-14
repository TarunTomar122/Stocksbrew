import { describe, expect, it } from "vitest";

import {
  EARNINGS_RECENT_MAX_DAYS,
  filterEarningsIntelRecent,
  isEventDateWithinRecentWindow,
} from "@/lib/earnings-intel";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";

const ref = new Date("2026-06-12T12:00:00.000Z");

function doc(ticker: string, eventDate: string): EarningsIntelDoc {
  return {
    doc_id: `US__US_${ticker}__latest`,
    market: "US",
    instrument_id: `US_${ticker}`,
    ticker,
    event_date: eventDate,
    generated_at: `${eventDate}T00:00:00.000Z`,
    report: { headline: ticker, summary: ticker },
  };
}

describe("earnings recent window", () => {
  it("includes reports within 14 days and drops older ones", () => {
    expect(isEventDateWithinRecentWindow("2026-06-12", EARNINGS_RECENT_MAX_DAYS, ref)).toBe(true);
    expect(isEventDateWithinRecentWindow("2026-05-29", EARNINGS_RECENT_MAX_DAYS, ref)).toBe(true);
    expect(isEventDateWithinRecentWindow("2026-05-28", EARNINGS_RECENT_MAX_DAYS, ref)).toBe(false);

    const filtered = filterEarningsIntelRecent(
      [doc("OLD", "2026-05-20"), doc("NEW", "2026-06-10")],
      EARNINGS_RECENT_MAX_DAYS,
      ref,
    );
    expect(filtered.map((row) => row.ticker)).toEqual(["NEW"]);
  });
});
