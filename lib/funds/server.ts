import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { POPULAR_FUNDS, popularFund, type FundListing } from "@/lib/funds/catalog";

/**
 * Which tickers are funds, and what we know about each: the popular list
 * (lib/funds/catalog.ts), every fund the fund facts job confirmed
 * (`tm_fund_meta/latest`, held funds included) and every fund the holdings job
 * has read (`tm_etf_meta/latest`). Written by backend/agentdata/fund_facts.py
 * and backend/agentdata/etf_holdings.py.
 */

type MetaFunds = { funds?: Record<string, { name?: unknown; fund_name?: unknown } | undefined> };

async function loadCatalogUncached(): Promise<Record<string, string>> {
  const [factsMeta, etfMeta] = await Promise.all([
    adminFirestore.collection("tm_fund_meta").doc("latest").get().catch(() => null),
    adminFirestore.collection("tm_etf_meta").doc("latest").get().catch(() => null),
  ]);
  const out: Record<string, string> = {};
  // Weakest name first, so the popular list's names (the ones we chose) win.
  for (const [snap, field] of [
    [etfMeta, "fund_name"],
    [factsMeta, "name"],
  ] as const) {
    const funds = snap?.exists ? (snap.data() as MetaFunds).funds : null;
    for (const [ticker, info] of Object.entries(funds ?? {})) {
      const key = ticker.trim().toUpperCase();
      const name = info?.[field];
      if (key) out[key] = typeof name === "string" && name.trim() ? name.trim() : out[key] ?? key;
    }
  }
  for (const fund of POPULAR_FUNDS) out[fund.ticker] = fund.name;
  return out;
}

const loadCatalog = unstable_cache(loadCatalogUncached, ["fund-catalog-v1"], { revalidate: 3600 });

/** Every fund we know about, ticker to name. The popular list alone when the store cannot be read. */
export async function getFundCatalog(): Promise<Map<string, string>> {
  const raw = await loadCatalog().catch(() => null);
  return new Map(Object.entries(raw ?? Object.fromEntries(POPULAR_FUNDS.map((fund) => [fund.ticker, fund.name]))));
}

/** The fund behind a ticker, or null when it is not one we know as a fund. Popular funds answer without a read. */
export async function fundListing(ticker: string | null | undefined): Promise<FundListing | null> {
  const key = String(ticker ?? "").trim().toUpperCase();
  if (!key) return null;
  const popular = popularFund(key);
  if (popular) return popular;
  const name = (await getFundCatalog()).get(key);
  return name ? { ticker: key, name } : null;
}

/** One fund's facts from `tm_fund_facts` (Yahoo Finance via backend/agentdata/fund_facts.py). */
export type FundFacts = {
  name: string | null;
  expenseRatio: number | null;
  aumUsd: number | null;
  dividendYield: number | null;
  inceptionDate: string | null;
  category: string | null;
  family: string | null;
  /** Sector name to fraction of the fund, as Yahoo reports it; null for a bond or gold fund. */
  sectorWeights: Record<string, number> | null;
  /** Yahoo's quote type: "ETF" or "MUTUALFUND" (priced once a day from its NAV). */
  quoteType: string | null;
  fetchedAt: string | null;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function toFundFacts(raw: Record<string, unknown> | null | undefined): FundFacts | null {
  if (!raw) return null;
  const weights = raw.sector_weights && typeof raw.sector_weights === "object" ? (raw.sector_weights as Record<string, unknown>) : null;
  const sectorWeights = weights
    ? Object.fromEntries(Object.entries(weights).filter((entry): entry is [string, number] => num(entry[1]) !== null && (entry[1] as number) > 0))
    : null;
  return {
    name: str(raw.name),
    expenseRatio: num(raw.expense_ratio),
    aumUsd: num(raw.aum_usd),
    dividendYield: num(raw.dividend_yield),
    inceptionDate: str(raw.inception_date),
    category: str(raw.category),
    family: str(raw.family),
    sectorWeights: sectorWeights && Object.keys(sectorWeights).length ? sectorWeights : null,
    quoteType: str(raw.quote_type)?.toUpperCase() ?? null,
    fetchedAt: str(raw.fetched_at),
  };
}

async function loadFactsUncached(ticker: string): Promise<FundFacts | null> {
  const snap = await adminFirestore.collection("tm_fund_facts").doc(ticker).get();
  return snap.exists ? toFundFacts(snap.data() as Record<string, unknown>) : null;
}

/** Facts change weekly at most; a missing fund is cached as null too, so an hour keeps a new one from waiting long. */
export const getFundFacts = unstable_cache(loadFactsUncached, ["fund-facts-v1"], { revalidate: 3600 });
