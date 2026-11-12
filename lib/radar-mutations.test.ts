import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore, type MemoryStore } from "@/lib/import/test-store";

const h = vi.hoisted(() => ({
  store: null as MemoryStore | null,
  rebuild: vi.fn(async (_uid: string, _min?: number) => undefined),
  sync: vi.fn(async (_uid: string, _input: { pause?: readonly string[]; resume?: readonly string[] }) => ({ paused: 0, resumed: 0 })),
  after: vi.fn((_label: string, _work: Promise<unknown>) => undefined),
}));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore } = await import("@/lib/import/test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return memoryFirestore(h.store!);
    },
  };
});
vi.mock("@/lib/watchlist-view-rebuild", () => ({ requestWatchlistViewRebuild: h.rebuild }));
vi.mock("@/lib/stock-alerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock-alerts")>()),
  syncAlertPauses: h.sync,
}));
vi.mock("@/lib/after-response", () => ({ afterResponse: h.after }));
vi.mock("@/lib/on-demand-queue", () => ({ maybeQueueOnDemandNews: vi.fn(async () => false) }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: vi.fn(async () => ({ uid: "u1" })) }));
vi.mock("@/lib/posthog-server-capture", () => ({ captureServerEventSafe: vi.fn(async () => undefined) }));
vi.mock("@/lib/funds/on-demand", () => ({ queueFundRequest: vi.fn(async () => undefined) }));
vi.mock("@/lib/funds/server", () => ({ fundListing: vi.fn(async () => null) }));
vi.mock("@/lib/instrument-resolver", () => ({
  getInstrumentLabels: vi.fn(async () => new Map()),
  resolveInstrumentByTicker: vi.fn(async (ticker: string) => ({ instrument_id: `US_${ticker}`, ticker, name: ticker, market: "US" })),
}));

import { addAgentStockToRadar } from "@/lib/agent-intelligence";
import { addRadarStock, removeRadarStock } from "@/lib/radar-mutations";
import { POST as trackPost } from "@/app/api/track/route";

const AAPL_HOLDING = { quantity: 10, average_cost: 150, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-01" };

/** Holds AAPL with shares and cost, watches NVDA. */
function seed(): Record<string, unknown> {
  return {
    tracked_stocks: ["US_AAPL", "US_NVDA"],
    watchlist_positions: { US_AAPL: "holding", US_NVDA: "watchlist" },
    watchlist_holdings: { US_AAPL: { ...AAPL_HOLDING } },
    covered_stocks: ["US_AAPL", "US_NVDA"],
    watchlist_version: 4,
  };
}

const user = () => h.store!.docs.get("users/u1")!;

beforeEach(() => {
  h.store = createMemoryStore();
  h.store.docs.set("users/u1", seed());
  h.rebuild.mockClear();
  h.sync.mockClear();
  h.after.mockClear();
});

function trackRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("adding a stock that is already followed (bug 1)", () => {
  it("keeps a holding a holding, with its shares and cost, when the add says watchlist", async () => {
    const result = await addRadarStock({ uid: "u1", instrumentId: "US_AAPL", positionType: "watchlist" });
    expect(result).toMatchObject({ already_tracked: true, position_type: "holding", changed: false, source_version: 4 });
    expect(user().watchlist_positions).toEqual({ US_AAPL: "holding", US_NVDA: "watchlist" });
    expect(user().watchlist_holdings).toEqual({ US_AAPL: AAPL_HOLDING });
    expect(user().watchlist_version).toBe(4);
    // Nothing changed, so nothing was written and nothing rebuilt.
    expect(h.store!.writes.filter((w) => w.path === "users/u1")).toEqual([]);
    expect(h.rebuild).not.toHaveBeenCalled();
  });

  it("marks a watched stock as held when an add says holding, without a move (nothing is lost)", async () => {
    const result = await addRadarStock({ uid: "u1", instrumentId: "US_NVDA", positionType: "holding" });
    expect(result).toMatchObject({ position_type: "holding", changed: true, source_version: 5 });
    expect(user().watchlist_positions).toEqual({ US_AAPL: "holding", US_NVDA: "holding" });
    expect(user().watchlist_holdings).toMatchObject({ US_AAPL: AAPL_HOLDING, US_NVDA: { quantity: null, average_cost: null } });
  });

  it("writes nothing for an add of the kind the stock already has", async () => {
    await addRadarStock({ uid: "u1", instrumentId: "US_NVDA", positionType: "watchlist" });
    await addRadarStock({ uid: "u1", instrumentId: "US_AAPL", positionType: "holding" });
    expect(h.store!.writes).toEqual([]);
    expect(user().watchlist_holdings).toEqual({ US_AAPL: AAPL_HOLDING });
  });

  it("still moves on an explicit move (the row menu), and moving to Watching drops the numbers as before", async () => {
    const result = await addRadarStock({ uid: "u1", instrumentId: "US_AAPL", positionType: "watchlist", move: true });
    expect(result).toMatchObject({ position_type: "watchlist", changed: true, source_version: 5 });
    expect(user().watchlist_positions).toEqual({ US_AAPL: "watchlist", US_NVDA: "watchlist" });
    expect(user().watchlist_holdings).toEqual({});
  });

  it("theme, basket, landing picks and onboarding: POST /api/track with watchlist keeps the holding", async () => {
    const response = await trackPost(trackRequest({ instrument_id: "US_AAPL", position_type: "watchlist" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, already_tracked: true, position_type: "holding", refresh_queued: false });
    expect(user().watchlist_holdings).toEqual({ US_AAPL: AAPL_HOLDING });
  });

  it("POST /api/track with move: true is the only way the route turns a holding into a watched stock", async () => {
    const response = await trackPost(trackRequest({ instrument_id: "US_AAPL", position_type: "watchlist", move: true }));
    expect(await response.json()).toMatchObject({ position_type: "watchlist", refresh_queued: true });
    expect(user().watchlist_positions).toMatchObject({ US_AAPL: "watchlist" });
    expect(h.rebuild).toHaveBeenCalledWith("u1", 5);
  });

  it("POST /api/track with skip_refresh leaves the rebuild to the browser", async () => {
    const response = await trackPost(trackRequest({ instrument_id: "US_MSFT", position_type: "watchlist", skip_refresh: true }));
    expect(await response.json()).toMatchObject({ refresh_queued: false });
    expect(user().tracked_stocks).toContain("US_MSFT");
    expect(h.rebuild).not.toHaveBeenCalled();
  });

  it("Ask's add button and MCP add_to_radar (default watchlist) keep the holding", async () => {
    const result = await addAgentStockToRadar("u1", { ticker: "AAPL", market: "US", positionType: "watchlist" });
    expect(result).toMatchObject({ already_tracked: true, position_type: "holding" });
    expect(user().watchlist_holdings).toEqual({ US_AAPL: AAPL_HOLDING });
  });

  it("MCP add_to_radar with holding marks a watched stock as held, like the web", async () => {
    await addAgentStockToRadar("u1", { ticker: "NVDA", market: "US", positionType: "holding" });
    expect(user().watchlist_positions).toMatchObject({ US_NVDA: "holding" });
    expect(user().watchlist_holdings).toMatchObject({ US_AAPL: AAPL_HOLDING });
  });
});

describe("rebuilding the view after a write (fix plan step 2)", () => {
  it("queues a rebuild after the response with the new version when a stock is added", async () => {
    await addRadarStock({ uid: "u1", instrumentId: "US_MSFT", positionType: "watchlist", requestedBy: "track_post" });
    expect(user().tracked_stocks).toEqual(["US_AAPL", "US_NVDA", "US_MSFT"]);
    expect(h.rebuild).toHaveBeenCalledWith("u1", 5);
    expect(h.after).toHaveBeenCalledWith("watchlist_view_rebuild", expect.any(Promise));
  });

  it("queues one for a removal, an Ask/MCP add, and leaves it to the browser for skip_refresh", async () => {
    await removeRadarStock({ uid: "u1", instrumentId: "US_NVDA", requestedBy: "track_delete" });
    expect(h.rebuild).toHaveBeenLastCalledWith("u1", 5);
    await addAgentStockToRadar("u1", { ticker: "MSFT", market: "US" });
    expect(h.rebuild).toHaveBeenLastCalledWith("u1", 6);
    h.rebuild.mockClear();
    await addRadarStock({ uid: "u1", instrumentId: "US_AMD", skipRebuild: true });
    await removeRadarStock({ uid: "u1", instrumentId: "US_AMD", skipRebuild: true });
    expect(h.rebuild).not.toHaveBeenCalled();
  });

  it("does not rebuild for removing a stock that was not followed", async () => {
    await removeRadarStock({ uid: "u1", instrumentId: "US_TSLA" });
    expect(h.rebuild).not.toHaveBeenCalled();
    expect(h.sync).not.toHaveBeenCalled();
  });
});

describe("alerts follow the book (fix plan step 5)", () => {
  it("pauses a removed stock's alerts and resumes them when it is followed again", async () => {
    await removeRadarStock({ uid: "u1", instrumentId: "US_AAPL" });
    expect(h.sync).toHaveBeenCalledWith("u1", { pause: ["US_AAPL"] });
    await addRadarStock({ uid: "u1", instrumentId: "US_AAPL" });
    // The plan goes along, so coming back can't get round the Free price-alert limit.
    expect(h.sync).toHaveBeenLastCalledWith("u1", { resume: ["US_AAPL"], plan: "free" });
  });
});
