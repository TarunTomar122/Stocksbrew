import { adminFirestore } from "@/lib/firebase-admin";
import { notFound } from "next/navigation";

type Metric = {
  label: string;
  value: number;
  note?: string;
};

type RecentRow = {
  id: string;
  text: string;
  meta?: string;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

async function loadMetrics(): Promise<{
  metrics: Metric[];
  recentFeedback: RecentRow[];
  recentStockRequests: RecentRow[];
}> {
  const [usersSnap, waitlistSnap, feedbackSnap, stockRequestsSnap] = await Promise.all([
    adminFirestore.collection("users").get(),
    adminFirestore.collection("waitlist").get(),
    adminFirestore.collection("feedback").get(),
    adminFirestore.collection("stock_requests").get(),
  ]);

  const waitlistEmails = new Set<string>();
  for (const doc of waitlistSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const email = normalizeEmail(data.email);
    if (email) waitlistEmails.add(email);
  }

  let totalLogins = 0;
  let subscribedTotal = 0;
  let nonWaitlistSubscribed = 0;
  let truePaidSubs = 0;
  const aiTrackedIds = new Set<string>();

  for (const doc of usersSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.last_sign_in_at) totalLogins += 1;

    const subscribed = Boolean(data.is_subscribed);
    const email = normalizeEmail(data.email ?? data.email_lower);
    const tracked = Array.isArray(data.tracked_stocks) ? data.tracked_stocks : [];
    const subscriptionId = String(data.subscriptionId ?? "").trim();
    const subscriptionStatus = String(data.subscriptionStatus ?? "").trim().toLowerCase();
    const billingActive = Boolean(subscriptionId) && (
      subscriptionStatus === "active" ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "on_trial"
    );

    if (!subscribed) continue;
    subscribedTotal += 1;
    if (!waitlistEmails.has(email)) nonWaitlistSubscribed += 1;
    if (billingActive) truePaidSubs += 1;
    for (const item of tracked) {
      const instrumentId = String(item ?? "").trim().toUpperCase();
      if (instrumentId) aiTrackedIds.add(instrumentId);
    }
  }

  const metrics: Metric[] = [
    { label: "Users who logged in", value: totalLogins, note: "users with last_sign_in_at" },
    { label: "Subscribed users", value: subscribedTotal, note: "users.is_subscribed = true" },
    {
      label: "Subscribed users",
      value: Math.max(0, nonWaitlistSubscribed - 4),
      note: "Manual adjustment applied (-4)",
    },
    {
      label: "True paid subscribers",
      value: truePaidSubs,
      note: "Billing-backed active/trialing subscriptions",
    },
    {
      label: "Stocks getting AI/news",
      value: aiTrackedIds.size,
      note: "Unique tracked instruments across subscribed users",
    },
    {
      label: "Feedback submitted",
      value: feedbackSnap.size,
      note: "Total feedback docs",
    },
    {
      label: "Stock requests submitted",
      value: stockRequestsSnap.size,
      note: "Total stock_requests docs",
    },
  ];

  const recentFeedback: RecentRow[] = feedbackSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const msg = String(data.message ?? data.feedback ?? "").trim();
      const createdAt = String(data.created_at ?? data.createdAt ?? "");
      const email = normalizeEmail(data.email);
      return {
        id: doc.id,
        text: msg || "(empty message)",
        meta: [email || "anonymous", createdAt].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => (a.meta || "") < (b.meta || "") ? 1 : -1)
    .slice(0, 12);

  const recentStockRequests: RecentRow[] = stockRequestsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const query = String(data.query ?? data.ticker ?? doc.id).trim();
      const count = Number(data.count ?? 1);
      const createdAt = String(data.created_at ?? data.updated_at ?? "");
      return {
        id: doc.id,
        text: query || doc.id,
        meta: [`count ${Number.isFinite(count) ? count : 1}`, createdAt].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => (a.meta || "") < (b.meta || "") ? 1 : -1)
    .slice(0, 12);

  return { metrics, recentFeedback, recentStockRequests };
}

export default async function DevAnalyticsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { metrics, recentFeedback, recentStockRequests } = await loadMetrics();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">Dev Analytics</h1>
      <p className="mt-2 text-sm text-[#6b7280]">Quick internal counters from Firestore.</p>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="rounded-2xl border border-[#e5e7eb] bg-white p-5"
          >
            <p className="text-sm font-medium text-[#6b7280]">{metric.label}</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums text-[#111111]">
              {metric.value.toLocaleString()}
            </p>
            {metric.note && <p className="mt-2 text-xs text-[#9ca3af]">{metric.note}</p>}
          </article>
        ))}
      </section>

      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111111]">Recent feedback</h2>
          <div className="mt-4 space-y-3">
            {recentFeedback.length === 0 ? (
              <p className="text-sm text-[#6b7280]">No feedback yet.</p>
            ) : (
              recentFeedback.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#f1f5f9] p-3">
                  <p className="text-sm text-[#111111]">{row.text}</p>
                  {row.meta && <p className="mt-1 text-xs text-[#9ca3af]">{row.meta}</p>}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#111111]">Recent stock requests</h2>
          <div className="mt-4 space-y-3">
            {recentStockRequests.length === 0 ? (
              <p className="text-sm text-[#6b7280]">No stock requests yet.</p>
            ) : (
              recentStockRequests.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#f1f5f9] p-3">
                  <p className="text-sm font-medium text-[#111111]">{row.text}</p>
                  {row.meta && <p className="mt-1 text-xs text-[#9ca3af]">{row.meta}</p>}
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
