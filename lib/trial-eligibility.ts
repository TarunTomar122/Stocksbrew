/** Fields used to decide if a user may receive the product's default Dodo trial. */
export type TrialEligibilityInput = {
  hasUsedTrial?: boolean;
  subscribedAt?: string | null;
  subscriptionId?: string | null;
};

/**
 * One trial per account. Dodo checkout always creates a new subscription and
 * does not dedupe trials — callers must pass subscription_data.trial_period_days: 0
 * when this returns false.
 */
export function isTrialEligible(
  doc: TrialEligibilityInput | null | undefined,
): boolean {
  if (!doc) return true;
  if (doc.hasUsedTrial === true) return false;
  if (String(doc.subscribedAt ?? "").trim()) return false;
  if (String(doc.subscriptionId ?? "").trim()) return false;
  return true;
}

export function trialConsumedPatch(): { hasUsedTrial: true } {
  return { hasUsedTrial: true };
}
