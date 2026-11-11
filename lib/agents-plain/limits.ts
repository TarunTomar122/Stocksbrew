import { createHash } from "node:crypto";

import { USAGE_COLLECTION } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import type { Plan } from "@/lib/entitlements";

/**
 * How often one person may ask for a plain-English agent. Every request is
 * counted (rules are cheap, but a script should not hammer the catalogue),
 * and the model reads are counted apart, since they cost money. Signed-out
 * visitors are counted by a hash of their address, never the address itself,
 * and all of them share one daily ceiling on model reads.
 *
 * One doc per subject per UTC day in the plan meters collection. Signed-in
 * counts fail open when the store is down, like the plan meters; signed-out
 * model reads fail closed.
 */
export const PLAIN_PARSES_PER_DAY: Record<Plan, number> = { anon: 40, free: 150, pro: 400 };
export const PLAIN_MODEL_READS_PER_DAY: Record<Plan, number> = { anon: 5, free: 25, pro: 100 };
export const ANON_MODEL_READS_CEILING = 300;
export const PLAIN_METER = "plain_agent";

export type PlainMeter = { allowed: boolean; model: boolean; reason?: "parses" | "model" | "everyone" };

function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function anonymousPlainSubject(forwardedFor: string | null, realIp: string | null): string {
  const address = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
  return `anon_${createHash("sha256").update(`plain-agent:${address}`).digest("hex").slice(0, 32)}`;
}

function ref(subject: string, now: Date) {
  return adminFirestore.collection(USAGE_COLLECTION).doc(`${subject}__${PLAIN_METER}__${day(now)}`.replace(/[\/\s]/g, "_"));
}

/**
 * Count one request, and one model read when `wantsModel`. `allowed` false
 * means no reading at all today; `model` false means rules only.
 */
export async function consumePlainParse(plan: Plan, subject: string, wantsModel: boolean, now: Date = new Date()): Promise<PlainMeter> {
  const mine = ref(subject, now);
  const everyone = plan === "anon" && wantsModel ? ref("anon_all", now) : null;
  try {
    return await adminFirestore.runTransaction(async (tx) => {
      const [snap, allSnap] = await Promise.all([tx.get(mine), everyone ? tx.get(everyone) : Promise.resolve(null)]);
      const data = snap.data() ?? {};
      const parses = typeof data.used === "number" ? (data.used as number) : 0;
      const reads = typeof data.model === "number" ? (data.model as number) : 0;
      const allReads = allSnap && typeof allSnap.data()?.model === "number" ? (allSnap.data()!.model as number) : 0;
      if (parses >= PLAIN_PARSES_PER_DAY[plan]) return { allowed: false, model: false, reason: "parses" as const };
      let model = false;
      let reason: PlainMeter["reason"];
      if (wantsModel) {
        if (reads >= PLAIN_MODEL_READS_PER_DAY[plan]) reason = "model";
        else if (everyone && allReads >= ANON_MODEL_READS_CEILING) reason = "everyone";
        else model = true;
      }
      const at = now.toISOString();
      tx.set(mine, { subject, feature: PLAIN_METER, used: parses + 1, model: reads + (model ? 1 : 0), updated_at: at }, { merge: true });
      if (everyone && model) tx.set(everyone, { subject: "anon_all", feature: PLAIN_METER, model: allReads + 1, updated_at: at }, { merge: true });
      return { allowed: true, model, reason };
    });
  } catch (error) {
    console.error("plain agent meter failed", plan, error instanceof Error ? error.message : "unknown");
    // A counter outage must not take the feature down for signed-in people; signed-out model reads stay closed.
    return { allowed: true, model: plan !== "anon" && wantsModel };
  }
}
