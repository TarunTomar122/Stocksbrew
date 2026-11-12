import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The agent tools over the portfolio features, copy tests and plain-English
 * agents. The loaders are mocked; the pure builders (buildXray,
 * buildDividendPlan, runStressTest, the copy helpers, the plain-English
 * reader) are the real ones, so the tools are checked against the shapes the
 * pages really get.
 */

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: vi.fn() }));
vi.mock("@/lib/xray-data", () => ({ loadUserXray: vi.fn() }));
vi.mock("@/lib/dividend-plan-data", () => ({ holdingSeeds: vi.fn(), loadDividendPlan: vi.fn() }));
vi.mock("@/lib/stress-test-data", () => ({ loadUserStress: vi.fn() }));
vi.mock("@/lib/copy-trades", async () => ({
  ...(await vi.importActual<typeof import("@/lib/copy-trades-shared")>("@/lib/copy-trades-shared")),
  getCopyHub: vi.fn(),
  getCopyRecord: vi.fn(),
}));
vi.mock("@/lib/agent-jobs-data", () => ({ listJobs: vi.fn() }));
vi.mock("@/lib/agents-plain/limits", () => ({ consumePlainParse: vi.fn() }));
vi.mock("@/lib/agents-plain/model", () => ({ plainModelReader: vi.fn(() => null) }));
vi.mock("@/lib/agents-plain/server", () => ({ plainCatalog: vi.fn(), plainCallLookup: vi.fn() }));
vi.mock("@/lib/entitlements-server", () => ({
  viewerFromUserDoc: (uid: string) => ({ uid, signedIn: true, isSubscribed: true, plan: "pro", tracked: [], covered: [], coverage: null, trialEligible: false }),
}));

import {
  getAgentCopyTest,
  getAgentDividendPlan,
  getAgentStressTest,
  getAgentWhatYouOwn,
  readAgentWatchRequest,
} from "@/lib/agent-feature-tools";
import { AgentDataError } from "@/lib/agent-errors";
import { consumePlainParse } from "@/lib/agents-plain/limits";
import { plainCallLookup, plainCatalog } from "@/lib/agents-plain/server";
import { buildCatalog } from "@/lib/agents-plain/stocks";
import { listJobs } from "@/lib/agent-jobs-data";
import { getCopyHub, getCopyRecord, type CopyHub, type CopyHubRow, type CopyRecordFull } from "@/lib/copy-trades";
import { buildDividendPlan } from "@/lib/dividend-plan";
import { holdingSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { runStressTest, weightHoldings, type Episode, type EpisodeCloses } from "@/lib/stress-test";
import { buildStressRead } from "@/lib/stress-test";
import { loadUserStress } from "@/lib/stress-test-data";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";
import { buildXray, buildXrayRead, type FundDoc } from "@/lib/xray";
import { loadUserXray } from "@/lib/xray-data";

const UID = "member-1";
const USER = {
  tracked_stocks: ["US_VOO", "US_NVDA", "US_KO"],
  watchlist_positions: { US_VOO: "holding", US_NVDA: "holding", US_KO: "holding" },
  watchlist_holdings: { US_VOO: { quantity: 10 }, US_NVDA: { quantity: 20 }, US_KO: { quantity: 100 } },
} as unknown as UserDoc;
const EMPTY_USER = { tracked_stocks: [], watchlist_positions: {} } as unknown as UserDoc;
const ABROAD_USER = { tracked_stocks: ["IN_TCS"], watchlist_positions: { IN_TCS: "holding" } } as unknown as UserDoc;

/** The tool's answer when the member has holdings: the no-holdings branch is the one with edit_link. */
function withHoldings<T extends { data_status: string }>(out: T): Exclude<T, { edit_link: string }> {
  expect(out).not.toHaveProperty("edit_link");
  return out as Exclude<T, { edit_link: string }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserDoc).mockResolvedValue(USER);
});

/* ── what_you_own ─────────────────────────────────────────────────────── */

const VOO: FundDoc = {
  ticker: "VOO",
  fundName: "Vanguard S&P 500 ETF",
  asOf: "2026-06-30",
  filedAt: "2026-08-28",
  sourceUrl: "https://www.sec.gov/voo",
  status: "ok",
  note: null,
  holdings: [
    { ticker: "NVDA", name: "NVIDIA Corp", weight: 0.075 },
    { ticker: "AAPL", name: "Apple Inc", weight: 0.066 },
    { ticker: "JPM", name: "JPMorgan Chase & Co", weight: 0.015 },
  ],
};

function xrayView() {
  const xray = buildXray(
    [
      { ticker: "VOO", name: "Vanguard S&P 500 ETF", value: 6_000 },
      { ticker: "NVDA", name: "NVIDIA Corporation", value: 4_000 },
    ],
    { funds: { VOO }, nameOf: { NVDA: "NVIDIA Corporation", AAPL: "Apple Inc.", JPM: "JPMorgan Chase & Co." }, sectorOf: { NVDA: "Technology", AAPL: "Technology", JPM: "Financials" } },
  );
  return { xray, read: buildXrayRead(xray, {}), pricesAsOf: null, mode: "live" as const, coveredFunds: ["VOO"] };
}

describe("what_you_own", () => {
  it("reads the member's own holdings and returns direct vs through-funds weights with the page's read", async () => {
    vi.mocked(loadUserXray).mockResolvedValue(xrayView());
    const out = withHoldings(await getAgentWhatYouOwn(UID, { limit: 2 }));

    expect(getUserDoc).toHaveBeenCalledWith(UID);
    expect(loadUserXray).toHaveBeenCalledWith(USER);
    expect(out.data_status).toBe("available");
    expect(out.as_of).toBe("2026-06-30");
    const nvda = out.companies!.find((row) => row.ticker === "NVDA")!;
    expect(nvda.direct_pct).toBe(40);
    expect(nvda.through_funds_pct).toBeCloseTo(4.5);
    expect(nvda.via_funds).toEqual([{ fund: "VOO", value: 450 }]);
    expect(out.companies).toHaveLength(2);
    expect(out.companies_count).toBeGreaterThan(2);
    expect(out.funds![0]).toMatchObject({ ticker: "VOO", filing_url: "https://www.sec.gov/voo", holdings_as_of: "2026-06-30" });
    expect(out.read?.headline).toBeTruthy();
    expect(out.read?.source).toContain("SEC N-PORT");
    expect(out.link).toMatch(/\/portfolio\/xray$/);
  });

  it("says so when the member marks no holdings, and never falls back to the example", async () => {
    vi.mocked(getUserDoc).mockResolvedValue(EMPTY_USER);
    vi.mocked(loadUserXray).mockResolvedValue(null);
    const out = await getAgentWhatYouOwn(UID);
    expect(out).toMatchObject({ data_status: "no_holdings", as_of: null });
    expect(out.message).toContain("no holdings marked");
  });

  it("tells holdings without values apart from no funds, like the page", async () => {
    const view = xrayView();
    vi.mocked(loadUserXray).mockResolvedValue({ ...view, xray: { ...view.xray, total: 0, unvalued: ["NVDA"] } });
    expect((await getAgentWhatYouOwn(UID)).data_status).toBe("no_values");
    vi.mocked(loadUserXray).mockResolvedValue({ ...view, xray: { ...view.xray, funds: [], asOfDates: [] } });
    const direct = await getAgentWhatYouOwn(UID);
    expect(direct).toMatchObject({ data_status: "no_funds", as_of: null });
  });

  it("names the non-US case apart", async () => {
    vi.mocked(getUserDoc).mockResolvedValue(ABROAD_USER);
    vi.mocked(loadUserXray).mockResolvedValue(null);
    const out = await getAgentWhatYouOwn(UID);
    expect(out.message).toContain("covers US stocks");
  });

  it("turns a failed user read into a retryable error, not an empty portfolio", async () => {
    vi.mocked(getUserDoc).mockRejectedValue(new Error("store down"));
    await expect(getAgentWhatYouOwn(UID)).rejects.toMatchObject({ code: "portfolio_unavailable", status: 503 });
  });
});

/* ── dividend_plan ────────────────────────────────────────────────────── */

function dividendPlan() {
  return buildDividendPlan(
    [
      {
        ticker: "KO",
        name: "Coca-Cola",
        shares: 100,
        avgCost: 50,
        price: 70,
        history: {
          symbol: "KO",
          payments: [
            { exDate: "2025-11-28", amount: 0.51 },
            { exDate: "2026-03-13", amount: 0.53 },
            { exDate: "2026-06-13", amount: 0.53 },
            { exDate: "2026-09-12", amount: 0.53 },
          ],
          frequency: "quarterly",
          perYear: 4,
          latestAmount: 0.53,
          yearAgoAmount: 0.51,
          payLagDays: 18,
          fetchedAt: "2026-11-10T06:00:00Z",
        },
        announced: [{ exDate: "2026-11-27", payDate: "2026-12-15", amount: 0.53 }],
        payout: 68,
        sector: "Consumer Staples",
      },
    ],
    "2026-11-11",
  );
}

describe("dividend_plan", () => {
  it("returns the 12 months split into announced and estimated, per stock", async () => {
    vi.mocked(holdingSeeds).mockReturnValue([{ ticker: "KO", name: null, shares: 100, avgCost: 50 }]);
    vi.mocked(loadDividendPlan).mockResolvedValue({ plan: dividendPlan(), pricesAsOf: "2026-11-10", calendarOk: true });
    const out = withHoldings(await getAgentDividendPlan(UID));

    expect(holdingSeeds).toHaveBeenCalledWith(USER);
    expect(out.data_status).toBe("available");
    expect(out.months).toHaveLength(12);
    expect(out.months![0]).toMatchObject({ month: "2026-11", label: expect.any(String) });
    const december = out.months!.find((month) => month.month === "2026-12")!;
    expect(december.announced).toBe(53);
    expect(out.totals!.announced).toBe(53);
    expect(out.totals!.next_12_months).toBeGreaterThan(53);
    expect(out.stocks![0]).toMatchObject({ ticker: "KO", next: { status: "announced", pay_date: "2026-12-15", amount: 53 } });
    expect(out.stocks![0]).not.toHaveProperty("payments");
    expect(out.warning).toBeNull();
    expect(out.read?.headline).toBeTruthy();
    expect(out.sources!.map((source) => source.name).join(" ")).toContain("Nasdaq");
  });

  it("adds every payment on request and warns when the calendar was down", async () => {
    vi.mocked(holdingSeeds).mockReturnValue([{ ticker: "KO", name: null, shares: 100, avgCost: 50 }]);
    vi.mocked(loadDividendPlan).mockResolvedValue({ plan: dividendPlan(), pricesAsOf: "2026-11-10", calendarOk: false });
    const out = withHoldings(await getAgentDividendPlan(UID, { payments: true }));
    const payments = (out.stocks![0] as { payments?: Array<{ status: string }> }).payments!;
    expect(payments.length).toBeGreaterThanOrEqual(4);
    expect(new Set(payments.map((payment) => payment.status))).toEqual(new Set(["announced", "estimate"]));
    expect(out.warning).toContain("could not be read");
  });

  it("does not load a plan for a member with no US holdings", async () => {
    vi.mocked(getUserDoc).mockResolvedValue(EMPTY_USER);
    vi.mocked(holdingSeeds).mockReturnValue([]);
    const out = await getAgentDividendPlan(UID);
    expect(out.data_status).toBe("no_holdings");
    expect(loadDividendPlan).not.toHaveBeenCalled();
  });
});

/* ── stress_test ──────────────────────────────────────────────────────── */

const FALL: Episode = { id: "covid-crash", name: "2020 Covid crash", start: "2020-02-19", end: "2020-03-23", what: "The virus shut the world.", kind: "fall" };

function closes(start: number, end: number, fund = false): EpisodeCloses {
  return {
    fund,
    first: "2014-11-10",
    last: "2026-11-10",
    points: { [FALL.id]: { start: { date: FALL.start, close: start }, end: { date: FALL.end, close: end } } },
  };
}

function stressView() {
  const input = weightHoldings([
    { ticker: "NVDA", name: "NVIDIA", value: 6_000 },
    { ticker: "KO", name: "Coca-Cola", value: 4_000 },
  ]);
  const bench = closes(100, 66, true);
  const result = runStressTest(input, new Map([["NVDA", closes(100, 60)], ["KO", closes(100, 80)]]), bench, [FALL]);
  return { result, read: buildStressRead(result, { example: false }), mode: "live" as const, pricesAsOf: null, history: { first: "2014-11-10", last: "2026-11-10" } };
}

describe("stress_test", () => {
  it("returns each episode against the S&P 500 with the page's sentence", async () => {
    vi.mocked(loadUserStress).mockResolvedValue(stressView());
    const out = withHoldings(await getAgentStressTest(UID));

    expect(loadUserStress).toHaveBeenCalledWith(USER);
    expect(out.as_of).toBe("2026-11-10");
    const covid = out.episodes![0]!;
    expect(covid).toMatchObject({ id: "covid-crash", portfolio_pct: -32, sp500_pct: -34, covered_pct: 100 });
    expect(covid.sentence).toMatch(/^Lost 32%/);
    expect(covid.driver).toMatchObject({ ticker: "NVDA" });
    expect(covid).not.toHaveProperty("moves");
    expect(out.notes).toContain("It is history, not a forecast.");
  });

  it("adds every holding's move on request", async () => {
    vi.mocked(loadUserStress).mockResolvedValue(stressView());
    const out = withHoldings(await getAgentStressTest(UID, { holdings: true }));
    const moves = (out.episodes![0] as { moves?: Array<{ ticker: string; pct: number }> }).moves!;
    expect(moves.map((move) => [move.ticker, move.pct])).toEqual([["KO", -20], ["NVDA", -40]]);
  });

  it("says so when there is nothing to test", async () => {
    vi.mocked(loadUserStress).mockResolvedValue(null);
    expect((await getAgentStressTest(UID)).data_status).toBe("no_holdings");
  });
});

/* ── copy_test ────────────────────────────────────────────────────────── */

function record(overrides: Partial<CopyRecordFull> = {}): CopyRecordFull {
  return {
    slug: "berkshire-hathaway",
    kind: "fund",
    name: "Berkshire Hathaway",
    person: "Warren Buffett",
    rule: "Buy the 50 largest stock positions in each 13F.",
    caveat: "13F filings arrive late.",
    hold_label: "Bought their first portfolio and never traded",
    eligible: true,
    not_ranked_because: null,
    rank: 3,
    updated_at: "2026-11-09T00:00:00Z",
    start_date: "2020-02-18",
    end_date: "2026-11-09",
    ended: false,
    sessions: 1692,
    years: 6.72,
    start_value: 10000,
    copy: { end_value: 23677.77, total: 1.3678, annualized: 0.1368, max_drawdown: -0.3922, drawdown_peak: "2020-02-19", drawdown_trough: "2020-03-23" },
    spy: { end_value: 24639.12, total: 1.4639, annualized: 0.1435, max_drawdown: -0.3372, drawdown_peak: "2020-02-19", drawdown_trough: "2020-03-23" },
    hold: { end_value: 28016.68, total: 1.8017, annualized: 0.1656, max_drawdown: -0.3922, drawdown_peak: null, drawdown_trough: null },
    curve: [["2020-02-18", 1, 1, 1]],
    curve_columns: ["date", "copy", "spy", "hold"],
    yearly: [{ year: 2025, from: null, to: null, values: [0.12, 0.18, 0.1] }],
    trades: { buys: 100, sells: 71, resized: 152, rebalances: 29, skipped_trades: 0, ignored_sales: 0, turnover_per_year: 0.33 },
    positions_count: 94,
    best: [{ ticker: "AAPL", name: "Apple Inc", pnl: 8038.17, return: 3.5579, first: "2020-02-18", last: null, held: true, days: 1691 }],
    worst: [{ ticker: "GOOGL", name: "Alphabet Inc", pnl: -375.01, return: 0.0136, first: "2025-11-17", last: null, held: true, days: 300 }],
    held_now: 29,
    coverage: { priced: 94, skipped: 0, skipped_examples: [], weight_avg: 0.98, weight_min: 0.96, cash_share: 0 },
    excess_per_year: -0.0067,
    price_source: "Adjusted daily closes",
    benchmark: "SPY",
    last_filing: "2026-08-14",
    ...overrides,
  };
}

function row(overrides: Partial<CopyHubRow>): CopyHubRow {
  return {
    slug: "x",
    kind: "fund",
    name: "X",
    person: "Someone",
    start_date: "2020-02-18",
    end_date: "2026-11-09",
    eligible: true,
    not_ranked_because: null,
    excess_per_year: 0,
    years: 6.7,
    copy_total: 1,
    copy_annualized: 0.12,
    spy_total: 1.4,
    spy_annualized: 0.14,
    max_drawdown: -0.3,
    trades: 10,
    best: null,
    worst: null,
    spark: [],
    rank: null,
    sessions: 1692,
    ...overrides,
  };
}

const HUB: CopyHub = {
  generated_at: "2026-11-09T12:00:00Z",
  fund_start: "2013-01-01",
  price_as_of: "2026-11-07",
  rows: [
    row({ slug: "berkshire-hathaway", name: "Berkshire Hathaway", person: "Warren Buffett", excess_per_year: -0.0067, rank: 3 }),
    row({ slug: "pershing-square", name: "Pershing Square", person: "Bill Ackman", excess_per_year: 0.05, rank: 1 }),
    row({ slug: "bridgewater-associates", name: "Bridgewater Associates", person: "Ray Dalio", excess_per_year: 0.01, rank: 2 }),
    row({ slug: "nancy-pelosi", kind: "congress", name: "Nancy Pelosi", person: "Nancy Pelosi", party: "D", state: "CA", district: "11", excess_per_year: 0.08, rank: 1 }),
  ],
  funds: 3,
  members: 1,
  ranked_funds: 3,
  ranked_members: 1,
  fund_rule: "Fund rule.",
  fund_caveat: "Fund caveat.",
  congress_rule: "Congress rule.",
  congress_caveat: "Congress caveat.",
};

describe("copy_test", () => {
  it("returns one record by slug with the page's verdict and sources", async () => {
    vi.mocked(getCopyRecord).mockResolvedValue(record());
    const out = await getAgentCopyTest({ slug: "berkshire-hathaway" });
    expect(getCopyRecord).toHaveBeenCalledWith("berkshire-hathaway");
    expect(out).toMatchObject({
      data_status: "available",
      slug: "berkshire-hathaway",
      copy: { end_value: 23677.77, annualized: 0.1368 },
      sp500: { end_value: 24639.12 },
      yearly: [{ year: 2025, returns: { copy: 0.12, sp500: 0.18, not_trading: 0.1 } }],
    });
    const full = out as { verdict: { headline: string }; versus_not_trading: string; sources: Array<{ name: string; as_of: string }>; link: string };
    expect(full.verdict.headline).toContain("$23,678");
    expect(full.versus_not_trading).toContain("$28,017");
    expect(full.sources[0]).toEqual({ name: "SEC 13F filings", as_of: "2026-08-14" });
    expect(full.link).toMatch(/\/follow\/berkshire-hathaway\/copy$/);
    expect(out).not.toHaveProperty("curve");
  });

  it("finds one record by a name search", async () => {
    vi.mocked(getCopyHub).mockResolvedValue(HUB);
    vi.mocked(getCopyRecord).mockResolvedValue(record());
    const out = await getAgentCopyTest({ query: "Warren Buffett" });
    expect(getCopyRecord).toHaveBeenCalledWith("berkshire-hathaway");
    expect(out.data_status).toBe("available");
  });

  it("lists the slugs when a search matches several", async () => {
    vi.mocked(getCopyHub).mockResolvedValue(HUB);
    const out = await getAgentCopyTest({ query: "a", kind: "fund" });
    expect(out.data_status).toBe("several_matches");
    expect((out as { matches: Array<{ slug: string }> }).matches.map((match) => match.slug)).not.toContain("nancy-pelosi");
    expect(getCopyRecord).not.toHaveBeenCalled();
  });

  it("returns the ranking, best first, trimmed to the limit", async () => {
    vi.mocked(getCopyHub).mockResolvedValue(HUB);
    const out = (await getAgentCopyTest({ limit: 2 })) as unknown as {
      funds: { ranked_count: number; ranked: Array<{ slug: string }> };
      house_members: { ranked: Array<{ slug: string; who: string }> };
      read: { headline: string } | null;
    };
    expect(out.funds.ranked_count).toBe(3);
    expect(out.funds.ranked.map((entry) => entry.slug)).toEqual(["pershing-square", "bridgewater-associates"]);
    expect(out.house_members.ranked[0]).toMatchObject({ slug: "nancy-pelosi", who: "Democrat, CA-11" });
    expect(out.read?.headline).toBeTruthy();
  });

  it("rejects a malformed slug before reading anything, and says when nothing matches", async () => {
    await expect(getAgentCopyTest({ slug: "../tm_agent_tokens/x" })).rejects.toMatchObject({ code: "invalid_slug" });
    expect(getCopyRecord).not.toHaveBeenCalled();
    vi.mocked(getCopyHub).mockResolvedValue(HUB);
    await expect(getAgentCopyTest({ query: "nobody at all" })).rejects.toMatchObject({ code: "copy_test_not_found", status: 404 });
    vi.mocked(getCopyHub).mockResolvedValue(null);
    await expect(getAgentCopyTest({})).rejects.toBeInstanceOf(AgentDataError);
  });

  it("says a failed record read is an outage, not a missing record", async () => {
    vi.mocked(getCopyRecord).mockRejectedValue(new Error("store down"));
    await expect(getAgentCopyTest({ slug: "berkshire-hathaway" })).rejects.toMatchObject({ code: "copy_tests_unavailable", status: 503 });
  });

  it("returns an empty record with the page's sentence", async () => {
    vi.mocked(getCopyRecord).mockResolvedValue({
      ...record(),
      empty: true,
      start_date: null,
      end_date: null,
      eligible: false,
      not_ranked_because: "none of the reported trades could be priced",
    } as never);
    const out = await getAgentCopyTest({ slug: "berkshire-hathaway" });
    expect(out).toMatchObject({ data_status: "empty", message: "We could not build a copy of Berkshire Hathaway: none of the reported trades could be priced." });
  });
});

/* ── watch_in_plain_words ─────────────────────────────────────────────── */

const CATALOG = buildCatalog([
  { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
  { ticker: "AAPL", name: "Apple Inc.", aliases: ["AAPL", "Apple"], price: 348.63 },
]);

describe("watch_in_plain_words", () => {
  beforeEach(() => {
    vi.mocked(plainCatalog).mockResolvedValue(CATALOG);
    vi.mocked(consumePlainParse).mockResolvedValue({ allowed: true, model: false });
    vi.mocked(listJobs).mockResolvedValue([]);
  });

  it("reads a request into the agent preview without saving anything, on the Pro meter", async () => {
    const out = await readAgentWatchRequest(UID, { text: "tell me if NVDA closes below 150" });
    expect(consumePlainParse).toHaveBeenCalledWith("pro", UID, false);
    expect(listJobs).toHaveBeenCalledWith(UID);
    expect(out).toMatchObject({ data_status: "understood", saved: false, via: "rules" });
    expect(out.watches).toHaveLength(1);
    expect(out.watches[0]!.full).toContain("NVIDIA");
    expect(out.watches[0]!.agent).toMatchObject({ trigger: expect.any(Object), scope: { kind: "tickers", tickers: ["NVDA"] } });
    expect(out.capacity).toMatchObject({ running: 0, total: 0, run_limit: 20 });
    expect(out.link).toMatch(/\/agents$/);
  });

  it("reads a sell watch back with our sell-some price, through the member's own plan", async () => {
    const lookup = vi.fn(async (tickers: string[]) => Object.fromEntries(tickers.map((ticker) => [ticker, { call: "Trim" as const, add_below: null, trim_above: 250, locked: false }])));
    vi.mocked(plainCallLookup).mockReturnValue(lookup);
    const out = await readAgentWatchRequest(UID, { text: "tell me when to sell NVDA" });
    expect(lookup).toHaveBeenCalledWith(["NVDA"]);
    expect(vi.mocked(plainCallLookup).mock.calls[0]![0]).toMatchObject({ uid: UID, signedIn: true });
    expect(out.lead).toBe("Our call on NVIDIA is already Sell some; I'll tell you when it reaches our sell-some price ($250).");
    expect(out.watches[0]!.agent).toMatchObject({ template: "sell-zone" });
    // A watch with no buy or sell side never reads the member's document for it.
    vi.mocked(plainCallLookup).mockClear();
    await readAgentWatchRequest(UID, { text: "tell me if NVDA closes below 150" });
    expect(plainCallLookup).not.toHaveBeenCalled();
  });

  it("marks an agent the member already has", async () => {
    const first = await readAgentWatchRequest(UID, { text: "tell me if NVDA closes below 150" });
    vi.mocked(listJobs).mockResolvedValue([{ ...first.watches[0]!.agent, id: "a", uid: UID, mode: "tell_me", enabled: true, created_at: "", updated_at: "" }]);
    const again = await readAgentWatchRequest(UID, { text: "tell me if NVDA closes below 150" });
    expect(again.watches[0]!.already_have).toBe(true);
    expect(again.capacity?.running).toBe(1);
  });

  it("stops at the daily limit and rejects empty or long requests", async () => {
    vi.mocked(consumePlainParse).mockResolvedValue({ allowed: false, model: false, reason: "parses" });
    await expect(readAgentWatchRequest(UID, { text: "tell me if NVDA closes below 150" })).rejects.toMatchObject({ code: "plain_parse_limit", status: 429 });
    await expect(readAgentWatchRequest(UID, { text: "   " })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(readAgentWatchRequest(UID, { text: "x".repeat(301) })).rejects.toMatchObject({ code: "invalid_request" });
  });
});
