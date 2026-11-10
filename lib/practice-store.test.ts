import { beforeEach, describe, expect, it, vi } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
let writes = 0;

vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
  });
  return {
    adminFirestore: {
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async <T,>(callback: (transaction: unknown) => Promise<T>): Promise<T> =>
        callback({
          get: async (target: { path: string }) => ({ exists: docs.has(target.path), data: () => docs.get(target.path) }),
          set: (target: { path: string }, data: Record<string, unknown>) => {
            writes += 1;
            docs.set(target.path, JSON.parse(JSON.stringify(data)));
          },
        }),
    },
  };
});

const PRICES: Record<string, { dates: string[]; closes: number[] }> = {
  SPY: { dates: ["2026-11-04", "2026-11-05", "2026-11-06"], closes: [500, 505, 510] },
  AAPL: { dates: ["2026-11-04", "2026-11-05", "2026-11-06"], closes: [190, 195, 200] },
};

vi.mock("@/lib/backtest", () => ({
  PRICE_SOURCE: "test prices",
  loadPriceSeries: async (symbols: string[]) =>
    Object.fromEntries(symbols.filter((symbol) => PRICES[symbol]).map((symbol) => [symbol, PRICES[symbol]])),
}));

import { getPracticePayload, placePracticeOrder } from "./practice-store";

describe("practice store", () => {
  beforeEach(() => {
    docs.clear();
    writes = 0;
  });

  it("shows a fresh $100,000 without writing anything", async () => {
    const payload = await getPracticePayload("u1");
    expect(payload?.opened).toBe(false);
    expect(payload?.view.cash).toBe(100000);
    expect(payload?.view.benchmark).toMatchObject({ symbol: "SPY", start_date: "2026-11-06", start_close: 510 });
    expect(writes).toBe(0);
    expect(docs.size).toBe(0);
  });

  it("creates the account on the first order, filled at the latest stored close", async () => {
    const response = await placePracticeOrder("u1", { side: "buy", symbol: "aapl", dollars: 10000 });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.trade).toMatchObject({ symbol: "AAPL", price: 200, price_date: "2026-11-06", shares: 50, amount: 10000 });
    expect(response.payload.opened).toBe(true);
    expect(response.payload.view.cash).toBe(90000);
    expect(response.payload.view.equity).toBe(100000);
    const stored = docs.get("tm_practice_accounts/u1") as { cash: number; uid: string };
    expect(stored.cash).toBe(90000);
    expect(stored.uid).toBe("u1");

    const again = await getPracticePayload("u1");
    expect(again?.opened).toBe(true);
    expect(again?.view.rows[0]).toMatchObject({ symbol: "AAPL", shares: 50, value: 10000 });
  });

  it("refuses a ticker with no stored price and writes nothing", async () => {
    const response = await placePracticeOrder("u1", { side: "buy", symbol: "ZZZZ", dollars: 1000 });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.code).toBe("no_price");
    expect(writes).toBe(0);
  });

  it("refuses an order the cash cannot cover and leaves the account alone", async () => {
    await placePracticeOrder("u1", { side: "buy", symbol: "AAPL", dollars: 60000 });
    const response = await placePracticeOrder("u1", { side: "buy", symbol: "AAPL", dollars: 60000 });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.code).toBe("not_enough_cash");
    expect(writes).toBe(1);
    expect((docs.get("tm_practice_accounts/u1") as { cash: number }).cash).toBe(40000);
  });

  it("keeps accounts apart by user", async () => {
    await placePracticeOrder("u1", { side: "buy", symbol: "AAPL", shares: 10 });
    const other = await getPracticePayload("u2");
    expect(other?.opened).toBe(false);
    expect(other?.view.rows).toHaveLength(0);
  });

  it("will not overwrite a stored document it cannot read", async () => {
    docs.set("tm_practice_accounts/u1", { something: "else" });
    const response = await placePracticeOrder("u1", { side: "buy", symbol: "AAPL", shares: 1 });
    expect(response.ok).toBe(false);
    expect(writes).toBe(0);
    expect(docs.get("tm_practice_accounts/u1")).toEqual({ something: "else" });
  });
});
