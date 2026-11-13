import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

const { firstMisfit, misfitWords } = await import("./validate");

import type { ConditionInputs } from "@/lib/thesis-watch/conditions";

const inputs = (values: ConditionInputs["values"]): ConditionInputs => ({ ticker: "NVDA", report: null, values });

describe("lines against the figures we store", () => {
  it("refuses a figure the company has no value for, and a price far from where it trades", () => {
    const stored = new Map([["NVDA", inputs({ revenue_growth: { value: 83, asOf: "2026-11-08", source: "x", href: null }, price: { value: 166, asOf: "2026-11-12", source: "x", href: null } })]]);
    expect(firstMisfit([{ ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] }], stored)).toBeNull();
    expect(firstMisfit([{ ticker: "NVDA", conditions: [{ metric: "dividend", op: "above", value: 0.01 }] }], stored)).toEqual({ ticker: "NVDA", metric: "dividend" });
    expect(firstMisfit([{ ticker: "NVDA", conditions: [{ metric: "price", op: "below", value: 1000 }] }], stored)).toEqual({ ticker: "NVDA", metric: "price" });
    // A company whose figures could not be read at all fits nothing.
    expect(firstMisfit([{ ticker: "MU", conditions: [{ metric: "gross_margin", op: "above", value: 30 }] }], stored)).toEqual({ ticker: "MU", metric: "gross_margin" });
  });

  it("says why in words", () => {
    expect(misfitWords("NVDA", "dividend")).toBe("We don't have the dividend for NVDA, so that line can't be checked. Pick another figure.");
    expect(misfitWords("NVDA", "price")).toMatch(/too far from its price/);
  });
});
