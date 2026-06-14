import { describe, expect, it } from "vitest";

import {
  daysUntilEventDate,
  isWithinPreEarningsWindow,
  shouldShowPreEarningsIntel,
  type PreEarningsIntelDoc,
} from "@/lib/pre-earnings-intel-shared";

const ref = new Date("2026-06-10T18:00:00.000Z");

function preDoc(eventDate: string): PreEarningsIntelDoc {
  return {
    doc_id: "US__ORCL__upcoming",
    market: "US",
    instrument_id: "US_ORCL",
    ticker: "ORCL",
    event_date: eventDate,
    generated_at: "2026-06-01T00:00:00.000Z",
    report: { headline: "Test", summary: "Test" },
  };
}

describe("pre-earnings window", () => {
  it("counts days until event in UTC", () => {
    expect(daysUntilEventDate("2026-06-11", ref)).toBe(1);
    expect(daysUntilEventDate("2026-06-10", ref)).toBe(0);
    expect(daysUntilEventDate("2026-06-09", ref)).toBe(-1);
  });

  it("only treats future report dates as upcoming", () => {
    expect(isWithinPreEarningsWindow("2026-06-11", 7, ref)).toBe(true);
    expect(isWithinPreEarningsWindow("2026-06-10", 7, ref)).toBe(false);
    expect(isWithinPreEarningsWindow("2026-06-09", 7, ref)).toBe(false);
  });

  it("hides pre-earnings once post-earnings covers the print", () => {
    expect(shouldShowPreEarningsIntel(preDoc("2026-06-11"), { event_date: "2026-06-10" }, 7, ref)).toBe(
      true,
    );
    expect(shouldShowPreEarningsIntel(preDoc("2026-06-11"), { event_date: "2026-06-11" }, 7, ref)).toBe(
      false,
    );
    expect(shouldShowPreEarningsIntel(preDoc("2026-06-10"), null, 7, ref)).toBe(false);
  });
});
