import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ variable: "", className: "" }), Inter_Tight: () => ({ variable: "", className: "" }) }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "", className: "" }) }));
vi.mock("@/components/oa/oa-site-header", () => ({ OaSiteHeader: () => null }));

import { wordCount } from "@/components/stock-report/format";
import { shortHeadline } from "./signals-view";

describe("a thread headline or post line in at most 15 words", () => {
  it("keeps a short headline as it is", () => {
    expect(shortHeadline("My thoughts on NVDA")).toBe("My thoughts on NVDA");
  });

  it("keeps the first sentence when the whole runs long", () => {
    const line = shortHeadline(
      "Jensen Huang's shock reverberates across the market. Super Micro (SMCI) stock falls 12% as a DOJ probe eyes Alice Huang links.",
    );
    expect(line).toBe("Jensen Huang's shock reverberates across the market.");
  });

  it("ends at a colon, dash or linking word when there is no sentence break", () => {
    const line = shortHeadline("Super Micro stock falls 12% in a single session as a DOJ probe eyes links to a former executive in Taiwan");
    expect(line).toBe("Super Micro stock falls 12% in a single session");
  });

  it("never cuts mid-word, and stays within 15 words", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen";
    const line = shortHeadline(text);
    expect(line.endsWith("fifteen…")).toBe(true);
    expect(wordCount(line)).toBeLessThanOrEqual(15);
  });

  it("keeps a post of up to 15 words whole, never dropping its \"but\" half", () => {
    const text = "Says the stock market lost $3 trillion in one day but predicts a stronger recovery.";
    expect(shortHeadline(text)).toBe(text);
  });

  it("ends at a linking word before a cut-off, and never on a small word", () => {
    expect(shortHeadline("Nvidia stock slides after NYT report alleges Jensen Huang had a second affair with an employee")).toBe(
      "Nvidia stock slides after NYT report alleges Jensen Huang had a second affair",
    );
    const line = shortHeadline("one two three four five six seven eight nine ten eleven twelve thirteen fourteen of an employee here");
    expect(line).toBe("one two three four five six seven eight nine ten eleven twelve thirteen fourteen…");
  });

  it("is empty for nothing", () => {
    expect(shortHeadline(null)).toBe("");
  });
});

