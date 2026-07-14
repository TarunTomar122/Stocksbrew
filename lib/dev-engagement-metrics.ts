import { adminFirestore } from "@/lib/firebase-admin";
import { POSTHOG_DOMAIN_SQL, isPostHogQueryConfigured, runHogQL } from "@/lib/posthog-server";

export type EngagementEmailRow = {
  email: string;
  uid: string | null;
  detail: string;
  createdAt: string | null;
};

export type DevEngagementMetrics = {
  radarRepeatVisitors: EngagementEmailRow[];
  radarRepeatVisitorsError: string | null;
  newsletterModalSignups: EngagementEmailRow[];
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

async function loadNewsletterModalSignups(): Promise<EngagementEmailRow[]> {
  const snap = await adminFirestore.collection("newsletter_signups").get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const source = String(data.source ?? "").trim();
      if (source !== "homepage_modal") return null;
      const email = normalizeEmail(data.email ?? doc.id);
      if (!email) return null;
      return {
        email,
        uid: String(data.uid ?? "").trim() || null,
        detail: source || "homepage_modal",
        createdAt: fmtDate(data.created_at),
      };
    })
    .filter((row): row is EngagementEmailRow => row !== null)
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
}

async function loadRadarRepeatVisitors(periodDays: number): Promise<{
  rows: EngagementEmailRow[];
  error: string | null;
}> {
  if (!isPostHogQueryConfigured()) {
    return { rows: [], error: "PostHog query API not configured" };
  }

  const interval = `interval ${periodDays} day`;
  const visitRes = await runHogQL<{ distinct_id: string; visits: number; email: string | null }>(`
    SELECT
      distinct_id,
      count() AS visits,
      any(toString(person.properties.email)) AS email
    FROM events
    WHERE timestamp > now() - ${interval}
      AND event = '$pageview'
      AND properties.path = '/watchlist'
      AND ${POSTHOG_DOMAIN_SQL}
    GROUP BY distinct_id
    HAVING visits > 1
    ORDER BY visits DESC
    LIMIT 500
  `);

  if (visitRes.error) {
    return { rows: [], error: visitRes.error };
  }

  const visitsByUser = new Map(
    visitRes.rows.map((row) => [String(row.distinct_id), Number(row.visits) || 0]),
  );
  if (visitsByUser.size === 0) {
    return { rows: [], error: null };
  }

  const usersSnap = await adminFirestore.collection("users").get();
  const rows: EngagementEmailRow[] = [];

  for (const doc of usersSnap.docs) {
    const visits = visitsByUser.get(doc.id);
    if (!visits) continue;
    const data = doc.data() as Record<string, unknown>;
    const tracked = Array.isArray(data.tracked_stocks) ? data.tracked_stocks : [];
    if (tracked.length === 0) continue;

    const email = normalizeEmail(data.email_lower ?? data.email);
    if (!email) continue;

    rows.push({
      email,
      uid: doc.id,
      detail: `${visits} radar visits · ${tracked.length} tracked`,
      createdAt: null,
    });
  }

  rows.sort((a, b) => {
    const av = Number((a.detail.match(/^(\d+)/) ?? ["0"])[0]);
    const bv = Number((b.detail.match(/^(\d+)/) ?? ["0"])[0]);
    return bv - av;
  });

  return { rows, error: null };
}

export async function loadDevEngagementMetrics(periodDays = 7): Promise<DevEngagementMetrics> {
  const [newsletterModalSignups, radar] = await Promise.all([
    loadNewsletterModalSignups(),
    loadRadarRepeatVisitors(periodDays),
  ]);

  return {
    radarRepeatVisitors: radar.rows,
    radarRepeatVisitorsError: radar.error,
    newsletterModalSignups,
  };
}
