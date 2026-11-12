import { describe, expect, it } from "vitest";

import { aboutCount, leansAgainst, moveStamp, parseTasteTickers, pickLines, type TasteLine } from "@/lib/landing-taste-shared";
import { heroProof } from "@/lib/brand-copy";

const sales = (t: string): TasteLine => ({ id: "sales", text: `${t}'s sales rose 10% over the last four quarters.`, source: "From the 10-Q" });

describe("landing taste", () => {
  it("reads up to three valid tickers, once each", () => {
    expect(parseTasteTickers("nvda, JPM ,ko,nvda,aapl")).toEqual(["NVDA", "JPM", "KO"]);
    expect(parseTasteTickers("brk.b <script> 123")).toEqual(["BRK.B"]);
    expect(parseTasteTickers("brk-b")).toEqual(["BRK.B"]);
    expect(parseTasteTickers(null)).toEqual([]);
  });

  it("rounds the call count for the proof line and leaves it out when there is none", () => {
    expect(aboutCount(726)).toBe("about 730");
    expect(aboutCount(Number.NaN)).toBeNull();
    expect(heroProof(aboutCount(726))).toBe("About 730 US stocks with a dated call, and the sources under each one.");
    expect(heroProof(null)).not.toMatch(/\d/);
  });

  it("dates the move in New York time, with the day when it is not today", () => {
    const now = new Date("2026-11-11T22:00:00Z");
    expect(moveStamp("2026-11-11T20:59:00+00:00", now)).toBe("3:59 PM ET");
    expect(moveStamp("2026-11-10T21:00:00Z", now)).toBe("yesterday, 4:00 PM ET");
    expect(moveStamp("2026-11-06T21:00:00Z", now)).toBe("Friday, 4:00 PM ET");
    expect(moveStamp("2026-11-03T21:00:00Z", now)).toBe("Nov 3, 4:00 PM ET");
    expect(moveStamp("not a date", now)).toBe("");
  });

  it("never leads a card with a line that argues against its call", () => {
    const missed: TasteLine = { id: "eps", text: "In its Oct 13 report, JPM's earnings per share of $5.75 missed the $5.80 analysts expected.", source: "Nasdaq" };
    const fell: TasteLine = { id: "move", text: "KO fell 8% in the month to Nov 10, while the S&P 500 rose 1%.", source: "Yahoo" };
    expect(leansAgainst(missed, "Add")).toBe(true);
    expect(leansAgainst(missed, "Hold")).toBe(false);
    expect(leansAgainst(fell, "Add")).toBe(true);
    expect(leansAgainst(fell, "Trim")).toBe(false);
  });

  it("varies the kind of reason across cards when it can", () => {
    const div: TasteLine = { id: "dividend", text: "JPM pays $6.60 a share.", source: "Dividend history" };
    const missed: TasteLine = { id: "eps", text: "JPM's earnings per share missed the forecast.", source: "Nasdaq" };
    const picked = pickLines([
      { call: "Hold", lines: [sales("NVDA")] },
      { call: "Add", lines: [sales("JPM"), missed, div] },
      { call: "Add", lines: [sales("KO")] },
      { call: "Add", lines: [missed] },
    ]);
    expect(picked.map((line) => line?.id ?? null)).toEqual(["sales", "dividend", "sales", null]);
  });
});
