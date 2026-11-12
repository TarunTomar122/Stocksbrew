import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const movers = vi.fn();
const report = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/premarket", () => ({ getPremarketMovers: () => movers() }));
vi.mock("@/lib/premarket-opening", () => ({ getPremarketOpeningReport: () => report() }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ variable: "", className: "" }) }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "", className: "" }) }));

import PremarketPage from "./page";

const PREMARKET = new Date("2026-11-12T13:42:00.000Z"); // Thursday 8:42 AM ET
const GAPPER = { ticker: "MU", name: "Micron", pre_market_change_pct: 6.6, pre_market_price: 773, previous_close: 725 };
const doc = (generatedAt: string, up = [GAPPER]) => ({ market: "US", date: generatedAt.slice(0, 10), market_state: "PRE", generated_at: generatedAt, gappers_up: up, gappers_down: [], by_ticker: {} });
/** What a render that got past the redirect throws (the JSX needs the Next compiler), or null. */
const outcome = () => PremarketPage().then(() => null, (error: unknown) => String(error));

describe("/premarket shows only this morning's numbers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PREMARKET);
  });
  afterEach(() => {
    vi.useRealTimers();
    redirect.mockClear();
  });

  it("goes to Market today while today's premarket is not in yet", async () => {
    movers.mockResolvedValue(doc("2026-11-11T12:30:00.000Z"));
    report.mockResolvedValue({ generated_at: "2026-11-11T12:31:00.000Z", global_cues: [] });
    await expect(PremarketPage()).rejects.toThrow("NEXT_REDIRECT /explore");
  });

  it("goes to Market today when neither read has anything", async () => {
    movers.mockResolvedValue(null);
    report.mockRejectedValue(new Error("down"));
    await expect(PremarketPage()).rejects.toThrow("NEXT_REDIRECT /explore");
  });

  it("goes to Market today when this morning's numbers have nothing in them", async () => {
    movers.mockResolvedValue(doc("2026-11-12T12:30:00.000Z", []));
    report.mockResolvedValue({ generated_at: "2026-11-12T12:31:00.000Z", global_cues: [] });
    await expect(PremarketPage()).rejects.toThrow("NEXT_REDIRECT /explore");
  });

  it("renders with this morning's numbers", async () => {
    movers.mockResolvedValue(doc("2026-11-12T12:30:00.000Z"));
    report.mockResolvedValue({ generated_at: "2026-11-12T12:31:00.000Z", global_cues: [] });
    const result = await outcome();
    // In vitest the JSX itself throws "React is not defined"; anything else (a redirect, a data error) fails here.
    expect(result === null || /React is not defined/.test(result)).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });
});
