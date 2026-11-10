import { describe, expect, it } from "vitest";

import { readLooksBroken, type StockRead } from "./stock-read";

const base: StockRead = {
  call: "Hold",
  actionLabel: "Hold here",
  actionSummary: "Upside and downside look balanced.",
  headline: "Data center demand keeps growing",
  body: null,
  reasons: ["Revenue grew 40% year over year."],
  changers: ["A cut to capital spending guidance."],
  confidence: "medium",
  horizon: "weeks",
  zones: { addBelow: 100, addAbove: null, trimAbove: 200 },
  writtenAt: "2026-11-09T15:00:00Z",
  articleCount: 12,
  sourceCount: 5,
  changed: null,
};

describe("readLooksBroken", () => {
  it("passes a normal read", () => {
    expect(readLooksBroken(base)).toBe(false);
  });

  it("catches a read written from a bot wall", () => {
    expect(readLooksBroken({ ...base, headline: "The page requests human verification before continuing" })).toBe(true);
    expect(readLooksBroken({ ...base, reasons: ["Please enable JavaScript to view this page."] })).toBe(true);
    expect(readLooksBroken({ ...base, body: "Access denied. You do not have permission." })).toBe(true);
  });

  it("does not trip on ordinary finance wording", () => {
    expect(readLooksBroken({ ...base, reasons: ["Subscriber growth beat estimates and access to credit improved."] })).toBe(false);
  });
});
