import { describe, expect, it } from "vitest";

import { fundAddingView, fundRequestStateOf, importAddingLine } from "@/lib/funds/adding";
import { fundInstrumentId, fundKindOf } from "@/lib/funds/tickers";
import { navDayOf } from "@/lib/funds/view";

describe("which tickers are funds", () => {
  it("knows ETFs and mutual funds from the checked-in list", () => {
    expect(fundKindOf("VTWO")).toBe("etf");
    expect(fundKindOf("spy")).toBe("etf");
    expect(fundKindOf("$QQQ")).toBe("etf");
    expect(fundKindOf("VTSAX")).toBe("mutual_fund");
    expect(fundKindOf("FXAIX")).toBe("mutual_fund");
  });

  it("does not call stocks, money market funds or junk funds", () => {
    for (const ticker of ["AAPL", "NVDA", "SPAXX", "VMFXX", "ZZZZX", "BRK.B", "", null, undefined, "TOOLONG"]) {
      expect(fundKindOf(ticker)).toBeNull();
    }
  });

  it("uses the house instrument id", () => {
    expect(fundInstrumentId("vtwo")).toBe("US_VTWO");
  });
});

describe("where a fund request stands", () => {
  it("reads the request document", () => {
    expect(fundRequestStateOf(null)).toBe("none");
    expect(fundRequestStateOf({ status: "queued" })).toBe("adding");
    expect(fundRequestStateOf({ status: "running" })).toBe("adding");
    expect(fundRequestStateOf({ status: "retry", resolve_error: "fund_check: timeout" })).toBe("adding");
    expect(fundRequestStateOf({})).toBe("adding");
    expect(fundRequestStateOf({ status: "fulfilled", fulfilled: true })).toBe("ready");
    expect(fundRequestStateOf({ status: "needs_confirmation" })).toBe("not_found");
    expect(fundRequestStateOf({ status: "queued", fund_check: "not_a_fund" })).toBe("not_found");
    // Yahoo said no fund, then the stock lane placed it: it has a page.
    expect(fundRequestStateOf({ status: "fulfilled", fulfilled: true, fund_check: "not_a_fund" })).toBe("ready");
  });
});

describe("the adding page's words", () => {
  it("says we are adding it and when to come back", () => {
    expect(fundAddingView("vtwo", "etf", "adding")).toEqual({
      title: "Adding VTWO now",
      line: "Check back in a few minutes for its price, costs and holdings.",
      tone: "busy",
    });
    expect(fundAddingView("VTSAX", "mutual_fund", "none").line).toBe("Check back in a few minutes. Mutual funds are priced once a day.");
  });

  it("is honest when it is done, missing, failing or slow", () => {
    expect(fundAddingView("VTWO", "etf", "ready")).toMatchObject({ title: "VTWO is ready", line: null, tone: "done" });
    expect(fundAddingView("ABCDX", "mutual_fund", "not_found")).toMatchObject({ title: "We couldn't find a fund called ABCDX", tone: "missing" });
    expect(fundAddingView("VTWO", "etf", "error")).toMatchObject({ title: "We couldn't add VTWO right now", tone: "error" });
    expect(fundAddingView("VTWO", "etf", "slow").title).toBe("Still adding VTWO");
  });

  it("keeps within the word budget: titles of ten words or fewer, one line of fifteen or fewer", () => {
    for (const step of ["none", "adding", "ready", "not_found", "error", "slow"] as const) {
      for (const kind of ["etf", "mutual_fund"] as const) {
        const view = fundAddingView("VTWO", kind, step);
        expect(view.title.split(/\s+/).length).toBeLessThanOrEqual(10);
        if (view.line) expect(view.line.split(/\s+/).length).toBeLessThanOrEqual(15);
      }
    }
    expect(importAddingLine("etf")).toBe("New to us, adding it now. Prices in a few minutes.");
    expect(importAddingLine("mutual_fund")).toBe("New to us, adding it now. Priced once a day.");
  });
});

describe("a mutual fund's price day", () => {
  it("reads Yahoo's midnight stamp as the NAV's own day", () => {
    expect(navDayOf("2026-11-11T00:00:00+00:00")).toBe("2026-11-11");
    expect(navDayOf("2026-11-11T00:00:00Z")).toBe("2026-11-11");
  });

  it("reads any other stamp as the New York day", () => {
    expect(navDayOf("2026-11-12T01:30:00Z")).toBe("2026-11-11");
    expect(navDayOf("2026-11-12T21:00:00Z")).toBe("2026-11-12");
    expect(navDayOf(null)).toBeNull();
    expect(navDayOf("not a date")).toBeNull();
  });
});
