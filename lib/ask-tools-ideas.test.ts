import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ask's filing-change and idea-basket tools, with every store mocked. Made-up uids only; nothing here reads or writes a
 * real account. The baskets are keyed by uid the way the store keys them, so another person's id finds nothing.
 */

const UID = "test-uid-0001";
const OTHER = "test-uid-9999";

const state = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  filings: new Map<string, unknown>(),
  catalog: new Set<string>(["AMD", "NVDA", "MU", "TSM", "VRT", "ZZZQ"]),
  catalogDown: false,
  baskets: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  jobs: [] as Array<{ uid: string; enabled: boolean }>,
  coverage: new Set<string>(["NVDA", "MU", "TSM", "VRT", "AVGO", "AMD"]),
}));

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/filing-changes/server", () => ({
  getFilingChanges: async (ticker: string) => {
    state.calls.push(["getFilingChanges", ticker]);
    return (state.filings.get(ticker) as never) ?? null;
  },
}));
vi.mock("@/lib/instrument-resolver", () => ({
  resolveInstrumentByTicker: async (ticker: string) => {
    if (state.catalogDown) throw new Error("catalog down");
    return state.catalog.has(ticker) ? { ticker, instrument_id: `US_${ticker}`, name: ticker, market: "US" } : null;
  },
}));
vi.mock("@/lib/agent-jobs-data", () => ({
  listJobs: async (uid: string) => state.jobs.filter((job) => job.uid === uid),
}));
vi.mock("@/lib/basket-agent/count", () => ({
  runningBasketCount: async (uid: string) => state.baskets.filter((basket) => basket.uid === uid && basket.enabled === true).length,
}));
vi.mock("@/lib/basket-agent/data", () => ({
  listBaskets: async (uid: string) => {
    state.calls.push(["listBaskets", uid]);
    return state.baskets.filter((basket) => basket.uid === uid);
  },
  getBasket: async (uid: string, id: string) => {
    state.calls.push(["getBasket", uid, id]);
    return state.baskets.find((basket) => basket.uid === uid && basket.id === id) ?? null;
  },
  listBasketRuns: async (uid: string, basketId: string | null = null) => {
    state.calls.push(["listBasketRuns", uid, basketId]);
    return state.runs.filter((run) => run.uid === uid && (!basketId || run.basket_id === basketId));
  },
  basketsOverPlan: (list: Array<{ id: string; enabled: boolean; created_at: string }>, jobsRunning: number, limit: number) => {
    const room = Math.max(0, limit - jobsRunning);
    return new Set(list.filter((basket) => basket.enabled).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(room).map((basket) => basket.id));
  },
  quotesFor: async (tickers: string[]) => Object.fromEntries(tickers.filter((ticker) => ticker === "NVDA").map((ticker) => [ticker, { price: 190.17, dayPct: -1.2 }])),
  createBasket: async () => {
    throw new Error("Ask must never save a basket");
  },
  updateBasket: async () => {
    throw new Error("Ask must never edit a basket");
  },
}));
vi.mock("@/lib/screens", () => ({ getThematicScreens: async () => ({ screens: [] }) }));
vi.mock("@/lib/seo/family-data", () => ({
  getCoverage: async () => ({ bySymbol: new Map([...state.coverage].map((ticker) => [ticker, { name: `${ticker} Inc` }])) }),
}));

import type { Comparison } from "@/lib/filing-changes/diff";
import type { FilingChangesDoc } from "@/lib/filing-changes/store";
import { cardForModel, type FilingChangesCard, type IdeaBasketCard, type IdeaBasketsCard, type WatchIdeaCard } from "@/lib/ask-cards";
import { basketCard, basketOutlook, basketsCard, buildIdeaTools, filingChangesCard, watchIdeaCard, type IdeaToolContext } from "@/lib/ask-tools-ideas";
import { describeCard, planOffline } from "@/lib/ask-offline";
import { datedReason } from "@/lib/basket-agent/model";
import { fallbackWatch } from "@/lib/ask-pipeline";
import type { Viewer } from "@/lib/entitlements-server";

const NOW = new Date("2026-11-13T15:00:00Z");

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/edgar/data/2488/${filed}.htm`, headings: 42 },
    base: { form, accession: "acc-base", filed: form === "10-K" ? "2025-02-05" : "2026-08-05", period: null, url: "https://www.sec.gov/Archives/edgar/data/2488/base.htm", headings: 42 },
    added: [],
    dropped: [],
    reworded: [],
    same: 40,
    reason: null,
    ...patch,
  };
}

function doc(ticker: string, latest: Comparison, history: Comparison[] = []): FilingChangesDoc {
  return { version: 1, ticker, company: `${ticker} Inc`, cik: 1, latest, history, updated_at: NOW.toISOString(), source: "SEC EDGAR" };
}

// AMD as stored on Nov 13, 2026: the Nov 4 10-Q only rewords; the Feb 10-K added one risk and dropped three.
const AMD = doc(
  "AMD",
  comparison("10-Q", "2026-11-04", {
    reworded: [{ from: "Our ability to design new products includes the use of third-party IP.", to: "Our ability to design new products depends on the use of third-party IP.", score: 0.96 }],
  }),
  [
    comparison("10-K", "2026-02-04", {
      added: ["We may be required to satisfy financial obligations under guarantees."],
      dropped: ["The loss of a significant customer may harm us.", "Our worldwide operations are subject to political risks.", "We may not realize the benefits of the Xilinx acquisition."],
    }),
  ],
);

function viewer(uid: string, plan: Viewer["plan"]): Viewer {
  return { uid, signedIn: true, isSubscribed: plan === "pro", plan, tracked: [], covered: [], coverage: null, trialEligible: false };
}

const context = (uid: string | null, plan: Viewer["plan"] = "free"): IdeaToolContext => ({ uid, viewer: uid ? viewer(uid, plan) : null, now: NOW });

function basket(uid: string, id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    uid,
    name: "Test basket: AI capex",
    idea: "AI data centre spending keeps growing",
    source: { kind: "theme", slug: "ai-capex" },
    lines: [
      { ticker: "NVDA", company: "NVIDIA", kind: "growth", reason: "Sells the chips every AI data centre needs.", added_at: "2026-11-10T00:00:00Z" },
      { ticker: "MU", company: "Micron", kind: "growth", reason: "Memory demand grows with AI servers.", added_at: "2026-11-10T00:00:00Z" },
      { ticker: "VRT", company: "Vertiv", kind: "growth", reason: "Cools and powers the data centres.", added_at: "2026-11-10T00:00:00Z" },
    ],
    enabled: true,
    archived: false,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    last_checked_day: "2026-11-12",
    replay: { from: "2026-10-13", to: "2026-11-07", sessions: 20, days: [], proposals: [{ op: "drop", ticker: "MU", line: "x", first: "2026-10-20", days: 3 }], counts: { propose: 3, nothing: 17, could_not_check: 0 }, notes: [], replayed_at: "2026-11-10T00:00:00Z", tickers: ["NVDA", "MU", "VRT"] },
    dropped: [],
    version: 2,
    ...patch,
  };
}

function run(uid: string, basketId: string, day: string, patch: Record<string, unknown> = {}) {
  return {
    id: `${uid}__${basketId}__${day}`,
    uid,
    basket_id: basketId,
    basket_name: "Test basket: AI capex",
    day,
    ran_at: `${day}T22:00:00Z`,
    decision: "nothing",
    summary: "All three reasons still hold.",
    statuses: [
      { ticker: "NVDA", kind: "growth", verdict: "holds", line: "Revenue up 62% on the year.", signal: null, metric: { label: "Revenue growth", value: 62, text: "+62%", better: "higher" }, asOf: "2026-10-31" },
      { ticker: "MU", kind: "growth", verdict: "weaker", line: "Revenue growth slowed to 12% from 40%.", signal: null, metric: null, asOf: "2026-10-31" },
    ],
    changes: [],
    missing: [],
    ...patch,
  };
}

beforeEach(() => {
  state.calls.length = 0;
  state.filings.clear();
  state.catalogDown = false;
  state.baskets = [];
  state.runs = [];
  state.jobs = [];
});

describe("get_filing_changes", () => {
  it("shows the newest filing that added or dropped a risk, and says a newer one changed less", async () => {
    state.filings.set("AMD", AMD);
    const card = (await filingChangesCard("amd", NOW)) as FilingChangesCard;
    expect(card.card).toBe("filing_changes");
    expect(card.filing).toMatchObject({ form: "10-K", filed: "2026-02-04" });
    expect(card.filing.url).toMatch(/^https:\/\/www\.sec\.gov\//);
    expect(card.base).toMatchObject({ form: "10-K", filed: "2025-02-05" });
    expect(card.headline).toBe("AMD's 10-K filed Feb 4 added 1 risk and dropped 3 against its 10-K from Feb 5, 2025.");
    expect(card.added).toEqual(["We may be required to satisfy financial obligations under guarantees."]);
    expect(card.dropped).toHaveLength(3);
    expect(card.since?.line).toBe("Since then, its 10-Q filed Nov 4 adds no new risks.");
    expect(card.unread).toBeNull();
    expect(card).toMatchObject({ source: expect.stringContaining("SEC EDGAR"), as_of: "2026-11-04", source_url: "/stock/AMD#filing-changes" });
  });

  it("keeps what the model reads small: counts, then a few risks cut to a few dozen words", async () => {
    const long = Array.from({ length: 50 }, (_, index) => `word${index}`).join(" ");
    state.filings.set("NVDA", doc("NVDA", comparison("10-K", "2026-02-25", { added: Array.from({ length: 12 }, (_, index) => `${long} ${index}`) })));
    const card = (await filingChangesCard("NVDA", NOW)) as FilingChangesCard;
    expect(card.added).toHaveLength(12);
    const model = cardForModel(card) as { added: string[]; added_count: number };
    expect(model.added_count).toBe(12);
    expect(model.added).toHaveLength(8);
    expect(model.added[0]!.split(" ")).toHaveLength(30);
    expect(model.added[0]!.endsWith("…")).toBe(true);
  });

  it("tells an unknown ticker from a stock we have not compared", async () => {
    expect(await filingChangesCard("QQQQX", NOW)).toMatchObject({ card: "error", message: "QQQQX isn't a US stock in our catalog." });
    expect(await filingChangesCard("ZZZQ", NOW)).toMatchObject({ card: "error", message: expect.stringContaining("haven't compared ZZZQ's 10-K and 10-Q") });
    // A catalog that cannot be read never turns "not compared" into "not a stock".
    state.catalogDown = true;
    expect(await filingChangesCard("QQQQX", NOW)).toMatchObject({ card: "error", message: expect.stringContaining("haven't compared") });
    expect(await filingChangesCard("not a ticker!", NOW)).toMatchObject({ card: "error", message: "That does not look like a ticker." });
  });

  it("never reports a filing it could not read as a change", async () => {
    state.filings.set("MU", doc("MU", comparison("10-K", "2026-10-03", { status: "unreadable", reason: "few_headings_new", added: [], dropped: [] })));
    expect(await filingChangesCard("MU", NOW)).toMatchObject({ card: "error", message: expect.stringContaining("couldn't read the risk section of MU's 10-K filed Oct 3") });
    // An unreadable newest filing over a readable older one: the older one shows, and the card says the newer was not read.
    state.filings.set("TSM", doc("TSM", comparison("10-Q", "2026-11-06", { status: "unreadable", reason: "no_section" }), [comparison("10-K", "2026-04-20", { added: ["Taiwan risk."] })]));
    const card = (await filingChangesCard("TSM", NOW)) as FilingChangesCard;
    expect(card.filing.filed).toBe("2026-04-20");
    expect(card.unread).toMatchObject({ form: "10-Q", filed: "2026-11-06" });
    expect(card.as_of).toBe("2026-11-06");
  });

  it("is the same for every plan, signed out included (filings are never gated)", async () => {
    state.filings.set("AMD", AMD);
    const anon = await buildIdeaTools(context(null)).get_filing_changes!.execute!({ ticker: "AMD" }, { toolCallId: "a", messages: [] });
    const pro = await buildIdeaTools(context(UID, "pro")).get_filing_changes!.execute!({ ticker: "AMD" }, { toolCallId: "b", messages: [] });
    expect(anon).toEqual(pro);
    expect((anon as FilingChangesCard).card).toBe("filing_changes");
  });
});

describe("get_my_baskets and get_my_basket", () => {
  it("asks a signed-out person to sign in and reads nothing", async () => {
    expect(await basketsCard(context(null))).toMatchObject({ card: "sign_in" });
    expect(await basketCard(context(null), { basket_id: "d237b01a117f" })).toMatchObject({ card: "sign_in" });
    expect(state.calls).toEqual([]);
  });

  it("lists the person's baskets with counts, the companies that need a look and the latest decision", async () => {
    state.baskets = [basket(UID, "d237b01a117f"), basket(OTHER, "aaaaaa111111", { name: "Someone else's" })];
    state.runs = [run(UID, "d237b01a117f", "2026-11-12"), run(UID, "d237b01a117f", "2026-11-11"), run(OTHER, "aaaaaa111111", "2026-11-12")];
    const card = (await basketsCard(context(UID))) as IdeaBasketsCard;
    expect(card.total).toBe(1);
    expect(card.rows[0]).toMatchObject({
      id: "d237b01a117f",
      counts: { holds: 1, weaker: 1, broken: 0, played_out: 0, unknown: 1 },
      needs_look: [{ ticker: "MU", verdict: "weaker", verdict_words: "Weaker", line: "Revenue growth slowed to 12% from 40%." }],
      latest: { day: "2026-11-12", decision_words: "Nothing to change" },
      href: "/agents/baskets/d237b01a117f",
    });
    expect(card.as_of).toBe("2026-11-12");
    expect(state.calls.every((call) => call[1] === UID)).toBe(true);
  });

  it("opens one basket in full, worst reason first, with prices and only the changes that still apply", async () => {
    state.baskets = [basket(UID, "d237b01a117f")];
    state.runs = [
      run(UID, "d237b01a117f", "2026-11-12", {
        decision: "propose",
        summary: "Drop MU: its growth reason is weaker.",
        changes: [
          { op: "drop", ticker: "MU", company: "Micron", kind: "growth", line: "Revenue growth slowed to 12%.", since: "2026-11-11" },
          // Already accepted: TSM is not in the basket to drop.
          { op: "drop", ticker: "TSM", company: "TSMC", kind: "growth", line: "Gone." },
        ],
      }),
      run(UID, "d237b01a117f", "2026-11-11"),
    ];
    const card = (await basketCard(context(UID), { basket_id: "D237B01A117F" })) as IdeaBasketCard;
    expect(card.card).toBe("idea_basket");
    expect(card.companies.map((company) => company.ticker)).toEqual(["MU", "VRT", "NVDA"]);
    expect(card.companies.find((company) => company.ticker === "NVDA")).toMatchObject({ verdict_words: "Holds", figure: "Revenue growth +62%", price: 190.17, day_change_pct: -1.2 });
    expect(card.companies.find((company) => company.ticker === "VRT")).toMatchObject({ verdict: "unknown", verdict_words: "Not checked", line: null, price: null });
    expect(card.latest?.changes).toEqual([{ op: "drop", ticker: "MU", company: "Micron", line: "Revenue growth slowed to 12%.", since: "2026-11-11" }]);
    expect(card.recent).toEqual([{ day: "2026-11-11", decision_words: "Nothing to change", summary: "All three reasons still hold." }]);
    expect(card.replay).toMatchObject({ sessions: 20, proposals: 1, earlier: false });
    // The person's own reasons stay on the page; the model reads the verdicts.
    expect(JSON.stringify(cardForModel(card))).not.toContain("Sells the chips");
  });

  it("finds a basket by its name among the person's own only", async () => {
    state.baskets = [basket(UID, "d237b01a117f"), basket(OTHER, "aaaaaa111111", { name: "Grid power" })];
    expect(await basketCard(context(UID), { name: "ai capex" })).toMatchObject({ card: "idea_basket", id: "d237b01a117f" });
    expect(await basketCard(context(UID), { name: "Grid power" })).toMatchObject({ card: "error", message: expect.stringContaining('no idea basket called "Grid power"') });
  });

  it("finds nothing for another person's basket id, or an id that is not one", async () => {
    state.baskets = [basket(OTHER, "aaaaaa111111")];
    state.runs = [run(OTHER, "aaaaaa111111", "2026-11-12")];
    expect(await basketCard(context(UID), { basket_id: "aaaaaa111111" })).toMatchObject({ card: "error", message: expect.stringContaining("no idea basket with that id") });
    expect(await basketCard(context(UID), { basket_id: "../../x" })).toMatchObject({ card: "error" });
    expect(state.calls.filter((call) => call[0] === "getBasket")).toEqual([["getBasket", UID, "aaaaaa111111"]]);
  });

  it("says when the plan leaves a switched-on basket out", async () => {
    state.baskets = [basket(UID, "d237b01a117f")];
    state.jobs = [{ uid: UID, enabled: true }, { uid: UID, enabled: true }];
    const free = (await basketsCard(context(UID, "free"))) as IdeaBasketsCard;
    expect(free.rows[0]!.paused_by_plan).toBe(true);
    const pro = (await basketsCard(context(UID, "pro"))) as IdeaBasketsCard;
    expect(pro.rows[0]!.paused_by_plan).toBe(false);
  });
});

describe("watch_idea", () => {
  const IDEA = { idea: "AI data centre spending keeps growing", tickers: ["NVDA", "MU", "VRT", "FAKEX"], reasons: [{ ticker: "VRT", reason: "Cools and powers the data centres." }] };

  it("drafts the basket the editor opens with and links there, saving nothing", async () => {
    const card = (await watchIdeaCard(context(UID, "pro"), IDEA)) as WatchIdeaCard;
    expect(card).toMatchObject({ card: "watch_idea", status: "ready", left_out: ["FAKEX"], signed_in: true, outlook: null, existing: null });
    expect(card.lines.map((line) => line.ticker)).toEqual(["NVDA", "MU", "VRT"]);
    expect(card.href).toBe(`/agents/baskets/new?idea=${encodeURIComponent(IDEA.idea)}&tickers=${encodeURIComponent("NVDA,MU,VRT")}`);
    expect(card.lines.every((line) => line.reason.length > 0)).toBe(true);
    expect(card.source).toContain("Nothing is saved");
    expect(cardForModel(card)).toMatchObject({ tickers: ["NVDA", "MU", "VRT"] });
  });

  it("states the plan's running limit before anything is saved", async () => {
    state.baskets = [basket(UID, "d237b01a117f", { lines: [{ ticker: "AVGO", company: "Broadcom", kind: "growth", reason: "x", added_at: "" }, { ticker: "TSM", company: "TSMC", kind: "growth", reason: "x", added_at: "" }] })];
    state.jobs = [{ uid: UID, enabled: true }];
    const free = (await watchIdeaCard(context(UID, "free"), IDEA)) as WatchIdeaCard;
    expect(free.outlook).toMatchObject({ kind: "paused", line: expect.stringContaining("so this basket would be saved paused") });
    const pro = (await watchIdeaCard(context(UID, "pro"), IDEA)) as WatchIdeaCard;
    expect(pro.outlook).toBeNull();
    expect(basketOutlook({ saved: 20, running: 0, plan: "pro" })).toMatchObject({ kind: "full" });
    expect(basketOutlook({ saved: 3, running: 1, plan: "free" })).toBeNull();
  });

  it("points at the basket the person already has on the same companies", async () => {
    state.baskets = [basket(UID, "d237b01a117f")];
    const card = (await watchIdeaCard(context(UID), { idea: "AI spending", tickers: ["VRT", "NVDA", "MU"] })) as WatchIdeaCard;
    expect(card).toMatchObject({ status: "already", existing: { id: "d237b01a117f", href: "/agents/baskets/d237b01a117f" } });
    // Someone else's basket on the same companies is not theirs.
    state.baskets = [basket(OTHER, "aaaaaa111111")];
    expect(((await watchIdeaCard(context(UID), { idea: "AI spending", tickers: ["VRT", "NVDA", "MU"] })) as WatchIdeaCard).status).toBe("ready");
  });

  it("never takes a thesis over holdings for an idea basket, by name or as 'already watching'", async () => {
    state.baskets = [basket(UID, "aaaaaa111111", { name: "AI capex thesis", source: { kind: "holdings" } })];
    expect(await basketCard(context(UID), { name: "AI capex thesis" })).toMatchObject({ card: "error", message: expect.stringContaining("no idea basket called") });
    const card = (await watchIdeaCard(context(UID), { idea: "AI spending", tickers: ["VRT", "NVDA", "MU"] })) as WatchIdeaCard;
    expect(card.status).toBe("ready");
  });

  it("dates a reason's bare 'today', never a 'today's' that means our time", () => {
    expect(datedReason("NVIDIA sells the chips that power today’s AI data centers.", "Nov 12")).toBe("NVIDIA sells the chips that power today’s AI data centers.");
    expect(datedReason("It passes the \"Momentum\" screen today: up 30%.", "Nov 12")).toBe("It passed the \"Momentum\" screen on Nov 12: up 30%.");
    expect(datedReason("Its shares hit a high today.", "Nov 12")).toBe("Its shares hit a high on Nov 12.");
  });

  it("works signed out, and refuses a basket we could not check", async () => {
    const card = (await watchIdeaCard(context(null), IDEA)) as WatchIdeaCard;
    expect(card).toMatchObject({ card: "watch_idea", signed_in: false, outlook: null });
    expect(await watchIdeaCard(context(UID), { idea: "x y z", tickers: ["NVDA"] })).toMatchObject({ card: "error" });
    expect(await watchIdeaCard(context(UID), { idea: "Odd ones", tickers: ["NVDA", "FAKEX", "FAKEY"] })).toMatchObject({ card: "error", message: expect.stringContaining("FAKEX and FAKEY") });
  });
});

describe("the offline path", () => {
  it("routes the questions to the new tools", () => {
    expect(planOffline("What did AMD add to its risks?")).toEqual([{ tool: "get_filing_changes", input: { ticker: "AMD" } }]);
    expect(planOffline("What new risks are in NVDA's 10-K?")).toEqual([{ tool: "get_filing_changes", input: { ticker: "NVDA" } }]);
    expect(planOffline("Did AMD's latest 10-Q change its risk factors?")).toEqual([{ tool: "get_filing_changes", input: { ticker: "AMD" } }]);
    // A filing's figures are a stock question, not a risks question.
    expect(planOffline("What was AMD revenue in its latest 10-K?")[0]?.tool).toBe("get_stock");
    expect(planOffline("What were NVDA's margins in the last 10-Q?").some((call) => call.tool === "get_filing_changes")).toBe(false);
    expect(planOffline("How are my idea baskets doing?")).toEqual([{ tool: "get_my_baskets", input: {} }]);
    expect(planOffline("What did AMD change in its risks?")).toEqual([{ tool: "get_filing_changes", input: { ticker: "AMD" } }]);
    // A question about a stock that only mentions risks in passing stays a stock question.
    expect(planOffline("What changed for NVDA and what are the risks?")[0]?.tool).toBe("get_stock");
    // A basket of an idea is still build_basket.
    expect(planOffline("Build me a basket of uranium miners")[0]?.tool).toBe("build_basket");
  });

  it("writes each new card as a plain sentence from its own figures", async () => {
    state.filings.set("AMD", AMD);
    const filing = await filingChangesCard("AMD", NOW);
    expect(describeCard(filing)).toContain("AMD's 10-K filed Feb 4 added 1 risk and dropped 3");
    expect(describeCard(filing)).toContain("“We may be required to satisfy financial obligations under guarantees.”");
    state.baskets = [basket(UID, "d237b01a117f")];
    state.runs = [run(UID, "d237b01a117f", "2026-11-12")];
    expect(describeCard(await basketsCard(context(UID)))).toBe("You have 1 idea basket: “Test basket: AI capex”. Needs a look: MU in “Test basket: AI capex” (weaker).");
    expect(describeCard(await basketCard(context(UID), { basket_id: "d237b01a117f" }))).toBe("“Test basket: AI capex”: 1 of 2 reasons hold. The check on Nov 12, 2026: All three reasons still hold.");
    expect(describeCard(await watchIdeaCard(context(UID), { idea: "AI spending", tickers: ["NVDA", "MU"] }))).toContain("Nothing is saved yet");
  });

  it("offers an agent on the company's next big filing after a filing answer", async () => {
    state.filings.set("AMD", AMD);
    const card = await filingChangesCard("AMD", NOW);
    expect(fallbackWatch("AMD added one risk in its 10-K.", [card], NOW)).toEqual({ kind: "sec_filing", ticker: "AMD", filing: "big" });
  });
});
