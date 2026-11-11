import { describe, expect, it } from "vitest";

import {
  buildCongressMemberRead,
  buildFollowRead,
  buildFundRead,
  buildInsiderRead,
  dominantPeriod,
  fundIsStale,
  fundStaleLine,
  insiderPace,
  memberIsStale,
  memberStaleLine,
  missedFilings,
  mostBought,
  mostSold,
  tallyCongress,
  tallyFundMoves,
  type CongressTradeLite,
  type FundDigest,
} from "@/lib/follow-insights";
import type { CongressProfile, FundProfile, InsiderTrade } from "@/lib/follow-shared";

/** A fixed day, so records do not go stale as the calendar moves. */
const TODAY = "2026-11-11";

function digest(slug: string, period: string, moves: Partial<Record<"opened" | "added" | "reduced" | "exited", string[]>>): FundDigest {
  const lines = (list?: string[]) => (list ?? []).map((ticker) => ({ ticker, name: `${ticker} Inc`, weight: 0.05 }));
  return { slug, name: slug.toUpperCase(), period, filed_at: "2026-08-14", opened: lines(moves.opened), added: lines(moves.added), reduced: lines(moves.reduced), exited: lines(moves.exited) };
}

function buy(symbol: string, filed: string, insider: string, extra: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    id: `${symbol}-${filed}-${insider}`,
    symbol,
    company: `${symbol} Corp`,
    insider,
    insider_id: insider,
    role: "Director",
    tx_type: "buy",
    shares: 100,
    price: 10,
    value: 1000,
    transaction_date: filed,
    filing_date: filed,
    filed_at: `${filed}T10:00:00`,
    lag_days: 1,
    shares_after: null,
    ownership: "D",
    plan_10b5_1: false,
    url: "",
    ...extra,
  };
}

function trade(ticker: string, person: string, side: "buy" | "sell", date = "2026-11-01"): CongressTradeLite {
  return { ticker, company: `${ticker} Inc`, person_id: person, person_name: person, tx_type: side, disclosure_date: date };
}

describe("fund tallies", () => {
  const digests = [
    digest("a", "2026-06-30", { opened: ["AMZN"], reduced: ["AAPL"] }),
    digest("b", "2026-06-30", { added: ["AMZN", "SPY"], exited: ["AAPL"] }),
    digest("c", "2026-06-30", { added: ["AMZN"], reduced: ["AAPL", "MSFT"] }),
    digest("d", "2026-09-30", { added: ["NVDA"] }),
  ];

  it("picks the quarter most funds filed for", () => {
    expect(dominantPeriod(digests)).toBe("2026-06-30");
    expect(dominantPeriod([])).toBeNull();
  });

  it("counts each fund once per side and leaves index funds out", () => {
    const tallies = tallyFundMoves(digests, "2026-06-30");
    const amzn = tallies.find((row) => row.ticker === "AMZN");
    expect(amzn?.buyers.map((buyer) => buyer.id)).toEqual(["a", "b", "c"]);
    expect(amzn?.opened).toBe(1);
    expect(tallies.some((row) => row.ticker === "SPY")).toBe(false);
    expect(tallies.some((row) => row.ticker === "NVDA")).toBe(false);
    expect(mostBought(tallies, 1)[0].ticker).toBe("AMZN");
    expect(mostSold(tallies, 1)[0].ticker).toBe("AAPL");
  });

  it("writes the crowd insight with counts out of the funds that filed", () => {
    const read = buildFollowRead({ digests, totalFunds: 4, congress: [], insiderBuys: [], sectors: {}, today: "2026-11-10" });
    expect(read.headline).toContain("AMZN");
    expect(read.insights[0].text).toBe(
      "In their Q2 2026 reports, 3 of 3 funds bought or added to AMZN, more than any other stock. 3 sold some or all of their AAPL, more than any other stock.",
    );
    expect(read.fundsInPeriod).toBe(3);
    // The funds tab leads with the funds-only sentence; Congress has its own tab.
    expect(read.fundLead).toBe(read.headline.split(" Members of Congress")[0]);
    expect(read.fundLead.endsWith(".")).toBe(true);
  });

  it("leaves the crowd insight out when fewer than three funds agree", () => {
    const read = buildFollowRead({ digests: digests.slice(0, 2), totalFunds: 2, congress: [], insiderBuys: [], sectors: {}, today: "2026-11-10" });
    expect(read.insights.find((insight) => insight.id === "fund-crowd")).toBeUndefined();
    expect(read.headline).toBe("");
    expect(read.fundLead).toBe("");
  });

  it("puts the reader's own stocks first when funds moved them", () => {
    const read = buildFollowRead({ digests, totalFunds: 4, congress: [], insiderBuys: [], sectors: {}, today: "2026-11-10", mine: ["AMZN", "AAPL"] });
    expect(read.insights[0].id).toBe("your-stocks");
    expect(read.insights[0].text).toContain("net buyers of AMZN (3 bought, 0 cut)");
    expect(read.insights[0].text).toContain("net sellers of AAPL (0 bought, 3 cut)");
  });
});

describe("Congress", () => {
  it("counts distinct members and drops trades before the window", () => {
    const tallies = tallyCongress(
      [trade("NVDA", "x", "buy"), trade("NVDA", "x", "buy"), trade("NVDA", "y", "buy"), trade("NVDA", "z", "buy", "2026-09-01")],
      "2026-10-11",
    );
    expect(tallies[0].buyers).toHaveLength(2);
  });

  it("names the sector most members bought into", () => {
    const congress = [trade("NVDA", "a", "buy"), trade("AVGO", "b", "buy"), trade("NVDA", "c", "buy"), trade("JPM", "d", "buy"), trade("XOM", "e", "sell"), trade("XOM", "f", "sell")];
    const read = buildFollowRead({
      digests: [],
      totalFunds: 0,
      congress,
      insiderBuys: [],
      sectors: { NVDA: "Technology", AVGO: "Technology", JPM: "Financials" },
      today: "2026-11-10",
    });
    const insight = read.insights.find((item) => item.id === "congress");
    expect(insight?.text).toBe("3 members of Congress reported buying tech stocks in the last 30 days, more than any other sector (NVDA and AVGO).");
    expect(insight?.soWhat).toBe("Across all stocks they reported 4 buys and 2 sales.");
  });
});

describe("insiders", () => {
  it("compares the last two weeks with the normal pace and finds a hot sector", () => {
    const buys = [
      buy("XOM", "2026-11-05", "a"),
      buy("CVX", "2026-11-04", "b"),
      buy("XOM", "2026-11-03", "c"),
      buy("SLB", "2026-11-02", "d"),
      buy("JPM", "2026-09-15", "e"),
      buy("JPM", "2026-10-01", "f"),
    ];
    const pace = insiderPace(buys, "2026-11-10", { XOM: "Energy", CVX: "Energy", SLB: "Energy", JPM: "Financials" });
    expect(pace?.recent).toBe(4);
    expect(pace?.hotSector?.sector).toBe("Energy");
    expect(pace?.hotSector?.tickers[0]).toBe("XOM");
  });

  it("needs two windows of history before calling anything unusual", () => {
    expect(insiderPace([buy("XOM", "2026-11-05", "a")], "2026-11-10", {})).toBeNull();
  });

  it("calls out several insiders buying one stock, and the dollar balance", () => {
    const buys = [buy("LKQ", "2026-11-05", "a"), buy("LKQ", "2026-11-04", "b"), buy("ACN", "2026-11-04", "c", { value: 500_000, role: "Chief Executive Officer" })];
    const sale = { ...buy("AAPL", "2026-11-05", "z"), id: "s", tx_type: "sell" as const, value: 10_000_000 };
    const read = buildInsiderRead({ buys, recent: [sale, ...buys], sectors: {}, today: "2026-11-10" });
    const multi = read.insights.find((insight) => insight.id === "insider-multi" || insight.id === "insider-conviction");
    expect(multi?.tickers?.[0]).toBe("LKQ");
    const balance = read.insights.find((insight) => insight.id === "insider-balance");
    // The same 7-day window and count as /filings (lib/insider-balance.ts), plan sales included and their share said underneath.
    expect(balance?.text).toBe("Insiders sold $10.0M in the last 7 days and bought $502K, 20 dollars sold for every one bought.");
    expect(balance?.soWhat).toBe("None of the selling was under pre-set plans. Selling is normal (pay, taxes, diversifying); buying is the rarer tell.");
  });
});

describe("one fund, one member", () => {
  const perf = {
    start_date: "2013-08-14",
    end_date: "2026-11-09",
    ended: false,
    fund: { r_1m: null, r_3m: null, r_ytd: null, r_1y: null, r_since: 3, annualized: 0.173, max_drawdown: -0.45 },
    spy: { r_1m: null, r_3m: null, r_ytd: null, r_1y: null, r_since: 2, annualized: 0.139, max_drawdown: -0.34 },
    covered_weight_latest: 1,
    covered_weight_avg: 1,
  };

  it("puts a tiny new stake after the moves that changed the fund", () => {
    const profile = {
      fund: "Berkshire Hathaway",
      latest: { quarter: "Q2 2026", filed_at: "2026-08-14", period: "2026-06-30", stock_positions: 40 },
      portfolio: [{ ticker: "AAPL", weight: 0.22 }],
      changes: {
        counts: { new: 1, added: 1, reduced: 0, sold: 0, held: 0 },
        new: [{ ticker: "DHI", name: "D.R. Horton, Inc.", weight: 0.0004 }],
        added: [{ ticker: "GOOGL", name: "Alphabet Inc.", weight: 0.09, prev_weight: 0.02 }],
        reduced: [],
        sold: [],
      },
      performance: perf,
    } as unknown as FundProfile;
    expect(buildFundRead(profile, null, TODAY).headline).toBe("Berkshire Hathaway added to Alphabet in Q2 2026, and opened a small new stake in D.R. Horton.");
  });

  it("reads a fund's concentration, moves and record", () => {
    const profile = {
      fund: "Pershing Square",
      latest: { quarter: "Q2 2026", filed_at: "2026-08-14", period: "2026-06-30", stock_positions: 14 },
      portfolio: [
        { ticker: "UBER", weight: 0.3 },
        { ticker: "BN", weight: 0.2 },
        { ticker: "MSFT", weight: 0.12 },
      ],
      changes: {
        counts: { new: 1, added: 1, reduced: 1, sold: 1, held: 0 },
        new: [{ ticker: "V", weight: 0.058 }],
        added: [{ ticker: "UBER", weight: 0.3, prev_weight: 0.2 }],
        reduced: [{ ticker: "AMZN", weight: 0.104, prev_weight: 0.17 }],
        sold: [{ ticker: "GOOG", prev_weight: 0.006 }],
      },
      performance: perf,
    } as unknown as FundProfile;
    const read = buildFundRead(profile, null, TODAY);
    expect(read.headline).toBe("Pershing Square bought V, added to UBER, cut AMZN and sold all of GOOG in Q2 2026.");
    expect(read.insights[0].text).toBe("Pershing Square is 62% in three stocks: UBER 30%, BN 20% and MSFT 12%.");
    expect(read.insights[1].text).toBe("In Q2 2026 it opened V (5.8%), added to UBER (now 30%), cut AMZN to 10.4% and sold out of GOOG.");
    expect(read.insights[2].text).toBe(
      "Since Aug 14, 2013, copying Pershing Square's stock picks from each filing date beat the S&P 500 by 3.4 points a year (+17.3% against +13.9%).",
    );
  });

  it("reads a member's favourite stock and lean", () => {
    const profile = {
      name: "Jane Doe",
      first_report: "2023-01-12",
      latest_date: "2026-11-01",
      stats: { trades: 5, buys: 4, sells: 1, est_volume: 0, median_lag_days: 20, late_trades: 1, top_bought: [{ ticker: "NVDA", name: null, weight: null }] },
      trades: [
        { ticker: "NVDA", company: "Nvidia", tx_type: "buy" },
        { ticker: "NVDA", company: "Nvidia", tx_type: "buy" },
        { ticker: "NVDA", company: "Nvidia", tx_type: "sell" },
        { ticker: "AAPL", company: "Apple", tx_type: "buy" },
        { ticker: "MSFT", company: "Microsoft", tx_type: "buy" },
      ],
      performance: perf,
    } as unknown as CongressProfile;
    const read = buildCongressMemberRead(profile, null, TODAY);
    expect(read.headline).toBe("Copying Jane Doe's buys beat the S&P 500 by 3.4 points a year since Aug 2013.");
    expect(read.insights[0].text).toBe("NVDA is the stock Jane Doe trades most: 2 buys and 1 sale in the latest 5 reported trades.");
    expect(read.insights[1].soWhat).toBe("A typical trade reaches the public 20 days after it happens; 1 came in past the 45-day limit.");
  });
});

describe("records that stopped", () => {
  it("treats a member as stopped after about six months without a report", () => {
    expect(memberIsStale("2024-12-10", TODAY)).toBe(true);
    expect(memberIsStale("2026-06-01", TODAY)).toBe(false);
    expect(memberIsStale("", TODAY)).toBe(false);
    expect(memberStaleLine({ name: "Morgan McGarvey", latest_date: "2024-12-10" }, TODAY)).toBe(
      "Our records for Morgan McGarvey stop in December 2024; we don't know what they have traded since.",
    );
    expect(memberStaleLine({ name: "Jane Doe", latest_date: "2026-11-01" }, TODAY)).toBeNull();
  });

  it("counts the 13Fs a fund has missed by their 45-day deadlines", () => {
    // Q3 2026 is due Nov 14, so on Nov 11 the Q2 2026 report is the latest one owed.
    expect(missedFilings("2026-06-30", TODAY)).toBe(0);
    expect(missedFilings("2026-03-31", TODAY)).toBe(1);
    expect(missedFilings("2025-12-31", TODAY)).toBe(2);
    // Not missed on the deadline day itself, only after it.
    expect(missedFilings("2026-06-30", "2026-11-14")).toBe(0);
    expect(missedFilings("2026-06-30", "2026-11-15")).toBe(1);
    expect(fundIsStale("2026-03-31", TODAY)).toBe(false);
    expect(fundIsStale("2025-12-31", TODAY)).toBe(true);
    const fund = { fund: "Old Fund LP", latest: { period: "2025-09-30", filed_at: "2025-11-13" } } as unknown as FundProfile;
    expect(fundStaleLine(fund, TODAY)).toBe("Our records for Old Fund LP stop with its Q3 2025 report, filed in November 2025; we don't know what it has traded since.");
  });

  it("says what a stopped member did in the past tense", () => {
    const profile = {
      name: "Morgan McGarvey",
      first_report: "2023-03-24",
      latest_date: "2024-12-10",
      stats: { trades: 6, buys: 2, sells: 4, est_volume: 0, median_lag_days: 20, late_trades: 0, top_bought: [] },
      trades: [
        { ticker: "MSFT", company: "Microsoft", tx_type: "sell" },
        { ticker: "MSFT", company: "Microsoft", tx_type: "sell" },
        { ticker: "MSFT", company: "Microsoft", tx_type: "buy" },
        { ticker: "AAPL", company: "Apple", tx_type: "sell" },
        { ticker: "AAPL", company: "Apple", tx_type: "sell" },
        { ticker: "NVDA", company: "Nvidia", tx_type: "buy" },
      ],
      performance: null,
    } as unknown as CongressProfile;
    const read = buildCongressMemberRead(profile, null, TODAY);
    const all = [read.headline, ...read.insights.flatMap((item) => [item.text, item.soWhat ?? ""])].join(" ");
    expect(all).toContain("MSFT was the stock Morgan McGarvey traded most: 1 buy and 2 sales in the last 6 reported trades we have.");
    expect(all).toContain("Morgan McGarvey sold more than they bought: 2 buys and 4 sales from Mar 24, 2023 to Dec 10, 2024.");
    expect(all).toContain("A typical trade reached the public 20 days after it happened.");
    expect(all).not.toMatch(/trades most|sells more than buys|reaches the public/);
  });

  it("describes a stopped fund as it was at its last filing", () => {
    const profile = {
      fund: "Old Fund",
      latest: { quarter: "Q3 2025", filed_at: "2025-11-13", period: "2025-09-30", stock_positions: 14 },
      portfolio: [
        { ticker: "UBER", weight: 0.3 },
        { ticker: "BN", weight: 0.2 },
        { ticker: "MSFT", weight: 0.12 },
      ],
      changes: null,
      performance: null,
    } as unknown as FundProfile;
    expect(buildFundRead(profile, null, TODAY).headline).toBe("Old Fund was 62% in three stocks: UBER 30%, BN 20% and MSFT 12% at its last filing.");
  });
});
