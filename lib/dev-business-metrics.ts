import { adminFirestore } from "@/lib/firebase-admin";
import { classifyBilling } from "@/lib/billing-state";

export type FeedbackRow = {
  id: string;
  text: string;
  email: string | null;
  createdAt: string | null;
  path: string | null;
};

export type DevBusinessMetrics = {
  totalUsers: number;
  paidProActive: number;
  newUsers7d: number;
  recentFeedback: FeedbackRow[];
  feedbackInPeriod: number;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseTime(value: unknown): number {
  if (!value) return 0;
  const n = new Date(String(value)).getTime();
  return Number.isFinite(n) ? n : 0;
}

function daysAgo(iso: unknown): number | null {
  const t = parseTime(iso);
  if (!t) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
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

/** Minimal Firestore counts for conversion sanity checks alongside PostHog. */
export async function loadDevBusinessMetrics(periodDays = 30): Promise<DevBusinessMetrics> {
  const [usersSnap, feedbackSnap] = await Promise.all([
    adminFirestore.collection("users").get(),
    adminFirestore.collection("feedback").get(),
  ]);

  let paidProActive = 0;
  let newUsers7d = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const billing = classifyBilling(data);
    if (billing.bucket === "active_paid") paidProActive += 1;

    const createdDays = daysAgo(data.created_at);
    if (createdDays !== null && createdDays <= 7) newUsers7d += 1;
  }

  const periodCutoffDays = periodDays;
  const allFeedback: FeedbackRow[] = feedbackSnap.docs
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
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));

  const feedbackInPeriod = allFeedback.filter((row) => {
    const age = daysAgo(row.createdAt);
    return age !== null && age <= periodCutoffDays;
  }).length;

  const recentFeedback = allFeedback
    .filter((row) => {
      const age = daysAgo(row.createdAt);
      return age !== null && age <= periodCutoffDays;
    })
    .slice(0, 20)
    .map((row) => ({
      ...row,
      createdAt: fmtDate(row.createdAt),
    }));

  return {
    totalUsers: usersSnap.size,
    paidProActive,
    newUsers7d,
    recentFeedback,
    feedbackInPeriod,
  };
}
