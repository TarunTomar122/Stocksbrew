import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchlistRow } from "@/lib/watchlist-view";

const h = vi.hoisted(() => ({
  view: null as Record<string, unknown> | null,
  live: null as { rows: unknown[]; version?: number } | null,
}));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));
vi.mock("@/lib/watchlist-view", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/watchlist-view")>()),
  getWatchlistView: vi.fn(async () => h.view),
}));
vi.mock("@/lib/radar-rows", () => ({ loadRadarRowsForUser: vi.fn(async () => h.live) }));
vi.mock("@/lib/instrument-resolver", () => ({
  getInstrumentLabels: vi.fn(async () => new Map()),
  resolveInstrumentByTicker: vi.fn(async () => null),
}));

import { getMyAgentRadar } from "@/lib/agent-intelligence";

function row(id: string, patch: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    instrument_id: id,
    ticker: id.slice(3),
    position_type: "watchlist",
    market: "US",
    sector_label: "",
    industry_label: "",
    currency: "USD",
    price: 100,
    day_change_pct: 1,
    day_change_abs: 1,
    scores: { overall: null, verdict: null, valuation: null, growth: null, quality: null, momentum: null },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "", vibe: "wild", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: false,
    ...patch,
  } as WatchlistRow;
}

beforeEach(() => {
  // The stored view is from before the person's edits: it still has NVDA (since removed) and says AAPL is watched with
  // no shares (a scheduled build), in its own order.
  h.view = {
    rows: [row("US_NVDA"), row("US_MSFT"), row("US_AAPL")],
    tracked_count: 3,
    holdings_count: 0,
    watchlist_count: 3,
    attention_items: [{ instrument_id: "US_NVDA", reason: "old" }, { instrument_id: "US_MSFT", reason: "keep" }],
    built_at: "2026-11-10T21:00:00Z",
  };
  // The live book: AAPL is held (10 shares at $150 cost, $200 now), MSFT is held with an entered value, NVDA is gone.
  h.live = {
    rows: [
      row("US_AAPL", { position_type: "holding", price: 200, holding: { quantity: 10, market_value: null, average_cost: 150 } }),
      row("US_MSFT", { position_type: "holding", price: 400, holding: { quantity: null, market_value: 2000, average_cost: null } }),
    ],
  };
});

describe("getMyAgentRadar (Ask's portfolio card, MCP get_my_radar), bug 9", () => {
  it("lists the live book with live holding or watching, shares, value, gain and weight", async () => {
    const out = await getMyAgentRadar("u1");
    expect(out).toMatchObject({ tracked_count: 2, holdings_count: 2, watchlist_count: 0 });
    const rows = out.rows as Array<{ instrument_id: string; position_type: string; holding: Record<string, number | null> | null }>;
    // the view's order, without the removed stock
    expect(rows.map((r) => r.instrument_id)).toEqual(["US_MSFT", "US_AAPL"]);
    const aapl = rows.find((r) => r.instrument_id === "US_AAPL")!;
    expect(aapl.position_type).toBe("holding");
    expect(aapl.holding).toMatchObject({ quantity: 10, market_value: 2000, unrealized_gain_pct: 33.3, portfolio_weight_pct: 50 });
    // The view still describes the old book (NVDA, AAPL watched), so its write-ups are left out.
    expect(out).toMatchObject({ view_status: "rebuilding", brief: null, portfolio: null, changes: null });
    expect((out as unknown as { attention_items: Array<{ instrument_id: string }> }).attention_items.map((i) => i.instrument_id)).toEqual(["US_MSFT"]);
  });

  it("answers with the live rows when there is no view yet, and with none when everything was removed", async () => {
    h.view = null;
    expect((await getMyAgentRadar("u1")).tracked_count).toBe(2);
    h.view = { rows: [row("US_NVDA")], tracked_count: 1 };
    h.live = { rows: [] };
    const out = await getMyAgentRadar("u1");
    expect(out).toMatchObject({ data_status: "available", tracked_count: 0, rows: [] });
  });

  it("counts shares at the live price before a typed value, gives a holding with no value no weight, and keeps a watched stock's old numbers out", async () => {
    h.live = {
      rows: [
        row("US_AAPL", { position_type: "holding", price: 200, holding: { quantity: 10, market_value: 999, average_cost: 150 } }),
        row("US_MSFT", { position_type: "holding", price: 400, holding: { quantity: null, market_value: null, average_cost: null } }),
        row("US_NVDA", { position_type: "watchlist", holding: { quantity: 5, market_value: null, average_cost: 100 } }),
      ],
    };
    const rows = (await getMyAgentRadar("u1")).rows as Array<{ instrument_id: string; holding: Record<string, number | null> | null }>;
    const by = Object.fromEntries(rows.map((r) => [r.instrument_id, r.holding]));
    expect(by.US_AAPL).toMatchObject({ market_value: 2000, portfolio_weight_pct: 100 });
    expect(by.US_MSFT).toMatchObject({ market_value: null, portfolio_weight_pct: null });
    expect(by.US_NVDA).toBeNull();
  });

  it("keeps the view's write-ups when it describes today's book, and not after a shares or cost edit", async () => {
    h.view = {
      rows: [row("US_MSFT", { position_type: "holding" }), row("US_AAPL", { position_type: "holding" })],
      brief: { narrative: "n", signals: [], status: "ready" },
      portfolio: { x: 1 },
      source_version: 7,
    };
    h.live = { ...h.live!, version: 7 };
    expect(await getMyAgentRadar("u1")).toMatchObject({ view_status: "current", brief: { narrative: "n" }, portfolio: { x: 1 } });
    h.live = { ...h.live!, version: 8 }; // same stocks and kinds, new numbers
    expect(await getMyAgentRadar("u1")).toMatchObject({ view_status: "rebuilding", brief: null, portfolio: null });
  });

  it("gives no weight when no holding has a value, never the stored one", async () => {
    h.live = { rows: [row("US_AAPL", { position_type: "holding", price: null, holding: { quantity: null, market_value: null, average_cost: null, portfolio_weight_pct: 60 } })] };
    const rows = (await getMyAgentRadar("u1")).rows as Array<{ holding: Record<string, number | null> | null }>;
    expect(rows[0]!.holding).toMatchObject({ market_value: null, portfolio_weight_pct: null });
  });
});

