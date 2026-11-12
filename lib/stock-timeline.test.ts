import { describe, expect, it } from "vitest";

import { analystTrendChanges, buildStockTimeline, parseLooseDate, parseMonthPeriod, prettyDay, timelineHeadline, timelineSortMs } from "@/lib/stock-timeline";
import type { NewsArticle } from "@/lib/news";
import type { PowerTrade } from "@/lib/power-trades";
import type { TimelineEvent } from "@/lib/stock";

const now = new Date("2026-11-09T20:00:00Z");

function article(over: Partial<NewsArticle>): NewsArticle {
  return {
    id: "a1",
    market: "US",
    title: "Nvidia slides on probe",
    url: "https://example.com/a?utm=1",
    source_name: "Example",
    published_at: "2026-11-09T13:00:00Z",
    summary: "Shares fell.",
    sentiment_label: "bearish",
    sentiment_score: -0.4,
    sector_tags: [],
    tickers: ["NVDA"],
    coverage_mode: "core",
    ...over,
  };
}

const trade: PowerTrade = {
  trade_id: "t1",
  person_id: "sheldon-whitehouse",
  person_name: "Sheldon Whitehouse",
  chamber: "senate",
  party: "D",
  state: "RI",
  ticker: "NVDA",
  company: "NVIDIA",
  tx_type: "sell",
  amount_low: 15001,
  amount_high: 50000,
  transaction_date: "2026-08-13",
  disclosure_date: "2026-09-02",
  lag_days: 20,
  perf_pct: null,
  source: "Senate eFD",
  source_url: "https://efd.example",
  captured_at: "2026-09-03T00:00:00Z",
};

describe("date helpers", () => {
  it("parses the loose date formats the pipelines store", () => {
    expect(parseLooseDate("Sep 10, 2026")).toBe("2026-09-10");
    expect(parseLooseDate("2026-09-10T12:00:00Z")).toBe("2026-09-10");
    expect(parseLooseDate("soon")).toBeNull();
    expect(parseMonthPeriod("Jun '26")).toBe("2026-06-01");
    expect(parseMonthPeriod("June")).toBeNull();
    expect(prettyDay("2026-10-01", now)).toBe("Oct 1");
    expect(prettyDay("2025-10-01", now)).toBe("Oct 1, 2025");
  });

  it("sorts day rows to the end of their day but never past now", () => {
    expect(timelineSortMs({ at: "2026-11-09", precision: "day" }, now)).toBe(now.getTime());
    expect(timelineSortMs({ at: "2026-11-08", precision: "day" }, now)).toBe(Date.UTC(2026, 10, 8, 23, 59));
    expect(timelineSortMs({ at: "garbage", precision: "time" }, now)).toBe(0);
  });
});

describe("analystTrendChanges", () => {
  it("reports only the months where ratings moved", () => {
    const changes = analystTrendChanges([
      { period: "Sep '26", strong_buy: 20, buy: 40, hold: 2, sell: 0 },
      { period: "Aug '26", strong_buy: 20, buy: 39, hold: 2, sell: 1 },
      { period: "Oct '26", strong_buy: 20, buy: 40, hold: 2, sell: 0 },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ at: "2026-09-01", title: "Analyst ratings shifted: 1 more buy, 1 fewer sell", tone: "up" });
  });
});

describe("buildStockTimeline", () => {
  it("merges every source newest first and keeps each row's source", () => {
    const { items, upcoming } = buildStockTimeline({
      ticker: "NVDA",
      now,
      move: { asOf: "2026-11-09T19:00:00Z", dayChangePct: -5, headline: "Nvidia slides as board probes CEO" },
      news: [article({}), article({ id: "a2", url: "https://example.com/a?utm=2", title: "Duplicate by url" })],
      powerTrades: [trade],
      lastEarningsDate: "2026-08-26",
      callHistory: [{ date: "2026-10-02", from: "Hold", to: "Add", text: "Add on dips.", priceAtCall: 201.5 }],
      nextEarnings: { date: "2026-11-17", time: "amc", epsEstimate: 2.49, source: "Earnings calendar" },
      congressHref: (item) => `/follow/${item.person_id}`,
    });
    expect(items.map((item) => item.id)).toEqual(["move", "news-a1", "call-2026-10-02", "earnings-2026-08-26", "congress-t1"]);
    expect(items[2]).toMatchObject({
      title: "Our call moved from hold to add",
      detail: "Add on dips. NVDA was at $201.50.",
      source: "stocksbrew call ledger",
      tone: "up",
    });
    expect(items[3]).toMatchObject({ title: "NVDA reported earnings", source: "Earnings calendar" });
    expect(items[4]).toMatchObject({
      title: "Sheldon Whitehouse sold NVDA",
      href: "/follow/sheldon-whitehouse",
      detail: "Senate, D-RI. Amount $15K to $50K. Disclosed Sep 2, 20 days after the trade.",
    });
    expect(upcoming).toEqual([
      {
        id: "next-earnings-2026-11-17",
        kind: "earnings",
        date: "2026-11-17",
        title: "NVDA reports earnings after the market closes",
        detail: "Analysts expect $2.49 a share.",
        source: "Earnings calendar",
      },
    ]);
  });

  it("hides the earnings write-up from free readers and skips a ledger entry the brief already explains", () => {
    const { items } = buildStockTimeline({
      ticker: "NVDA",
      now,
      earnings: { ticker: "NVDA", event_date: "2026-08-26", report: { headline: "Beat and raise", summary: "" } },
      earningsLocked: true,
      callChange: { at: "2026-11-09T15:00:00Z", reason: "Probe adds risk.", headline: "Hold here" },
      callHistory: [{ date: "2026-11-09", from: "Add", to: "Hold" }],
    });
    expect(items.map((item) => item.id)).toEqual(["call-change", "earnings-2026-08-26"]);
    expect(items[1]).toMatchObject({ title: "NVDA reported earnings", locked: true });
    expect(items[1]!.detail).toBeUndefined();
  });

  it("leaves out brief stories that only quote the bank as the analyst", () => {
    const { items } = buildStockTimeline({
      ticker: "JPM",
      now,
      briefEvents: [
        { event_id: "a", timestamp: "2026-08-25T13:14:54Z", title: "JPMorgan Says Strategy Could Face $2.8 Billion in Forced Selling. What Would That Do to the Bitcoin Price?", source_name: "Yahoo Finance" },
        { event_id: "b", timestamp: "2026-08-25T12:00:00Z", title: "JPMorgan Chase (JPM) Takes Lead Role In A Major AI IPO", source_name: "Yahoo Finance" },
      ] as TimelineEvent[],
    });
    expect(items.map((item) => item.title)).toEqual(["JPMorgan Chase (JPM) takes lead role in a major AI IPO"]);
  });

  it("is empty when nothing is stored", () => {
    expect(buildStockTimeline({ ticker: "X", now })).toEqual({ items: [], upcoming: [] });
  });

  it("names both calls when the ledger confirms the switch", () => {
    const { items } = buildStockTimeline({
      ticker: "NVDA",
      now,
      callChange: { at: "2026-11-09T15:00:00Z", reason: null, headline: "Hold here", from: "Buy more", to: "Keep" },
    });
    expect(items[0]).toMatchObject({ id: "call-change", title: "We changed our call from Buy more to Keep" });
  });
});

describe("timelineHeadline", () => {
  it("writes a Title Case headline as a sentence, keeping the company's own words, without the publisher it already names", () => {
    expect(timelineHeadline("Here's How Much You Would Have Made Owning JPMorgan Chase Stock In The Last 5 Years - Benzinga", "Benzinga", "JPMorgan Chase & Co.")).toBe(
      "Here's how much you would have made owning JPMorgan Chase stock in the last 5 years",
    );
    expect(timelineHeadline("JPMorgan May Sell $2 Billion of Qualtrics Debt at About 85 Cents on the Dollar", "Yahoo Finance", "JPMorgan Chase & Co.")).toBe(
      "JPMorgan may sell $2 billion of Qualtrics debt at about 85 cents on the dollar",
    );
  });

  it("leaves a sentence-case headline, and a dash that is not the publisher, alone", () => {
    expect(timelineHeadline("Nvidia board prepares to remove Huang after latest allegations: report", "Seeking Alpha", "NVIDIA Corporation")).toBe(
      "Nvidia board prepares to remove Huang after latest allegations: report",
    );
    expect(timelineHeadline("Apple slips - analysts split on iPhone demand", "Reuters", "Apple Inc.")).toBe("Apple slips - analysts split on iPhone demand");
    expect(timelineHeadline("Is Apple a buy now? - The Motley Fool", "Motley Fool", "Apple Inc.")).toBe("Is Apple a buy now?");
  });

  it("sentence-cases news rows built from the feed", () => {
    const { items } = buildStockTimeline({
      ticker: "JPM",
      companyName: "JPMorgan Chase & Co.",
      now,
      news: [article({ title: "JPMorgan Announces Cash Distributions For The JPMorgan ETFs", source_name: "Yahoo Finance", published_at: "2026-11-09T12:00:00Z" })],
    });
    expect(items.find((item) => item.kind === "news")?.title).toBe("JPMorgan announces cash distributions for the JPMorgan ETFs");
  });
});
