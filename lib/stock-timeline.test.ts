import { describe, expect, it } from "vitest";

import { analystTrendChanges, buildStockTimeline, developmentSentence, lineRepeatsRow, parseLooseDate, parseMonthPeriod, prettyDay, saysSameDevelopment, timelineHeadline, timelineSortMs, weekChange, type StockTimelineItem } from "@/lib/stock-timeline";
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
      title: "Our call moved from Keep to Buy more",
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
    expect(items.map((item) => item.title)).toEqual(["JPMorgan Chase takes lead role in a major AI IPO"]);
  });

  it("tells a bait headline by its plain summary when it names the stock, or leaves it out", () => {
    const { items } = buildStockTimeline({
      ticker: "JPM",
      companyName: "JPMorgan Chase & Co.",
      now,
      news: [
        article({
          id: "b3",
          url: "https://example.com/b3",
          title: "JPMorgan Predicted Strong Wegovy Pill Sales (and Was Right). Is Novo Nordisk Stock a Buy Now?",
          summary: "Novo Nordisk lived up to expectations for its Wegovy pill in the third quarter, but it still has more work ahead.",
        }),
        article({ id: "b1", url: "https://example.com/b1", title: "Here's How Much You Would Have Made Owning JPMorgan Chase Stock In The Last 5 Years", summary: "" }),
        article({
          id: "b2",
          url: "https://example.com/b2",
          title: "JPMorgan Chase & Co. (JPM) is Attracting Investor Attention: Here is What You Should Know",
          summary: "JPMorgan agreed to buy a payments startup for $1.2 billion on Monday. More details followed.",
        }),
      ],
    });
    expect(items.map((item) => item.title)).toEqual(["JPMorgan agreed to buy a payments startup for $1.2 billion on Monday."]);
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

describe("developmentSentence", () => {
  const input = { ticker: "JPM", companyName: "JPMorgan Chase & Co.", day: "Nov 10", recent: true };
  it("turns a company-first headline into a dated past-tense sentence", () => {
    expect(developmentSentence("JPMorgan Chase (JPM) takes lead role in a major AI IPO", input)?.text).toBe("JPMorgan Chase took lead role in a major AI IPO on Nov 10.");
    expect(developmentSentence("JPMorgan announces cash distributions for the JPMorgan ETFs", input)?.text).toBe("JPMorgan announced cash distributions for the JPMorgan ETFs on Nov 10.");
  });
  it("is null for questions, lists, other companies, maybes and price moves", () => {
    expect(developmentSentence("Here’s how much you would have made owning JPMorgan Chase stock in the last 5 years", input)).toBeNull();
    expect(developmentSentence("JPMorgan may sell $2 billion of Qualtrics debt at about 85 cents on the dollar", input)).toBeNull();
    expect(developmentSentence("Anthropic plans IPO live stream with Amodei, JPMorgan CEO Dimon", input)).toBeNull();
    expect(developmentSentence("JPMorgan vs. Bank of America: Which dividend stock is better for retirement?", input)).toBeNull();
    expect(developmentSentence("JPMorgan’s stock drops as the bank reshuffles", input)).toBeNull();
    // Price moves, analyst notes on other companies and headline-relative days are not developments.
    expect(developmentSentence("JPMorgan closes at a record high", input)).toBeNull();
    expect(developmentSentence("JPMorgan raises Nvidia price target to $250", input)).toBeNull();
    expect(developmentSentence("JPMorgan announces a buyback today", input)).toBeNull();
    // A short ticker that is also a word only counts in capitals.
    expect(developmentSentence("All signed contracts point to a strong quarter", { ...input, ticker: "ALL", companyName: "The Allstate Corporation" })).toBeNull();
    expect(developmentSentence("It takes more than AI to win", { ...input, ticker: "IT", companyName: "Gartner, Inc." })).toBeNull();
    // The price after a comma is not part of what happened, and "U.S." does not end the clause.
    expect(developmentSentence("JPMorgan signs U.S. payments deal, shares jump", input)?.text).toBe("JPMorgan signed U.S. payments deal on Nov 10.");
  });
});

describe("timelineHeadline tails", () => {
  it("strips a known site after a bar and a trailing ticker tag, and keeps a real second half", () => {
    expect(timelineHeadline("Nvidia: Why I’m Buying The Fear (NASDAQ:NVDA) | Seeking Alpha", "Google News", "NVIDIA Corporation")).toBe("Nvidia: Why I’m buying the fear");
    expect(timelineHeadline("Stock market today | Nifty 50 ends higher", "Mint", "")).toBe("Stock market today | Nifty 50 ends higher");
    expect(timelineHeadline("Firmly Raises $15 Million Series A Round", "Business Wire", "")).toContain("Series A");
  });
});

describe("weekChange", () => {
  const now = new Date("2026-11-12T07:00:00Z");
  const news = (title: string, at: string): StockTimelineItem => ({ id: title, kind: "news", at, precision: "time", title, source: "Yahoo Finance" });
  const jpm = [
    news("Here’s how much you would have made owning JPMorgan Chase stock in the last 5 years", "2026-11-11T20:00:00Z"),
    news("JPMorgan partners with OpenAI: What it means for JPM's AI strategy", "2026-11-11T15:00:00Z"),
    news("JPMorgan Chase (JPM) takes lead role in a major AI IPO", "2026-11-10T20:00:00Z"),
    news("JPMorgan may sell $2 billion of Qualtrics debt at about 85 cents on the dollar", "2026-11-10T18:00:00Z"),
    news("JPMorgan Chase & Co. (JPM) is attracting investor attention: Here is what you should know", "2026-11-10T16:00:00Z"),
    news("JPMorgan announces cash distributions for the JPMorgan ETFs", "2026-11-10T14:00:00Z"),
    news("JPMorgan (JPM) stock may be 31% undervalued on Senate probe news", "2026-11-10T13:00:00Z"),
    news("Anthropic plans IPO live stream with Amodei, JPMorgan CEO Dimon", "2026-11-09T13:00:00Z"),
    news("JPMorgan beats on trading revenue", "2026-10-20T13:00:00Z"),
  ];

  it("leads with the development behind the subject most stories share, said from its strongest headline", () => {
    // AI is the subject (OpenAI and Anthropic count under it); the newest headline that says JPMorgan did something leads.
    expect(weekChange(jpm, { ticker: "JPM", companyName: "JPMorgan Chase & Co.", now })).toBe("JPMorgan partnered with OpenAI on Nov 11.");
  });

  it("never describes the feed instead of the company", () => {
    const line = weekChange(jpm, { ticker: "JPM", companyName: "JPMorgan Chase & Co.", now }) ?? "";
    expect(line).not.toMatch(/stories|are about/);
  });

  it("says something still going on in the present, only from a story of the last two days", () => {
    const nvda = [
      news("Dow Jones futures rise, techs fall as Nvidia may oust CEO Huang after CoreWeave leads rally", "2026-11-11T20:00:00Z"),
      news("Trump’s ties to Nvidia CEO Jensen Huang in the spotlight", "2026-11-11T19:00:00Z"),
      news("Nvidia board meets to decide CEO Huang’s future, source says", "2026-11-11T18:00:00Z"),
      news("Nasdaq-100 futures slide as the Nvidia sell-off resumes", "2026-11-11T17:00:00Z"),
    ];
    expect(weekChange(nvda, { ticker: "NVDA", companyName: "NVIDIA Corporation", now })).toBe("Nvidia's board is meeting to decide CEO Huang’s future.");
    // A week-old "meets" may be long settled: nothing leads instead.
    const old = nvda.map((item) => ({ ...item, at: item.at.replace("2026-11-11", "2026-11-07") }));
    expect(weekChange(old, { ticker: "NVDA", companyName: "NVIDIA Corporation", now })).toBeNull();
  });

  it("leads with a report, and with our own call when the news shares no subject", () => {
    const call: StockTimelineItem = { id: "call-2026-11-09", kind: "call", at: "2026-11-09", precision: "day", title: "Our call moved from Keep to Buy more", source: "stocksbrew call ledger" };
    expect(weekChange([...jpm, call], { ticker: "JPM", companyName: "JPMorgan Chase & Co.", now })).toBe("JPMorgan partnered with OpenAI on Nov 11.");
    expect(weekChange([jpm[0]!, call], { ticker: "JPM", companyName: "JPMorgan Chase & Co.", now })).toBe("Our call moved from Keep to Buy more on Nov 9.");
    const report: StockTimelineItem = { id: "earnings", kind: "earnings", at: "2026-11-10", precision: "day", title: "JPM reported earnings", source: "Earnings calendar" };
    expect(weekChange([report], { ticker: "JPM", now })).toBe("JPM reported earnings on Nov 10.");
  });

  it("is null when the stories share no subject, and on a quiet week", () => {
    const mixed = [news("Bank names a new head of trading", "2026-11-11T10:00:00Z"), news("Card spending rose in October", "2026-11-10T10:00:00Z")];
    expect(weekChange(mixed, { ticker: "JPM", now })).toBeNull();
    // Market words and stock-tip headlines are no subject.
    const noise = [news("3 bank stocks to buy now as the Fed holds", "2026-11-11T10:00:00Z"), news("U.S. banks rally as the Fed signals a pause", "2026-11-10T10:00:00Z")];
    expect(weekChange(noise, { ticker: "JPM", now })).toBeNull();
    expect(weekChange([news("Old story", "2026-10-01T10:00:00Z")], { ticker: "JPM", now })).toBeNull();
  });
});

describe("saysSameDevelopment", () => {
  const jpm = { ticker: "JPM", companyName: "JPMorgan Chase & Co." };
  it("knows the week's line says the brief's lead again when it names the same subject", () => {
    expect(saysSameDevelopment("JPMorgan partnered with OpenAI on Nov 11.", "JPMorgan has a new partnership with OpenAI to improve coding efficiency.", jpm)).toBe(true);
  });
  it("keeps a line about another subject, and one that names nothing", () => {
    expect(saysSameDevelopment("JPMorgan took the lead role in a major AI IPO on Nov 10.", "JPMorgan has a new partnership with OpenAI.", jpm)).toBe(false);
    expect(saysSameDevelopment("JPM reported earnings on Nov 10.", "JPMorgan has a new partnership with OpenAI.", jpm)).toBe(false);
    expect(saysSameDevelopment("JPMorgan partnered with OpenAI on Nov 11.", "", jpm)).toBe(false);
  });
});

describe("lineRepeatsRow", () => {
  it("catches a week line that is a row of the list under it, said again (owner rule 1, Nov 13)", () => {
    const rows = [{ title: "Cerebras shares fell 3.24% after results, while profitability evidence remained incomplete." }, { title: "Our call moved to Keep" }];
    expect(lineRepeatsRow("Cerebras shares fell 3.24% after results, while profitability evidence remained incomplete.", rows)).toBe(true);
    expect(lineRepeatsRow("Our call moved to Keep on Nov 9.", rows)).toBe(true);
    expect(lineRepeatsRow("JPMorgan partnered with OpenAI on Nov 11.", rows)).toBe(false);
    expect(lineRepeatsRow(null, rows)).toBe(false);
  });
});
