import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Map(), cookies: () => ({ get: () => undefined }) }));

// A store with nothing saved: no earlier days, no alerts, no call changes.
const emptyQuery = { where: () => emptyQuery, orderBy: () => emptyQuery, limit: () => emptyQuery, get: async () => ({ docs: [] }) };
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
  adminFirestore: {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => ({ exists: false }), set: async () => {} }),
      where: () => emptyQuery,
    }),
    getAll: async (...refs: unknown[]) => refs.map(() => ({ exists: false })),
  },
}));
vi.mock("@/lib/local-firestore", () => ({ localFirestoreFromEnv: () => null }));
vi.mock("@/lib/after-response", () => ({ afterResponse: () => {} }));
vi.mock("@/lib/shared-cache", () => ({ sharedCache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth-server", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: vi.fn() }));
vi.mock("@/lib/watchlist-view", () => ({
  getWatchlistView: vi.fn(),
  getRadarStockStates: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { earnings_date: "2026-11-20" }]))),
  getRadarUserView: vi.fn(async () => null),
  isActiveRadarUserView: () => false,
}));
vi.mock("@/lib/entitlements-server", () => ({
  isCovered: () => true,
  viewerFromUserDoc: (uid: string) => ({ uid, signedIn: true, isSubscribed: true, plan: "pro", tracked: [], covered: [], coverage: null, trialEligible: false }),
}));
vi.mock("@/lib/firestore", () => ({ getLatestPriceQuotes: vi.fn() }));
vi.mock("@/lib/instrument-resolver", () => ({
  getInstrumentLabels: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { ticker: id.slice(3), name: `${id.slice(3)} Inc` }]))),
}));
vi.mock("@/lib/earnings-intel", () => ({
  getLatestEarningsIntelForInstruments: vi.fn(async (_market: string, ids: string[]) =>
    ids.map((id) => ({
      instrument_id: id,
      ticker: id.slice(3),
      market: "US",
      event_date: "2026-11-10",
      generated_at: "2026-11-11T12:00:00.000Z",
      report: { headline: `${id.slice(3)} beat`, summary: "Sales grew." },
    })),
  ),
  listAllEarningsIntelDocs: async () => [],
}));
vi.mock("@/lib/pre-earnings-intel", () => ({ getPreEarningsIntelForInstruments: vi.fn(async () => []) }));
vi.mock("@/lib/agent-jobs-data", () => ({ listRuns: vi.fn(async () => []) }));
vi.mock("@/lib/daily-anomalies", () => ({ getDailyAnomalies: async () => null }));
vi.mock("@/lib/earnings", () => ({ getEarnings: async () => [], getNextEarningsCalendarEventCached: async () => null }));
vi.mock("@/lib/hero-indices", () => ({ getHeroIndices: async () => [] }));
vi.mock("@/lib/markets", () => ({ getMarketsData: async () => null }));
vi.mock("@/lib/news", () => ({ getNewsFeed: vi.fn(async () => []) }));
vi.mock("@/lib/power-trades", () => ({ getPowerTradesCached: async () => null }));
vi.mock("@/lib/reddit-cues", () => ({ getRedditCues: async () => null, hasRedditBrief: () => false }));

import { getSessionUser } from "@/lib/auth-server";
import { loadBriefingPage } from "@/lib/briefing-data";
import { getLatestEarningsIntelForInstruments } from "@/lib/earnings-intel";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getUserDoc } from "@/lib/watchlist";
import { getWatchlistView } from "@/lib/watchlist-view";

const row = (id: string) => ({ instrument_id: id, ticker: id.slice(3), instrument_name: `${id.slice(3)} Inc`, price: 1, day_change_pct: 0 });
// US_ZZZ is on the tracked list but its research row is not built yet: only AAA and BBB are in the view.
const TRACKED = ["US_AAA", "US_BBB", "US_ZZZ"];

function asUser(uid: string) {
  vi.mocked(getSessionUser).mockResolvedValue({ uid } as Awaited<ReturnType<typeof getSessionUser>>);
}

function quotesFor(ids: string[]) {
  return new Map(ids.map((id) => [id, { ticker: id.slice(3), currency: "USD", captured_at: "2026-11-12T20:59:00.000Z", quote: { current: 100, day_change_pct: 1.5 } }]));
}

/** The briefing without the fields that only differ between two people or two builds. */
function comparable(data: Awaited<ReturnType<typeof loadBriefingPage>>) {
  return { briefing: data.briefing, positions: data.positions, degraded: data.degraded };
}

describe("loadBriefingPage, a member's build", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T22:00:00.000Z"));
    vi.mocked(getUserDoc).mockImplementation(async (uid: string) => ({ uid, tracked_stocks: TRACKED, watchlist_positions: { US_AAA: "holding" } }) as Awaited<ReturnType<typeof getUserDoc>>);
    vi.mocked(getWatchlistView).mockResolvedValue({ rows: [row("US_AAA"), row("US_BBB")] } as Awaited<ReturnType<typeof getWatchlistView>>);
    vi.mocked(getLatestPriceQuotes).mockImplementation(async (ids: string[]) => quotesFor(ids));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts the build's reads from the tracked list and builds the same briefing as without them", async () => {
    asUser("early-1");
    const early = await loadBriefingPage();
    // Read for the whole tracked list, before the rows were known.
    expect(vi.mocked(getLatestPriceQuotes).mock.calls[0]?.[0]).toEqual(TRACKED);
    expect(vi.mocked(getLatestEarningsIntelForInstruments).mock.calls[0]?.[1]).toEqual(TRACKED);

    vi.clearAllMocks();
    asUser("late-1");
    // A day that is not a date builds today's briefing without the early reads: the old path.
    const late = await loadBriefingPage({ day: "not-a-day" });
    expect(vi.mocked(getLatestPriceQuotes).mock.calls[0]?.[0]).toEqual(["US_AAA", "US_BBB"]);

    expect(comparable(early)).toEqual(comparable(late));
    expect(early.positions?.map((position) => position.ticker)).toEqual(["AAA", "BBB"]);
    // The extra tracked stock's report never reaches the briefing.
    expect(JSON.stringify(early.briefing)).not.toContain("ZZZ");
    expect(early.degraded).toEqual([]);
  });

  it("reads a failed early read again for the rows before calling it degraded", async () => {
    vi.mocked(getLatestPriceQuotes).mockImplementation(async (ids: string[]) => {
      if (ids.includes("US_ZZZ")) throw new Error("LocalDB batch read failed (400)");
      return quotesFor(ids);
    });
    asUser("early-2");
    const data = await loadBriefingPage();
    expect(vi.mocked(getLatestPriceQuotes).mock.calls.map((call) => call[0])).toEqual([TRACKED, ["US_AAA", "US_BBB"]]);
    expect(data.degraded).toEqual([]);
    expect(data.positions?.map((position) => position.price)).toEqual([100, 100]);
  });

  it("still marks a source degraded when the read for the rows fails too", async () => {
    vi.mocked(getLatestPriceQuotes).mockRejectedValue(new Error("store down"));
    asUser("early-3");
    const data = await loadBriefingPage();
    expect(data.degraded).toContain("prices");
  });
});
