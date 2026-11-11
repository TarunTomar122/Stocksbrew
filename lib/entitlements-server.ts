import { headers } from "next/headers";
import { cache } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { FREE_COVERED_STOCKS, limitFor, planOf, ruleFor, type FeatureId, type Plan } from "@/lib/entitlements";
import { coverageState, type CoverageState } from "@/lib/entitlements-coverage";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { isTrialEligible } from "@/lib/trial-eligibility";
import { getUserDoc, resolveIsSubscribed, type UserDoc } from "@/lib/watchlist";

export type Viewer = {
  uid: string | null;
  signedIn: boolean;
  isSubscribed: boolean;
  plan: Plan;
  /** Everything the user tracks (instrument ids). */
  tracked: string[];
  /** The stocks the agent covers in full for this account. On Pro: everything tracked. */
  covered: string[];
  /** Slots, fills and the weekly swap (lib/entitlements-coverage.ts). Null when signed out. */
  coverage: CoverageState | null;
  /** Whether "3 days free" may be shown to this person. */
  trialEligible: boolean;
};

/** The free trial is only offered at US checkout, so only promise it there. */
function trialMarket(): boolean {
  try {
    return headers().get("x-vercel-ip-country") !== "IN";
  } catch {
    return true;
  }
}

/** Who is looking, resolved once per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return { uid: null, signedIn: false, isSubscribed: false, plan: "anon", tracked: [], covered: [], coverage: null, trialEligible: trialMarket() };
  }
  const doc = await getUserDoc(session.uid).catch(() => null);
  return viewerFromUserDoc(session.uid, doc, trialMarket() && isTrialEligible(doc as Parameters<typeof isTrialEligible>[0]));
});

/**
 * The viewer a signed-in account resolves to, from its user doc alone: the
 * same plan and coverage `getViewer` gives that person, for code that runs
 * without a request (the nightly jobs).
 */
export function viewerFromUserDoc(uid: string, doc: UserDoc | null, trialEligible = false): Viewer {
  const isSubscribed = resolveIsSubscribed(doc);
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  const tracked = strings(doc?.tracked_stocks);
  // `covered_stocks` is the explicit choice; until an account has made one,
  // the first tracked stocks are covered, so nobody starts with nothing.
  const coverage = coverageState(doc as Record<string, unknown> | null, isSubscribed);
  return {
    uid,
    signedIn: true,
    isSubscribed,
    plan: planOf({ signedIn: true, isSubscribed }),
    tracked,
    covered: coverage.covered,
    coverage,
    trialEligible,
  };
}

/**
 * Whether a "covered" feature (zones and target, the pre-earnings read, zone
 * alerts, briefing explanations) is on for this stock. Pro: every stock.
 * Free: the stocks the agent covers. `instrumentIdOrTicker` is "US_NVDA" or
 * a bare ticker.
 */
export function isCovered(viewer: Viewer, instrumentIdOrTicker: string): boolean {
  if (viewer.plan === "pro") return true;
  if (viewer.plan === "anon") return false;
  const key = bareTicker(instrumentIdOrTicker);
  return viewer.covered.some((id) => bareTicker(id) === key);
}

/** "US_BRK_B", "BRK.B" and "brk-b" are the same stock. */
function bareTicker(value: string): string {
  return value.trim().toUpperCase().replace(/^(US|IN)_/, "").replace(/[._-]/g, "_");
}

/**
 * The one question every page asks before it sends price levels: may this
 * viewer see zones, "what would change the call" and the pre-earnings read
 * for this stock? Yes on Pro, yes on a Free account's covered stocks, and yes
 * for everyone on the showcase stocks (so a visitor can see what coverage
 * looks like). Use this, not `isCovered`, when deciding what to send.
 */
export function canSeeLevels(viewer: Viewer, instrumentIdOrTicker: string): boolean {
  const ticker = instrumentIdOrTicker.trim().toUpperCase().replace(/^(US|IN)_/, "").replace(/_/g, ".");
  return isFeaturedStockTicker(ticker) || isFeaturedStockTicker(ticker.replace(/\./g, "-")) || isCovered(viewer, instrumentIdOrTicker);
}

/** How many covered slots a Free account has left. */
export function coveredSlotsLeft(viewer: Viewer): number {
  if (viewer.plan === "pro") return Number.POSITIVE_INFINITY;
  if (viewer.plan === "anon") return 0;
  return Math.max(0, FREE_COVERED_STOCKS - viewer.covered.length);
}

export const USAGE_COLLECTION = "tm_agent_usage_meters";

export type MeterResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  per: "day" | "month";
  /** The counter could not be read, so a costly feature said no. Show "try again", not "limit reached". */
  unavailable?: true;
};

/**
 * Metered features that cost us a model call per use. When the counter store
 * is down these say "try again in a minute" instead of running uncounted: an
 * outage must not turn into unlimited model spend. Cheap meters (backtests)
 * still fail open so an outage does not take them down.
 *
 * Today "ask" is listed for any future caller of consumeMeter: /api/ask and
 * /api/chat count questions on their own counter (lib/ask-limits.ts), which
 * fails closed in the routes. Deep research's real gate is the peek before a
 * run (/api/research); the count after the report is saved only records it.
 */
export const FAIL_CLOSED_METERS: ReadonlySet<FeatureId> = new Set<FeatureId>(["ask", "deep_research"]);

/** What to tell a person when a costly feature's counter is down. */
export const METER_UNAVAILABLE_MESSAGE = "We could not check your allowance just now, so nothing ran and nothing was counted. Try again in a minute.";

function periodKey(per: "day" | "month", now: Date): string {
  return per === "day" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
}

/**
 * Count one use of a metered feature. `subject` is the uid, or for signed-out
 * visitors a stable anonymous key (a hashed IP). The day rolls over at
 * midnight UTC. If the store is down, cheap features fail open (an outage
 * must not take them down) and the costly ones in FAIL_CLOSED_METERS fail
 * closed with `unavailable`.
 */
export async function consumeMeter(
  feature: FeatureId,
  plan: Plan,
  subject: string,
  now: Date = new Date(),
  /** Identifies this exact request. Repeating a key already counted in the period is free. */
  key?: string,
): Promise<MeterResult> {
  const rule = ruleFor(feature, plan);
  if (rule.kind === "locked") return { allowed: false, used: 0, limit: 0, remaining: 0, per: "day" };
  if (rule.kind !== "meter") {
    const limit = limitFor(feature, plan);
    return { allowed: true, used: 0, limit, remaining: limit, per: "day" };
  }
  const ref = adminFirestore
    .collection(USAGE_COLLECTION)
    .doc(`${subject}__${feature}__${periodKey(rule.per, now)}`.replace(/[\/\s]/g, "_"));
  try {
    return await adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const used = typeof data?.used === "number" ? (data.used as number) : 0;
      const keys = Array.isArray(data?.keys) ? (data.keys as unknown[]).filter((k): k is string => typeof k === "string") : [];
      if (key && keys.includes(key)) {
        return { allowed: true, used, limit: rule.max, remaining: Math.max(0, rule.max - used), per: rule.per };
      }
      if (used >= rule.max) {
        return { allowed: false, used, limit: rule.max, remaining: 0, per: rule.per };
      }
      tx.set(
        ref,
        { subject, feature, used: used + 1, keys: key ? [...keys, key].slice(-200) : keys, updated_at: now.toISOString() },
        { merge: true },
      );
      return { allowed: true, used: used + 1, limit: rule.max, remaining: rule.max - used - 1, per: rule.per };
    });
  } catch (error) {
    if (FAIL_CLOSED_METERS.has(feature)) {
      console.error("consumeMeter failed closed", feature, error);
      return { allowed: false, used: 0, limit: rule.max, remaining: 0, per: rule.per, unavailable: true };
    }
    console.error("consumeMeter failed open", feature, error);
    return { allowed: true, used: 0, limit: rule.max, remaining: rule.max, per: rule.per };
  }
}

/**
 * Read a meter without spending it, for "2 of 3 left today" notes. Null when
 * the feature has no meter on this plan, or the store could not be read: a
 * caller gating a costly feature treats null as "try again" (see the research
 * route).
 */
export async function peekMeter(
  feature: FeatureId,
  plan: Plan,
  subject: string,
  now: Date = new Date(),
): Promise<MeterResult | null> {
  const rule = ruleFor(feature, plan);
  if (rule.kind !== "meter") return null;
  try {
    const snap = await adminFirestore
      .collection(USAGE_COLLECTION)
      .doc(`${subject}__${feature}__${periodKey(rule.per, now)}`.replace(/[\/\s]/g, "_"))
      .get();
    const used = snap.exists && typeof snap.data()?.used === "number" ? (snap.data()?.used as number) : 0;
    return { allowed: used < rule.max, used, limit: rule.max, remaining: Math.max(0, rule.max - used), per: rule.per };
  } catch {
    return null;
  }
}
