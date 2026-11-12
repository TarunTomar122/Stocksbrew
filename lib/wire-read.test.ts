import { describe, expect, it } from "vitest";

import { countTones, leanOf, marketRead, newsThemes, readTheWire, stockBuzz, storiesBetween, toneWord, type NewsLabels } from "@/lib/wire-read";
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
  const stories = (count: number, ticker: string, hoursAgo: number) => Array.from({ length: count }, () => item({ hoursAgo, tickers: [ticker] }));
  const read = (items: WireItem[], quotes: Record<string, { pct: number | null; name: string }>, labels: NewsLabels = {}) =>
    readTheWire({ items, quotes, labels, newestAt: new Date(NOW).toISOString(), labelledBy: "Claude Haiku 5.5", labelledAt: null }, { nowMs: NOW, filters });

  it("says nothing when no stock has enough coverage to lead", () => {
    expect(marketRead({ today: [], yesterday: [], labels: {}, buzz: [], themes: [], sources: 1, asOf: null, labelledBy: null, filters })).toBeNull();
    expect(read(stories(3, "NVDA", 1), { NVDA: { pct: 1, name: "NVIDIA Corporation" } }).read).toBeNull();
  });

  it("leads with the most talked-about stock against the day before, then the biggest move and the jump in coverage, without tone labels", () => {
    const items = [...stories(21, "NVDA", 1), ...stories(3, "NVDA", 30), ...stories(9, "AMD", 2), ...stories(1, "AMD", 30), ...stories(4, "CRWV", 3)];
    const reading = read(items, {
      NVDA: { pct: -4, name: "NVIDIA Corporation" },
      AMD: { pct: 0.4, name: "Advanced Micro Devices, Inc." },
      CRWV: { pct: 20, name: "CoreWeave, Inc." },
    });
    const r = reading.read!;
    // One idea, one number (owner rule 8).
    expect(r.headline).toBe("NVDA has 21 stories today, up from 3.");
    expect(r.insights.map((insight) => insight.id)).toEqual(["leader", "mover", "jump"]);
    expect(r.insights[0]!.text).toBe("NVDA fell 4.0% today on 21 stories.");
    // The headline has the count against the day before, so the card's figure is the share, not the same numbers again.
    expect(r.insights[0]!.figure).toEqual({ value: "62%", label: "of all company coverage today" });
    expect(r.insights[0]!.soWhat).toBe("Big news and a big move together: check what changed before you trade it.");
    expect(r.insights[1]!.text).toBe("CRWV rose 20.0% today, the biggest move in the news, on 4 stories that are all new today.");
    expect(r.insights[1]!.soWhat).toMatch(/^The top story: “Headline number \d+ about markets”\.$/);
    // The figure has the coverage against the day before, so the sentence says what the stock did with it.
    expect(r.insights[2]!.text).toBe("AMD is suddenly in the news, but the stock has barely moved on it so far.");
    expect(r.insights[2]!.soWhat).toMatch(/^Leading its coverage: “Headline number \d+ about markets”\.$/);
    // A ratio over a single story is noise: the count is the figure.
    expect(r.insights[2]!.figure).toEqual({ value: "9", label: "stories, 1 the day before" });
    // Every card names a different stock; no tone was used, so the source line does not mention it.
    expect(new Set(r.insights.flatMap((insight) => insight.tickers ?? [])).size).toBe(3);
    expect(r.source).toBe("34 stories from 1 source");
  });

  it("never says the headline's coverage jump when the card calls it ongoing", () => {
    // 20 stories against 8 is 2.5 times: not a surge, so the headline uses the share and the card says so plainly.
    const reading = read([...stories(20, "NVDA", 1), ...stories(8, "NVDA", 30)], { NVDA: { pct: 0.5, name: "NVIDIA" } });
    expect(reading.read!.headline).toBe("NVDA leads the news today, with 100% of all company coverage.");
    expect(reading.read!.insights[0]!.soWhat).toBe("A bit more coverage than the day before: still an ongoing story.");
  });

  it("says a leader's coverage fell when it did, not that it is steady", () => {
    const reading = read([...stories(6, "NVDA", 1), ...stories(20, "NVDA", 30)], { NVDA: { pct: 0.5, name: "NVIDIA" } });
    expect(reading.read!.insights[0]!.soWhat).toBe("Fewer stories than the day before: an older story winding down, not a new one.");
  });

  it("adds tone only where it clearly leans, and flags a stock whose news and price disagree", () => {
    const lead = stories(12, "NVDA", 1);
    const good = labelled(5, "positive", 1, { tickers: ["AAPL"] });
    const reading = read([...lead, ...good.rows], { NVDA: { pct: 1.2, name: "NVIDIA" }, AAPL: { pct: -3.5, name: "Apple Inc." } }, good.labels);
    const disagree = reading.read!.insights.find((insight) => insight.id === "disagree");
    expect(disagree?.text).toBe("AAPL: 100% of today's headlines about it read as good news, yet the stock fell 3.5%.");
    expect(reading.read!.insights[0]!.text).not.toMatch(/positive|negative/);
    // The source line names the stories and their sources, never the model that read their tone.
    expect(reading.read!.source).toMatch(/^\d[\d,]* stories from \d+ sources?$/);
    expect(reading.read!.source).not.toMatch(/Claude|Haiku|tone/);
  });

  it("tells the biggest story when the labels name one about another stock", () => {
    const lead = stories(15, "NVDA", 1);
    const probe = labelled(4, "negative", 2, { tickers: ["TSLA"] }, "Tesla recall");
    const reading = read([...lead, ...probe.rows], { NVDA: { pct: 0.2, name: "NVIDIA" }, TSLA: { pct: -2, name: "Tesla, Inc." } }, probe.labels);
    const theme = reading.read!.insights.find((insight) => insight.id === "theme")!;
    expect(theme.text).toBe("TSLA: the biggest story is Tesla recall, 100% negative.");
    expect(theme.soWhat).toBe("TSLA is down 2.0% today.");
    expect(theme.action!.href).toBe("/news?theme=Tesla+recall");
  });
});

describe("toneWord", () => {
  it("says the clear lean, else a neutral majority or a mixed read, else nothing", () => {
    expect(toneWord({ positive: 6, negative: 1, neutral: 1 }, 8)?.text).toBe("75% positive");
    expect(toneWord({ positive: 1, negative: 1, neutral: 6 }, 10)).toEqual({ text: "60% neutral", side: "neutral" });
    expect(toneWord({ positive: 3, negative: 2, neutral: 1 }, 6)).toEqual({ text: "Mixed", side: "mixed" });
    // Too few toned stories say nothing: the cell stays empty.
    expect(toneWord({ positive: 1, negative: 0, neutral: 1 }, 20)).toBeNull();
  });
});
