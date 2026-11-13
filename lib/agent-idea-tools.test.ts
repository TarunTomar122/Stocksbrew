import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The agent tools (MCP, REST, CLI) over filing changes and idea baskets, with every store mocked. Made-up uids only.
 * Scope first, then the allowance, then the reader with the token's own uid, whatever the arguments say.
 */

const UID = "owner-uid";
const OTHER = "someone-else";

const state = vi.hoisted(() => ({
  filings: new Map<string, unknown>(),
  catalog: new Set<string>(["AMD", "ZZZQ"]),
  baskets: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  failBaskets: false,
}));

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/watchlist", () => ({ getUserDoc: vi.fn(), resolveIsSubscribed: vi.fn() }));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/agent-quota", () => ({
  AgentQuotaError: class AgentQuotaError extends Error {},
  consumeAgentQuota: vi.fn(async () => ({ used: 1, remaining: 199, limit: 200, period: "day" })),
}));
vi.mock("@/lib/agent-feature-tools", () => ({}));
vi.mock("@/lib/filing-changes/server", () => ({ getFilingChanges: async (ticker: string) => (state.filings.get(ticker) as never) ?? null }));
vi.mock("@/lib/instrument-resolver", () => ({
  resolveInstrumentByTicker: async (ticker: string) => (state.catalog.has(ticker) ? { ticker, instrument_id: `US_${ticker}`, name: ticker, market: "US" } : null),
  getInstrumentLabels: async () => new Map(),
}));
vi.mock("@/lib/agent-jobs-data", () => ({ listJobs: async () => [] }));
vi.mock("@/lib/basket-agent/data", () => ({
  listBaskets: async (uid: string) => {
    if (state.failBaskets) throw new Error("store down");
    return state.baskets.filter((basket) => basket.uid === uid);
  },
  getBasket: async (uid: string, id: string) => state.baskets.find((basket) => basket.uid === uid && basket.id === id) ?? null,
  listBasketRuns: async (uid: string, basketId: string | null = null) => state.runs.filter((run) => run.uid === uid && (!basketId || run.basket_id === basketId)),
  basketsOverPlan: () => new Set<string>(),
}));

import type { AgentPrincipal } from "@/lib/agent-auth";
import { getAgentBasket, getAgentFilingChanges, listAgentBaskets } from "@/lib/agent-idea-tools";
import { executeAgentTool } from "@/lib/agent-intelligence";
import { consumeAgentQuota } from "@/lib/agent-quota";
import type { Comparison } from "@/lib/filing-changes/diff";

function principal(scopes: AgentPrincipal["scopes"]): AgentPrincipal {
  return { uid: UID, tokenId: "t", kind: "personal", scopes, label: "test", clientId: null };
}

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/${filed}.htm`, headings: 42 },
    base: { form, accession: "acc-base", filed: "2025-02-05", period: null, url: "https://www.sec.gov/Archives/base.htm", headings: 42 },
    added: [],
    dropped: [],
    reworded: [],
    same: 40,
    reason: null,
    ...patch,
  };
}

const doc = (ticker: string, latest: Comparison, history: Comparison[] = []) => ({ version: 1, ticker, company: `${ticker} Inc`, cik: 1, latest, history, updated_at: "2026-11-13T01:00:00Z", source: "SEC EDGAR" });

function basket(uid: string, id: string) {
  return {
    id,
    uid,
    name: "AI capex",
    idea: "AI spending keeps growing",
    source: { kind: "own" },
    lines: [
      { ticker: "NVDA", company: "NVIDIA", kind: "growth", reason: "Sells the chips.", added_at: "2026-11-10T00:00:00Z" },
      { ticker: "MU", company: "Micron", kind: "growth", reason: "Memory demand.", added_at: "2026-11-10T00:00:00Z" },
    ],
    enabled: true,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    last_checked_day: "2026-11-12",
    replay: null,
    dropped: [],
    version: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.filings.clear();
  state.baskets = [];
  state.runs = [];
  state.failBaskets = false;
});

describe("get_filing_changes", () => {
  it("returns the comparison with both filings, the risks as filed and the link", async () => {
    state.filings.set("AMD", doc("AMD", comparison("10-Q", "2026-11-04"), [comparison("10-K", "2026-02-04", { added: ["New risk."], dropped: ["Old risk."] })]));
    const out = await getAgentFilingChanges({ ticker: "amd" });
    expect(out).toMatchObject({
      data_status: "available",
      ticker: "AMD",
      filing: { form: "10-K", filed: "2026-02-04" },
      compared_with: { form: "10-K", filed: "2025-02-05" },
      added: ["New risk."],
      dropped: ["Old risk."],
      since: { filing: { form: "10-Q", filed: "2026-11-04" } },
      as_of: "2026-11-04",
      source: { name: "SEC EDGAR" },
    });
    expect(String(out.link)).toMatch(/\/stock\/AMD#filing-changes$/);
    expect(out).toMatchObject({ summary: expect.stringContaining("added 1 risk and dropped 1") });
  });

  it("refuses an unknown ticker, and says so when there is no comparison or it could not be read", async () => {
    await expect(getAgentFilingChanges({ ticker: "QQQQX" })).rejects.toMatchObject({ code: "stock_not_found", status: 404 });
    await expect(getAgentFilingChanges({ ticker: "" })).rejects.toMatchObject({ code: "invalid_ticker", status: 400 });
    await expect(getAgentFilingChanges({ ticker: "NOT A TICKER" })).rejects.toMatchObject({ code: "stock_not_found" });
    expect(await getAgentFilingChanges({ ticker: "ZZZQ" })).toMatchObject({ data_status: "no_comparison", ticker: "ZZZQ" });
    state.filings.set("ZZZQ", doc("ZZZQ", comparison("10-K", "2026-10-03", { status: "unreadable", reason: "no_section" })));
    const unreadable = await getAgentFilingChanges({ ticker: "ZZZQ" });
    expect(unreadable).toMatchObject({ data_status: "unreadable", filing: { form: "10-K", filed: "2026-10-03" } });
    expect(unreadable).not.toHaveProperty("added");
  });
});

describe("list_baskets and get_basket", () => {
  it("lists only the token owner's baskets", async () => {
    state.baskets = [basket(UID, "d237b01a117f"), basket(OTHER, "aaaaaa111111")];
    state.runs = [{ uid: UID, basket_id: "d237b01a117f", day: "2026-11-12", ran_at: "", decision: "nothing", summary: "Both hold.", statuses: [], changes: [], missing: [] }];
    const out = await listAgentBaskets(UID);
    expect(out).toMatchObject({ data_status: "available", count: 1, as_of: "2026-11-12" });
    expect((out.baskets as Array<{ id: string; link: string }>).map((entry) => entry.id)).toEqual(["d237b01a117f"]);
    expect((out.baskets as Array<{ link: string }>)[0]!.link).toMatch(/\/agents\/baskets\/d237b01a117f$/);
    expect(await listAgentBaskets("nobody")).toMatchObject({ data_status: "no_baskets", count: 0, baskets: [] });
  });

  it("finds nothing for another account's basket id", async () => {
    state.baskets = [basket(OTHER, "aaaaaa111111"), basket(UID, "d237b01a117f")];
    await expect(getAgentBasket(UID, { basket_id: "aaaaaa111111" })).rejects.toMatchObject({ code: "basket_not_found", status: 404 });
    await expect(getAgentBasket(UID, { basket_id: "../etc" })).rejects.toMatchObject({ code: "basket_not_found", status: 404 });
    await expect(getAgentBasket(UID, { basket_id: " " })).rejects.toMatchObject({ code: "invalid_basket_id", status: 400 });
    expect(await getAgentBasket(UID, { basket_id: "d237b01a117f" })).toMatchObject({ data_status: "available", basket: { id: "d237b01a117f", name: "AI capex" } });
  });

  it("says the store failed rather than that there are no baskets", async () => {
    state.failBaskets = true;
    await expect(listAgentBaskets(UID)).rejects.toMatchObject({ code: "baskets_unavailable", status: 503 });
  });
});

describe("the dispatcher", () => {
  it("puts get_filing_changes under stocks:read and the baskets under radar:read, checked before counting a call", async () => {
    await expect(executeAgentTool(principal(["market:read"]), "get_filing_changes", { ticker: "AMD" })).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(executeAgentTool(principal(["stocks:read"]), "list_baskets", {})).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(executeAgentTool(principal(["stocks:read"]), "get_basket", { basket_id: "d237b01a117f" })).rejects.toMatchObject({ code: "insufficient_scope" });
    expect(consumeAgentQuota).not.toHaveBeenCalled();
  });

  it("reads the token owner's baskets, whatever uid the arguments carry", async () => {
    state.baskets = [basket(OTHER, "aaaaaa111111")];
    const out = await executeAgentTool(principal(["radar:read"]), "list_baskets", { uid: OTHER });
    expect(out).toMatchObject({ count: 0, usage: { limit: 200 } });
    await expect(executeAgentTool(principal(["radar:read"]), "get_basket", { basket_id: "aaaaaa111111", uid: OTHER })).rejects.toMatchObject({ code: "basket_not_found" });
    state.filings.set("AMD", doc("AMD", comparison("10-K", "2026-02-04", { added: ["New risk."] })));
    expect(await executeAgentTool(principal(["stocks:read"]), "get_filing_changes", { ticker: "AMD" })).toMatchObject({ data_status: "available", usage: { limit: 200 } });
  });
});
