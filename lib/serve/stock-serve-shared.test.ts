import { describe, expect, it } from "vitest";

import type { NewsArticle } from "@/lib/news";
import { buildMultipleHistory, callChanges, type CallRecord } from "@/lib/stock-chart";
import { buildPriceHistorySeries } from "@/lib/price-history-series";
import {
  SERVE_PARTS,
  SERVE_SCHEMA,
  changeRecords,
  compactDaily,
  expandDaily,
  hashSourcePaths,
  historyWindowFromRows,
  newsInWindow,
  partVerdict,
  rawFromSeriesPart,
  serveDocId,
  seriesPartFromRaw,
  snapshotRows,
  type ServeStockDoc,
} from "./stock-serve-shared";

const NOW = Date.parse("2026-11-13T15:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function doc(parts: Partial<ServeStockDoc>): ServeStockDoc {
  return { schema: SERVE_SCHEMA, ticker: "AMD", instrument_id: "US_AMD", ...parts } as ServeStockDoc;
}

describe("compactDaily", () => {
  it("gives back exactly the same dates and closes", () => {
    const dates = ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"];
    const closes = [24.5962, 24.9434, 25.244, 0.0001, 512.3];
    const compact = compactDaily(dates, closes)!;
    expect(compact.scale).toBe(10_000);
    expect(compact.gaps).toBe("3121");
    expect(expandDaily(compact)).toEqual({ dates, closes });
  });

  it("uses cents when every close has two decimals, and a list for long gaps", () => {
    const compact = compactDaily(["2020-01-02", "2020-03-02"], [2.71, 2.66])!;
    expect(compact.scale).toBe(100);
    expect(compact.gaps).toEqual([60]);
    expect(expandDaily(compact).closes).toEqual([2.71, 2.66]);
  });

  it("refuses anything it could not give back the same", () => {
    expect(compactDaily(["2026-11-06"], [1, 2])).toBeNull();
    expect(compactDaily(["2026-11-06", "bad"], [1, 2])).toBeNull();
    expect(compactDaily(["2026-11-07", "2026-11-06"], [1, 2])).toBeNull();
    expect(compactDaily(["2026-11-06", "2026-11-06"], [1, 2])).toBeNull();
    expect(compactDaily(["2026-11-06", "2026-11-07"], [1.123456, 2])).toBeNull();
    expect(compactDaily(["2026-11-06", "2026-11-07"], [1, null])).toBeNull();
    expect(compactDaily([], [])).toBeNull();
  });

  it("keeps an uncompactable series as it was stored", () => {
    const raw = { symbol: "X", source: "yahoo_chart", fetched_at: "t", adjusted: true, dates: ["2026-11-06", "oops"], closes: [1, 2], extra: 1 };
    const part = seriesPartFromRaw(raw);
    expect(part.compact).toBeUndefined();
    expect(rawFromSeriesPart(part)).toEqual({ symbol: "X", source: "yahoo_chart", fetched_at: "t", adjusted: true, dates: ["2026-11-06", "oops"], closes: [1, 2] });
  });

  it("round-trips a real-sized series", () => {
    const dates: string[] = [];
    const closes: number[] = [];
    let day = Date.UTC(2014, 10, 12);
    let close = 41.2871;
    for (let i = 0; i < 3018; i++) {
      dates.push(new Date(day).toISOString().slice(0, 10));
      closes.push(Math.round(close * 10_000) / 10_000);
      day += (new Date(day).getUTCDay() === 5 ? 3 : 1) * 86_400_000;
      close *= 1 + Math.sin(i) * 0.02;
    }
    const part = seriesPartFromRaw({ dates, closes });
    expect(part.compact).toBeDefined();
    expect(rawFromSeriesPart(part)).toEqual({ dates, closes });
    expect(JSON.stringify(part).length).toBeLessThan(JSON.stringify({ dates, closes }).length / 2);
  });
});

describe("snapshot rows", () => {
  it("rebuild the window the page's two functions read, with the same answers", () => {
    const window = Array.from({ length: 30 }, (_, i) => ({
      captured_at: new Date(Date.UTC(2026, 9, 1 + i, 20)).toISOString(),
      quote: { current: 100 + i, high: 1, low: 2 },
      fundamentals: { pe_ttm: 20 + (i % 7), market_cap: 5 },
      other: "dropped",
    }));
    const live = { quote: { current: 140 }, captured_at: "2026-11-13T15:00:00Z" };
    const rebuilt = historyWindowFromRows(snapshotRows(window));
    expect(buildPriceHistorySeries({ ...live, history_window: rebuilt as never })).toEqual(
      buildPriceHistorySeries({ ...live, history_window: window as never }),
    );
    expect(buildMultipleHistory(rebuilt)).toEqual(buildMultipleHistory(window));
  });

  it("keep missing values missing", () => {
    expect(snapshotRows([{ captured_at: 3, quote: null }, null])).toEqual([[null, null, null], [null, null, null]]);
    expect(snapshotRows("nope")).toEqual([]);
  });
});

describe("changeRecords", () => {
  it("keeps only what callChanges reads, so its answer is unchanged", () => {
    const records: CallRecord[] = [
      { date: "2026-10-01", stance: "accumulate", text: "Buy more", priceAtCall: 100 },
      { date: "2026-10-02", stance: "accumulate", text: "Buy more", priceAtCall: 101 },
      { date: "2026-10-03", stance: "hold", text: "Hold", priceAtCall: 102 },
      { date: "bad", stance: "trim", text: null, priceAtCall: null },
      { date: "2026-10-05", stance: "", text: null, priceAtCall: null },
      { date: "2026-10-04", stance: "hold", text: "Hold", priceAtCall: 103 },
      { date: "2026-10-06", stance: "trim", text: "Sell some", priceAtCall: 110 },
    ];
    const kept = changeRecords(records);
    expect(kept.map((record) => record.date)).toEqual(["2026-10-01", "2026-10-03", "2026-10-06"]);
    expect(callChanges(kept)).toEqual(callChanges(records));
  });
});

describe("partVerdict", () => {
  const hashes = new Map([["tm_price_history_daily/AMD", "h1"]]);
  const checked = new Set(["tm_price_history_daily/AMD", "tm_daily_anomaly_tickers/US__AMD"]);
  const series = (src: Record<string, string | null>, builtAt = iso(-60_000), v: number = SERVE_PARTS.series.v) => ({
    p_series: { v, built_at: builtAt, as_of: null, src, data: {} },
  });

  it("serves a hash part only while every source hash still matches", () => {
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" })), "series", NOW, hashes, checked)).toBe("fresh");
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h0" })), "series", NOW, hashes, checked)).toBe("changed");
    // A doc that did not exist at build time and still does not.
    expect(partVerdict(doc({ p_anomaly: { v: 1, built_at: iso(-1000), as_of: null, src: { "tm_daily_anomaly_tickers/US__AMD": null }, data: null } }), "anomaly", NOW, hashes, checked)).toBe("fresh");
    // A doc that has appeared since.
    expect(partVerdict(doc({ p_anomaly: { v: 1, built_at: iso(-1000), as_of: null, src: { "tm_price_history_daily/AMD": null }, data: null } }), "anomaly", NOW, hashes, checked)).toBe("changed");
  });

  it("never trusts a source it did not check, or a hash part with no sources", () => {
    expect(partVerdict(doc(series({ "tm_other/AMD": null })), "series", NOW, hashes, checked)).toBe("changed");
    expect(partVerdict(doc(series({})), "series", NOW, hashes, checked)).toBe("changed");
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" })), "series", NOW, null, checked)).toBe("changed");
  });

  it("drops parts from another layout, past their age, from the future, or missing", () => {
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" }, iso(-60_000), 99)), "series", NOW, hashes, checked)).toBe("version");
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" }, iso(-SERVE_PARTS.series.maxAgeMs - 1))), "series", NOW, hashes, checked)).toBe("expired");
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" }, iso(10 * 60_000))), "series", NOW, hashes, checked)).toBe("expired");
    expect(partVerdict(doc(series({ "tm_price_history_daily/AMD": "h1" }, "not a time")), "series", NOW, hashes, checked)).toBe("expired");
    expect(partVerdict(doc({}), "series", NOW, hashes, checked)).toBe("missing");
    expect(partVerdict(null, "series", NOW, hashes, checked)).toBe("missing");
    expect(partVerdict({ ...doc(series({ "tm_price_history_daily/AMD": "h1" })), schema: 2 }, "series", NOW, hashes, checked)).toBe("missing");
  });

  it("drops a dirty-checked part stamped after it was built, here or on the shared _all doc", () => {
    const calls = { p_calls: { v: SERVE_PARTS.calls.v, built_at: iso(-60_000), as_of: null, data: { records: [] } } };
    expect(partVerdict(doc(calls), "calls", NOW, null)).toBe("fresh");
    expect(partVerdict(doc({ ...calls, dirty_calls: iso(-120_000) }), "calls", NOW, null)).toBe("fresh");
    expect(partVerdict(doc({ ...calls, dirty_calls: iso(-60_000) }), "calls", NOW, null)).toBe("fresh");
    expect(partVerdict(doc({ ...calls, dirty_calls: iso(-30_000) }), "calls", NOW, null)).toBe("dirty");
    expect(partVerdict(doc(calls), "calls", NOW, null, undefined, { dirty_calls: iso(-1000) })).toBe("dirty");
    expect(partVerdict(doc(calls), "calls", NOW, null, undefined, { dirty_news: iso(-1000) })).toBe("fresh");
  });
});

describe("newsInWindow", () => {
  it("drops headlines that have aged out of the window since the build", () => {
    const article = (published_at: string) => ({ id: published_at, published_at }) as NewsArticle;
    const rows = [article(iso(-86_400_000)), article(iso(-13.9 * 86_400_000)), article(iso(-14.1 * 86_400_000)), article("bad")];
    expect(newsInWindow(rows, 14, NOW).map((row) => row.id)).toEqual([rows[0]!.id, rows[1]!.id]);
  });
});

describe("ids and sources", () => {
  it("never makes a path out of a ticker, and never names the shared doc", () => {
    expect(serveDocId(" amd ")).toBe("AMD");
    expect(serveDocId("a/b")).toBeNull();
    expect(serveDocId("")).toBeNull();
    expect(serveDocId("_all")).toBeNull();
  });

  it("names each hash part's sources from the ticker alone", () => {
    expect(hashSourcePaths("BRK/B", "US_BRK/B").results).toEqual(["tm_earnings_history/BRK-B"]);
    expect(hashSourcePaths("amd", "US_AMD")).toEqual({
      series: ["tm_price_history_daily/AMD"],
      bundle: ["tm_on_demand_news_jobs/US_AMD", "tm_call_stability/US_AMD"],
      anomaly: ["tm_daily_anomaly_tickers/US__AMD"],
      results: ["tm_earnings_history/AMD"],
      reddit: ["reddit_ticker_contexts/US__AMD"],
    });
  });
});
