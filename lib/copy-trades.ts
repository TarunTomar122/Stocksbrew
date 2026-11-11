import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { plainCaveat, type CopyHub, type CopyRecord } from "@/lib/copy-trades-shared";

export * from "@/lib/copy-trades-shared";

/**
 * Loaders for the copy tests. The documents are written by
 * `backend/agentdata/copy_trades.py` and only change when it runs (weekly,
 * after the 13F and House jobs), so an hour of cache is plenty.
 */
const REVALIDATE = 3600;

async function loadRecord(slug: string): Promise<CopyRecord | null> {
  const snap = await adminFirestore.collection("tm_copy_trades").doc(slug).get();
  if (!snap.exists) return null;
  const data = snap.data() as CopyRecord | undefined;
  if (!data || typeof data.slug !== "string" || (data.kind !== "fund" && data.kind !== "congress")) return null;
  return typeof data.caveat === "string" ? { ...data, caveat: plainCaveat(data.caveat) } : data;
}

export const getCopyRecord = (slug: string) =>
  unstable_cache(() => loadRecord(slug), ["copy-trades-record-v3", slug], { revalidate: REVALIDATE })();

async function loadHub(): Promise<CopyHub | null> {
  const snap = await adminFirestore.collection("tm_copy_trades_meta").doc("hub").get();
  if (!snap.exists) return null;
  const data = snap.data() as CopyHub | undefined;
  if (!data || !Array.isArray(data.rows)) return null;
  return {
    ...data,
    fund_caveat: typeof data.fund_caveat === "string" ? plainCaveat(data.fund_caveat) : data.fund_caveat,
    congress_caveat: typeof data.congress_caveat === "string" ? plainCaveat(data.congress_caveat) : data.congress_caveat,
  };
}

export const getCopyHub = unstable_cache(loadHub, ["copy-trades-hub-v3"], { revalidate: REVALIDATE });
