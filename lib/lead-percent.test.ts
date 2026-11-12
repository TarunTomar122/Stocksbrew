import { describe, expect, it } from "vitest";

import { leadPercent } from "./lead-percent";

describe("leadPercent", () => {
  it("signs the first percent by the word before it", () => {
    expect(leadPercent("Eight of the nine holdings are up 1.1% so far this week, behind the S&P 500's 3.3% rise.")).toBe("+1.1%");
    expect(leadPercent("Nov 11 at 6:19 AM ET: NVDA fell 5.47% in a day.")).toBe("\u22125.47%");
    expect(leadPercent("It is down about 2% this month.")).toBe("\u22122%");
    expect(leadPercent("It rose by 12% after the report.")).toBe("+12%");
  });
  it("keeps a share unsigned and a written sign as it is", () => {
    expect(leadPercent("Once the funds are counted, Apple is 18% of the example portfolio.")).toBe("18%");
    expect(leadPercent("Tech makes up 41% of it.")).toBe("41%");
    expect(leadPercent("The week was \u22123% for the fund.")).toBe("\u22123%");
  });
  it("gives nothing without a percent, or without a direction when asked for one", () => {
    expect(leadPercent("Nothing to report.")).toBeUndefined();
    expect(leadPercent("None of the nine stocks moved 5% or more in a day.", { signedOnly: true })).toBeUndefined();
    expect(leadPercent("NVDA fell 5.5% in a day.", { signedOnly: true })).toBe("\u22125.5%");
  });
});

describe("leadPercent ranges", () => {
  it("reads a range dash as a range, not a minus", () => {
    expect(leadPercent("a 10-15% drop")).toBe("15%");
  });
});
