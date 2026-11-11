import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

describe("pending picks across sign-in", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), dispatchEvent: () => true });
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps valid picks once and hands them over only once", async () => {
    const { savePendingPicks, takePendingPicks, hasPendingPicks } = await import("@/lib/pending-picks");
    expect(savePendingPicks([{ instrumentId: "US_NVDA", ticker: "NVDA" }, { instrumentId: "US_NVDA", ticker: "NVDA" }, { instrumentId: "bad id", ticker: "X" }])).toBe(true);
    expect(hasPendingPicks()).toBe(true);
    expect(takePendingPicks()?.picks).toEqual([{ instrumentId: "US_NVDA", ticker: "NVDA" }]);
    expect(takePendingPicks()).toBeNull();
  });

  it("drops picks that are too old or have failed too often", async () => {
    const { savePendingPicks, takePendingPicks } = await import("@/lib/pending-picks");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T20:00:00Z"));
    savePendingPicks([{ instrumentId: "US_JPM", ticker: "JPM" }]);
    vi.setSystemTime(new Date("2026-11-11T21:00:00Z"));
    expect(takePendingPicks()).toBeNull();
    savePendingPicks([{ instrumentId: "US_JPM", ticker: "JPM" }], 3);
    expect(takePendingPicks()).toBeNull();
  });

  it("adds each pick, retries a profile that is not ready, and marks the first-run dialog seen", async () => {
    const { addPicks } = await import("@/lib/pending-picks");
    const { POST_SIGNUP_ONBOARDING_SEEN } = await import("@/lib/sign-in");
    vi.useFakeTimers();
    const statuses = [409, 200, 200, 500];
    const fetchMock = vi.fn(async () => ({ ok: statuses[0] === 200, status: statuses.shift() ?? 200 }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const run = addPicks([
      { instrumentId: "US_NVDA", ticker: "NVDA" },
      { instrumentId: "US_JPM", ticker: "JPM" },
      { instrumentId: "US_KO", ticker: "KO" },
    ]);
    await vi.runAllTimersAsync();
    const result = await run;
    expect(result.added).toBe(2);
    expect(result.failed.map((pick) => pick.ticker)).toEqual(["KO"]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(localStorage.getItem(POST_SIGNUP_ONBOARDING_SEEN)).toBe("1");
  });

  it("leaves the first-run dialog unseen when no pick went in", async () => {
    const { addPicks } = await import("@/lib/pending-picks");
    const { POST_SIGNUP_ONBOARDING_SEEN } = await import("@/lib/sign-in");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const result = await addPicks([{ instrumentId: "US_NVDA", ticker: "NVDA" }, { instrumentId: "US_JPM", ticker: "JPM" }]);
    expect(result.added).toBe(0);
    expect(result.failed.map((pick) => pick.ticker)).toEqual(["NVDA", "JPM"]);
    expect(localStorage.getItem(POST_SIGNUP_ONBOARDING_SEEN)).toBeNull();
  });

  it("names the stocks it could not add in a plain sentence", async () => {
    const { couldNotAddMessage } = await import("@/lib/pending-picks");
    expect(couldNotAddMessage([{ ticker: "NVDA" }])).toBe("We couldn't add NVDA. Try again.");
    expect(couldNotAddMessage([{ ticker: "NVDA" }, { ticker: "JPM" }])).toBe("We couldn't add NVDA and JPM. Try again.");
    expect(couldNotAddMessage([{ ticker: "NVDA" }, { ticker: "JPM" }, { ticker: "KO" }])).toBe("We couldn't add NVDA, JPM and KO. Try again.");
    expect(couldNotAddMessage([])).toBe("We couldn't add your stocks. Try again.");
  });
});
