import { describe, expect, it } from "vitest";

import type { PastReport } from "@/lib/earnings-season";

import { basisClash, buildResult, callAfter, eventFromDoc, nextTradingDay, pickMove, previousTradingDay, reactionDay, releaseParts } from "./build";

const TODAY = "2026-11-11";
const NOON = new Date("2026-11-11T19:03:00Z");

const row = (patch: Record<string, unknown> = {}) => ({
  ticker: "CRWV",
  company: "CoreWeave, Inc.",
  event_date: "2026-11-10",
  market: "US",
  time: "amc",
  eps_estimate: -1.45,
  estimated_eps: -1.55,
  reported_eps: -1.27,
  actuals_source: "yfinance",
  actuals_captured_at: "2026-11-10T23:00:28.738345+00:00",
  ...patch,
});

const past = (patch: Partial<PastReport>): PastReport => ({
  date: "2026-08-12",
  session: "amc",
  from: "calendar",
  epsEstimate: null,
  epsActual: null,
  result: null,
  surprisePct: null,
  move: 10,
  basis: "1d",
  ...patch,
});

describe("days", () => {
  it("skips weekends and market holidays", () => {
    expect(nextTradingDay("2026-11-13")).toBe("2026-11-16");
    expect(nextTradingDay("2026-11-25")).toBe("2026-11-27"); // Thanksgiving
    expect(previousTradingDay("2026-11-16")).toBe("2026-11-13");
    expect(reactionDay("2026-11-10", "amc")).toBe("2026-11-11");
    expect(reactionDay("2026-11-10", "bmo")).toBe("2026-11-10");
  });
});

describe("the calendar row", () => {
  it("compares the actual with its own provider's estimate", () => {
    const event = eventFromDoc(row())!;
    expect(event.eps).toMatchObject({ actual: -1.27, expected: -1.55, verdict: "beat", source: "Yahoo Finance" });
    expect(event.eps!.surprisePct).toBeCloseTo(18.06, 2);
    expect(event.session).toBe("amc");
  });

  it("keeps no EPS when the two estimates are on different bases", () => {
    expect(basisClash(1.24, 0.08)).toBe(true);
    expect(basisClash(-1.55, -1.45)).toBe(false);
    expect(basisClash(0.19, 0)).toBe(false);
    const hsai = eventFromDoc(row({ ticker: "HSAI", eps_estimate: 0.08, estimated_eps: 1.24, reported_eps: 0.72, actuals_source: "alphavantage" }))!;
    expect(hsai.eps).toBeNull();
  });

  it("uses the ±1% thresholds and skips rows without a result or outside the US", () => {
    expect(eventFromDoc(row({ reported_eps: 0.14, estimated_eps: 0.14, eps_estimate: 0.14 }))!.eps!.verdict).toBe("in_line");
    expect(eventFromDoc(row({ reported_eps: null }))).toBeNull();
    expect(eventFromDoc(row({ market: "US_SUPERSEDED" }))).toBeNull();
    expect(eventFromDoc(row({ time: "during" }))!.session).toBe("unknown");
  });
});

describe("the move", () => {
  const base = { date: "2026-11-10", session: "amc" as const, today: TODAY, now: NOON, past: null, priceMeta: null, quote: null, premarket: null };

  it("uses the live quote on the reaction day while the session runs", () => {
    expect(pickMove({ ...base, quote: { pct: 25.45, capturedAt: "2026-11-11T19:03:00+00:00" } })).toMatchObject({ pct: 25.45, kind: "today", day: TODAY, nextDay: true });
  });

  it("ignores a quote from another day or from before the open", () => {
    expect(pickMove({ ...base, quote: { pct: 3, capturedAt: "2026-11-10T19:03:00+00:00" } })).toBeNull();
    expect(pickMove({ ...base, quote: { pct: 3, capturedAt: "2026-11-11T13:00:00+00:00" } })).toBeNull();
  });

  it("uses the pre-market quote before the open", () => {
    const early = new Date("2026-11-11T12:00:00Z");
    expect(pickMove({ ...base, now: early, premarket: { pct: 12.3, date: TODAY, at: "2026-11-11T11:55:00Z" } })).toMatchObject({ pct: 12.3, kind: "before_open" });
    expect(pickMove({ ...base, now: early, premarket: { pct: 12.3, date: "2026-11-10", at: null } })).toBeNull();
  });

  it("prefers the measured close-to-close move once the close is final", () => {
    const own = past({ date: "2026-11-09", move: -13.51 });
    expect(pickMove({ ...base, date: "2026-11-09", past: own, priceMeta: { lastDate: "2026-11-10", fetchedAt: "2026-11-10T22:56:00Z" } })).toMatchObject({ pct: -13.51, kind: "day", day: "2026-11-10" });
  });

  it("does not take a bar fetched during the session for the close", () => {
    const own = past({ date: "2026-11-09", move: 4 });
    expect(pickMove({ ...base, date: "2026-11-09", past: own, priceMeta: { lastDate: "2026-11-10", fetchedAt: "2026-11-10T19:53:00Z" } })).toBeNull();
  });

  it("says two days when the report time is unknown", () => {
    const own = past({ date: "2026-11-05", session: "unknown", move: 6, basis: "2d" });
    expect(pickMove({ ...base, date: "2026-11-05", session: "unknown", past: own })).toMatchObject({ kind: "two_days" });
    expect(pickMove({ ...base, session: "unknown", quote: { pct: 25.45, capturedAt: "2026-11-11T19:03:00+00:00" } })).toBeNull();
  });
});

describe("the call", () => {
  const stability = (patch: Record<string, unknown>) => ({ call: "Hold", session: TODAY, changes: [], updated_at: "2026-11-11T15:08:00Z", ...patch });

  it("finds a change made after the results reached the market", () => {
    const changed = callAfter(stability({ call: "Add", changes: [{ date: TODAY, from: "Hold", to: "Add", trigger: "earnings", reason: "Results beat." }] }), "2026-11-10", "amc", TODAY);
    expect(changed).toMatchObject({ status: "changed", call: "Buy more", from: "Keep", on: TODAY, reason: "Results beat." });
  });

  it("ignores a change from before the results", () => {
    expect(callAfter(stability({ changes: [{ date: "2026-11-10", from: "Add", to: "Hold" }] }), "2026-11-10", "amc", TODAY)).toMatchObject({ status: "held", call: "Keep" });
  });

  it("only states the call before its first run after the results", () => {
    expect(callAfter(stability({ session: "2026-11-09" }), "2026-11-09", "amc", TODAY)).toMatchObject({ status: "pending" });
    expect(callAfter(stability({ call: "nonsense" }), "2026-11-09", "amc", TODAY)).toBeNull();
    expect(callAfter(null, "2026-11-09", "amc", TODAY)).toBeNull();
  });
});

describe("the release", () => {
  it("reads revenue and the outlook only with a filing to point at", () => {
    const doc = {
      ticker: "CEG",
      event_date: "2026-11-09",
      filing: { url: "https://www.sec.gov/ceg.htm", filed_at: "2026-11-09T11:53:11+00:00" },
      revenue: { value: 6_500_000_000, yoy_pct: 4.2 },
      guidance: { change: "raised", items: [{ label: "Adjusted EPS", period: "Full year 2026", low: 12.5, high: 12.8, unit: "usd_per_share" }] },
      period: { label: "Q3 2026" },
      read: { title: "x" },
    };
    const parts = releaseParts(doc);
    expect(parts.revenue).toMatchObject({ value: 6.5e9, yoyPct: 4.2, url: "https://www.sec.gov/ceg.htm" });
    expect(parts.guidance).toMatchObject({ change: "raised", first: "Full year 2026 adjusted EPS $12.50 to $12.80" });
    expect(parts.period).toBe("Q3 2026");
    expect(parts.href).toBe("/stock/CEG/earnings/2026-11-09");
    expect(releaseParts({ ...doc, filing: {} }).revenue).toBeNull();
    expect(releaseParts({ ...doc, guidance: { change: "none", items: [] } }).guidance).toBeNull();
  });
});

describe("the read", () => {
  it("puts it together, with the usual move from the earlier reports only", () => {
    const history = {
      past: [past({ date: "2026-11-10", move: null, basis: null }), past({ date: "2026-08-12", move: 10 }), past({ date: "2026-05-14", move: -20 }), past({ date: "2026-03-01", move: 6 })],
      typicalDayPct: 4,
    };
    const result = buildResult({
      event: eventFromDoc(row())!,
      today: TODAY,
      now: NOON,
      history,
      priceMeta: null,
      quote: { pct: 25.45, capturedAt: "2026-11-11T19:03:00+00:00" },
      premarket: null,
      stability: { call: "Add", session: TODAY, changes: [], updated_at: "2026-11-11T15:08:00Z" },
      release: null,
    })!;
    // The reaction session is today, so there is no finished close yet: the live quote is the move, and today's
    // report is not counted in the usual move (median of 10, 20 and 6 is 10; three reports, so the mean: 12).
    expect(result.move).toMatchObject({ pct: 25.45, kind: "today", usualPct: 12, usualCount: 3 });
    expect(result.call).toMatchObject({ status: "held", call: "Buy more" });
    expect(result.sources.map((source) => source.label)).toEqual(["EPS and estimate", "Move", "Call reviewed"]);
  });

  it("is null with nothing reported we can stand behind", () => {
    const hsai = eventFromDoc(row({ ticker: "HSAI", eps_estimate: 0.08, estimated_eps: 1.24, reported_eps: 0.72 }))!;
    expect(buildResult({ event: hsai, today: TODAY, now: NOON, history: null, priceMeta: null, quote: null, premarket: null, stability: null, release: null })).toBeNull();
  });
});
