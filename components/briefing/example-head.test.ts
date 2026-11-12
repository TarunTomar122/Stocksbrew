import { describe, expect, it } from "vitest";

import { exampleClock, exampleMarketWords } from "./briefing-view";

describe("the example briefing's one clock", () => {
  it("says the session and when the prices were taken", () => {
    expect(exampleClock("After the close", "2026-11-11T21:00:00.000Z", null, "2026-11-11")).toBe("After the close, prices as of 4:00 PM ET");
    expect(exampleClock("Market is open", "2026-11-11T16:41:00.000Z", null, "2026-11-11")).toBe("Market is open, prices as of 11:41 AM ET");
  });

  it("says the earlier close when the prices are from one, and only the session without a time", () => {
    expect(exampleClock("Before the open", "2026-11-11T21:00:00.000Z", null, "2026-11-12")).toBe("Before the open, prices as of Wednesday's close");
    expect(exampleClock("Before the open", "2026-11-11T17:33:00.000Z", null, "2026-11-12")).toBe("Before the open, prices as of Wednesday 12:33 PM ET");
    expect(exampleClock("Closed for the weekend", null, "Prices as of Friday's close.", "2026-11-14")).toBe("Closed for the weekend, prices as of Friday's close");
    expect(exampleClock("Closed for the weekend", null, null, "2026-11-14")).toBe("Closed for the weekend");
  });
});

describe("exampleMarketWords", () => {
  it("is one line, or nothing", () => {
    expect(exampleMarketWords({ pct: 1.31, day: "2026-11-11", leader: "tech" }, "2026-11-11")).toBe("Market today: S&P 500 +1.3%, tech led");
    expect(exampleMarketWords({ pct: -0.4, day: "2026-11-11", leader: null }, "2026-11-11")).toBe("Market today: S&P 500 −0.4%");
    expect(exampleMarketWords({ pct: 0.6, day: "2026-11-13", leader: "energy" }, "2026-11-14")).toBe("Market on Friday: S&P 500 +0.6%, energy led");
    expect(exampleMarketWords(null, "2026-11-11")).toBeNull();
  });
});
