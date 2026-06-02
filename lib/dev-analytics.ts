import { adminFirestore } from "@/lib/firebase-admin";
import {
  classifyBilling,
  isBillingBackedPro,
} from "@/lib/billing-state";
import { getActiveUniverses, getPriceCoreOverrides } from "@/lib/firestore";

export type Metric = {
  label: string;
  value: number | string;
  note?: string;
  tone?: "default" | "warn" | "good";
};

export type UserRow = {
  id: string;
  email: string;
  plan: "Pro" | "Free";
  status: string;
  tracked: number;
  lastLogin: string | null;
  joined: string | null;
  flag?: string | null;
};

export type FeedbackRow = {
  id: string;
  text: string;
  email: string | null;
  createdAt: string | null;
  path: string | null;
};

export type StockRequestRow = {
  id: string;
  ticker: string;
  count: number;
  updatedAt: string | null;
};

export type LifecycleRow = {
  id: string;
  type: string;
  email: string | null;
  createdAt: string | null;
};

export type DevAnalyticsSnapshot = {
  metrics: Metric[];
  coverage: Metric[];
  health: Metric[];
  users: UserRow[];
  recentFeedback: FeedbackRow[];
  stockRequestLeaderboard: StockRequestRow[];
  lifecycleEvents: LifecycleRow[];
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseTime(value: unknown): number {
  if (!value) return 0;
  const n = new Date(String(value)).getTime();
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(value: unknown): string | null {
  const t = parseTime(value);
  if (!t) return null;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysAgo(iso: unknown): number | null {
  const t = parseTime(iso);
  if (!t) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

async function loadUniverseInstrumentIds(market: "US" | "IN", universeId: string): Promise<string[]> {
  if (!universeId) return [];
  try {
    const snap = await adminFirestore
      .collection("tm_instruments")
      .where("market", "==", market)
      .where("universes", "array-contains", universeId)
      .get();
    return snap.docs.map((doc) => doc.id);
  } catch {
    const snap = await adminFirestore.collection("tm_instruments").where("market", "==", market).get();
    return snap.docs
      .filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const universes = Array.isArray(data.universes) ? data.universes : [];
        return universes.some((raw) => String(raw || "").trim() === universeId);
      })
      .map((doc) => doc.id);
  }
}

export async function loadDevAnalytics(): Promise<DevAnalyticsSnapshot> {
  const [usersSnap, feedbackSnap, stockRequestsSnap, lifecycleSnap] = await Promise.all([
    adminFirestore.collection("users").get(),
    adminFirestore.collection("feedback").get(),
    adminFirestore.collection("stock_requests").get(),
    adminFirestore
      .collection("tm_lifecycle_events")
      .orderBy("created_at", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  ]);

  let totalUsers = 0;
  let loggedInUsers = 0;
  let subscribedTotal = 0;
  let activePaidPro = 0;
  let paidCancelScheduled = 0;
  let complimentaryPro = 0;
  let churnedBilling = 0;
  let paymentFailed = 0;
  let processing = 0;
  let freeWithRadar = 0;
  let signedUpNoRadar = 0;
  const aiTrackedIdsUS = new Set<string>();
  const aiTrackedIdsIN = new Set<string>();
  const users: UserRow[] = [];
  const activeUniverses = await getActiveUniverses();

  const priceUniverseUS = activeUniverses.US_price;
  const aiUniverseUS = activeUniverses.US_ai;
  const priceUniverseIN = activeUniverses.IN_price;
  const aiUniverseIN = activeUniverses.IN_ai;

  const [priceUniverseUsIds, aiUniverseUsIds, priceUniverseInIds, aiUniverseInIds, priceCoreOverridesUS, priceCoreOverridesIN] = await Promise.all([
    loadUniverseInstrumentIds("US", priceUniverseUS),
    loadUniverseInstrumentIds("US", aiUniverseUS),
    priceUniverseIN ? loadUniverseInstrumentIds("IN", priceUniverseIN) : Promise.resolve([] as string[]),
    aiUniverseIN ? loadUniverseInstrumentIds("IN", aiUniverseIN) : Promise.resolve([] as string[]),
    getPriceCoreOverrides("US"),
    getPriceCoreOverrides("IN"),
  ]);

  const aiUniverseUsCount = aiUniverseUsIds.length;

  for (const doc of usersSnap.docs) {
    totalUsers += 1;
    const data = doc.data() as Record<string, unknown>;
    if (data.last_sign_in_at) loggedInUsers += 1;

    const subscribed = Boolean(data.is_subscribed);
    const email = normalizeEmail(data.email ?? data.email_lower) || doc.id;
    const tracked = Array.isArray(data.tracked_stocks)
      ? data.tracked_stocks.filter((x) => typeof x === "string")
      : [];
    const billing = classifyBilling(data);

    if (subscribed) subscribedTotal += 1;

    switch (billing.bucket) {
      case "active_paid":
        activePaidPro += 1;
        break;
      case "paid_cancel_scheduled":
        paidCancelScheduled += 1;
        break;
      case "complimentary_pro":
        complimentaryPro += 1;
        break;
      case "churned_billing":
        churnedBilling += 1;
        break;
      case "payment_issue":
        if (billing.subscriptionStatus === "payment_failed" || billing.subscriptionStatus === "failed") {
          paymentFailed += 1;
        } else if (billing.subscriptionStatus === "processing") {
          processing += 1;
        }
        break;
      case "free":
        if (tracked.length > 0) freeWithRadar += 1;
        else if (data.last_sign_in_at) signedUpNoRadar += 1;
        break;
    }

    for (const item of tracked) {
      const instrumentId = String(item ?? "").trim().toUpperCase();
      if (!instrumentId) continue;
      if (instrumentId.startsWith("US_")) aiTrackedIdsUS.add(instrumentId);
      if (instrumentId.startsWith("IN_")) aiTrackedIdsIN.add(instrumentId);
    }

    let flag: string | null = null;
    if (billing.bucket === "payment_issue") flag = billing.label;
    else if (billing.bucket === "paid_cancel_scheduled") flag = "Cancel scheduled";
    else if (billing.bucket === "complimentary_pro") flag = "No billing id";
    else if (billing.bucket === "churned_billing") flag = "Churned billing";
    else if (subscribed && billing.hasSubscriptionId && !isBillingBackedPro(billing)) {
      flag = "Billing mismatch";
    }

    users.push({
      id: doc.id,
      email,
      plan: subscribed ? "Pro" : "Free",
      status: billing.label,
      tracked: tracked.length,
      lastLogin: fmtDate(data.last_sign_in_at),
      joined: fmtDate(data.created_at),
      flag,
    });
  }

  users.sort((a, b) => {
    const planOrder = a.plan === "Pro" ? 0 : 1;
    const planOrderB = b.plan === "Pro" ? 0 : 1;
    if (planOrder !== planOrderB) return planOrder - planOrderB;
    return b.tracked - a.tracked;
  });

  // Runtime truth: price refresh runs over active price universe + overrides.
  const dailyPriceRefreshUsSet = new Set<string>(priceUniverseUsIds);
  for (const id of priceCoreOverridesUS) dailyPriceRefreshUsSet.add(id);
  const dailyPriceRefreshInSet = new Set<string>(priceUniverseInIds);
  for (const id of priceCoreOverridesIN) dailyPriceRefreshInSet.add(id);
  const inLaunchPaused = String(activeUniverses.IN_ai || "").trim().toLowerCase() === "in_ai_launch";

  const recentFeedback: FeedbackRow[] = feedbackSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        text: String(data.message ?? data.feedback ?? "").trim() || "(empty)",
        email: normalizeEmail(data.email) || null,
        createdAt: String(data.created_at ?? data.createdAt ?? "") || null,
        path: String(data.path ?? "").trim() || null,
      };
    })
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
    .slice(0, 15);

  const stockRequestLeaderboard: StockRequestRow[] = stockRequestsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        ticker: String(data.query ?? data.ticker ?? doc.id).trim().toUpperCase(),
        count: Number(data.count ?? 1),
        updatedAt: String(data.updated_at ?? data.created_at ?? "") || null,
      };
    })
    .sort((a, b) => b.count - a.count || parseTime(b.updatedAt) - parseTime(a.updatedAt))
    .slice(0, 15);

  const lifecycleEvents: LifecycleRow[] =
    lifecycleSnap?.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        type: String(data.type ?? "unknown"),
        email: normalizeEmail(data.email) || null,
        createdAt: String(data.created_at ?? "") || null,
      };
    }) ?? [];

  const newUsers7d = usersSnap.docs.filter((doc) => {
    const created = doc.data().created_at;
    const d = daysAgo(created);
    return d !== null && d <= 7;
  }).length;

  const metrics: Metric[] = [
    { label: "Total user docs", value: totalUsers },
    { label: "Logged in at least once", value: loggedInUsers },
    { label: "Pro (Firestore)", value: subscribedTotal, note: "is_subscribed = true" },
    {
      label: "Paid Pro · active",
      value: activePaidPro,
      note: "Dodo sub id + active + not cancel scheduled",
      tone: "good",
    },
    {
      label: "Paid Pro · cancel scheduled",
      value: paidCancelScheduled,
      note: "Still Pro until period ends",
      tone: paidCancelScheduled ? "warn" : "default",
    },
    {
      label: "Complimentary Pro",
      value: complimentaryPro,
      note: "Pro without Dodo subscription id (waitlist etc.)",
    },
    {
      label: "Churned · had billing",
      value: churnedBilling,
      note: "Cancelled/expired or Pro flag cleared",
      tone: churnedBilling ? "warn" : "default",
    },
    { label: "Unique tracked tickers", value: aiTrackedIdsUS.size + aiTrackedIdsIN.size },
    { label: "Feedback messages", value: feedbackSnap.size },
    { label: "Stock requests", value: stockRequestsSnap.size },
    { label: "New users (7d)", value: newUsers7d },
  ];

  const coverage: Metric[] = [
    {
      label: "Daily prices refresh · US",
      value: dailyPriceRefreshUsSet.size,
      note: `${priceUniverseUS} + price_core_overrides`,
      tone: "good",
    },
    {
      label: "Post-close fundamentals refresh · US",
      value: dailyPriceRefreshUsSet.size,
      note: "Weekdays only, same set as price refresh",
      tone: "good",
    },
    {
      label: "AI briefs · US",
      value: aiTrackedIdsUS.size,
      note: "Subscribed users' tracked stocks only",
      tone: "good",
    },
    {
      label: "Daily prices refresh · IN",
      value: inLaunchPaused ? "—" : dailyPriceRefreshInSet.size,
      note: inLaunchPaused
        ? "India is on hold (launch tier disabled)"
        : `${priceUniverseIN || "not configured"} + price_core_overrides`,
      tone: inLaunchPaused ? "warn" : "good",
    },
    {
      label: "AI briefs · IN",
      value: inLaunchPaused ? "—" : aiTrackedIdsIN.size,
      note: inLaunchPaused
        ? "India is on hold (launch tier disabled)"
        : "Subscribed users' tracked stocks only",
      tone: inLaunchPaused ? "warn" : "default",
    },
  ];

  const health: Metric[] = [
    { label: "Payment failed", value: paymentFailed, tone: paymentFailed ? "warn" : "default" },
    { label: "Payment processing", value: processing },
    { label: "Free with Radar stocks", value: freeWithRadar },
    { label: "Signed in, empty Radar", value: signedUpNoRadar, tone: signedUpNoRadar ? "warn" : "default" },
  ];

  return {
    metrics,
    coverage,
    health,
    users,
    recentFeedback,
    stockRequestLeaderboard,
    lifecycleEvents,
  };
}
