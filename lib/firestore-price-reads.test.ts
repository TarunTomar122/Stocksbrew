import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tm_latest_prices reads in lib/firestore.ts ask for a field mask on either
 * backend (Firestore's getAll fieldMask; the LocalDB adapter's batchGet select)
 * and hand back exactly the masked fields, whatever the store sends.
 */

const PRICE = {
  instrument_id: "US_AAPL",
  ticker: "AAPL",
  market: "US",
  currency: "USD",
  captured_at: "2026-11-12T20:59:00+00:00",
  updated_at: "2026-11-12T21:00:00+00:00",
  session_phase: "closed",
  quote: { current: 173.03, day_change_pct: -2.22 },
  fundamentals: { market_cap: 3.1e12, pe_ttm: 28.4 },
  analyst_consensus: { label: "Buy" },
  provider_metadata: { source: "x" },
  history_window: { dates: ["2026-11-12"], closes: [173.03] },
  recent_sessions: [{ date: "2026-11-12" }],
  source: "yahoo",
};

const state = vi.hoisted(() => ({ backend: "firebase" as "firebase" | "local", calls: [] as unknown[][], bodies: [] as unknown[] }));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/shared-cache", () => ({ sharedCache: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { LocalFirestore, setLocalDbFetchForTests } = await import("@/lib/local-firestore");
  // An older store server: it ignores `select` and answers with whole documents.
  setLocalDbFetchForTests(async (_url, init) => {
    const body = JSON.parse(String(init.body)) as { paths: string[] };
    state.bodies.push(body);
    const documents = body.paths.filter((path) => path === "tm_latest_prices/US_AAPL").map((path) => ({ path, data: PRICE }));
    return new Response(JSON.stringify({ documents }), { status: 200 });
  });
  const local = new LocalFirestore("http://store.test", "token");
  // Firebase Admin's shape: getAll(...refs, { fieldMask }) projects server side.
  const firebase = {
    collection: (name: string) => ({ doc: (id: string) => ({ id, path: `${name}/${id}` }) }),
    getAll: async (...args: unknown[]) => {
      state.calls.push(args);
      const options = args.at(-1) as { fieldMask?: string[] };
      const refs = (options && "fieldMask" in options ? args.slice(0, -1) : args) as Array<{ id: string }>;
      return refs.map((ref) => ({
        id: ref.id,
        exists: ref.id === "US_AAPL",
        data: () => (options?.fieldMask ? Object.fromEntries(options.fieldMask.map((field) => [field, PRICE[field as keyof typeof PRICE]])) : PRICE),
      }));
    },
  };
  return {
    adminFirestore: new Proxy({}, { get: (_target, key) => {
      const target = (state.backend === "local" ? local : firebase) as unknown as Record<PropertyKey, unknown>;
      const value = target[key];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    } }),
  };
});

import {
  LATEST_PRICE_CORE_FIELDS,
  LATEST_PRICE_QUOTE_FIELDS,
  getLatestPriceCores,
  getLatestPriceFundamentals,
  getLatestPriceHistory,
  getLatestPriceQuotes,
  getLatestPrices,
} from "@/lib/firestore";

beforeEach(() => {
  state.calls = [];
  state.bodies = [];
});

describe.each(["firebase", "local"] as const)("tm_latest_prices reads on %s", (backend) => {
  beforeEach(() => {
    state.backend = backend;
  });

  it("quotes: only the quote fields, one masked read for every id", async () => {
    const quotes = await getLatestPriceQuotes(["US_AAPL", "US_NOPE"]);
    expect([...quotes.keys()]).toEqual(["US_AAPL"]);
    expect(Object.keys(quotes.get("US_AAPL")!).sort()).toEqual([...LATEST_PRICE_QUOTE_FIELDS].sort());
    expect(quotes.get("US_AAPL")!.quote.current).toBe(173.03);
    if (backend === "firebase") expect(state.calls[0]!.at(-1)).toEqual({ fieldMask: [...LATEST_PRICE_QUOTE_FIELDS] });
    else expect(state.bodies).toEqual([{ paths: ["tm_latest_prices/US_AAPL", "tm_latest_prices/US_NOPE"], select: [...LATEST_PRICE_QUOTE_FIELDS] }]);
  });

  it("cores, fundamentals and history: their own field lists, never the whole document", async () => {
    const cores = await getLatestPriceCores(["US_AAPL"]);
    expect(Object.keys(cores.get("US_AAPL")!).sort()).toEqual([...LATEST_PRICE_CORE_FIELDS].sort());
    expect(Object.keys((await getLatestPriceFundamentals(["US_AAPL"])).get("US_AAPL")!)).toEqual(["fundamentals"]);
    const history = await getLatestPriceHistory("US_AAPL");
    expect(Object.keys(history!).sort()).toEqual(["captured_at", "history_window", "quote", "updated_at"]);
    expect(await getLatestPriceHistory("US_NOPE")).toBeNull();
  });

  it("an empty id list reads nothing", async () => {
    expect((await getLatestPriceQuotes([])).size).toBe(0);
    expect(state.calls.length + state.bodies.length).toBe(0);
  });

  it("getLatestPrices still reads whole documents (its caller needs history_window)", async () => {
    const prices = await getLatestPrices(["US_AAPL"]);
    expect(prices.get("US_AAPL")).toEqual(PRICE);
    if (backend === "firebase") expect(state.calls[0]).toHaveLength(1);
    else expect(state.bodies[0]).toEqual({ paths: ["tm_latest_prices/US_AAPL"] });
  });
});
