import { adminFirestore } from "@/lib/firebase-admin";

import { BASKETS_COLLECTION } from "./model";

/**
 * How many idea-basket agents a person has switched on. They count toward the plan's running limit on agents
 * (lib/entitlements.ts `agents`) together with the standing jobs, so lib/agent-jobs-data.ts reads this too. Only the
 * store and the model: no import back into the jobs module.
 */
export async function runningBasketCount(
  uid: string,
  exceptId: string | null = null,
): Promise<number> {
  const snap = await adminFirestore
    .collection(BASKETS_COLLECTION)
    .where("uid", "==", uid)
    .get();
  return snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return (
      data.uid === uid &&
      data.enabled === true &&
      data.archived !== true &&
      data.id !== exceptId
    );
  }).length;
}
