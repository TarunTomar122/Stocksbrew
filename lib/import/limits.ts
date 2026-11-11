import { createHmac } from "node:crypto";

import { adminFirestore } from "@/lib/firebase-admin";
import { USAGE_COLLECTION } from "@/lib/entitlements-server";

/**
 * How often the import may call the model. Only model reads count
 * (screenshots, or pasted text our rules could not read); a CSV or a list of
 * tickers is read by rules and costs nothing.
 *
 * Counted per day (UTC) in the same collection as the plan meters, one doc
 * per subject and day. Signed-out visitors are counted by a hash of their
 * address, which is never stored itself, and all of them together share one
 * daily ceiling so a crawler cannot run up the model bill. Signed-in reads
 * fail open if the store is down, like the plan meters; signed-out reads
 * fail closed.
 */
export const IMPORT_READS_PER_DAY = { anon: 3, free: 10, pro: 30 } as const;
/** All signed-out visitors together, per day. */
export const ANON_IMPORT_READS_CEILING = 300;

export const IMPORT_METER = "import_read";

export type ImportPlan = keyof typeof IMPORT_READS_PER_DAY;

export type ImportMeter = { allowed: boolean; used: number; limit: number; remaining: number; reason?: "personal" | "everyone" };

function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The anonymous subject for a request: a keyed hash of the address and the
 * day. The key is a server secret, so the stored id cannot be turned back into
 * an address by trying every IP, and a new day gives a new id.
 */
export function anonymousSubject(forwardedFor: string | null, realIp: string | null, now: Date = new Date()): string {
  const address = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
  // Its own secret (set on Vercel), never another service's token; the fallback is only for local runs.
  const key = (process.env.IMPORT_HASH_SECRET || "stocksbrew-import-local").trim();
  return `anon_${createHmac("sha256", key).update(`import:${day(now)}:${address}`).digest("hex").slice(0, 32)}`;
}

function meterRef(subject: string, now: Date) {
  return adminFirestore.collection(USAGE_COLLECTION).doc(`${subject}__${IMPORT_METER}__${day(now)}`.replace(/[\/\s]/g, "_"));
}

/** Spend one model read. Refuses without counting when the subject (or, for signed-out visitors, everyone) has none left. */
export async function consumeImportRead(plan: ImportPlan, subject: string, now: Date = new Date()): Promise<ImportMeter> {
  const limit = IMPORT_READS_PER_DAY[plan];
  const ref = meterRef(subject, now);
  const globalRef = plan === "anon" ? meterRef("anon_all", now) : null;
  try {
    return await adminFirestore.runTransaction(async (tx) => {
      const [snap, globalSnap] = await Promise.all([tx.get(ref), globalRef ? tx.get(globalRef) : Promise.resolve(null)]);
      const used = typeof snap.data()?.used === "number" ? (snap.data()!.used as number) : 0;
      const everyone = globalSnap && typeof globalSnap.data()?.used === "number" ? (globalSnap.data()!.used as number) : 0;
      if (used >= limit) return { allowed: false, used, limit, remaining: 0, reason: "personal" as const };
      if (globalRef && everyone >= ANON_IMPORT_READS_CEILING) return { allowed: false, used, limit, remaining: limit - used, reason: "everyone" as const };
      const at = now.toISOString();
      tx.set(ref, { subject, feature: IMPORT_METER, used: used + 1, updated_at: at }, { merge: true });
      if (globalRef) tx.set(globalRef, { subject: "anon_all", feature: IMPORT_METER, used: everyone + 1, updated_at: at }, { merge: true });
      return { allowed: true, used: used + 1, limit, remaining: limit - used - 1 };
    });
  } catch (error) {
    console.error("import meter failed", plan, error instanceof Error ? error.message : "unknown");
    // Signed-out reads are the ones a script could run up, so they fail closed.
    if (plan === "anon") return { allowed: false, used: 0, limit, remaining: 0, reason: "everyone" };
    return { allowed: true, used: 0, limit, remaining: limit };
  }
}

/**
 * Give a read back when the model never answered (an error or a timeout), so
 * a failure on our side does not use up someone's day. Best effort.
 */
export async function refundImportRead(plan: ImportPlan, subject: string, now: Date = new Date()): Promise<void> {
  const ref = meterRef(subject, now);
  const globalRef = plan === "anon" ? meterRef("anon_all", now) : null;
  try {
    await adminFirestore.runTransaction(async (tx) => {
      const [snap, globalSnap] = await Promise.all([tx.get(ref), globalRef ? tx.get(globalRef) : Promise.resolve(null)]);
      const used = typeof snap.data()?.used === "number" ? (snap.data()!.used as number) : 0;
      const at = now.toISOString();
      if (used > 0) tx.set(ref, { used: used - 1, updated_at: at }, { merge: true });
      const everyone = globalSnap && typeof globalSnap.data()?.used === "number" ? (globalSnap.data()!.used as number) : 0;
      if (globalRef && everyone > 0) tx.set(globalRef, { used: everyone - 1, updated_at: at }, { merge: true });
    });
  } catch (error) {
    console.error("import meter refund failed", plan, error instanceof Error ? error.message : "unknown");
  }
}
