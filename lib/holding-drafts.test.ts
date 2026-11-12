import { describe, expect, it } from "vitest";

import { buildBatch, emptySaveAllowed, needsEmptyConfirm, readDraft } from "@/lib/holding-drafts";

const NVDA = { instrument_id: "US_NVDA", position_type: "holding" as const, holding: { quantity: 15.9, average_cost: 181.8 } };
const AAPL = { instrument_id: "US_AAPL", position_type: "watchlist" as const };

describe("readDraft", () => {
  it("keeps an untouched box, clears an emptied one and reads a typed number", () => {
    expect(readDraft(undefined)).toEqual({ kind: "keep" });
    expect(readDraft("")).toEqual({ kind: "clear" });
    expect(readDraft("   ")).toEqual({ kind: "clear" });
    expect(readDraft("$1,234.50")).toEqual({ kind: "set", value: 1234.5 });
    expect(readDraft("0")).toEqual({ kind: "set", value: 0 });
  });

  it("calls text, negatives and absurd sizes invalid", () => {
    expect(readDraft("abc")).toEqual({ kind: "invalid", message: "Enter a number" });
    expect(readDraft("1.2.3")).toEqual({ kind: "invalid", message: "Enter a number" });
    expect(readDraft("-3")).toEqual({ kind: "invalid", message: "Can't be negative" });
    expect(readDraft("5000000000")).toEqual({ kind: "invalid", message: "That's too large" });
  });
});

describe("buildBatch", () => {
  it("keeps the saved shares and cost when the boxes are left alone", () => {
    const { items, errors } = buildBatch([NVDA, AAPL], {}, {});
    expect(errors).toEqual({});
    expect(items).toEqual([
      { instrument_id: "US_NVDA", position_type: "holding", holding: { quantity: 15.9, average_cost: 181.8, source: "manual" } },
      { instrument_id: "US_AAPL", position_type: "watchlist" },
    ]);
  });

  it("clears a field the person emptied, instead of keeping the saved number", () => {
    const { items, errors } = buildBatch([NVDA], { US_NVDA: "" }, { US_NVDA: "" });
    expect(errors).toEqual({});
    expect(items[0]!.holding).toEqual({ quantity: null, average_cost: null, source: "manual" });
  });

  it("replaces only the box that was typed in", () => {
    const { items } = buildBatch([NVDA], { US_NVDA: "20" }, {});
    expect(items[0]!.holding).toEqual({ quantity: 20, average_cost: 181.8, source: "manual" });
  });

  it("reports a bad number on its own box, so the save is blocked", () => {
    const { errors } = buildBatch([NVDA, { ...AAPL, position_type: "holding" as const }], { US_NVDA: "-1" }, { US_AAPL: "lots" });
    expect(errors).toEqual({ US_NVDA: { shares: "Can't be negative" }, US_AAPL: { cost: "Enter a number" } });
  });

  it("saves no numbers for a stock moved to Watching, even with a bad box left behind", () => {
    const moved = { ...NVDA, position_type: "watchlist" as const, holding: undefined };
    const { items, errors } = buildBatch([moved], { US_NVDA: "-1" }, {});
    expect(errors).toEqual({});
    expect(items).toEqual([{ instrument_id: "US_NVDA", position_type: "watchlist" }]);
  });

  it("saves what the boxes show: a holding switched to Watch and back, with empty boxes, is saved with no numbers", () => {
    // setPosition drops the row's numbers on Watch; back on Hold the boxes are empty, so nothing comes back on save.
    const backToHold = { ...NVDA, holding: undefined };
    const { items, errors } = buildBatch([backToHold], {}, {});
    expect(errors).toEqual({});
    expect(items).toEqual([{ instrument_id: "US_NVDA", position_type: "holding" }]);
  });

  it("gives a newly added holding numbers only once a box is filled", () => {
    const added = { instrument_id: "US_MSFT", position_type: "holding" as const };
    expect(buildBatch([added], {}, {}).items).toEqual([{ instrument_id: "US_MSFT", position_type: "holding" }]);
    expect(buildBatch([added], { US_MSFT: "3" }, {}).items[0]!.holding).toEqual({ quantity: 3, source: "manual" });
  });
});

describe("needsEmptyConfirm", () => {
  it("asks before a save that removes every stock, and only then", () => {
    expect(needsEmptyConfirm(0, 3)).toBe(true);
    expect(needsEmptyConfirm(1, 3)).toBe(false);
    expect(needsEmptyConfirm(0, 0)).toBe(false);
  });

  it("lets the last stock go: an empty list is a valid save", () => {
    expect(buildBatch([], {}, {})).toEqual({ items: [], errors: {} });
  });
});

describe("emptySaveAllowed (the save route)", () => {
  it("accepts an empty list sent on purpose and refuses one whose rows were all unreadable", () => {
    expect(emptySaveAllowed([], 0)).toBe(true);
    expect(emptySaveAllowed([{ instrument_id: "??" }], 0)).toBe(false);
    expect(emptySaveAllowed(undefined, 0)).toBe(false);
    expect(emptySaveAllowed([{ instrument_id: "US_NVDA" }], 1)).toBe(true);
  });
});
