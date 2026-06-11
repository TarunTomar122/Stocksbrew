import { createHash } from "node:crypto";

import { adminFirestore } from "@/lib/firebase-admin";
import type { PortfolioBookRow } from "@/lib/portfolio-book";
import type { PortfolioRebalanceBundle } from "@/lib/portfolio-organize-types";

const COLLECTION = "tm_portfolio_rebalance";
export const REBALANCE_PLAN_CACHE_VERSION = 3;

export function portfolioFingerprint(rows: PortfolioBookRow[]): string {
  const parts = rows
    .map((row) => {
      const weight = row.holding?.portfolio_weight_pct;
      const resolvedWeight =
        typeof weight === "number" && Number.isFinite(weight) ? weight.toFixed(2) : "eq";
      return `${row.instrument_id}:${row.position_type}:${resolvedWeight}`;
    })
    .sort();
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 24);
}

function isSameUtcDay(a: string, b: Date): boolean {
  const d = new Date(a);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === b.getUTCFullYear() &&
    d.getUTCMonth() === b.getUTCMonth() &&
    d.getUTCDate() === b.getUTCDate()
  );
}

export async function getCachedRebalancePlan(
  uid: string,
  fingerprint: string,
): Promise<PortfolioRebalanceBundle | null> {
  const doc = await adminFirestore.collection(COLLECTION).doc(uid).get();
  if (!doc.exists) return null;

  const data = doc.data() as PortfolioRebalanceBundle & {
    holdings_fingerprint?: string;
    cache_version?: number;
  };
  if (data.holdings_fingerprint !== fingerprint) return null;
  if (!isSameUtcDay(data.generated_at, new Date())) return null;
  if ((data.cache_version ?? 1) < REBALANCE_PLAN_CACHE_VERSION) return null;
  if (!data.strategies || !data.default_strategy) return null;

  return {
    default_strategy: data.default_strategy,
    strategies: data.strategies,
    generated_at: data.generated_at,
    holdings_fingerprint: fingerprint,
  };
}

export async function setCachedRebalancePlan(
  uid: string,
  fingerprint: string,
  plan: PortfolioRebalanceBundle,
): Promise<void> {
  await adminFirestore.collection(COLLECTION).doc(uid).set({
    ...plan,
    holdings_fingerprint: fingerprint,
    cache_version: REBALANCE_PLAN_CACHE_VERSION,
    updated_at: new Date().toISOString(),
  });
}

export async function clearCachedRebalancePlan(uid: string): Promise<void> {
  await adminFirestore.collection(COLLECTION).doc(uid).delete();
}
