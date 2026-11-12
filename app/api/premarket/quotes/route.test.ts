import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const movers = vi.fn();
const report = vi.fn();

vi.mock("@/lib/premarket", async () => {
  const shared = await vi.importActual<typeof import("@/lib/premarket-shared")>("@/lib/premarket-shared");
  return { getLivePremarketQuote: shared.getLivePremarketQuote, getPremarketMovers: () => movers() };
});
vi.mock("@/lib/premarket-opening", () => ({ getPremarketOpeningReport: () => report() }));

import { GET } from "./route";

const PREMARKET = new Date("2026-11-12T13:42:00.000Z"); // Thursday 8:42 AM ET
const MOVERS = {
  market: "US",
  date: "2026-11-12",
  market_state: "PRE",
  generated_at: "2026-11-12T13:40:00.000Z",
  by_ticker: {
    NVDA: { pre_market_change_pct: 4.04, pre_market_price: 175.71 },
    AAPL: { pre_market_change_pct: -0.56, pre_market_price: 346.54 },
  },
};
const REPORT = {
  generated_at: "2026-11-12T13:41:00.000Z",
  global_cues: [
    { id: "US_OPEN_NQ", ticker: "NQ=F", group: "futures", price: 28364, previous_close: 27835, change_pct: 1.9, captured_at: "2026-11-12T13:30:00.000Z" },
    { id: "US_OPEN_ES", ticker: "ES=F", group: "futures", price: 7609, previous_close: 7544, change_pct: 0.86, captured_at: "2026-11-12T13:30:00.000Z" },
  ],
};

const ask = (tickers: string) => GET(new Request(`http://localhost/api/premarket/quotes?tickers=${encodeURIComponent(tickers)}`));

describe("GET /api/premarket/quotes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PREMARKET);
    movers.mockResolvedValue(MOVERS);
    report.mockResolvedValue(REPORT);
  });
  afterEach(() => {
    vi.useRealTimers();
    movers.mockReset();
    report.mockReset();
  });

  it("gives this morning's moves for the asked tickers and S&P 500 futures when SPY has no quote", async () => {
    const body = await (await ask("NVDA,aapl,KO,bad ticker!")).json();
    expect(body).toEqual({ live: true, at: MOVERS.generated_at, stocks: { NVDA: 4.04, AAPL: -0.56 }, sp500: { pct: 0.86, source: "futures" } });
  });

  it("prefers SPY's own premarket price", async () => {
    movers.mockResolvedValue({ ...MOVERS, by_ticker: { ...MOVERS.by_ticker, SPY: { pre_market_change_pct: 0.7, pre_market_price: 680 } } });
    expect((await (await ask("NVDA")).json()).sp500).toEqual({ pct: 0.7, source: "SPY" });
  });

  it("is not live after the open, on a weekend, or on yesterday's quotes", async () => {
    vi.setSystemTime(new Date("2026-11-12T14:31:00.000Z"));
    expect(await (await ask("NVDA")).json()).toEqual({ live: false });
    vi.setSystemTime(new Date("2026-11-14T13:00:00.000Z"));
    expect(await (await ask("NVDA")).json()).toEqual({ live: false });
    vi.setSystemTime(PREMARKET);
    movers.mockResolvedValue({ ...MOVERS, date: "2026-11-11" });
    expect(await (await ask("NVDA")).json()).toEqual({ live: false });
  });

  it("leaves out futures from an earlier morning, and is not live when the reads fail", async () => {
    report.mockResolvedValue({ ...REPORT, generated_at: "2026-11-11T13:41:00.000Z" });
    expect((await (await ask("NVDA")).json()).sp500).toBeNull();
    movers.mockRejectedValue(new Error("down"));
    expect(await (await ask("NVDA")).json()).toEqual({ live: false });
  });

  it("without tickers, says only whether this morning's premarket is in", async () => {
    const ready = () => GET(new Request("http://localhost/api/premarket/quotes"));
    expect(await (await ready()).json()).toEqual({ live: true });
    // Yesterday's numbers during today's premarket: not in yet.
    movers.mockResolvedValue({ ...MOVERS, date: "2026-11-11", generated_at: "2026-11-11T12:30:00.000Z" });
    report.mockResolvedValue({ ...REPORT, generated_at: "2026-11-11T12:31:00.000Z" });
    expect(await (await ready()).json()).toEqual({ live: false });
    movers.mockResolvedValue(null);
    report.mockResolvedValue(null);
    expect(await (await ready()).json()).toEqual({ live: false });
    // Today's documents with nothing in them: the page would have nothing to show, so the nav does not offer it.
    movers.mockResolvedValue({ ...MOVERS, gappers_up: [], gappers_down: [] });
    report.mockResolvedValue({ ...REPORT, global_cues: [] });
    expect(await (await ready()).json()).toEqual({ live: false });
    // After the open, whatever the data.
    movers.mockResolvedValue(MOVERS);
    report.mockResolvedValue(REPORT);
    vi.setSystemTime(new Date("2026-11-12T14:31:00.000Z"));
    expect(await (await ready()).json()).toEqual({ live: false });
  });

  it("is cached at the edge for a minute", async () => {
    expect((await GET(new Request("http://localhost/api/premarket/quotes"))).headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
