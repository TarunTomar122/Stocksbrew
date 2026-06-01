/**
 * Server-only PostHog HogQL queries for internal analytics.
 * Requires POSTHOG_PERSONAL_API_KEY (Project query read) + POSTHOG_PROJECT_ID.
 */

const DOMAIN_HOSTS = [
  "www.stocksbrew.online",
  "stocksbrew.online",
  "www.tikrr.online",
  "tikrr.online",
] as const;

export const POSTHOG_DOMAIN_SQL = `(
  properties.$host IN (${DOMAIN_HOSTS.map((h) => `'${h}'`).join(", ")})
  OR properties.$current_url LIKE '%stocksbrew.online%'
  OR properties.$current_url LIKE '%tikrr.online%'
)`;

type HogQLResponse = {
  columns?: string[];
  results?: unknown[][];
  detail?: string;
};

function apiHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  return host.replace("i.posthog.com", "posthog.com").replace(/\/$/, "");
}

export function isPostHogQueryConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

export async function runHogQL<T extends Record<string, unknown>>(
  query: string,
): Promise<{ rows: T[]; error?: string }> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    return { rows: [], error: "POSTHOG_PERSONAL_API_KEY not configured" };
  }

  try {
    const res = await fetch(`${apiHost()}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query },
      }),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as HogQLResponse;
    if (!res.ok) {
      return {
        rows: [],
        error: json.detail ?? `PostHog query failed (${res.status})`,
      };
    }

    const columns = json.columns ?? [];
    const results = json.results ?? [];
    const rows = results.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as T;
    });
    return { rows };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : "PostHog query error" };
  }
}

export type PostHogAnalyticsSnapshot = {
  configured: boolean;
  error?: string;
  dauSeries: Array<{ day: string; dau: number }>;
  eventCounts: Array<{ event: string; count: number }>;
  topPaths: Array<{ path: string; views: number }>;
  funnel: {
    checkoutStarted: number;
    subscriptionConverted: number;
    conversionRate: number | null;
  };
  periodDays: number;
};

export async function loadPostHogAnalytics(days = 30): Promise<PostHogAnalyticsSnapshot> {
  const empty: PostHogAnalyticsSnapshot = {
    configured: isPostHogQueryConfigured(),
    dauSeries: [],
    eventCounts: [],
    topPaths: [],
    funnel: { checkoutStarted: 0, subscriptionConverted: 0, conversionRate: null },
    periodDays: days,
  };

  if (!empty.configured) return empty;

  const domain = POSTHOG_DOMAIN_SQL;
  const interval = `interval ${days} day`;

  const [dauRes, eventsRes, pathsRes, checkoutRes, convertedRes] = await Promise.all([
    runHogQL<{ day: string; dau: number }>(`
      SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS dau
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = '$pageview'
        AND ${domain}
      GROUP BY day
      ORDER BY day DESC
      LIMIT 14
    `),
    runHogQL<{ event: string; c: number }>(`
      SELECT event, count() AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${domain}
        AND event NOT LIKE '$%'
      GROUP BY event
      ORDER BY c DESC
      LIMIT 12
    `),
    runHogQL<{ path: string; views: number }>(`
      SELECT properties.path AS path, count() AS views
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = '$pageview'
        AND ${domain}
        AND properties.path != ''
      GROUP BY path
      ORDER BY views DESC
      LIMIT 10
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = 'checkout_started'
        AND ${domain}
      LIMIT 1
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = 'subscription_converted'
        AND ${domain}
      LIMIT 1
    `),
  ]);

  const firstError =
    dauRes.error ?? eventsRes.error ?? pathsRes.error ?? checkoutRes.error ?? convertedRes.error;

  const checkoutStarted = Number(checkoutRes.rows[0]?.c ?? 0);
  const subscriptionConverted = Number(convertedRes.rows[0]?.c ?? 0);

  return {
    configured: true,
    error: firstError,
    dauSeries: dauRes.rows.map((r) => ({
      day: String(r.day),
      dau: Number(r.dau ?? 0),
    })),
    eventCounts: eventsRes.rows.map((r) => ({
      event: String(r.event),
      count: Number(r.c ?? 0),
    })),
    topPaths: pathsRes.rows.map((r) => ({
      path: String(r.path),
      views: Number(r.views ?? 0),
    })),
    funnel: {
      checkoutStarted,
      subscriptionConverted,
      conversionRate:
        checkoutStarted > 0
          ? Math.round((subscriptionConverted / checkoutStarted) * 1000) / 10
          : null,
    },
    periodDays: days,
  };
}
