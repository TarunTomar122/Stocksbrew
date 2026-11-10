import { describe, expect, it } from "vitest";

import {
  briefingItemFor,
  cleanReportTicker,
  earningsDayHref,
  fmtEps,
  fmtRange,
  fmtUsd,
  isIndexable,
  isReportDay,
  latestPerTicker,
  reportDescription,
  toReport,
  type EarningsDayReport,
} from "./earnings-day-shared";

const base: EarningsDayReport = {
  ticker: "QLYS",
  company: "Qualys",
  event_date: "2026-11-09",
  status: "complete",
  filing: { form: "8-K", accession: "a", filed_at: "2026-11-09T21:08:26+00:00", url: "https://www.sec.gov/x.htm", index_url: "https://www.sec.gov/i.htm" },
  eps: { estimate: 1.46, actual: 1.67, verdict: "beat", surprise: 0.21, surprise_pct: 14.4 },
  revenue: { value: 188_049_000, prior: 169_882_000, yoy_pct: 10.7 },
  guidance: { change: "raised", items: [] },
  read: {
    title: "Qualys Q3 2026 Earnings: Beat on EPS, Revenue Up 11%, Guidance Raised",
    headline: "Qualys beat on EPS, raised its outlook and the stock fell 13.5%.",
    lead: "Earned $1.67 a share against the $1.46 analysts expected.",
    insights: [
      { id: "eps-QLYS", tone: "up", text: "Earned $1.67 a share against the $1.46 analysts expected, a 14.4% beat." },
      { id: "revenue-QLYS", tone: "up", text: "Revenue was $188.0 million, up 10.7%." },
      { id: "guidance-QLYS", tone: "up", text: "Qualys raised its full-year 2026 revenue outlook." },
    ],
    watch: [],
  },
};

describe("earnings day report rules", () => {
  it("indexes a page only once the release is read and there is a verdict or a revenue figure", () => {
    expect(isIndexable(base)).toBe(true);
    expect(isIndexable({ ...base, status: "partial" })).toBe(false);
    expect(isIndexable({ ...base, filing: null })).toBe(false);
    expect(isIndexable({ ...base, eps: { ...base.eps!, verdict: "pending", actual: null }, revenue: null })).toBe(false);
    expect(isIndexable({ ...base, eps: { ...base.eps!, verdict: "pending", actual: null } })).toBe(true);
    expect(isIndexable(null)).toBe(false);
  });

  it("sends the read of an uncovered stock nowhere", () => {
    const covered = briefingItemFor(base, true);
    expect(covered.headline).toBe(base.read!.headline);
    expect(covered.insights).toHaveLength(2);
    expect(covered.href).toBe("/stock/QLYS/earnings/2026-11-09");
    const locked = briefingItemFor(base, false);
    expect(locked.headline).toBeNull();
    expect(locked.insights).toEqual([]);
    expect(JSON.stringify(locked)).not.toContain("14.4%");
    expect(locked.title).toBe(base.read!.title);
  });

  it("parses stored documents defensively", () => {
    expect(toReport(null)).toBeNull();
    expect(toReport({ ticker: "QLYS", event_date: "nope", read: { title: "x" } })).toBeNull();
    expect(toReport({ ticker: "QLYS", event_date: "2026-11-09" })).toBeNull();
    const parsed = toReport({ ticker: "qlys", event_date: "2026-11-09", read: { title: "T", headline: "H" }, status: "weird" });
    expect(parsed?.ticker).toBe("QLYS");
    expect(parsed?.status).toBe("partial");
    expect(parsed?.read?.insights).toEqual([]);
  });

  it("keeps the newest report per ticker", () => {
    const older = { ...base, event_date: "2026-08-04" };
    const other = { ...base, ticker: "HIMS", event_date: "2026-11-09" };
    expect(latestPerTicker([older, base, other]).map((r) => `${r.ticker} ${r.event_date}`)).toEqual(["HIMS 2026-11-09", "QLYS 2026-11-09"]);
  });

  it("formats money, EPS and ranges the way the read writes them", () => {
    expect(fmtUsd(188_049_000)).toBe("$188.0 million");
    expect(fmtUsd(1_497_000_000)).toBe("$1.50 billion");
    expect(fmtUsd(null)).toBe("n/a");
    expect(fmtEps(-0.29)).toBe("−$0.29");
    expect(fmtRange({ low: 736_900_000, high: 738_900_000, unit: "usd" })).toBe("$736.9 to $738.9 million");
    expect(fmtRange({ low: 8.07, high: 8.14, unit: "usd_per_share" })).toBe("$8.07 to $8.14");
  });

  it("checks addresses", () => {
    expect(cleanReportTicker("brk.b")).toBe("BRK.B");
    expect(cleanReportTicker("<script>")).toBeNull();
    expect(isReportDay("2026-02-30")).toBe(false);
    expect(isReportDay("2026-11-09")).toBe(true);
    expect(earningsDayHref("brk.b", "2026-11-07")).toBe("/stock/BRK.B/earnings/2026-11-07");
    expect(reportDescription(base)).toContain("Qualys beat on EPS");
  });
});
