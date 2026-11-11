import { describe, expect, it } from "vitest";

import { callBasis, factHasDate, lastReportOn, withoutVagueChange } from "@/lib/call-basis";

describe("callBasis", () => {
  it("splits a hold reason into two dated facts and what would change it", () => {
    const reason =
      "NVIDIA fell 18% over the past week, far more than other chip stocks (down 3.3%), even though its sales grew 83% over the past year. The Nov 17 report decides what we do: we'd buy more if sales keep growing this fast, and sell some if they slow sharply.";
    expect(callBasis(reason, { asOf: "2026-11-10", lastReport: "2026-08-26" })).toEqual({
      facts: [
        "NVIDIA fell 18% over the past week, far more than other chip stocks (down 3.3%).",
        "Its sales grew 83% in the year to its Aug 26 report.",
      ],
      change: "The Nov 17 report decides what we do: we'd buy more if sales keep growing this fast, and sell some if they slow sharply.",
    });
  });

  it("keeps dates the facts already carry", () => {
    const reason =
      "Coca-Cola's report on Oct 27 beat profit forecasts by 4.6%, and it pays a 2.2% dividend that it has raised for 64 years in a row. We'd stop buying if Coca-Cola's next report misses forecasts or the dividend stops growing.";
    expect(callBasis(reason)).toEqual({
      facts: ["Coca-Cola's report on Oct 27 beat profit forecasts by 4.6%.", "It pays a 2.2% dividend that it has raised for 64 years in a row."],
      change: "We'd stop buying if Coca-Cola's next report misses forecasts or the dividend stops growing.",
    });
  });

  it("handles one fact, the stock as subject and a 'next report' change line", () => {
    const one = callBasis("Apple trades near its high of the past year. Apple's next report decides what we do: a beat would have us buying more, and a miss would have us selling some.");
    expect(one?.facts).toEqual(["Apple trades near its high of the past year."]);
    expect(one?.change).toMatch(/^Apple's next report decides/);
    const move = callBasis("Its P/E of 40 is above the usual 30, but the stock rose 12% over the past month. We'd stop selling once the price settles back.", { asOf: "2026-11-10" });
    expect(move?.facts).toEqual(["Its P/E of 40 is above the usual 30.", "The stock rose 12% over the past month."]);
  });

  it("reads a name with brackets in its change line", () => {
    const basis = callBasis("Super Group (SGHC)'s report on Nov 3 beat profit forecasts by 75%, but it sits 28% below its high of the past year. Super Group (SGHC)'s next report decides what we do.");
    expect(basis?.facts).toHaveLength(2);
    expect(basis?.change).toMatch(/^Super Group/);
  });

  it("splits on an analysts fact and keeps a lowercase-led name", () => {
    const basis = callBasis("eBay's sales grew 5% over the past year, and three more analysts rate it a buy than three months ago. A miss in eBay's next report would make us stop buying.");
    expect(basis?.facts).toEqual(["eBay's sales grew 5% over the past year.", "Three more analysts rate it a buy than three months ago."]);
    expect(basis?.change).toBe("A miss in eBay's next report would make us stop buying.");
  });

  it("does not date sales with a report after the as-of day", () => {
    expect(callBasis("Its sales fell 4% over the past year.", { asOf: "2026-11-10", lastReport: "2026-11-12" })?.facts).toEqual(["Its sales fell 4% over the past year."]);
  });

  it("returns null for text that is not one of the templates", () => {
    expect(callBasis("")).toBeNull();
    expect(callBasis(null)).toBeNull();
    expect(callBasis("The evidence looks good. Prices are high. We'd buy on a dip.")).toBeNull();
    expect(callBasis("Too short.")).toBeNull();
  });

  it("keeps a reason with no change sentence whole", () => {
    const basis = callBasis("Right now the possible gain isn't worth the risk.");
    expect(basis).toEqual({ facts: ["Right now the possible gain isn't worth the risk."], change: null });
  });
});

describe("lastReportOn", () => {
  it("finds the latest report on or before the day", () => {
    expect(lastReportOn(["2026-02-25", "2026-05-27", "2026-08-26", "2026-11-19"], "2026-11-10", "2026-11-08")).toBe("2026-08-26");
    expect(lastReportOn(["2026-02-25"], null, "2026-03-10")).toBe("2026-02-25");
    expect(lastReportOn(["2026-02-25"], "2026-11-10", "2026-11-08")).toBeNull();
    expect(lastReportOn([], "2026-11-10", "2026-11-08")).toBeNull();
    // Without the day the figures were fetched, no report is named.
    expect(lastReportOn(["2026-08-26"], "2026-11-10")).toBeNull();
    // Figures fetched Nov 8 may not include a Nov 6 report yet; the one before is named instead.
    expect(lastReportOn(["2026-08-26", "2026-11-06"], "2026-11-10", "2026-11-08T08:47:18Z")).toBe("2026-08-26");
    expect(lastReportOn(["2026-08-26", "2026-11-04"], "2026-11-10", "2026-11-08")).toBe("2026-11-04");
  });
});

describe("factHasDate", () => {
  it("spots a day or month in a fact", () => {
    expect(factHasDate("NVIDIA fell 18% in the week to Nov 10.")).toBe(true);
    expect(factHasDate("Marvell fell 10% over the past week.")).toBe(false);
    expect(factHasDate("Robinhood Markets rose 12% over the past month.")).toBe(false);
    expect(factHasDate("Its P/E is below the 41 it typically traded at from April to July.")).toBe(true);
    expect(factHasDate("Its sales grew 83% over the past year.")).toBe(false);
    expect(factHasDate("It pays a 2.2% dividend that it has raised for 64 years in a row.")).toBe(false);
  });
});

describe("withoutVagueChange", () => {
  it("drops the old uncheckable conditions and keeps the facts", () => {
    expect(withoutVagueChange("Its P/E of 40 is above the usual 30, but the stock rose 12% over the past month. We'd stop selling once the price settles back.")).toBe(
      "Its P/E of 40 is above the usual 30, but the stock rose 12% over the past month.",
    );
    expect(withoutVagueChange("ADT rose 54% over the past month. After that rise we'd buy on a dip rather than now, and stop buying if ADT's next report misses forecasts.")).toBe(
      "ADT rose 54% over the past month.",
    );
    expect(withoutVagueChange("Coca-Cola's sales grew 7% over the past year. We'd stop buying if Coca-Cola's next report misses forecasts or the dividend stops growing.")).toBe(
      "Coca-Cola's sales grew 7% over the past year.",
    );
  });

  it("keeps a measured condition, a reason with no condition, and empty input", () => {
    const measured = "Acme's sales grew 24% over the past year. We'd stop buying if the Dec 3 report shows sales growth below 12% or misses profit forecasts.";
    expect(withoutVagueChange(measured)).toBe(measured);
    expect(withoutVagueChange("Sales slowed sharply last quarter.")).toBe("Sales slowed sharply last quarter.");
    expect(withoutVagueChange(null)).toBe("");
  });
});
