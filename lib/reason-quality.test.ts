import { describe, expect, it } from "vitest";

import { isCircularReason, realReason } from "@/lib/reason-quality";

describe("isCircularReason", () => {
  it("catches a line that only says the move again", () => {
    expect(isCircularReason("Semiconductor rally drives SOXL higher", "SOXL", "Direxion Daily Semiconductor Bull 3X Shares")).toBe(true);
    expect(isCircularReason("NetEase reverses recent gains", "NTES", "NetEase, Inc.")).toBe(true);
    expect(isCircularReason("NTES sharply underperforms a weaker market", "NTES", "NetEase, Inc.")).toBe(true);
    expect(isCircularReason("Shares surged 9% today.", "ZETA", "Zeta Global")).toBe(true);
    expect(isCircularReason("Rebounds sharply with little news", "ABC", "ABC Corp")).toBe(true);
    expect(isCircularReason("XPEV reverses pattern and trails the market", "XPEV", "XPeng Inc.")).toBe(true);
    expect(isCircularReason("HALO trades below its recent closing-price range", "HALO", "Halozyme Therapeutics")).toBe(true);
  });

  it("keeps a line that names a cause", () => {
    expect(isCircularReason("CoreWeave raises its forecast as AI demand and capacity strengthen", "CRWV", "CoreWeave, Inc.")).toBe(false);
    expect(isCircularReason("CoreWeave results lift Nebius and other neocloud stocks", "NBIS", "Nebius Group N.V.")).toBe(false);
    expect(isCircularReason("Zeta rose 12% after earnings", "ZETA", "Zeta Global")).toBe(false);
    expect(isCircularReason("Strong Q3 results and $450 million order", "ELMT", "Elmet Group")).toBe(false);
    expect(isCircularReason("Analyst upgrade to Buy lifts the stock", "X", "United States Steel")).toBe(false);
    expect(isCircularReason("FDA approves its obesity drug", "LLY", "Eli Lilly and Company")).toBe(false);
    expect(isCircularReason("CEO steps down after the board's review", "ABC", "ABC Corp")).toBe(false);
    expect(isCircularReason("Bitcoin rally lifts the bitcoin holder", "MSTR", "Strategy Inc")).toBe(false);
    // Live headlines from Nov 11 that name a cause without a results word.
    expect(isCircularReason("Thacker Pass timeline and capital needs pressure shares", "LAC", "Lithium Americas Corp")).toBe(false);
    expect(isCircularReason("Strong growth overshadowed by losses and defense delays", "PDYN", "Palladyne AI Corp")).toBe(false);
    expect(isCircularReason("AI travel competition weighs on Airbnb shares", "ABNB", "Airbnb, Inc.")).toBe(false);
  });

  it("does not count a cause word inside the stock's own name or ticker", () => {
    expect(isCircularReason("Oil States International jumps sharply", "OIS", "Oil States International, Inc.")).toBe(true);
    expect(isCircularReason("Oil States International jumps as crude oil climbs", "OIS", "Oil States International, Inc.")).toBe(false);
    expect(isCircularReason("FDA's shares jump", "FDA", null)).toBe(true);
  });

  it("does not let a move word pass as a cause", () => {
    expect(isCircularReason("NTES beats the broader market", "NTES", "NetEase, Inc.")).toBe(true);
    expect(isCircularReason("Shares rally across the board", "ABC", "ABC Corp")).toBe(true);
    expect(isCircularReason("Profit-taking after a run, adding to the quarter's gains", "ABC", "ABC Corp")).toBe(true);
    expect(isCircularReason("Growth stocks rally and ABC rallies with rivals", "ABC", "ABC Corp")).toBe(true);
  });

  it("knows causes that are not company results", () => {
    expect(isCircularReason("Rate-cut hopes lift homebuilders", "DHI", "D.R. Horton")).toBe(false);
    expect(isCircularReason("ABC jumps after being added to S&P 500", "ABC", "ABC Corp")).toBe(false);
    expect(isCircularReason("Positive topline data for its lead drug", "ABC", "ABC Corp")).toBe(false);
    expect(isCircularReason("Medicaid cuts weigh on hospital stocks", "HCA", "HCA Healthcare")).toBe(false);
    expect(isCircularReason("Barrick jumps as gold hits a record", "GOLD", "Barrick Mining Corp")).toBe(false);
  });

  it("treats an empty line as no reason", () => {
    expect(isCircularReason("", "NVDA", "NVIDIA")).toBe(true);
    expect(isCircularReason(null)).toBe(true);
  });
});

describe("realReason", () => {
  it("returns the reason only when it names a cause", () => {
    expect(realReason(" Raised its outlook. ", "NVDA", "NVIDIA")).toBe("Raised its outlook.");
    expect(realReason("Semiconductor rally drives SOXL higher", "SOXL", null)).toBeNull();
    expect(realReason(undefined)).toBeNull();
  });
});

describe("reason-quality: more real causes (ship 27 QA)", () => {
  it("keeps real causes and still drops circular ones", async () => {
    const { isCircularReason } = await import("./reason-quality");
    for (const text of [
      "AMD beats on the top and bottom line",
      "Shares drop as lock-up expires",
      "Stock joins Nasdaq-100",
      "Falls on dilution fears",
      "Slides after cyberattack",
      "Rises after Nvidia invests $5 billion",
      "Falls after 737 crash",
      "Rallies on China stimulus",
      "Falls on jet fuel costs",
    ]) expect(isCircularReason(text, "XYZ", "Xyz Corp")).toBe(false);
    for (const text of ["Semiconductor rally drives SOXL higher", "Rallies with chip stocks after a report on the sector", "Investors digest update"]) {
      expect(isCircularReason(text, "SOXL", "Direxion Daily Semiconductor Bull 3X")).toBe(true);
    }
  });
});
