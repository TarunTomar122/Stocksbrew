import { describe, expect, it } from "vitest";

import {
  PRACTICE_START_CASH,
  applyPracticeOrder,
  newPracticeAccount,
  practiceCurve,
  valuePracticeAccount,
  type PracticeAccount,
} from "./practice";

const NOW = "2026-11-09T15:00:00.000Z";
const fresh = () => newPracticeAccount("u1", NOW, { price: 500, date: "2026-11-06" });

function must(result: ReturnType<typeof applyPracticeOrder>): PracticeAccount {
  if (!result.ok) throw new Error(result.message);
  return result.account;
}

describe("practice account", () => {
  it("starts with $100,000 in cash and no positions", () => {
    const account = fresh();
    expect(account.cash).toBe(PRACTICE_START_CASH);
    expect(account.positions).toEqual({});
    expect(account.benchmark).toEqual({ symbol: "SPY", date: "2026-11-06", close: 500 });
  });

  it("fills a buy at the stored close and moves cash", () => {
    const result = applyPracticeOrder(fresh(), { side: "buy", symbol: "aapl", shares: 10 }, { price: 250.5, date: "2026-11-06" }, NOW);
    const account = must(result);
    expect(account.cash).toBe(97495);
    expect(account.positions.AAPL).toEqual({ shares: 10, cost: 2505 });
    expect(account.trades).toHaveLength(1);
    expect(account.trades[0]).toMatchObject({ side: "buy", symbol: "AAPL", price: 250.5, price_date: "2026-11-06", amount: 2505 });
  });

  it("turns a dollar order into shares without overspending", () => {
    const account = must(applyPracticeOrder(fresh(), { side: "buy", symbol: "NVDA", dollars: 1000 }, { price: 333.33, date: "2026-11-06" }, NOW));
    expect(account.trades[0].amount).toBeLessThanOrEqual(1000);
    expect(account.trades[0].shares).toBeCloseTo(3, 2);
  });

  it("refuses to spend more cash than the account has", () => {
    const result = applyPracticeOrder(fresh(), { side: "buy", symbol: "AAPL", shares: 1000 }, { price: 250, date: "2026-11-06" }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_enough_cash");
  });

  it("refuses to sell shares it does not hold", () => {
    const result = applyPracticeOrder(fresh(), { side: "sell", symbol: "AAPL", shares: 1 }, { price: 250, date: "2026-11-06" }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_enough_shares");
  });

  it("refuses a ticker with no stored price instead of guessing", () => {
    const result = applyPracticeOrder(fresh(), { side: "buy", symbol: "ZZZZ", shares: 1 }, null, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_price");
  });

  it("keeps average cost on a partial sell and removes a closed position", () => {
    let account = must(applyPracticeOrder(fresh(), { side: "buy", symbol: "AAPL", shares: 10 }, { price: 100, date: "2026-11-06" }, NOW));
    account = must(applyPracticeOrder(account, { side: "sell", symbol: "AAPL", shares: 4 }, { price: 150, date: "2026-11-09" }, NOW));
    expect(account.positions.AAPL).toEqual({ shares: 6, cost: 600 });
    expect(account.cash).toBe(100000 - 1000 + 600);
    account = must(applyPracticeOrder(account, { side: "sell", symbol: "AAPL", shares: 6 }, { price: 150, date: "2026-11-09" }, NOW));
    expect(account.positions.AAPL).toBeUndefined();
    expect(account.cash).toBe(100500);
  });

  it("does not change the account passed in", () => {
    const account = fresh();
    applyPracticeOrder(account, { side: "buy", symbol: "AAPL", shares: 10 }, { price: 100, date: "2026-11-06" }, NOW);
    expect(account.cash).toBe(PRACTICE_START_CASH);
    expect(account.trades).toHaveLength(0);
  });

  it("values positions and compares with SPY since the start", () => {
    const account = must(applyPracticeOrder(fresh(), { side: "buy", symbol: "AAPL", shares: 100 }, { price: 100, date: "2026-11-06" }, NOW));
    const view = valuePracticeAccount(account, {
      AAPL: { price: 110, date: "2026-11-09" },
      SPY: { price: 505, date: "2026-11-09" },
    });
    expect(view.equity).toBe(101000);
    expect(view.total_return).toBeCloseTo(0.01, 9);
    expect(view.rows[0]).toMatchObject({ symbol: "AAPL", value: 11000, pnl: 1000 });
    expect(view.rows[0].pnl_pct).toBeCloseTo(0.1, 9);
    expect(view.benchmark.return).toBeCloseTo(0.01, 9);
    expect(view.benchmark.value).toBe(101000);
  });

  it("counts an unpriced position at cost and says so", () => {
    const account = must(applyPracticeOrder(fresh(), { side: "buy", symbol: "AAPL", shares: 100 }, { price: 100, date: "2026-11-06" }, NOW));
    const view = valuePracticeAccount(account, {});
    expect(view.unpriced).toEqual(["AAPL"]);
    expect(view.equity).toBe(100000);
    expect(view.rows[0].value).toBeNull();
    expect(view.benchmark.return).toBeNull();
  });

  it("replays the trade log into a daily curve", () => {
    let account = must(applyPracticeOrder(fresh(), { side: "buy", symbol: "AAPL", shares: 100 }, { price: 100, date: "2026-11-06" }, NOW));
    account = must(applyPracticeOrder(account, { side: "sell", symbol: "AAPL", shares: 50 }, { price: 120, date: "2026-11-10" }, NOW));
    const curve = practiceCurve(account, {
      SPY: { dates: ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"], closes: [490, 500, 505, 510, 500] },
      AAPL: { dates: ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"], closes: [100, 110, 120, 100] },
    });
    expect(curve?.dates).toEqual(["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(curve?.account).toEqual([100000, 101000, 102000, 101000]);
    expect(curve?.benchmark).toEqual([100000, 101000, 102000, 100000]);
  });
});
