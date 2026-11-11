import { createHash } from "node:crypto";

import type { Plan } from "@/lib/entitlements";
import { USAGE_COLLECTION } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";

/**
 * How often one person may build a basket from plain words, mirroring the
 * plain-English agents meter (lib/agents-plain/limits.ts) under its own
 * name. Every build request is counted (opening a basket page is free),
 * and model reads are counted apart since they cost money. Signed-out
 * visitors are counted by a hash of their address and share one daily
 * ceiling on model reads.
 *
 * GATE: these are abuse limits, not plan limits. If baskets become a
 * pricing-page feature, they belong in lib/entitlements.ts.
 */
export const BASKET_PARSES_PER_DAY: Record<Plan, number> = { anon: 30, free: 100, pro: 300 };
export const BASKET_MODEL_READS_PER_DAY: Record<Plan, number> = { anon: 5, free: 20, pro: 80 };
export const ANON_BASKET_MODEL_CEILING = 300;
export const BASKET_METER = "plain_basket";

export type BasketMeter = { allowed: boolean; model: boolean };

function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function anonymousBasketSubject(forwardedFor: string | null, realIp: string | null): string {
  const address = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
  return `anon_${createHash("sha256").update(`plain-basket:${address}`).digest("hex").slice(0, 32)}`;
}

function ref(subject: string, now: Date) {
  return adminFirestore.collection(USAGE_COLLECTION).doc(`${subject}__${BASKET_METER}__${day(now)}`.replace(/[\/\s]/g, "_"));
}

/** Count one new request, and one model read when `wantsModel`. */
export async function consumeBasketParse(plan: Plan, subject: string, wantsModel: boolean, now: Date = new Date()): Promise<BasketMeter> {
  const mine = ref(subject, now);
  const everyone = plan === "anon" && wantsModel ? ref("anon_all", now) : null;
  try {
    return await adminFirestore.runTransaction(async (tx) => {
      const [snap, allSnap] = await Promise.all([tx.get(mine), everyone ? tx.get(everyone) : Promise.resolve(null)]);
      const data = snap.data() ?? {};
      const parses = typeof data.used === "number" ? (data.used as number) : 0;
      const reads = typeof data.model === "number" ? (data.model as number) : 0;
      const allReads = allSnap && typeof allSnap.data()?.model === "number" ? (allSnap.data()!.model as number) : 0;
      if (parses >= BASKET_PARSES_PER_DAY[plan]) return { allowed: false, model: false };
      const model = wantsModel && reads < BASKET_MODEL_READS_PER_DAY[plan] && (!everyone || allReads < ANON_BASKET_MODEL_CEILING);
      const at = now.toISOString();
      tx.set(mine, { subject, feature: BASKET_METER, used: parses + 1, model: reads + (model ? 1 : 0), updated_at: at }, { merge: true });
      if (everyone && model) tx.set(everyone, { subject: "anon_all", feature: BASKET_METER, model: allReads + 1, updated_at: at }, { merge: true });
      return { allowed: true, model };
    });
  } catch (error) {
    console.error("plain basket meter failed", plan, error instanceof Error ? error.message : "unknown");
    // A counter outage must not take the feature down for signed-in people; signed-out model reads stay closed.
    return { allowed: true, model: plan !== "anon" && wantsModel };
  }
}
