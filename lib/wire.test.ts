import { describe, expect, it } from "vitest";

import {
  WIRE_PAGE_SIZE,
  assessFreshness,
  classifyTopics,
  dayLabel,
  etDay,
  etTime,
  filterWire,
  groupByDay,
  hasActiveFilter,
  normalizeTicker,
  parseWireFilters,
  visibleTone,
  wireHref,
  type WireItem,
} from "@/lib/wire-shared";

function item(patch: Partial<WireItem> & { id: string }): WireItem {
  return {
    title: "Headline",
    url: `https://example.com/${patch.id}`,
    source: "CNBC",
    sourceKind: "publisher",
    publishedAt: "2026-11-09T15:00:00.000Z",
    excerpt: "",
    excerptOrigin: "",
    tickers: [],
    tone: null,
    topics: [],
    ...patch,
  };
}

describe("classifyTopics", () => {
  it("tags by keyword and can sit on two desks", () => {
    expect(classifyTopics("Nvidia beats estimates as data center revenue jumps")).toEqual(["earnings"]);
    expect(classifyTopics("Morgan Stanley downgrades Tesla, cuts price target")).toEqual(["analyst"]);
    expect(classifyTopics("Pfizer to acquire biotech in $4 billion deal")).toEqual(["mna"]);
    expect(classifyTopics("Fed holds rates as inflation cools")).toEqual(["macro"]);
    expect(classifyTopics("White House weighs new tariffs on chips")).toEqual(["policy"]);
    expect(classifyTopics("Apple unveils new iPhone")).toEqual(["product"]);
    expect(classifyTopics("Microsoft to open new data center in Ohio")).toEqual(["product"]);
    expect(classifyTopics("Analysts raise target after Apple launches new chip")).toEqual(["analyst", "product"]);
  });

  it("leaves a headline with no keyword untagged", () => {
    expect(classifyTopics("Winners and losers in the managed care divide")).toEqual([]);
    expect(classifyTopics("Hegseth impeachment articles introduced by Rep. Massie")).toEqual([]);
  });

  it("files official sources on their desk whatever the headline says", () => {
    expect(classifyTopics("Statement on a meeting", "Federal Reserve")).toEqual(["macro"]);
    expect(classifyTopics("Charges filed against adviser", "SEC")).toEqual(["policy"]);
  });
});

describe("visibleTone", () => {
  it("shows only real, non-neutral labels", () => {
    expect(visibleTone("Bullish")).toBe("bullish");
    expect(visibleTone("bearish")).toBe("bearish");
    expect(visibleTone("mixed")).toBe("mixed");
    expect(visibleTone("neutral")).toBeNull();
    expect(visibleTone("")).toBeNull();
    expect(visibleTone(undefined)).toBeNull();
  });
});

describe("filters in the URL", () => {
  it("parses and bounds every parameter", () => {
    expect(parseWireFilters(undefined)).toEqual({ topic: null, ticker: null, theme: null, mine: false, q: "", limit: WIRE_PAGE_SIZE });
    const parsed = parseWireFilters({ topic: "MNA", ticker: " $nvda ", mine: "1", q: "  data center ", n: "99999" });
    expect(parsed).toEqual({ topic: "mna", ticker: "NVDA", theme: null, mine: true, q: "data center", limit: 480 });
    expect(parseWireFilters({ theme: "  Nvidia   CEO probe " }).theme).toBe("Nvidia CEO probe");
    expect(parseWireFilters({ topic: "sports", ticker: "<script>", n: "3" })).toEqual({
      topic: null,
      ticker: null,
      theme: null,
      mine: false,
      q: "",
      limit: WIRE_PAGE_SIZE,
    });
    expect(parseWireFilters({ topic: ["earnings", "macro"] }).topic).toBe("earnings");
  });

  it("normalises tickers and rejects junk", () => {
    expect(normalizeTicker("brk.b")).toBe("BRK.B");
    expect(normalizeTicker("$AAPL")).toBe("AAPL");
    expect(normalizeTicker("")).toBeNull();
    expect(normalizeTicker("TOOLONGTICKER")).toBeNull();
    expect(normalizeTicker("9X")).toBeNull();
  });

  it("builds short links and round-trips", () => {
    const base = parseWireFilters(undefined);
    expect(wireHref(base)).toBe("/news");
    expect(wireHref(base, { topic: "earnings" })).toBe("/news?topic=earnings");
    const full = wireHref(base, { topic: "macro", ticker: "SPY", mine: true, q: "rate cut", limit: 160 });
    expect(full).toBe("/news?topic=macro&ticker=SPY&mine=1&q=rate+cut&n=160");
    const query = Object.fromEntries(new URL(full, "https://x.test").searchParams);
    expect(parseWireFilters(query)).toEqual({ topic: "macro", ticker: "SPY", theme: null, mine: true, q: "rate cut", limit: 160 });
    const themed = wireHref(base, { theme: "Oil prices" });
    expect(themed).toBe("/news?theme=Oil+prices");
    expect(hasActiveFilter({ ...base, theme: "Oil prices" })).toBe(true);
    expect(hasActiveFilter(base)).toBe(false);
    expect(hasActiveFilter({ ...base, q: "x" })).toBe(true);
  });
});

describe("filterWire", () => {
  const items = [
    item({ id: "a", title: "Nvidia beats estimates", tickers: ["NVDA"], topics: ["earnings"] }),
    item({ id: "b", title: "Fed holds rates", topics: ["macro"], source: "Federal Reserve" }),
    item({ id: "c", title: "Apple and Nvidia sign supply deal", tickers: ["AAPL", "NVDA"], topics: ["product"], excerpt: "A multi-year agreement." }),
  ];
  const base = parseWireFilters(undefined);

  it("filters by topic, ticker and text, all at once", () => {
    expect(filterWire(items, { ...base, topic: "macro" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterWire(items, { ...base, ticker: "NVDA" }).map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterWire(items, { ...base, q: "nvidia deal" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterWire(items, { ...base, q: "multi-year" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterWire(items, { ...base, ticker: "NVDA", topic: "earnings" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterWire(items, { ...base, q: "federal reserve" }).map((row) => row.id)).toEqual(["b"]);
  });

  it("applies my stocks only when a set is supplied", () => {
    expect(filterWire(items, { ...base, mine: true }, new Set(["AAPL"])).map((row) => row.id)).toEqual(["c"]);
    expect(filterWire(items, { ...base, mine: true }, null)).toHaveLength(3);
    expect(filterWire(items, { ...base, mine: true }, new Set(["TSLA"]))).toEqual([]);
    const themes = { a: "Nvidia earnings", c: "nvidia  EARNINGS" };
    expect(filterWire(items, { ...base, theme: "Nvidia earnings" }, null, themes).map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterWire(items, { ...base, theme: "Nvidia earnings" })).toEqual([]);
  });
});

describe("days in New York", () => {
  it("puts a late-evening UTC instant on the right New York day", () => {
    expect(etDay("2026-11-10T02:30:00Z")).toBe("2026-11-09");
    expect(etDay("2026-11-10T06:00:00Z")).toBe("2026-11-10");
    expect(etDay("nonsense")).toBe("");
    expect(etTime("2026-11-09T20:25:00Z")).toBe("3:25 PM");
  });

  it("labels today, yesterday and older days", () => {
    expect(dayLabel("2026-11-09", "2026-11-09")).toBe("Today");
    expect(dayLabel("2026-11-08", "2026-11-09")).toBe("Yesterday");
    expect(dayLabel("2026-11-06", "2026-11-09")).toBe("Friday");
    expect(dayLabel("2026-11-02", "2026-11-09")).toBe("Nov 2");
    expect(dayLabel("unknown", "2026-11-09")).toBe("Date unknown");
  });

  it("groups newest first and splits at New York midnight", () => {
    const rows = [
      item({ id: "old", publishedAt: "2026-11-08T18:00:00.000Z" }),
      item({ id: "late", publishedAt: "2026-11-10T03:00:00.000Z" }), // 10 PM on the 9th in New York
      item({ id: "noon", publishedAt: "2026-11-09T17:00:00.000Z" }),
    ];
    const days = groupByDay(rows, Date.parse("2026-11-10T04:00:00Z"));
    expect(days.map((day) => [day.day, day.label, day.items.map((row) => row.id)])).toEqual([
      ["2026-11-09", "Today", ["late", "noon"]],
      ["2026-11-08", "Yesterday", ["old"]],
    ]);
    expect(groupByDay([])).toEqual([]);
  });
});

describe("assessFreshness", () => {
  const now = Date.parse("2026-11-09T20:00:00Z");
  it("is fresh within the window, stale past it and empty with no rows", () => {
    expect(assessFreshness([{ publishedAt: "2026-11-09T19:00:00.000Z" }], now).state).toBe("fresh");
    expect(assessFreshness([{ publishedAt: "2026-11-07T12:00:00.000Z" }], now).state).toBe("fresh"); // over a weekend
    const stale = assessFreshness([{ publishedAt: "2026-05-11T12:00:00.000Z" }, { publishedAt: "2026-05-01T12:00:00.000Z" }], now);
    expect(stale.state).toBe("stale");
    expect(stale.newestAt).toBe("2026-05-11T12:00:00.000Z");
    expect(assessFreshness([], now)).toEqual({ state: "empty", newestAt: null, ageHours: null });
  });
});
