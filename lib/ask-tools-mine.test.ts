import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The person's own tools in Ask, with every store mocked. A made-up uid only;
 * nothing here reads or writes a real account.
 */

const UID = "test-uid-0001";
const OTHER = "test-uid-9999";

const state = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  docs: new Map<string, Record<string, unknown>>(),
  jobs: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  userDoc: null as Record<string, unknown> | null,
  reports: new Map<string, Record<string, unknown>>(),
  nextEarnings: null as { event_date: string } | null,
  /** Our call on each stock, as the watch box's call lookup returns it. */
  ourCalls: {} as Record<string, { call: "Add" | "Hold" | "Trim" | null; add_below: number | null; trim_above: number | null; locked?: boolean }>,
  prices: {} as Record<string, number>,
}));

vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          state.calls.push(["doc.get", `${name}/${id}`]);
          const data = state.docs.get(`${name}/${id}`);
          return { exists: Boolean(data), data: () => data };
        },
        set: async () => {
          throw new Error("no writes in Ask");
        },
      }),
    }),
  },
}));
vi.mock("@/lib/watchlist", () => ({
  getUserDoc: async (uid: string) => {
    state.calls.push(["getUserDoc", uid]);
    return state.userDoc;
  },
}));
vi.mock("@/lib/entitlements-server", () => ({ canSeeLevels: () => true }));
vi.mock("@/lib/agent-jobs-data", () => ({
  listJobs: async (uid: string) => {
    state.calls.push(["listJobs", uid]);
    return state.jobs.filter((job) => job.uid === uid);
  },
  listRuns: async (uid: string) => {
    state.calls.push(["listRuns", uid]);
    return state.runs.filter((run) => run.uid === uid);
  },
  createJob: async () => {
    throw new Error("Ask must never create an agent");
  },
}));
vi.mock("@/lib/agents-plain/server", async () => {
  const { buildCatalog } = await import("@/lib/agents-plain/stocks");
  const catalog = buildCatalog([
    { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
    { ticker: "BRK.B", name: "Berkshire Hathaway", price: 480 },
  ]);
  return {
    plainCatalog: async () => catalog,
    plainCallLookup: (viewer: { uid: string | null }) => async (tickers: string[]) => {
      state.calls.push(["callLookup", viewer.uid, ...tickers]);
      return Object.fromEntries(tickers.filter((ticker) => ticker in state.ourCalls).map((ticker) => [ticker, state.ourCalls[ticker]]));
    },
  };
});
vi.mock("@/lib/screener", () => ({
  getScreenerRows: async (tickers: string[]) => new Map(tickers.filter((ticker) => ticker in state.prices).map((ticker) => [ticker, { ticker, price: state.prices[ticker] }])),
}));
vi.mock("@/lib/research/store", () => ({
  researchStore: {
    get: async (uid: string, ticker: string, key: string) => {
      state.calls.push(["research.get", uid, ticker, key]);
      return state.reports.get(`${uid}|${ticker}|${key}`) ?? null;
    },
    list: async (uid: string) => {
      state.calls.push(["research.list", uid]);
      return [...state.reports.values()].filter((report) => report.uid === uid).map((report) => ({ ...report, headline: (report.body as { headline: string }).headline }));
    },
  },
}));
vi.mock("@/lib/thesis-watch/server", () => ({
  checkReasons: async (viewer: { uid: string }, _doc: unknown, options: Record<string, unknown>) => {
    state.calls.push(["checkReasons", viewer.uid, options]);
    return {
      checks: {
        US_NVDA: {
          instrumentId: "US_NVDA",
          ticker: "NVDA",
          kind: "growth",
          verdict: "weaker",
          headline: "Your reason for owning NVDA is weaker.",
          note: "Revenue growth slowed to 12% from 40% a year ago.",
          wordedBy: "rules",
          signals: [{ id: "growth_slowing", level: "soft", text: "Revenue growth slowed to 12%.", source: "SEC filings", asOf: "2026-11-01", href: "/stock/NVDA", data: {} }],
          checked: [],
          quote: "AI chips keep growing",
          limit: null,
          asOf: "2026-11-10",
          change: null,
        },
      },
      locked: ["US_KO"],
      unchecked: [],
      theses: { US_NVDA: {}, US_KO: {} },
    };
  },
  exampleReasonChecks: async () => {
    state.calls.push(["exampleReasonChecks"]);
    return [
      { instrumentId: "US_MSFT", ticker: "MSFT", kind: "long_term", verdict: "holds", headline: "Still holds.", note: "Nothing fired.", wordedBy: "rules", signals: [], checked: [], quote: null, limit: null, asOf: "2026-11-10", change: null },
    ];
  },
}));
vi.mock("@/lib/memo/store", () => ({
  listMemos: async (uid: string) => {
    state.calls.push(["listMemos", uid]);
    return [];
  },
  readMemo: async (uid: string) => {
    state.calls.push(["readMemo", uid]);
    return null;
  },
}));
const memo = (subject: "mine" | "example") => ({
  version: 1,
  weekKey: "2026-46",
  monday: "2026-11-09",
  friday: "2026-11-13",
  endDay: "2026-11-10",
  complete: false,
  subject,
  topLine: "Your holdings are up 1.2% this week, against 0.8% for the S&P 500.",
  week: null,
  changed: [{ id: "call:AAPL:2026-11-10", kind: "call", text: "Our call on Apple moved to Keep.", href: "/stock/AAPL", linkLabel: "", tone: "flat", tickers: ["AAPL"], source: "stocksbrew research", asOf: "2026-11-10" }],
  hurt: [],
  look: [],
  heldBack: 0,
  wordedBy: "rules",
  writtenAt: "2026-11-10T21:00:00Z",
});
vi.mock("@/lib/memo/server", () => ({
  loadExampleMemo: async () => {
    state.calls.push(["loadExampleMemo"]);
    return { mode: "example", memo: memo("example"), history: [], missingWeek: false };
  },
}));
vi.mock("@/lib/memo/data", () => ({
  userHoldings: async () => ({ subject: "mine", holdings: [{ ticker: "NVDA", name: "NVIDIA", instrumentId: "US_NVDA", units: 10, fund: false, covered: true }], userDoc: null, signature: "x" }),
  currentWeek: async () => ({ week: { key: "2026-46", monday: "2026-11-09", friday: "2026-11-13", complete: false, endDay: "2026-11-10" }, series: new Map(), today: "2026-11-11" }),
  loadSpanEvents: async () => ({ calls: [], moves: [], reports: [], upcoming: [], funds: [], insiders: [], congress: [] }),
  spanOf: () => ({ from: "2026-11-09", to: "2026-11-13", today: "2026-11-11" }),
}));
vi.mock("@/lib/memo/build", () => ({
  buildMemo: () => {
    state.calls.push(["buildMemo"]);
    return { memo: memo("mine") };
  },
}));
vi.mock("@/lib/portfolio-data", () => ({ BENCHMARK_SYMBOL: "SPY", newYorkToday: () => "2026-11-11" }));
vi.mock("@/lib/briefing-data", () => ({ BRIEFING_STATE_COLLECTION: "tm_briefing_state" }));
vi.mock("@/lib/earnings", () => ({ getNextEarningsCalendarEventCached: async () => state.nextEarnings }));

import { buildMineTools, watchOutlook, watchRequest, WATCH_KINDS } from "@/lib/ask-tools-mine";
import { MAX_JOBS_PER_USER } from "@/lib/agent-jobs";
import { cardForModel } from "@/lib/ask-cards";
import { can, limitFor } from "@/lib/entitlements";
import { WATCH_KINDS as PLAIN_WATCH_KINDS, parseByRules } from "@/lib/agents-plain/parse";
import { buildCatalog } from "@/lib/agents-plain/stocks";

const viewer = (uid: string) => ({ uid, signedIn: true, isSubscribed: false, plan: "free" as const, tracked: ["US_NVDA"], covered: ["US_NVDA"], coverage: null, trialEligible: false });
const NOW = new Date("2026-11-11T16:00:00Z");

function tools(uid: string | null, example = false) {
  return buildMineTools({ uid, viewer: uid ? (viewer(uid) as never) : null, example, now: NOW });
}

async function run(set: ReturnType<typeof tools>, name: string, input: Record<string, unknown> = {}) {
  return (await set[name]!.execute!(input as never, { toolCallId: "t", messages: [] })) as Record<string, unknown>;
}

/** Every uid any store was asked for. */
function uidsAsked(): string[] {
  return state.calls.flatMap(([name, ...args]) => {
    if (name === "doc.get") return [String(args[0]).split("/")[1]!.split("__")[0]!];
    if (name === "checkReasons") return [String(args[0])];
    if (["getUserDoc", "listJobs", "listRuns", "listMemos", "readMemo", "research.get", "research.list", "callLookup"].includes(name)) return [String(args[0])];
    return [];
  });
}

beforeEach(() => {
  state.calls = [];
  state.docs.clear();
  state.jobs = [];
  state.runs = [];
  state.reports.clear();
  state.nextEarnings = null;
  state.ourCalls = {};
  state.prices = {};
  state.userDoc = { uid: UID, tracked_stocks: ["US_NVDA"], watchlist_positions: { US_NVDA: "holding" }, watchlist_holdings: { US_NVDA: { quantity: 10, average_cost: 120 } } };
});

describe("scoping to the session's uid", () => {
  it("no tool takes a uid, an email or a document id from the model", () => {
    for (const [name, item] of Object.entries(tools(UID))) {
      const shape = (item.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
      for (const key of Object.keys(shape)) expect(`${name}.${key}`).not.toMatch(/\.(uid|user|user_id|email|doc|doc_id)$/);
    }
  });

  it("every read goes to the signed-in uid, never another", async () => {
    state.jobs = [
      { id: "mine000001", uid: UID, name: "NVDA below $150", enabled: true, template: "price-level", trigger: { type: "price", rule: "crosses_below", level: 150 }, scope: { kind: "tickers", tickers: ["NVDA"] } },
      { id: "theirs0001", uid: OTHER, name: "Someone else's", enabled: true, template: "price-level", trigger: { type: "price", rule: "crosses_below", level: 99 }, scope: { kind: "tickers", tickers: ["NVDA"] } },
    ];
    state.reports.set(`${OTHER}|NVDA|20261110T153012Z`, { uid: OTHER, ticker: "NVDA", key: "20261110T153012Z", status: "ready", body: { headline: "Theirs" } });
    const set = tools(UID);
    await run(set, "get_my_reasons");
    await run(set, "get_my_week");
    const agents = await run(set, "get_my_agents", { job_id: "theirs0001" });
    const research = await run(set, "get_my_research", { ticker: "NVDA", key: "20261110T153012Z" });
    await run(set, "open_briefing_item", { ticker: "NVDA", day: "2026-11-10", item_id: "move-NVDA" });
    await run(set, "suggest_watch", { kind: "price_below", ticker: "NVDA", level: 150 });

    expect(new Set(uidsAsked())).toEqual(new Set([UID]));
    // Someone else's agent id and report key find nothing.
    expect(agents).toMatchObject({ card: "agents", total: 1, focus: null, focus_missing: true });
    expect((agents.rows as Array<{ name: string }>).map((row) => row.name)).toEqual(["NVDA below $150"]);
    expect(research).toMatchObject({ card: "error" });
    expect(String(research.message)).toMatch(/not in your account/);
  });

  it("reads reasons without saving and without a model", async () => {
    const card = await run(tools(UID), "get_my_reasons");
    expect(state.calls.find(([name]) => name === "checkReasons")?.[2]).toMatchObject({ persist: false, word: false });
    expect(card).toMatchObject({ card: "reasons", example: false, saved: 2, locked: ["KO"] });
    expect((card.rows as Array<{ ticker: string; verdict_words: string }>)[0]).toMatchObject({ ticker: "NVDA", verdict_words: "Reason weaker" });
  });

  it("a briefing line saved under another uid is not read back", async () => {
    state.docs.set(`tm_briefing_state/${UID}__2026-11-10`, {
      uid: OTHER,
      snapshot: { needs_you: [{ id: "move-NVDA", ticker: "NVDA" }], also_today: [] },
    });
    const card = await run(tools(UID), "open_briefing_item", { ticker: "NVDA", day: "2026-11-10", item_id: "move-NVDA" });
    expect(card.card).toBe("error");
  });

  it("opens the person's own briefing line", async () => {
    state.docs.set(`tm_briefing_state/${UID}__2026-11-10`, {
      uid: UID,
      snapshot: {
        needs_you: [
          {
            id: "move-NVDA",
            ticker: "NVDA",
            name: "NVIDIA",
            headline: "NVDA fell 6.2%",
            why: "Chip export rules tightened.",
            metric: "-6.2%",
            reason_status: "confirmed",
            next_step: "Read the rule.",
            evidence: [{ label: "Reuters", source: "Reuters", url: null, at: "2026-11-10" }],
            as_of: "2026-11-10T21:00:00Z",
            day_change_pct: -6.2,
            price: 150.1,
          },
        ],
        also_today: [],
      },
    });
    const card = await run(tools(UID), "open_briefing_item", { ticker: "NVDA", day: "2026-11-10", item_id: "move-NVDA" });
    expect(card).toMatchObject({ card: "briefing_item", ticker: "NVDA", reason_confirmed: true, day_change_pct: -6.2 });
  });
});

describe("signed out and the example portfolio", () => {
  it("asks to sign in, and reads nothing", async () => {
    const set = tools(null);
    for (const name of ["get_my_reasons", "get_my_week", "get_my_agents", "get_my_research"]) {
      expect((await run(set, name)).card, name).toBe("sign_in");
    }
    expect(uidsAsked()).toEqual([]);
  });

  it("answers about the example only when the question came from it, and marks it", async () => {
    const set = tools(null, true);
    expect(await run(set, "get_my_reasons")).toMatchObject({ card: "reasons", example: true });
    expect(await run(set, "get_my_week")).toMatchObject({ card: "memo", example: true });
    expect(uidsAsked()).toEqual([]);
    // Agents and research have no example: still a sign-in.
    expect((await run(set, "get_my_agents")).card).toBe("sign_in");
  });

  it("signed in with nothing held: the example only from an example link", async () => {
    state.userDoc = { uid: UID, tracked_stocks: [], watchlist_positions: {} };
    expect((await run(tools(UID), "get_my_week")).card).toBe("error");
    expect(await run(tools(UID, true), "get_my_week")).toMatchObject({ card: "memo", example: true });
  });
});

describe("this week's memo", () => {
  it("built quietly from the memo's rules when there is no copy from today, and points at the line the link named", async () => {
    const card = await run(tools(UID), "get_my_week", { item_id: "call:AAPL:2026-11-10" });
    expect(state.calls.some(([name]) => name === "buildMemo")).toBe(true);
    expect(card).toMatchObject({ card: "memo", example: false, week_key: "2026-46" });
    expect(card.focus).toMatchObject({ id: "call:AAPL:2026-11-10" });
  });
});

describe("Watch this", () => {
  const catalog = buildCatalog([
    { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
    { ticker: "BRK.B", name: "Berkshire Hathaway", price: 480 },
  ]);

  // The template the watch box saves for each kind: Ask's request must land on exactly that agent.
  const TEMPLATE: Record<(typeof WATCH_KINDS)[number], string> = {
    price_below: "price-level",
    price_above: "price-level",
    daily_move: "big-move",
    earnings_before: "earnings-ahead",
    earnings_out: "earnings-out",
    fund_13f: "fund-filing",
    congress_trade: "congress-trade",
    insider_trade: "insider-trade",
    movers_list: "mover",
    buy_zone: "buy-zone",
    sell_zone: "sell-zone",
    call_change: "call-change",
    daily_check: "morning-check",
    weekly_review: "weekly-review",
    sec_filing: "sec-filing",
    news_change: "news",
  };

  it("offers every kind the watch box knows, and each request is read by the watch box's own rules as exactly that agent", () => {
    expect(WATCH_KINDS).toBe(PLAIN_WATCH_KINDS);
    const cases: Array<Parameters<typeof watchRequest>[0]> = [
      ...WATCH_KINDS.map((kind) => ({ kind, ticker: "NVDA", level: 150 })),
      // Every kind that can follow the person's stocks.
      ...WATCH_KINDS.filter((kind) => !["price_below", "price_above", "fund_13f", "congress_trade"].includes(kind)).map((kind) => ({ kind, mine: true })),
      { kind: "price_above", ticker: "BRK.B", level: 512.5 },
      { kind: "daily_move", mine: true, pct: 4 },
      { kind: "earnings_before", mine: true, days: 1 },
      { kind: "call_change", ticker: "NVDA", to: "sell_some" },
      { kind: "call_change", ticker: "NVDA", to: "buy_more" },
      { kind: "call_change", ticker: "NVDA", to: "keep" },
      ...(["busy", "negative", "positive", "any"] as const).map((news) => ({ kind: "news_change" as const, ticker: "NVDA", news })),
      ...(["any", "big", "8-K", "10-K", "10-Q"] as const).map((filing) => ({ kind: "sec_filing" as const, ticker: "NVDA", filing })),
      { kind: "weekly_review", ticker: "NVDA", weekday: 5 },
    ];
    for (const input of cases) {
      const request = watchRequest(input);
      expect(request, JSON.stringify(input)).not.toBeNull();
      const parsed = parseByRules(request!, catalog, { hidden: [] });
      expect(parsed.confident, request!).toBe(true);
      expect(parsed.spec.cannot, request!).toEqual([]);
      expect(parsed.spec.watches.map((watch) => watch.draft.template), request!).toEqual([TEMPLATE[input.kind]]);
      expect(parsed.spec.watches[0]!.draft.scope.kind, request!).toBe(input.mine ? "watchlist" : "tickers");
    }
    // The settings the person asked for reach the agent.
    const settings = (input: Parameters<typeof watchRequest>[0]) => parseByRules(watchRequest(input)!, catalog, { hidden: [] }).spec.watches[0]!.draft.trigger;
    expect(settings({ kind: "call_change", ticker: "NVDA", to: "sell_some" })).toMatchObject({ event: "call_change", to: "Trim" });
    expect(settings({ kind: "news_change", ticker: "NVDA", news: "negative" })).toMatchObject({ news: "negative" });
    expect(settings({ kind: "sec_filing", ticker: "NVDA", filing: "8-K" })).toMatchObject({ filings: { forms: ["8-K"] } });
    expect(settings({ kind: "sec_filing", ticker: "NVDA", filing: "big" })).toMatchObject({ filings: { major: true } });
    expect(settings({ kind: "weekly_review", ticker: "NVDA", weekday: 5 })).toMatchObject({ weekday: 5 });
    expect(settings({ kind: "news_change", ticker: "NVDA", news: "busy" })).toMatchObject({ news: "busy" });
  });

  it("answers 'when should I sell?' from our call, its level and the distance, then waits behind one tap", async () => {
    state.ourCalls = { NVDA: { call: "Trim", add_below: null, trim_above: 250, locked: false } };
    state.prices = { NVDA: 230 };
    const card = await run(tools(UID), "suggest_watch", { kind: "sell_zone", ticker: "NVDA", offer: true });
    expect(card).toMatchObject({ card: "watch", status: "ready", request: "Tell me when to sell NVDA", offer: "Want me to tell you when it gets there?" });
    expect(card.zone).toEqual({
      side: "sell",
      call: "Sell some",
      level: 250,
      price: 230,
      gap_pct: 8.7,
      locked: false,
      answer: "Our call on NVIDIA is Sell some at $250. That's 8.7% above its price of $230.",
    });
    // The watch box's read-back, with the real price, and the sell watch it would save.
    expect(card.preview).toBe("Our call on NVIDIA is already Sell some; I'll tell you when it reaches our sell-some price ($250).");
    expect(card.drafts).toEqual([expect.objectContaining({ template: "sell-zone", scope: { kind: "tickers", tickers: ["NVDA"] } })]);
    // One read of our calls for the read-back and the answer, for this session's uid only.
    expect(state.calls.filter(([name]) => name === "callLookup")).toEqual([["callLookup", UID, "NVDA"]]);
    // The model reads the answer lines.
    expect(cardForModel(card as never)).toHaveProperty("zone.answer");
  });

  it("says plainly when the call has no level of that side, and offers to say when it changes", async () => {
    state.ourCalls = { NVDA: { call: "Hold", add_below: 150, trim_above: 250, locked: false } };
    state.prices = { NVDA: 168.79 };
    const sell = await run(tools(UID), "suggest_watch", { kind: "sell_zone", ticker: "NVDA", offer: true });
    // A Keep call shows no sell-some price, even though one is stored (owner rule 8).
    expect(sell.zone).toMatchObject({ call: "Keep", level: null, answer: "Our call on NVIDIA is Keep, so there's no sell-some price right now. It trades at $168.79." });
    expect(sell.offer).toBe("Want me to tell you if that changes?");
    expect(sell.preview).toBe("NVIDIA has no sell-some price right now; I'll tell you if our call turns to Sell some.");
    const buy = await run(tools(UID), "suggest_watch", { kind: "buy_zone", ticker: "NVDA", offer: true });
    expect(buy.zone).toMatchObject({ call: "Keep", level: null, answer: "Our call on NVIDIA is Keep, so there's no buy-more price right now. It trades at $168.79." });
  });

  it("answers the buy side the same way, and keeps the level back where the plan does not show it", async () => {
    state.ourCalls = { NVDA: { call: "Add", add_below: 150, trim_above: null, locked: false } };
    state.prices = { NVDA: 168.79 };
    const buy = await run(tools(UID), "suggest_watch", { kind: "buy_zone", ticker: "NVDA", offer: true });
    expect(buy.zone).toMatchObject({ level: 150, gap_pct: 11.1, answer: "Our call on NVIDIA is Buy more below $150. That's 11.1% below its price of $168.79." });
    expect(buy.offer).toBe("Want me to tell you when it gets there?");
    state.prices = { NVDA: 149.5 };
    expect((await run(tools(UID), "suggest_watch", { kind: "buy_zone", ticker: "NVDA", offer: true })).zone).toMatchObject({ gap_pct: null, answer: "Our call on NVIDIA is Buy more below $150. It's there now, at $149.50." });
    // A hair away from the level reads as there, never "0% below".
    state.prices = { NVDA: 150.04 };
    expect((await run(tools(UID), "suggest_watch", { kind: "buy_zone", ticker: "NVDA", offer: true })).zone).toMatchObject({ gap_pct: null, answer: "Our call on NVIDIA is Buy more below $150. It's there now, at $150.04." });
    state.prices = { NVDA: 168.79 };
    state.ourCalls = { NVDA: { call: "Add", add_below: null, trim_above: null, locked: true } };
    const locked = await run(tools(UID), "suggest_watch", { kind: "buy_zone", ticker: "NVDA", offer: true });
    expect(locked.zone).toMatchObject({ level: null, locked: true, answer: "Our call on NVIDIA is Buy more. Its buy-more price comes with covering the stock." });
    expect(JSON.stringify(locked)).not.toContain("150");
    state.ourCalls = {};
    expect((await run(tools(UID), "suggest_watch", { kind: "sell_zone", ticker: "NVDA", offer: true })).zone).toMatchObject({ call: null, answer: "We don't have a call on NVIDIA yet, so there's no sell-some price. It trades at $168.79." });
  });

  it("asked to be told rather than when, shows the watch at once; a watch on the person's stocks has no single answer", async () => {
    state.ourCalls = { NVDA: { call: "Trim", add_below: null, trim_above: 250, locked: false } };
    expect(await run(tools(UID), "suggest_watch", { kind: "sell_zone", ticker: "NVDA" })).toMatchObject({ offer: null, zone: expect.objectContaining({ level: 250 }) });
    expect(await run(tools(UID), "suggest_watch", { kind: "sell_zone", mine: true, offer: true })).toMatchObject({ card: "watch", zone: null });
    expect(await run(tools(UID), "suggest_watch", { kind: "call_change", ticker: "NVDA", to: "sell_some" })).toMatchObject({
      card: "watch",
      preview: "I'll watch NVIDIA (NVDA) and tell you when our call on it turns to Sell some.",
      zone: null,
    });
  });

  it("refuses shapes the agent box cannot take", () => {
    expect(watchRequest({ kind: "price_below", ticker: "NVDA" })).toBeNull();
    expect(watchRequest({ kind: "price_below", mine: true, level: 100 })).toBeNull();
    expect(watchRequest({ kind: "congress_trade", mine: true })).toBeNull();
    expect(watchRequest({ kind: "daily_move", ticker: "NVDA", pct: 80 })).toBeNull();
    expect(watchRequest({ kind: "daily_move" })).toBeNull();
  });

  it("fills in the agent box and sets nothing up", async () => {
    const card = await run(tools(UID), "suggest_watch", { kind: "daily_move", ticker: "NVDA", pct: 5 });
    expect(card).toMatchObject({ card: "watch", status: "ready", existing: [], request: "Tell me when NVDA moves 5% in a day" });
    expect(card.href).toBe("/agents?q=Tell%20me%20when%20NVDA%20moves%205%25%20in%20a%20day");
    expect(String(card.preview)).toMatch(/^I'll watch NVIDIA/);
  });

  it("states the exact rule and carries the agent it would save, for the card's one tap", async () => {
    const card = await run(tools(UID), "suggest_watch", { kind: "daily_move", ticker: "NVDA", pct: 5 });
    expect(card.rule).toEqual({ what: ["NVIDIA moves 5% or more in a day, up or down"], stocks: [{ ticker: "NVDA", name: "NVIDIA" }], mine: false });
    expect(card.drafts).toEqual([expect.objectContaining({ scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: expect.objectContaining({ pct: 5 }) })]);
    // Nothing running yet: it would simply start.
    expect(card.outlook).toBeNull();
    // The model reads the request and the preview, not the drafts or the rule.
    const forModel = cardForModel(card as never);
    expect(forModel).not.toHaveProperty("drafts");
    expect(forModel).not.toHaveProperty("rule");
    expect(forModel).toHaveProperty("preview");
  });

  it("warns before the tap when the plan would save it paused", async () => {
    const limit = limitFor("agents", "free");
    state.jobs = Array.from({ length: limit }, (_, index) => ({
      id: `run${index}`.padEnd(10, "0"),
      uid: UID,
      name: `AAPL below $${100 + index}`,
      enabled: true,
      template: "price-level",
      trigger: { type: "price", rule: "crosses_below", level: 100 + index },
      scope: { kind: "tickers", tickers: ["AAPL"] },
    }));
    const card = await run(tools(UID), "suggest_watch", { kind: "daily_move", ticker: "NVDA", pct: 5 });
    expect(card.outlook).toMatchObject({ kind: "paused" });
    expect(String((card.outlook as { line: string }).line)).toMatch(/^Free runs .* at a time and you have \d+ on, so this one will be saved paused\./);
    // Signed out there is no plan to warn about.
    expect((await run(tools(null), "suggest_watch", { kind: "daily_move", ticker: "NVDA", pct: 5 })).outlook).toBeNull();
  });

  it("the outlook follows the save route's order: room, then filing and news agents, then the running limit", () => {
    const draft = (trigger: Record<string, unknown>) => ({ template: "t", name: "n", trigger, scope: { kind: "tickers", tickers: ["NVDA"] } }) as never;
    const move = draft({ type: "price", rule: "daily_move", pct: 5 });
    const job = (index: number, enabled = false) => ({ template: "t", trigger: { type: "price", rule: "crosses_below", level: index }, scope: { kind: "tickers", tickers: ["AAPL"] }, enabled }) as never;
    expect(watchOutlook({ drafts: [move], jobs: Array.from({ length: MAX_JOBS_PER_USER }, (_, i) => job(i)), plan: "pro" })).toMatchObject({ kind: "full" });
    const twoMoves = [move, draft({ type: "price", rule: "daily_move", pct: 8 })];
    expect(watchOutlook({ drafts: twoMoves, jobs: Array.from({ length: MAX_JOBS_PER_USER - 1 }, (_, i) => job(i)), plan: "pro" })?.line).toMatch(/^You have room for 1 more agent, and this sets up 2\./);
    // The same draft twice counts once, as the route saves it once.
    expect(watchOutlook({ drafts: [move, move], jobs: Array.from({ length: MAX_JOBS_PER_USER - 1 }, (_, i) => job(i)), plan: "pro" })).toBeNull();
    const filing = watchOutlook({ drafts: [draft({ type: "event", event: "sec_filing" })], jobs: [], plan: "free" });
    if (can("agent_events", "free")) expect(filing).toBeNull();
    else expect(filing).toMatchObject({ kind: "pro_only" });
    expect(watchOutlook({ drafts: [move], jobs: [], plan: "pro" })).toBeNull();
    // An agent the person already has is skipped on save, so it never warns.
    expect(watchOutlook({ drafts: [move], jobs: [{ ...(move as object), enabled: true } as never], plan: "free" })).toBeNull();
  });

  it("counts idea baskets that are on against the running limit, as saving does", () => {
    const move = { template: "t", name: "n", trigger: { type: "price", rule: "daily_move", pct: 5 }, scope: { kind: "tickers", tickers: ["NVDA"] } } as never;
    const limit = limitFor("agents", "free");
    expect(watchOutlook({ drafts: [move], jobs: [], plan: "free", baskets: limit - 1 })).toBeNull();
    expect(watchOutlook({ drafts: [move], jobs: [], plan: "free", baskets: limit })).toMatchObject({ kind: "paused" });
  });

  it("says 'already' only when the person really has that agent", async () => {
    state.jobs = [{ id: "mine000001", uid: UID, name: "NVDA below $150", enabled: false, template: "price-level", trigger: { type: "price", rule: "crosses_below", level: 150 }, scope: { kind: "tickers", tickers: ["NVDA"] } }];
    expect(await run(tools(UID), "suggest_watch", { kind: "price_below", ticker: "NVDA", level: 150 })).toMatchObject({
      status: "already",
      existing: [{ name: "NVDA below $150", enabled: false }],
    });
    // A different level is a different agent.
    expect(await run(tools(UID), "suggest_watch", { kind: "price_below", ticker: "NVDA", level: 140 })).toMatchObject({ status: "ready", existing: [] });
    // The same agent under another account does not count.
    expect(await run(tools(OTHER), "suggest_watch", { kind: "price_below", ticker: "NVDA", level: 150 })).toMatchObject({ status: "ready" });
  });

  it("a reminder before a report always has time to fire", async () => {
    // Today is 2026-11-11 in New York.
    state.nextEarnings = { event_date: "2026-11-13" };
    const close = await run(tools(UID), "suggest_watch", { kind: "earnings_before", ticker: "NVDA", days: 3 });
    expect(close).toMatchObject({ request: "Tell me 1 day before NVDA reports earnings" });
    expect(String(close.note)).toMatch(/reports in 2 days, so this reminds you the day before/);
    state.nextEarnings = { event_date: "2026-11-12" };
    const tomorrow = await run(tools(UID), "suggest_watch", { kind: "earnings_before", ticker: "NVDA", days: 3 });
    expect(tomorrow).toMatchObject({ request: "Tell me 3 days before NVDA reports earnings" });
    expect(String(tomorrow.note)).toMatch(/too close for a reminder/);
    state.nextEarnings = { event_date: "2026-11-30" };
    expect(await run(tools(UID), "suggest_watch", { kind: "earnings_before", ticker: "NVDA", days: 3 })).toMatchObject({ request: "Tell me 3 days before NVDA reports earnings" });
  });

  it("signed out still gets the filled-in request, with a note that saving takes an account", async () => {
    const card = await run(tools(null), "suggest_watch", { kind: "earnings_before", ticker: "NVDA" });
    expect(card).toMatchObject({ card: "watch", status: "ready" });
    expect(String(card.note)).toMatch(/free account/);
    expect(state.calls.some(([name]) => name === "listJobs")).toBe(false);
  });
});
