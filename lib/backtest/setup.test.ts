import { describe, expect, it } from "vitest";

import { thinCurve } from "./chart";
import { DEFAULT_SETUP, parseSetup, setupHref, setupToQuery } from "./setup";

describe("backtest setup in the URL", () => {
  it("round-trips a full setup", () => {
    const setup = {
      holdings: [
        { symbol: "AAPL", weight: 40 },
        { symbol: "BRK.B", weight: 35.5 },
        { symbol: "TLT", weight: 24.5 },
      ],
      start: "2018-01-02",
      end: "2024-12-31",
      rebalance: "quarterly" as const,
      benchmark: "QQQ",
      cost_bps: 25,
    };
    const query = Object.fromEntries(new URLSearchParams(setupToQuery(setup)));
    expect(parseSetup(query)).toEqual(setup);
  });

  it("leaves defaults out of the link", () => {
    expect(setupHref({ ...DEFAULT_SETUP, holdings: [{ symbol: "SPY", weight: 60 }, { symbol: "TLT", weight: 40 }] })).toBe(
      "/backtest?t=SPY:60,TLT:40",
    );
    expect(setupHref(DEFAULT_SETUP)).toBe("/backtest");
  });

  it("ignores junk instead of throwing", () => {
    const setup = parseSetup({ t: "aapl:50,,<script>:1,AAPL:10,msft:abc,TSLA", from: "yesterday", rb: "hourly", bm: "!!", cost: "9999" });
    expect(setup.holdings).toEqual([
      { symbol: "AAPL", weight: 50 },
      { symbol: "MSFT", weight: 1 },
      { symbol: "TSLA", weight: 1 },
    ]);
    expect(setup.start).toBeNull();
    expect(setup.rebalance).toBe("monthly");
    expect(setup.benchmark).toBe("SPY");
    expect(setup.cost_bps).toBe(10);
  });

  it("caps the number of holdings", () => {
    const many = Array.from({ length: 60 }, (_, index) => `T${index}:1`).join(",");
    expect(parseSetup({ t: many }).holdings).toHaveLength(30);
  });
});

describe("thinCurve", () => {
  it("keeps the last point and the deepest fall inside each bucket", () => {
    const count = 3000;
    const dates = Array.from({ length: count }, (_, index) => `d${index}`);
    const strategy = Array.from({ length: count }, (_, index) => 100 + index * 0.1);
    strategy[1501] = 50; // a one-day crash that plain sampling would skip
    const benchmark = strategy.map(() => 100);
    const thin = thinCurve({ dates, strategy, benchmark });
    expect(thin.dates.length).toBeLessThanOrEqual(640);
    expect(thin.dates[thin.dates.length - 1]).toBe("d2999");
    expect(thin.strategy[thin.strategy.length - 1]).toBeCloseTo(strategy[count - 1], 2);
    expect(Math.min(...thin.dd_strategy)).toBeLessThan(-0.75);
    expect(Math.min(...thin.dd_benchmark)).toBe(0);
  });

  it("leaves a short curve whole", () => {
    const thin = thinCurve({ dates: ["a", "b", "c"], strategy: [100, 90, 95], benchmark: [100, 101, 102] });
    expect(thin.dates).toEqual(["a", "b", "c"]);
    expect(thin.dd_strategy).toEqual([0, -0.1, -0.05]);
  });
});
