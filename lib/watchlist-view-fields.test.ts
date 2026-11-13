import { describe, expect, it, vi } from "vitest";

/**
 * buildRows reads a stock's brief and facts documents with a field mask
 * (WATCHLIST_BRIEF_FIELDS, WATCHLIST_FACTS_FIELDS). A field left off a mask
 * comes back undefined without any error, so this records every field
 * rowFromDocs touches on those two documents and checks each one is masked,
 * then checks a row built from the masked documents equals one built from the
 * whole documents.
 */

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));
vi.mock("@/lib/firestore", () => ({
  batchGetRefs: vi.fn(),
  getLatestPriceQuotes: vi.fn(),
  getMarketMovers: vi.fn(),
  getMarketSnapshot: vi.fn(),
}));

import { projectFields } from "@/lib/local-firestore";
import { WATCHLIST_BRIEF_FIELDS, WATCHLIST_FACTS_FIELDS, rowFromDocs } from "@/lib/watchlist-view";

const soon = new Date(Date.now() + 5 * 86_400_000);
const soonLabel = soon.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const BRIEF = {
  visual_summary: { what_changed: "Services revenue beat again.", tone: "up", cards: [{ title: "x" }] },
  today_brief: "Today brief.",
  body: "Body.",
  thesis: "Thesis.",
  headline: "Headline.",
  overall_label: "bullish",
  source: "llm",
  coverage_type: "full",
  directive_v2: {
    stance: "accumulate",
    confidence: "high",
    watch_out: "We plan to keep this call until at least Dec 1.",
    action: { label: "Buy more", summary: "Cheap against its own history." },
    zones: { accumulate_below: 170.5, trim_above: 210 },
  },
  options_digest: { iv: 0.3, skew: [1, 2, 3] },
  fundamentals: { pe: 28 },
  visual_cards: [{ kind: "chart" }],
  market_regime: { label: "risk-on" },
};

const FACTS = {
  analyst: { label: "Buy", target_price: 220, target_low: 180, target_high: 260, buy: 30, hold: 8, sell: 2, analyst_count: 40 },
  returns: { one_month_pct: 6.2, three_month_pct: 9, six_month_pct: 12, one_year_pct: 21 },
  quick_stats: { market_cap: 3.1e12, pe_ttm: 28.4, eps_next_year_growth_pct: 9, institutional_ownership_pct: 61, recommendation_score: 1.9 },
  financials: { fiscal_year: 2026, revenue: 4e11, revenue_growth_yoy_pct: 6, operating_income: 1.2e11, net_income: 1e11, eps_diluted: 6.5 },
  institutions: { ownership_pct: 61, top_holders: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }] },
  events: [{ title: "Earnings", kind: "earnings", date_label: soonLabel }],
  financial_history: [{ year: 2025, revenue: 3.9e11 }],
  dividends: [{ date: "2026-08-01", amount: 0.26 }],
  analyst_trend: [{ month: "2026-10", buy: 29 }],
  business_segments: [{ name: "iPhone" }],
};

/** Every dotted field path read from `value`, and every path whose keys were listed. */
function recorder<T extends object>(value: T) {
  const reads = new Set<string>();
  const listed = new Set<string>();
  const wrap = (target: object, path: string): object =>
    new Proxy(target, {
      get(object, key, receiver) {
        const item = Reflect.get(object, key, receiver);
        if (typeof key !== "string" || Array.isArray(object)) return item;
        const child = path ? `${path}.${key}` : key;
        reads.add(child);
        // Inside an array the whole array field is what the mask names, so stop there.
        return item && typeof item === "object" && !Array.isArray(item) ? wrap(item, child) : item;
      },
      ownKeys(object) {
        listed.add(path);
        return Reflect.ownKeys(object);
      },
    });
  return { proxy: wrap(value, "") as T, reads, listed };
}

const covers = (mask: readonly string[], path: string) =>
  mask.some((field) => path === field || path.startsWith(`${field}.`));
const reachesMasked = (mask: readonly string[], path: string) =>
  covers(mask, path) || mask.some((field) => field.startsWith(`${path}.`));

function variants<T extends Record<string, unknown>>(doc: T, drops: string[][]): Record<string, unknown>[] {
  return drops.map((keys) => Object.fromEntries(Object.entries(doc).filter(([key]) => !keys.includes(key))));
}

// Each text field the row falls back to, so every branch is taken once.
const BRIEFS = variants(BRIEF, [[], ["visual_summary"], ["visual_summary", "today_brief"], ["visual_summary", "today_brief", "body"], ["visual_summary", "today_brief", "body", "thesis"]]);

function build(brief: Record<string, unknown>, facts: Record<string, unknown>, position: "holding" | "watchlist" = "watchlist") {
  return rowFromDocs(
    "US_AAPL",
    position,
    position === "holding" ? { quantity: 10, average_cost: 150 } : null,
    { ticker: "AAPL", currency: "USD", quote: { current: 173.03, day_change_pct: -2.22, day_change_abs: -3.92 } },
    { logo_url: "https://x/aapl.png", sector: "Technology", industry: "Consumer Electronics" },
    { overall: { score: 71, verdict: "Strong" }, pillars: { valuation: { score: 60, metrics: [] } }, sector_label: "Technology" },
    brief,
    facts,
    { rsi_14: { value: 55, state: "neutral" } },
    { days: { "2026-11-12": { count: 3, sentiment_n: 2, sentiment_sum: 1 } } },
    {},
  );
}

describe("watchlist row field masks", () => {
  it("reads nothing from a brief or facts document outside its mask", () => {
    const briefReads = new Set<string>();
    const factsReads = new Set<string>();
    const listed: string[] = [];
    for (const brief of BRIEFS) {
      for (const position of ["holding", "watchlist"] as const) {
        const b = recorder(brief);
        const f = recorder(FACTS);
        build(b.proxy, f.proxy, position);
        b.reads.forEach((path) => briefReads.add(path));
        f.reads.forEach((path) => factsReads.add(path));
        listed.push(...[...b.listed].filter((path) => path && !covers(WATCHLIST_BRIEF_FIELDS, path)).map((path) => `brief ${path}`));
        listed.push(...[...f.listed].filter((path) => path && !covers(WATCHLIST_FACTS_FIELDS, path)).map((path) => `facts ${path}`));
      }
    }
    expect([...briefReads].filter((path) => !reachesMasked(WATCHLIST_BRIEF_FIELDS, path))).toEqual([]);
    expect([...factsReads].filter((path) => !reachesMasked(WATCHLIST_FACTS_FIELDS, path))).toEqual([]);
    // A map whose keys are listed has to be masked whole, or its listing would come back short.
    expect(listed).toEqual([]);
    // The recorder saw the reads it should have (it is not silently empty).
    expect(briefReads).toContain("directive_v2");
    expect(factsReads).toContain("analyst");
  });

  it("builds the same row from the masked documents as from the whole ones", () => {
    for (const brief of BRIEFS) {
      for (const position of ["holding", "watchlist"] as const) {
        const whole = build(brief, FACTS, position);
        const masked = build(projectFields(brief, WATCHLIST_BRIEF_FIELDS)!, projectFields(FACTS, WATCHLIST_FACTS_FIELDS)!, position);
        expect(masked).toEqual(whole);
      }
    }
  });

  it("treats a brief with none of the masked fields as no brief, as a whole read of it would", () => {
    const empty = build({ options_digest: { iv: 1 } }, FACTS);
    const masked = build(projectFields({ options_digest: { iv: 1 } }, WATCHLIST_BRIEF_FIELDS)!, FACTS);
    expect(masked).toEqual(empty);
  });
});
