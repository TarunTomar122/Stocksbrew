import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import type { CopyHub, CopyRecord } from "@/lib/copy-trades-shared";

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
  return data && typeof data.slug === "string" && (data.kind === "fund" || data.kind === "congress") ? data : null;
}

export const getCopyRecord = (slug: string) =>
  unstable_cache(() => loadRecord(slug), ["copy-trades-record-v2", slug], { revalidate: REVALIDATE })();

async function loadHub(): Promise<CopyHub | null> {
  const snap = await adminFirestore.collection("tm_copy_trades_meta").doc("hub").get();
  if (!snap.exists) return null;
  const data = snap.data() as CopyHub | undefined;
  return data && Array.isArray(data.rows) ? data : null;
}

export const getCopyHub = unstable_cache(loadHub, ["copy-trades-hub-v2"], { revalidate: REVALIDATE });
