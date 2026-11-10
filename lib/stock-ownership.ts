/**
 * "Who is buying and selling" for the stock page.
 *
 * - Followed funds: `tm_fund_holders/{TICKER}`, a per-ticker index that
 *   `backend/agentdata/fund_holders.py` builds from the 13F profiles.
 * - Insiders (Form 4): `tm_insider_trades` through `lib/follow.ts`. Until the
 *   Form 4 job has written its run record, `insiders` is null and the page
 *   says we do not have them.
 * - Congress: read separately through `getStockCongressTrades`.
 *
 * `null` means "we do not have this data", an empty list means "we looked and
 * found nothing". The page words the two differently.
 */

import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getInsiderSummary, getInsiderTradesForSymbol } from "@/lib/follow";
import type { InsiderTrade } from "@/lib/follow-shared";

export type FundPositionRow = {
  slug: string;
  fund: string;
  manager: string;
  /** Page on the Follow surface. */
  href: string;
  shares: number | null;
  valueUsd: number | null;
  /** Share of the fund's reported stock portfolio, 0 to 100. */
  portfolioPct: number | null;
  /** Position rank inside the fund's portfolio, 1 is the largest. */
  rank: number | null;
  /** Change in shares against the prior quarter's filing, in percent. null when new or unknown. */
  changePct: number | null;
  action: "new" | "added" | "trimmed" | "held" | null;
  /** Quarter the 13F reports on, ISO date. */
  reportDate: string;
  quarter: string;
  /** When the 13F was filed with the SEC, ISO date. */
  filedDate: string | null;
  heldSince: string | null;
  sourceUrl: string | null;
};

export type FundExitRow = {
  slug: string;
  fund: string;
  manager: string;
  href: string;
  /** Share of the portfolio in the quarter before the exit, 0 to 100. */
  prevPortfolioPct: number | null;
  reportDate: string;
  quarter: string;
  filedDate: string | null;
};

export type InsiderTradeRow = {
  id: string;
  insider: string;
  role: string | null;
  action: "buy" | "sell";
  shares: number | null;
  price: number | null;
  valueUsd: number | null;
  /** ISO date the trade happened. */
  transactionDate: string;
  /** ISO date the Form 4 was filed. */
  filedDate: string | null;
  /** Sold or bought under a pre-arranged 10b5-1 plan. */
  planned: boolean;
  sourceUrl: string | null;
};

export type StockOwnership = {
  funds: {
    rows: FundPositionRow[];
    exits: FundExitRow[];
    holderCount: number;
    asOf: string | null;
    source: string;
  } | null;
  insiders: { rows: InsiderTradeRow[]; asOf: string | null; source: string; since: string | null } | null;
};

export const EMPTY_STOCK_OWNERSHIP: StockOwnership = { funds: null, insiders: null };

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoDay(value: unknown): string | null {
  const day = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

const ACTIONS: Record<string, FundPositionRow["action"]> = {
  new: "new",
  added: "added",
  increased: "added",
  reduced: "trimmed",
  trimmed: "trimmed",
  held: "held",
  unchanged: "held",
};

type RawHolderDoc = {
  holders?: unknown[];
  sold?: unknown[];
  holder_count?: unknown;
  latest_filed_at?: unknown;
  source?: unknown;
};

/** Pure reducer over a `tm_fund_holders` document. Exported for tests. */
export function parseFundHolders(raw: RawHolderDoc | null | undefined): StockOwnership["funds"] {
  if (!raw) return null;
  const rows: FundPositionRow[] = [];
  for (const item of Array.isArray(raw.holders) ? raw.holders : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const slug = text(row.slug);
    const fund = text(row.fund);
    const reportDate = isoDay(row.period);
    if (!slug || !fund || !reportDate) continue;
    rows.push({
      slug,
      fund,
      manager: text(row.manager),
      href: `/follow/${slug}`,
      shares: fin(row.shares) && row.shares > 0 ? row.shares : null,
      valueUsd: fin(row.value) && row.value > 0 ? row.value : null,
      portfolioPct: fin(row.weight) && row.weight > 0 ? row.weight * 100 : null,
      rank: fin(row.rank) && row.rank > 0 ? row.rank : null,
      changePct: fin(row.shares_delta_pct) ? row.shares_delta_pct : null,
      action: ACTIONS[text(row.change).toLowerCase()] ?? null,
      reportDate,
      quarter: text(row.quarter),
      filedDate: isoDay(row.filed_at),
      heldSince: isoDay(row.held_since),
      sourceUrl: text(row.url) || null,
    });
  }
  const exits: FundExitRow[] = [];
  for (const item of Array.isArray(raw.sold) ? raw.sold : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const slug = text(row.slug);
    const fund = text(row.fund);
    const reportDate = isoDay(row.period);
    if (!slug || !fund || !reportDate) continue;
    exits.push({
      slug,
      fund,
      manager: text(row.manager),
      href: `/follow/${slug}`,
      prevPortfolioPct: fin(row.prev_weight) && row.prev_weight > 0 ? row.prev_weight * 100 : null,
      reportDate,
      quarter: text(row.quarter),
      filedDate: isoDay(row.filed_at),
    });
  }
  return {
    rows,
    exits,
    holderCount: fin(raw.holder_count) ? Math.max(raw.holder_count, rows.length) : rows.length,
    asOf: isoDay(raw.latest_filed_at),
    source: text(raw.source) || "SEC EDGAR form 13F",
  };
}

async function loadFundHolders(ticker: string): Promise<StockOwnership["funds"]> {
  // The index is only meaningful once the 13F job has run. Without the meta
  // doc a missing ticker would read as "no fund holds it", which we cannot know.
  const key = ticker.replace("/", ".");
  const [doc, meta] = await adminFirestore.getAll(
    adminFirestore.collection("tm_fund_holders").doc(key),
    adminFirestore.collection("tm_fund_holders_meta").doc("run"),
  );
  if (!meta?.exists) return null;
  if (!doc?.exists) {
    return { rows: [], exits: [], holderCount: 0, asOf: isoDay((meta.data() as { updated_at?: string })?.updated_at), source: "SEC EDGAR form 13F" };
  }
  return parseFundHolders(doc.data() as RawHolderDoc);
}

const getFundHoldersCached = unstable_cache(
  async (ticker: string) => loadFundHolders(ticker).catch(() => null),
  ["stock-fund-holders-v2"],
  { revalidate: 900 },
);

/** Pure mapper from the Follow surface's Form 4 rows. Exported for tests. */
export function parseInsiderTrades(trades: ReadonlyArray<InsiderTrade>): InsiderTradeRow[] {
  const rows: InsiderTradeRow[] = [];
  for (const trade of trades) {
    const transactionDate = isoDay(trade.transaction_date);
    if (!trade.insider || !transactionDate) continue;
    rows.push({
      id: trade.id,
      insider: trade.insider,
      role: text(trade.role) || null,
      action: trade.tx_type === "buy" ? "buy" : "sell",
      shares: fin(trade.shares) && trade.shares > 0 ? trade.shares : null,
      price: fin(trade.price) && trade.price > 0 ? trade.price : null,
      valueUsd: fin(trade.value) && trade.value > 0 ? trade.value : null,
      transactionDate,
      filedDate: isoDay(trade.filing_date) ?? isoDay(trade.filed_at),
      planned: trade.plan_10b5_1 === true,
      sourceUrl: text(trade.url) || null,
    });
  }
  return rows.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

async function loadInsiders(ticker: string): Promise<StockOwnership["insiders"]> {
  // No run record means the Form 4 job has never run, which is different from
  // "it ran and this company had no open-market insider trades".
  const summary = await getInsiderSummary().catch(() => null);
  if (!summary?.meta) return null;
  const trades = await getInsiderTradesForSymbol(ticker).catch(() => []);
  return {
    rows: parseInsiderTrades(trades),
    asOf: text(summary.meta.generated_at) || null,
    source: "SEC EDGAR form 4",
    since: isoDay(summary.meta.since),
  };
}

export async function getStockOwnership(ticker: string, market: "US" | "IN"): Promise<StockOwnership> {
  const upper = ticker.trim().toUpperCase();
  if (market !== "US" || !upper) return EMPTY_STOCK_OWNERSHIP;
  const [funds, insiders] = await Promise.all([getFundHoldersCached(upper), loadInsiders(upper)]);
  return { funds, insiders };
}
