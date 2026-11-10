import { describe, expect, it } from "vitest";

import { countTones, leanOf, marketRead, newsThemes, readTheWire, stockBuzz, storiesBetween, type NewsLabels } from "@/lib/wire-read";
import { parseWireFilters, type WireItem } from "@/lib/wire-shared";

const NOW = Date.parse("2026-11-10T16:00:00Z");
const H = 3_600_000;

let n = 0;
function item(partial: Partial<WireItem> & { hoursAgo?: number }): WireItem {
  n += 1;
  const { hoursAgo = 1, ...rest } = partial;
  return {
    id: `i${n}`,
    title: `Headline number ${n} about markets`,
    url: `https://example.com/${n}`,
    source: "Reuters",
    sourceKind: "publisher",
    publishedAt: new Date(NOW - hoursAgo * H).toISOString(),
    excerpt: "",
    excerptOrigin: "",
    tickers: [],
    tone: null,
    topics: [],
    ...rest,
  };
}

const filters = parseWireFilters(undefined);

describe("stories", () => {
  it("keeps one copy of a story, preferring the labelled one, and merges its tickers", () => {
    const a = item({ title: "Nvidia falls on probe - Reuters", tickers: ["NVDA"] });
    const b = item({ title: "Nvidia falls on probe", tickers: ["AMD"] });
    const labels: NewsLabels = { [b.id]: { tone: "negative", scope: "stock", theme: null } };
    const out = storiesBetween([a, b], labels, NOW - 24 * H, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(b.id);
    expect(out[0]!.tickers.sort()).toEqual(["AMD", "NVDA"]);
  });

  it("drops foreign copies and anything outside the window", () => {
    const out = storiesBetween(
      [item({ title: "Cepheid obtient le marquage CE au titre du règlement IVDR" }), item({ hoursAgo: 30 }), item({ hoursAgo: 2 })],
      {},
      NOW - 24 * H,
      NOW,
    );
    expect(out).toHaveLength(1);
  });

  it("counts tones and leaves out off-topic and unlabelled stories", () => {
    const rows = [item({}), item({}), item({}), item({})];
    const labels: NewsLabels = {
      [rows[0]!.id]: { tone: "positive", scope: "stock", theme: null },
      [rows[1]!.id]: { tone: "negative", scope: "market", theme: null },
      [rows[2]!.id]: { tone: "positive", scope: "other", theme: null },
    };
    expect(countTones(rows, labels)).toEqual({ positive: 1, negative: 1, neutral: 0 });
    expect(leanOf({ positive: 6, negative: 2, neutral: 2 })).toBe("positive");
    expect(leanOf({ positive: 3, negative: 3, neutral: 4 })).toBe("mixed");
    expect(leanOf({ positive: 0, negative: 0, neutral: 0 })).toBeNull();
  });
});

describe("stocks in the news", () => {
  it("ranks by recent coverage, weighs releases and roundups less, and picks a lead that says something", () => {
    const fresh = [
      item({ tickers: ["NVDA"], hoursAgo: 1, title: "Nvidia board opens probe" }),
      item({ tickers: ["NVDA"], hoursAgo: 2, title: "Nvidia CEO speaks" }),
      item({ tickers: ["AAPL"], hoursAgo: 20, title: "Apple story one" }),
      item({ tickers: ["AAPL"], hoursAgo: 21, title: "Apple story two" }),
      item({ tickers: ["AAPL"], hoursAgo: 22, title: "Apple story three" }),
      item({ tickers: ["XYZ"], hoursAgo: 1, sourceKind: "press_release", title: "XYZ announces date" }),
    ];
    const labels: NewsLabels = {
      [fresh[0]!.id]: { tone: "negative", scope: "stock", theme: "Nvidia CEO probe" },
      [fresh[1]!.id]: { tone: "neutral", scope: "stock", theme: null },
    };
    const quotes = { NVDA: { pct: -3.2, name: "NVIDIA" }, AAPL: { pct: 0.4, name: "Apple" } };
    const rows = stockBuzz(fresh, { labels, quotes, nowMs: NOW, previous: [item({ tickers: ["NVDA"], hoursAgo: 30 })] });
    expect(rows.map((row) => row.ticker)).toEqual(["NVDA", "AAPL", "XYZ"]);
    expect(rows[0]!.lead.title).toBe("Nvidia board opens probe");
    expect(rows[0]!.tones).toEqual({ positive: 0, negative: 1, neutral: 1 });
    expect(rows[0]!.prevCount).toBe(1);
    expect(rows[0]!.share + rows[1]!.share + rows[2]!.share).toBeLessThanOrEqual(101);
    expect(rows[0]!.pct).toBe(-3.2);
    expect(rows[2]!.pct).toBeNull();
  });

  it("leaves out stories labelled off-topic", () => {
    const rows = [item({ tickers: ["AAPL"] })];
    expect(stockBuzz(rows, { labels: { [rows[0]!.id]: { tone: "neutral", scope: "other", theme: null } }, quotes: {}, nowMs: NOW })).toEqual([]);
  });
});

describe("themes", () => {
  it("groups by theme name regardless of case, needs three stories, and names the stocks it touches", () => {
    const rows = [
      item({ tickers: ["NVDA"] }),
      item({ tickers: ["NVDA", "AMD"] }),
      item({ tickers: ["NVDA"] }),
      item({}),
      item({}),
    ];
    const labels: NewsLabels = {
      [rows[0]!.id]: { tone: "negative", scope: "stock", theme: "Nvidia CEO probe" },
      [rows[1]!.id]: { tone: "negative", scope: "stock", theme: "nvidia ceo  probe" },
      [rows[2]!.id]: { tone: "neutral", scope: "stock", theme: "Nvidia CEO probe" },
      [rows[3]!.id]: { tone: "negative", scope: "market", theme: "Oil prices" },
      [rows[4]!.id]: { tone: "negative", scope: "market", theme: "Oil prices" },
    };
    const themes = newsThemes(rows, { labels, quotes: { NVDA: { pct: -2, name: "NVIDIA" } } });
    expect(themes).toHaveLength(1);
    expect(themes[0]!.name).toBe("Nvidia CEO probe");
    expect(themes[0]!.count).toBe(3);
    expect(themes[0]!.tickers[0]).toEqual({ ticker: "NVDA", count: 3, pct: -2 });
    expect(themes[0]!.prevCount).toBe(0);
  });
});

describe("the read", () => {
  function labelled(count: number, tone: "positive" | "negative" | "neutral", hoursAgo: number, extra: Partial<WireItem> = {}, theme: string | null = null) {
    const rows = Array.from({ length: count }, () => item({ hoursAgo, ...extra }));
    const labels: NewsLabels = Object.fromEntries(rows.map((row) => [row.id, { tone, scope: "stock" as const, theme }]));
    return { rows, labels };
  }

  it("says nothing when too few stories are labelled", () => {
    const { rows, labels } = labelled(10, "positive", 1);
    expect(marketRead({ today: rows, yesterday: [], labels, buzz: [], themes: [], sources: 1, asOf: null, labelledBy: null, filters })).toBeNull();
  });

  it("compares the balance with the day before and names the biggest story and stock", () => {
    const pos = labelled(30, "positive", 2);
    const neg = labelled(20, "negative", 3, { tickers: ["NVDA"] }, "Nvidia CEO probe");
    const old = labelled(25, "positive", 30);
    const oldNeg = labelled(25, "negative", 31);
    const all = [...pos.rows, ...neg.rows, ...old.rows, ...oldNeg.rows];
    const labels = { ...pos.labels, ...neg.labels, ...old.labels, ...oldNeg.labels };
    const reading = readTheWire(
      { items: all, quotes: { NVDA: { pct: -4, name: "NVIDIA" } }, labels, newestAt: new Date(NOW).toISOString(), labelledBy: "Claude Haiku 5.5", labelledAt: null },
      { nowMs: NOW, filters },
    );
    const read = reading.read!;
    expect(read.headline).toBe("Stock news leans positive today. Biggest story: Nvidia CEO probe");
    expect(read.insights[0]!.text).toBe("60% of the last day's 50 stories read positive and 40% negative, up from 50% the day before.");
    expect(read.insights[0]!.tone).toBe("up");
    expect(read.insights[1]!.text).toBe("The biggest story is Nvidia CEO probe: 20 stories, all of them new today, 100% negative.");
    expect(read.insights[1]!.soWhat).toBe("NVDA is down 4.0% today.");
    expect(read.insights[1]!.action!.href).toBe("/news?theme=Nvidia+CEO+probe");
    expect(read.source).toBe("50 stories from 1 source · tone read per headline by Claude Haiku 5.5");
    expect(reading.labelledShare).toBe(100);
  });

  it("flags a stock whose news and price disagree", () => {
    const good = labelled(45, "neutral", 2);
    const news = labelled(5, "positive", 1, { tickers: ["AAPL"] });
    const labels = { ...good.labels, ...news.labels };
    const reading = readTheWire(
      { items: [...good.rows, ...news.rows], quotes: { AAPL: { pct: -3.5, name: "Apple" } }, labels, newestAt: new Date(NOW).toISOString(), labelledBy: null, labelledAt: null },
      { nowMs: NOW, filters },
    );
    const disagree = reading.read!.insights.find((insight) => insight.id === "disagree");
    expect(disagree?.text).toBe("AAPL: 100% of today's headlines about it read as good news, yet the stock is −3.5% today.");
  });
});
