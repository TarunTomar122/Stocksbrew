import { describe, expect, it } from "vitest";

import {
  PAIRS_PER_STOCK,
  buildPairs,
  causeBucket,
  cleanTicker,
  clusterBuys,
  insiderIsIndexable,
  insiderWindow,
  isConfirmedMove,
  isIsoDay,
  isSpecificIndustry,
  moveTitle,
  moversDayTitle,
  pairHref,
  pairIsIndexable,
  pairSlug,
  parsePairSlug,
  sectorIsIndexable,
  stockLabel,
} from "@/lib/seo/families";

describe("pair addresses", () => {
  it("puts tickers in alphabetical order, lower case", () => {
    expect(pairSlug("NVDA", "AMD")).toBe("amd-vs-nvda");
    expect(pairSlug("amd", "NVDA")).toBe("amd-vs-nvda");
    expect(pairHref("XOM", "CVX")).toBe("/compare/cvx-vs-xom");
  });

  it("parses the canonical slug and flags every other spelling", () => {
    expect(parsePairSlug("amd-vs-nvda")).toEqual({ a: "AMD", b: "NVDA", slug: "amd-vs-nvda", isCanonical: true });
    expect(parsePairSlug("nvda-vs-amd")).toEqual({ a: "AMD", b: "NVDA", slug: "amd-vs-nvda", isCanonical: false });
    expect(parsePairSlug("NVDA-vs-AMD")?.isCanonical).toBe(false);
    expect(parsePairSlug("AMD-VS-NVDA")?.slug).toBe("amd-vs-nvda");
    expect(parsePairSlug("brk.b-vs-jpm")).toEqual({ a: "BRK.B", b: "JPM", slug: "brk.b-vs-jpm", isCanonical: true });
  });

  it("refuses anything that is not two different tickers, and the product comparisons", () => {
    for (const bad of ["", "nvda", "nvda-vs-nvda", "a-vs-b-vs-c", "nvda-vs-", "-vs-amd", "nv da-vs-amd", "stocksbrew-vs-finviz", "finviz-vs-stocksbrew", "%E0%A4%A-vs-amd", "toolongticker-vs-amd"]) {
      expect(parsePairSlug(bad), bad).toBeNull();
    }
  });

  it("cleans tickers from addresses", () => {
    expect(cleanTicker("nvda")).toBe("NVDA");
    expect(cleanTicker("BRK.B")).toBe("BRK.B");
    expect(cleanTicker("BF-B")).toBe("BF-B");
    expect(cleanTicker("$$")).toBeNull();
    expect(cleanTicker("../etc")).toBeNull();
    expect(cleanTicker("%ZZ")).toBeNull();
  });
});

describe("which pairs get a page", () => {
  const row = (symbol: string, industry: string | null, market_cap: number, sector = "Technology") => ({ symbol, sector, industry, market_cap });

  it("pairs only stocks in the same specific industry and sector", () => {
    const pairs = buildPairs([
      row("NVDA", "Semiconductors", 4000),
      row("AMD", "Semiconductors", 300),
      row("AVGO", "Semiconductors", 1500),
      row("MSFT", "Software Infrastructure", 3500),
      row("ORCL", "Software Infrastructure", 600),
      row("X1", "Information Technology", 10),
      row("X2", "Information Technology", 10),
      row("H1", "Semiconductors", 50, "Health Care"),
      row("N1", null, 10),
      row("N2", null, 10),
    ]);
    expect(pairs.map((pair) => pair.slug)).toEqual(["amd-vs-avgo", "amd-vs-nvda", "avgo-vs-nvda", "msft-vs-orcl"]);
    expect(pairs.find((pair) => pair.slug === "amd-vs-nvda")?.group).toBe("Semiconductors");
  });

  it("adds hand-picked rivals only when they share a sector", () => {
    const rows = [row("KO", "Consumer Staples", 300, "Consumer Staples"), row("PEP", "Consumer Staples", 200, "Consumer Staples"), row("AAPL", "Consumer Electronics", 3000)];
    const pairs = buildPairs(rows, { hand: [["KO", "PEP"], ["KO", "AAPL"], ["KO", "ZZZZ"]] });
    expect(pairs.map((pair) => pair.slug)).toEqual(["ko-vs-pep"]);
    expect(pairs[0]!.group).toBe("Consumer Staples");
  });

  it("caps pages per stock and prefers the best-known names", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`S${index}`, "Semiconductors", 1000 - index));
    const pairs = buildPairs(rows, { priority: ["S9", "S8"] });
    const count = new Map<string, number>();
    for (const pair of pairs) for (const symbol of [pair.a, pair.b]) count.set(symbol, (count.get(symbol) ?? 0) + 1);
    expect(Math.max(...count.values())).toBeLessThanOrEqual(PAIRS_PER_STOCK);
    // The priority names lead their industry, so they get a page together.
    expect(pairs.some((pair) => pair.slug === "s8-vs-s9")).toBe(true);
    // Only the six leading names are paired.
    expect(new Set(pairs.flatMap((pair) => [pair.a, pair.b])).size).toBeLessThanOrEqual(6);
    // Deterministic order.
    expect(pairs.map((pair) => pair.slug)).toEqual([...pairs.map((pair) => pair.slug)].sort());
  });

  it("indexes a pair only when both calls are recent and both stock pages are indexable", () => {
    const fresh = { symbol: "AMD", call: "Add", thesis: "x", call_at: "2026-11-05T00:00:00Z", price: 1, price_at: "2026-11-09T20:00:00Z" };
    const today = "2026-11-10";
    expect(pairIsIndexable(fresh, { ...fresh, symbol: "NVDA" }, today)).toBe(true);
    expect(pairIsIndexable(fresh, { ...fresh, symbol: "NVDA", call_at: "2026-10-20T00:00:00Z" }, today)).toBe(false);
    expect(pairIsIndexable(fresh, { ...fresh, symbol: "NVDA", thesis: "" }, today)).toBe(false);
    expect(pairIsIndexable(fresh, null, today)).toBe(false);
  });

  it("knows a sector name is not an industry", () => {
    expect(isSpecificIndustry("Semiconductors", "Technology")).toBe(true);
    expect(isSpecificIndustry("Technology", "Technology")).toBe(false);
    expect(isSpecificIndustry("Information Technology", "Technology")).toBe(false);
    expect(isSpecificIndustry("Utilities", "Technology")).toBe(false);
    expect(isSpecificIndustry("", "Technology")).toBe(false);
  });
});

describe("why a stock moved", () => {
  const confirmed = {
    narrative_status: "verified",
    move_explanation: {
      cause_type: "earnings",
      headline: "Lucid rises on lower cash burn",
      confidence: "medium",
      external_source: "mover_research",
      evidence: [{ title: "Lucid Q3 call", url: "https://example.com/a" }],
    },
  };

  it("gets a page only with a confirmed, sourced reason", () => {
    expect(isConfirmedMove(confirmed)).toBe(true);
    expect(isConfirmedMove({ ...confirmed, narrative_status: "unverified" })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, confidence: "low" } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, cause_type: "price_action" } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, cause_type: "no_verified_catalyst" } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, evidence: [] } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, evidence: [{ title: "x", url: "javascript:alert(1)" }] } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, external_source: "internal_tape_after_source_search" } })).toBe(false);
    expect(isConfirmedMove({ ...confirmed, move_explanation: { ...confirmed.move_explanation, headline: " " } })).toBe(false);
    expect(isConfirmedMove(null)).toBe(false);
  });

  it("asks the question while the day is live and states the move once it closed", () => {
    expect(moveTitle({ name: "Lucid Group", ticker: "LCID", pct: 5.69, day: "2026-11-10", today: "2026-11-10", closed: false })).toBe(
      "Why Is Lucid Group (LCID) Stock Up Today? Nov 10, 2026",
    );
    expect(moveTitle({ name: "Lucid Group", ticker: "LCID", pct: 5.21, day: "2026-11-10", today: "2026-11-10", closed: true })).toBe(
      "Why Lucid Group (LCID) Stock Rose 5.2% on Nov 10, 2026",
    );
    expect(moveTitle({ name: "HIMS", ticker: "HIMS", pct: -11.1, day: "2026-11-10", today: "2026-11-12", closed: false })).toBe("Why HIMS Stock Fell 11.1% on Nov 10, 2026");
    expect(moversDayTitle("2026-11-10")).toBe("Biggest Stock Movers on Nov 10, 2026 and Why They Moved");
    expect(stockLabel("AMD", "AMD")).toBe("AMD");
  });

  it("buckets causes and validates days", () => {
    expect(causeBucket("earnings_and_guidance")).toBe("earnings");
    expect(causeBucket("analyst price-target cut")).toBe("analyst calls");
    expect(causeBucket("business_contract")).toBe("deals and contracts");
    expect(causeBucket("something else")).toBe("other news");
    expect(isIsoDay("2026-11-10")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2026-11-10x")).toBe(false);
  });
});

describe("sectors and insiders", () => {
  it("indexes sectors with enough stocks", () => {
    expect(sectorIsIndexable(8)).toBe(true);
    expect(sectorIsIndexable(7)).toBe(false);
  });

  it("indexes an insider page with three trades in the window", () => {
    const trade = (day: string, tx_type: "buy" | "sell", insider: string, value = 1000) => ({ insider, tx_type, value, transaction_date: day, filing_date: day });
    const trades = [trade("2026-11-01", "sell", "A"), trade("2026-10-01", "sell", "B"), trade("2025-10-01", "sell", "C"), trade("2025-11-11", "buy", "D")];
    const window = insiderWindow(trades, "2026-11-10");
    expect(window.length).toBe(3);
    expect(insiderIsIndexable(window.length)).toBe(true);
    expect(insiderIsIndexable(2)).toBe(false);
  });

  it("finds cluster buys of three insiders within 30 days", () => {
    const buy = (day: string, insider: string, value = 100) => ({ insider, tx_type: "buy" as const, value, transaction_date: day });
    expect(clusterBuys([buy("2026-10-01", "A"), buy("2026-10-10", "B"), buy("2026-10-30", "C")])).toEqual([
      { first: "2026-10-01", last: "2026-10-30", insiders: ["A", "B", "C"], value: 300 },
    ]);
    // The same insider three times is not a cluster; a window wider than 30 days is not either.
    expect(clusterBuys([buy("2026-10-01", "A"), buy("2026-10-02", "A"), buy("2026-10-03", "A")])).toEqual([]);
    expect(clusterBuys([buy("2026-09-01", "A"), buy("2026-09-20", "B"), buy("2026-10-05", "C")])).toEqual([]);
    // Sales never count.
    expect(clusterBuys([buy("2026-10-01", "A"), buy("2026-10-02", "B"), { ...buy("2026-10-03", "C"), tx_type: "sell" as const }])).toEqual([]);
  });
});
