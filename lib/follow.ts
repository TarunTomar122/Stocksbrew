import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  normalizeFollowed,
  type CongressProfile,
  type FollowActivity,
  type FollowSource,
  type FundProfile,
  type InsiderCluster,
  type InsiderMeta,
  type InsiderTrade,
} from "@/lib/follow-shared";

import { buildFollowRead, type CongressTradeLite, type FollowRead, type FundDigest, type FundMove, type SectorMap } from "@/lib/follow-insights";

export * from "@/lib/follow-shared";

/**
 * Loaders for the Follow surface. Everything is written by the jobs in
 * `backend/agentdata` (funds_13f.py, house_ptr.py, insiders_form4.py) and
 * only changes when they run, so ten minutes of cache is plenty.
 */
const REVALIDATE = 600;

export type FollowMeta = {
  funds: {
    generated_at: string;
    funds: number;
    filings: number;
    quarters: number;
    with_performance: number;
    since_period: string;
    source: string;
  } | null;
  congress: {
    generated_at: string;
    years: number[];
    members: number;
    members_with_record: number;
    trades: number;
    reports_in_index: number;
    paper_filings_skipped: number;
    source: string;
    senate_note: string;
  } | null;
};

async function loadSources(): Promise<FollowSource[]> {
  const snap = await adminFirestore
    .collection("tm_follow_sources")
    .limit(1000)
    .get();
  return snap.docs
    .map((doc) => doc.data() as FollowSource)
    .filter(
      (source) =>
        source &&
        typeof source.slug === "string" &&
        (source.kind === "fund" || source.kind === "congress"),
    );
}

export const getFollowSources = unstable_cache(
  loadSources,
  ["follow-sources-v1"],
  { revalidate: REVALIDATE },
);

async function loadActivity(limit: number): Promise<FollowActivity[]> {
  const snap = await adminFirestore
    .collection("tm_follow_activity")
    .orderBy("date", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((doc) => doc.data() as FollowActivity)
    .filter((item) => item && item.source_id && item.date);
}

export const getFollowActivity = (limit = 60) =>
  unstable_cache(
    () => loadActivity(limit),
    ["follow-activity-v1", String(limit)],
    { revalidate: REVALIDATE },
  )();

async function loadSourceActivity(slug: string): Promise<FollowActivity[]> {
  const snap = await adminFirestore
    .collection("tm_follow_activity")
    .where("source_id", "==", slug)
    .limit(40)
    .get();
  return snap.docs
    .map((doc) => doc.data() as FollowActivity)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export const getSourceActivity = (slug: string) =>
  unstable_cache(
    () => loadSourceActivity(slug),
    ["follow-source-activity-v1", slug],
    { revalidate: REVALIDATE },
  )();

async function loadMeta(): Promise<FollowMeta> {
  const [funds, congress] = await Promise.all([
    adminFirestore.collection("tm_follow_meta").doc("funds").get(),
    adminFirestore.collection("tm_follow_meta").doc("congress").get(),
  ]);
  return {
    funds: funds.exists ? (funds.data() as FollowMeta["funds"]) : null,
    congress: congress.exists
      ? (congress.data() as FollowMeta["congress"])
      : null,
  };
}

export const getFollowMeta = unstable_cache(loadMeta, ["follow-meta-v1"], {
  revalidate: REVALIDATE,
});

async function loadProfile(
  slug: string,
): Promise<FundProfile | CongressProfile | null> {
  const fund = await adminFirestore
    .collection("tm_fund_profiles")
    .doc(slug)
    .get();
  if (fund.exists) return { ...(fund.data() as FundProfile), kind: "fund" };
  const person = await adminFirestore
    .collection("tm_follow_people")
    .doc(slug)
    .get();
  if (person.exists)
    return { ...(person.data() as CongressProfile), kind: "congress" };
  return null;
}

export const getFollowProfile = (slug: string) =>
  unstable_cache(() => loadProfile(slug), ["follow-profile-v1", slug], {
    revalidate: REVALIDATE,
  })();

/** Only the fields the pages show, so a couple of thousand rows stay well under the cache entry limit. */
function slimTrade(raw: Record<string, unknown>): InsiderTrade {
  const text = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const num = (key: string) =>
    typeof raw[key] === "number" && Number.isFinite(raw[key] as number)
      ? (raw[key] as number)
      : null;
  return {
    id: text("id"),
    symbol: text("symbol"),
    company: text("company"),
    insider: text("insider"),
    insider_id: text("insider_id"),
    role: text("role"),
    tx_type: raw.tx_type === "buy" ? "buy" : "sell",
    shares: num("shares") ?? 0,
    price: num("price"),
    value: num("value"),
    transaction_date: text("transaction_date"),
    filing_date: text("filing_date"),
    filed_at: text("filed_at"),
    lag_days: num("lag_days"),
    shares_after: num("shares_after"),
    ownership: text("ownership"),
    plan_10b5_1: raw.plan_10b5_1 === true,
    url: text("url"),
  };
}

async function loadInsiderTrades(limit: number): Promise<InsiderTrade[]> {
  const snap = await adminFirestore
    .collection("tm_insider_trades")
    .orderBy("filed_at", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((doc) => slimTrade(doc.data() as Record<string, unknown>))
    .filter((trade) => trade.id && trade.symbol);
}

export const getInsiderTrades = (limit = 1500) =>
  unstable_cache(
    () => loadInsiderTrades(limit),
    ["insider-trades-v3", String(limit)],
    { revalidate: REVALIDATE },
  )();

async function loadInsiderBuys(limit: number): Promise<InsiderTrade[]> {
  const snap = await adminFirestore
    .collection("tm_insider_trades")
    .where("tx_type", "==", "buy")
    .orderBy("filed_at", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((doc) => slimTrade(doc.data() as Record<string, unknown>))
    .filter((trade) => trade.id && trade.symbol);
}

/** Buys are rare next to sales, so they get their own query rather than a slice of the mixed list. */
export const getInsiderBuys = (limit = 400) =>
  unstable_cache(
    () => loadInsiderBuys(limit),
    ["insider-buys-v3", String(limit)],
    { revalidate: REVALIDATE },
  )();

async function loadSymbolInsiderTrades(
  symbol: string,
): Promise<InsiderTrade[]> {
  const snap = await adminFirestore
    .collection("tm_insider_trades")
    .where("symbol", "==", symbol)
    .limit(200)
    .get();
  return snap.docs
    .map((doc) => slimTrade(doc.data() as Record<string, unknown>))
    .sort((a, b) => (a.filed_at < b.filed_at ? 1 : -1));
}

/** Open-market insider trades for one stock, newest first. For the stock page. */
export const getInsiderTradesForSymbol = (symbol: string) =>
  unstable_cache(
    () => loadSymbolInsiderTrades(symbol.toUpperCase()),
    ["insider-symbol-v3", symbol.toUpperCase()],
    {
      revalidate: REVALIDATE,
    },
  )();

async function loadInsiderSummary(): Promise<{
  clusters: InsiderCluster[];
  meta: InsiderMeta | null;
}> {
  const [clusters, run] = await Promise.all([
    adminFirestore.collection("tm_insider_meta").doc("clusters").get(),
    adminFirestore.collection("tm_insider_meta").doc("run").get(),
  ]);
  const list = clusters.exists
    ? ((clusters.data() as { clusters?: InsiderCluster[] }).clusters ?? [])
    : [];
  return {
    clusters: Array.isArray(list) ? list : [],
    meta: run.exists ? (run.data() as InsiderMeta) : null,
  };
}

export const getInsiderSummary = unstable_cache(
  loadInsiderSummary,
  ["insider-summary-v3"],
  { revalidate: REVALIDATE },
);

/** The sources a signed-in person follows. Never cached: it is theirs and it changes on a click. */
export async function getFollowedSources(
  uid: string | null | undefined,
): Promise<string[]> {
  if (!uid) return [];
  try {
    const snap = await adminFirestore.collection("users").doc(uid).get();
    if (!snap.exists) return [];
    return normalizeFollowed(
      (snap.data() as { followedSources?: unknown }).followedSources,
    );
  } catch {
    return [];
  }
}

// ── the read: inputs for lib/follow-insights.ts ─────────────────────────────

type ChangeRow = { ticker?: string | null; name?: string | null; weight?: number | null; prev_weight?: number | null };

function moves(list: unknown, useWeight: "weight" | "prev_weight" = "weight"): FundMove[] {
  if (!Array.isArray(list)) return [];
  return (list as ChangeRow[])
    .filter((row) => row && typeof row.ticker === "string" && row.ticker)
    .map((row) => ({
      ticker: row.ticker as string,
      name: typeof row.name === "string" ? row.name : null,
      weight: typeof row[useWeight] === "number" ? (row[useWeight] as number) : null,
    }));
}

async function loadFundDigests(): Promise<FundDigest[]> {
  // The profiles are large (full portfolios and record curves); read only what the tally needs.
  // The LocalDB adapter takes the field list as one array, unlike Firebase's spread arguments.
  const query = adminFirestore.collection("tm_fund_profiles").limit(500) as unknown as {
    select(fields: string[]): { get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }> };
  };
  const snap = await query.select(["slug", "fund", "active", "latest.period", "latest.filed_at", "changes"]).get();
  const out: FundDigest[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as {
      slug?: string;
      fund?: string;
      active?: boolean;
      latest?: { period?: string; filed_at?: string };
      changes?: Record<string, unknown> | null;
    };
    if (!data?.changes || !data.latest?.period || data.active === false) continue;
    out.push({
      slug: data.slug || doc.id,
      name: data.fund || doc.id,
      period: data.latest.period,
      filed_at: data.latest.filed_at ?? "",
      opened: moves(data.changes.new),
      added: moves(data.changes.added),
      reduced: moves(data.changes.reduced),
      exited: moves(data.changes.sold, "prev_weight"),
    });
  }
  return out;
}

/** Each followed fund's latest 13F reduced to the tickers it moved. */
export const getFundDigests = unstable_cache(loadFundDigests, ["follow-fund-digests-v1"], { revalidate: REVALIDATE });

async function loadRecentCongressTrades(since: string): Promise<CongressTradeLite[]> {
  const snap = await adminFirestore.collection("tm_follow_trades").where("disclosure_date", ">=", since).limit(5000).get();
  return snap.docs
    .map((doc) => doc.data() as Partial<CongressTradeLite>)
    .filter((trade) => typeof trade.ticker === "string" && trade.ticker && typeof trade.disclosure_date === "string")
    .map((trade) => ({
      ticker: trade.ticker as string,
      company: trade.company ?? "",
      person_id: trade.person_id ?? "",
      person_name: trade.person_name ?? "",
      tx_type: trade.tx_type === "buy" ? "buy" : "sell",
      disclosure_date: trade.disclosure_date as string,
    }));
}

/** House trades reported in the last `days` days, for the read. */
export function getRecentCongressTrades(days = 30, today: string = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  const since = start.toISOString().slice(0, 10);
  return unstable_cache(() => loadRecentCongressTrades(since), ["follow-congress-recent-v1", since], { revalidate: REVALIDATE })();
}

/** ticker -> sector from the screener snapshot, for grouping trades by industry. */
export async function getSectorMap(): Promise<SectorMap> {
  // Loaded on first use: the screener module uses React's request cache, which plain Node tests (the sitemap's) do not have.
  const snapshot = await import("@/lib/screener").then((mod) => mod.getScreenerSnapshot()).catch(() => null);
  const out: SectorMap = {};
  for (const row of snapshot?.rows ?? []) if (row.sector) out[row.symbol] = row.sector;
  return out;
}

/** Everything the Follow read needs, read in parallel; a failed read leaves its insight out. */
export async function getFollowRead(mine: string[] = []): Promise<FollowRead> {
  const today = new Date().toISOString().slice(0, 10);
  const [digests, congress, buys, sources, sectors] = await Promise.all([
    getFundDigests().catch(() => [] as FundDigest[]),
    getRecentCongressTrades(30, today).catch(() => [] as CongressTradeLite[]),
    getInsiderBuys(500).catch(() => [] as InsiderTrade[]),
    getFollowSources().catch(() => [] as FollowSource[]),
    getSectorMap(),
  ]);
  return buildFollowRead({
    digests,
    totalFunds: sources.filter((source) => source.kind === "fund").length,
    congress,
    insiderBuys: buys,
    sectors,
    today,
    mine,
  });
}
