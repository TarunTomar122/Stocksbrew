import { describe, expect, it } from "vitest";

import { buildStockTimeline, reportDaysOf, staleOptionsMoveLine, withoutStaleOptionsLines } from "@/lib/stock-timeline";

// AMD on Thu Nov 12, 2026: Q3 reported Nov 3, the next report in February.
const today = "2026-11-12";
const afterReport = { today, lastReport: "2026-11-03", nextReport: "2027-02-02" };

describe("options' priced move refers only to the next report", () => {
  it("is stale once the report it priced is out", () => {
    expect(staleOptionsMoveLine("Options price an 8.5% post-Q3 move", "2026-11-12T12:36:49Z", afterReport)).toBe(true);
    expect(staleOptionsMoveLine("Options market prices an 8.5% post-Q2 earnings move", "2026-11-12T12:36:49Z", afterReport)).toBe(true);
    expect(staleOptionsMoveLine("Options price an 8.5% post-Q3 move", "2026-11-12T12:36:49Z", { ...afterReport, nextReport: null })).toBe(true);
  });

  it("holds before the next report, when the line was written after the last one", () => {
    const before = { today: "2026-11-12", lastReport: "2026-08-20", nextReport: "2026-11-19" };
    expect(staleOptionsMoveLine("Options markets imply roughly a 7% move after earnings", "2026-11-11T20:00:00Z", before)).toBe(false);
    // Written before the last report: it priced that one.
    expect(staleOptionsMoveLine("Options imply a 7% move after earnings", "2026-08-10T20:00:00Z", before)).toBe(true);
  });

  it("leaves other lines alone", () => {
    expect(staleOptionsMoveLine("The options market now prices a likely one-year range from $28 to $67", null, afterReport)).toBe(false);
    expect(staleOptionsMoveLine("Sales grew 42% after the Q3 report", null, afterReport)).toBe(false);
    expect(withoutStaleOptionsLines(["Sales grew 42%.", "Options price an 8.5% post-Q3 move."], "2026-11-12T00:00:00Z", afterReport)).toEqual(["Sales grew 42%."]);
  });

  it("reads the report days from the calendar", () => {
    expect(reportDaysOf([{ event_date: "2026-08-04" }, { event_date: "2026-11-03" }, { event_date: "2027-02-02" }], today)).toEqual(afterReport);
    expect(reportDaysOf([{ event_date: "2026-11-03" }], today, { event_date: "2027-02-03" }).nextReport).toBe("2027-02-03");
  });

  it("drops the stale line from the stock's timeline, as a headline or as a detail", () => {
    const { items } = buildStockTimeline({
      ticker: "AMD",
      companyName: "Advanced Micro Devices",
      now: new Date("2026-11-12T20:00:00Z"),
      lastEarningsDate: "2026-11-03",
      nextEarnings: { date: "2027-02-02", source: "Earnings calendar" },
      briefEvents: [
        { event_id: "a", title: "AMD options price an 8.5% post-Q3 move", timestamp: "2026-11-12T12:36:49Z", article_url: "https://example.com/a", source_name: "Seeking Alpha" },
        { event_id: "b", title: "AMD rises as William Blair upgrades", summary: "Options market prices an 8.5% post-Q2 earnings move", timestamp: "2026-11-12T12:40:00Z", article_url: "https://example.com/b", source_name: "Seeking Alpha" },
      ],
    } as never);
    const news = items.filter((item) => item.kind === "news");
    expect(news.map((item) => item.title)).toEqual(["AMD rises as William Blair upgrades"]);
    expect(news[0]!.detail).toBeUndefined();
  });
});
