import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStore } from "./test-store";

const store = vi.hoisted(() => ({ current: null as ReturnType<typeof import("./test-store").createMemoryStore> | null }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { memoryFirestore: make } = await import("./test-store");
  return {
    adminAuth: {},
    get adminFirestore() {
      return make(store.current!);
    },
  };
});

import { cleanSaveRows, mergeImport, saveImport, type SaveRow } from "./save";

const NOW = new Date("2026-11-10T15:00:00Z");

const row = (id: string, patch: Partial<SaveRow> = {}): SaveRow => ({ instrument_id: id, shares: null, average_cost: null, market_value: null, merge: "keep", ...patch });

/** A Free account that already owns AAPL (with numbers) and watches MSFT. */
function existing(): Record<string, unknown> {
  return {
    tracked_stocks: ["US_AAPL", "US_MSFT"],
    watchlist_positions: { US_AAPL: "holding", US_MSFT: "watchlist" },
    watchlist_holdings: {
      US_AAPL: { quantity: 10, average_cost: 150, market_value: null, currency: "USD", source: "manual", updated_at: "2026-01-01", lot_note: "kept" },
    },
    covered_stocks: ["US_AAPL", "US_MSFT"],
    covered_fills_used: 2,
    watchlist_version: 7,
    theses: { US_AAPL: { kind: "growth", reason: null, created_at: "2026-01-01", updated_at: "2026-01-01" } },
  };
}

describe("cleanSaveRows", () => {
  it("accepts covered-looking ids and numbers in range, last row per stock wins", () => {
    expect(
      cleanSaveRows([
        { instrument_id: "us_nvda", shares: "25", average_cost: 118, market_value: 999 },
        { instrument_id: "US_KO", shares: null, average_cost: null, market_value: 500 },
        { instrument_id: "US_NVDA", shares: 30, average_cost: null, market_value: null, merge: "add" },
      ]),
    ).toEqual([
      { instrument_id: "US_NVDA", shares: 30, average_cost: null, market_value: null, merge: "add" },
      { instrument_id: "US_KO", shares: null, average_cost: null, market_value: 500, merge: "keep" },
    ]);
  });

  it("reads anything but an explicit choice as keep", () => {
    expect(cleanSaveRows([{ instrument_id: "US_AAPL", shares: 3, merge: "overwrite" }])).toEqual([
      { instrument_id: "US_AAPL", shares: 3, average_cost: null, market_value: null, merge: "keep" },
    ]);
  });

  it.each([
    ["not a list", { rows: 1 }],
    ["empty", []],
    ["bad id", [{ instrument_id: "AAPL" }]],
    ["Indian id", [{ instrument_id: "IN_TCS" }]],
    ["negative shares", [{ instrument_id: "US_AAPL", shares: -1 }]],
    ["silly price", [{ instrument_id: "US_AAPL", average_cost: 9e9 }]],
    ["text number", [{ instrument_id: "US_AAPL", shares: "ten" }]],
  ])("refuses %s", (_label, raw) => {
    expect(cleanSaveRows(raw)).toBeNull();
  });

  it("refuses more than 100 rows", () => {
    expect(cleanSaveRows(Array.from({ length: 101 }, (_, i) => ({ instrument_id: `US_T${i}` })))).toBeNull();
  });
});

describe("mergeImport", () => {
  it("adds new stocks as holdings and never drops a sibling holding or field", () => {
    const merge = mergeImport(existing(), [row("US_NVDA", { shares: 25, average_cost: 118 })], "screenshot", NOW);
    expect(merge.added).toEqual(["US_NVDA"]);
    expect(merge.updated).toEqual([]);
    expect(merge.write.tracked_stocks).toEqual(["US_AAPL", "US_MSFT", "US_NVDA"]);
    expect(merge.write.watchlist_positions).toEqual({ US_AAPL: "holding", US_MSFT: "watchlist", US_NVDA: "holding" });
    const holdings = merge.write.watchlist_holdings as Record<string, Record<string, unknown>>;
    expect(holdings.US_AAPL).toEqual((existing().watchlist_holdings as Record<string, unknown>).US_AAPL);
    expect(holdings.US_NVDA).toMatchObject({ quantity: 25, average_cost: 118, market_value: null, currency: "USD", source: "screenshot" });
    expect(merge.write.watchlist_version).toBe(8);
    // Fields the import does not own are not in the write at all.
    expect(merge.write).not.toHaveProperty("theses");
  });

  it("leaves a stock already held exactly as it was unless the person chose otherwise", () => {
    const before = (existing().watchlist_holdings as Record<string, unknown>).US_AAPL;
    const merge = mergeImport(existing(), [row("US_AAPL", { shares: 12, average_cost: 160 })], "screenshot", NOW);
    expect(merge.added).toEqual([]);
    expect(merge.updated).toEqual([]);
    expect(merge.kept).toEqual(["US_AAPL"]);
    expect((merge.write.watchlist_holdings as Record<string, unknown>).US_AAPL).toEqual(before);
  });

  it("replaces or adds to a held stock only when asked, and never blanks a number the import did not have", () => {
    const replaced = mergeImport(existing(), [row("US_AAPL", { average_cost: 160, merge: "replace" })], "manual", NOW);
    expect(replaced.updated).toEqual(["US_AAPL"]);
    expect((replaced.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_AAPL).toMatchObject({ quantity: 10, average_cost: 160, lot_note: "kept", source: "manual" });
    const added = mergeImport(existing(), [row("US_AAPL", { shares: 10, average_cost: 170, merge: "add" })], "screenshot", NOW);
    expect((added.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_AAPL).toMatchObject({ quantity: 20, average_cost: 160 });
  });

  it("fills in what a held stock is missing even on keep", () => {
    const data = { ...existing(), watchlist_holdings: { US_AAPL: { quantity: 10, average_cost: null } } };
    const merge = mergeImport(data, [row("US_AAPL", { shares: 12, average_cost: 150 })], "screenshot", NOW);
    expect(merge.updated).toEqual(["US_AAPL"]);
    expect((merge.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_AAPL).toMatchObject({ quantity: 10, average_cost: 150 });
  });

  it("turns a watched stock the person says they own into a holding", () => {
    const merge = mergeImport(existing(), [row("US_MSFT", { shares: 4 })], "manual", NOW);
    expect(merge.updated).toEqual(["US_MSFT"]);
    expect((merge.write.watchlist_positions as Record<string, string>).US_MSFT).toBe("holding");
    expect((merge.write.watchlist_holdings as Record<string, Record<string, unknown>>).US_MSFT).toMatchObject({ quantity: 4 });
    expect(merge.write.tracked_stocks).toEqual(["US_AAPL", "US_MSFT"]);
    expect(merge.write).not.toHaveProperty("last_tracked_at");
    expect(merge.write).not.toHaveProperty("covered_stocks");
  });

  it("keeps a screenshot's value only while there are no shares", () => {
    const merge = mergeImport({}, [row("US_KO", { market_value: 500 }), row("US_PEP", { shares: 2, market_value: 300 })], "screenshot", NOW);
    const holdings = merge.write.watchlist_holdings as Record<string, Record<string, unknown>>;
    expect(holdings.US_KO!.market_value).toBe(500);
    expect(holdings.US_PEP!.market_value).toBeNull();
  });

  it("fills free covered slots with new stocks, up to five, without a swap", () => {
    const ids = ["US_A", "US_B", "US_C", "US_D"].map((id) => row(id));
    const merge = mergeImport(existing(), ids, "manual", NOW);
    expect(merge.write.covered_stocks).toEqual(["US_AAPL", "US_MSFT", "US_A", "US_B", "US_C"]);
    expect(merge.write.covered_fills_used).toBe(5);
    expect(merge.covered).not.toContain("US_D");
  });

  it("covers everything on Pro and stores no coverage fields", () => {
    const merge = mergeImport({ ...existing(), is_subscribed: true }, [row("US_NVDA")], "manual", NOW);
    expect(merge.covered).toEqual(["US_AAPL", "US_MSFT", "US_NVDA"]);
    expect(merge.write).not.toHaveProperty("covered_stocks");
  });
});

describe("saveImport (store with LocalDB merge semantics)", () => {
  beforeEach(() => {
    store.current = createMemoryStore();
  });

  it("refuses an account whose profile is not written yet, and writes nothing", async () => {
    const result = await saveImport({ uid: "u1", rows: [row("US_NVDA")], source: "manual", mutationId: "import_m1", now: NOW });
    expect(result).toEqual({ ok: false, code: "profile_not_ready" });
    expect(store.current!.writes).toEqual([]);
  });

  it("writes only the person's doc, the tracked counter and its event, keeping siblings and other fields", async () => {
    store.current!.docs.set("users/u1", existing());
    store.current!.docs.set("users/u2", { tracked_stocks: ["US_KO"] });
    const result = await saveImport({ uid: "u1", rows: [row("US_NVDA", { shares: 5 })], source: "screenshot", mutationId: "import_m1", now: NOW });
    expect(result).toMatchObject({ ok: true, added: ["US_NVDA"], updated: [], replay: false });
    expect(store.current!.writes.map((w) => w.path).sort()).toEqual(["tm_tracked_instruments/US_NVDA", "users/u1", "users/u1/watchlist_events/import_m1"]);
    const doc = store.current!.docs.get("users/u1")!;
    expect(Object.keys(doc.watchlist_holdings as object).sort()).toEqual(["US_AAPL", "US_NVDA"]);
    expect(doc.theses).toEqual(existing().theses);
    expect(store.current!.docs.get("users/u2")).toEqual({ tracked_stocks: ["US_KO"] });
  });

  it("does nothing the second time the same save arrives", async () => {
    store.current!.docs.set("users/u1", existing());
    await saveImport({ uid: "u1", rows: [row("US_NVDA")], source: "manual", mutationId: "import_m1", now: NOW });
    const after = structuredClone(store.current!.docs.get("users/u1"));
    const writes = store.current!.writes.length;
    const again = await saveImport({ uid: "u1", rows: [row("US_NVDA")], source: "manual", mutationId: "import_m1", now: NOW });
    expect(again).toMatchObject({ ok: true, added: ["US_NVDA"], replay: true });
    expect(store.current!.writes.length).toBe(writes);
    expect(store.current!.docs.get("users/u1")).toEqual(after);
  });

  it("leaves a sibling saved between two imports alone", async () => {
    store.current!.docs.set("users/u1", existing());
    await saveImport({ uid: "u1", rows: [row("US_NVDA")], source: "manual", mutationId: "import_a", now: NOW });
    await saveImport({ uid: "u1", rows: [row("US_KO", { shares: 3 })], source: "manual", mutationId: "import_b", now: NOW });
    const doc = store.current!.docs.get("users/u1")!;
    expect(doc.tracked_stocks).toEqual(["US_AAPL", "US_MSFT", "US_NVDA", "US_KO"]);
    expect(Object.keys(doc.watchlist_holdings as object).sort()).toEqual(["US_AAPL", "US_KO", "US_NVDA"]);
    expect(doc.watchlist_version).toBe(9);
  });
});

