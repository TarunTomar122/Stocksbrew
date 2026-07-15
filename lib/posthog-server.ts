/**
 * Server-only PostHog HogQL queries for internal analytics.
 * Requires a PostHog personal API key and POSTHOG_PROJECT_ID.
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
  return Boolean((process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_TOKEN) && process.env.POSTHOG_PROJECT_ID);
}

export async function runHogQL<T extends Record<string, unknown>>(
  query: string,
): Promise<{ rows: T[]; error?: string }> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_TOKEN;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    return { rows: [], error: "PostHog query token not configured" };
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

export type TrafficDay = {
  day: string;
  visitors: number;
  signups: number;
};

export type VisitorLocation = {
  country: string;
  visitors: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
};

export type PostHogAnalyticsSnapshot = {
  configured: boolean;
  error?: string;
  periodDays: number;
  summary: {
    visitors: number;
    returningVisitors: number;
    newVisitors: number;
  };
  trafficSeries: TrafficDay[];
  visitorLocations: VisitorLocation[];
  topPaths: Array<{ path: string; views: number }>;
  trafficSources: Array<{ source: string; views: number }>;
  funnel: FunnelStep[];
  checkoutConversionRate: number | null;
};

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export async function loadPostHogAnalytics(days = 7): Promise<PostHogAnalyticsSnapshot> {
  const periodDays = days === 7 ? 7 : 30;
  const empty: PostHogAnalyticsSnapshot = {
    configured: isPostHogQueryConfigured(),
    periodDays,
    summary: {
      visitors: 0,
      returningVisitors: 0,
      newVisitors: 0,
    },
    trafficSeries: [],
    visitorLocations: [],
    topPaths: [],
    trafficSources: [],
    funnel: [],
    checkoutConversionRate: null,
  };

  if (!empty.configured) return empty;

  const domain = POSTHOG_DOMAIN_SQL;
  const interval = `interval ${periodDays} day`;
  const pageviewFilter = `event = '$pageview' AND ${domain}`;

  const [
    seriesRes,
    signupsSeriesRes,
    summaryRes,
    returningRes,
    locationsRes,
    pathsRes,
    sourcesRes,
    visitorsRes,
    signUpRes,
    checkoutClickRes,
    checkoutStartRes,
    convertedRes,
  ] = await Promise.all([
    runHogQL<{ day: string; visitors: number }>(`
      SELECT
        toDate(timestamp) AS day,
        count(DISTINCT person_id) AS visitors
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
      GROUP BY day
      ORDER BY day ASC
      LIMIT ${periodDays}
    `),
    runHogQL<{ day: string; signups: number }>(`
      SELECT
        toDate(timestamp) AS day,
        count(DISTINCT person_id) AS signups
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = 'user_signed_up'
        AND ${domain}
      GROUP BY day
      ORDER BY day ASC
      LIMIT ${periodDays}
    `),
    runHogQL<{ visitors: number }>(`
      SELECT count(DISTINCT person_id) AS visitors
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
      LIMIT 1
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
        AND person_id IN (
          SELECT person_id
          FROM events
          WHERE timestamp > now() - interval ${periodDays * 2} day
            AND timestamp <= now() - ${interval}
            AND ${pageviewFilter}
        )
      LIMIT 1
    `),
    runHogQL<{ country: string; visitors: number }>(`
      SELECT
        if(
          length(toString(properties.$geoip_country_name)) > 0,
          toString(properties.$geoip_country_name),
          'Unknown'
        ) AS country,
        count(DISTINCT person_id) AS visitors
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
      GROUP BY country
      ORDER BY visitors DESC
      LIMIT 12
    `),
    runHogQL<{ path: string; views: number }>(`
      SELECT properties.path AS path, count() AS views
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
        AND properties.path != ''
      GROUP BY path
      ORDER BY views DESC
      LIMIT 12
    `),
    runHogQL<{ source: string; views: number }>(`
      SELECT
        multiIf(
          length(toString(properties.utm_source)) > 0, toString(properties.utm_source),
          length(toString(properties.source)) > 0, toString(properties.source),
          length(toString(properties.referrer)) > 0, toString(properties.referrer),
          'direct / none'
        ) AS source,
        count() AS views
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
      GROUP BY source
      ORDER BY views DESC
      LIMIT 10
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND ${pageviewFilter}
      LIMIT 1
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = 'user_signed_up'
        AND ${domain}
      LIMIT 1
    `),
    runHogQL<{ c: number }>(`
      SELECT count(DISTINCT person_id) AS c
      FROM events
      WHERE timestamp > now() - ${interval}
        AND event = 'checkout_clicked'
        AND ${domain}
      LIMIT 1
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
    seriesRes.error ??
    signupsSeriesRes.error ??
    summaryRes.error ??
    returningRes.error ??
    locationsRes.error ??
    pathsRes.error ??
    sourcesRes.error ??
    visitorsRes.error ??
    signUpRes.error ??
    checkoutClickRes.error ??
    checkoutStartRes.error ??
    convertedRes.error;

  const visitors = Number(summaryRes.rows[0]?.visitors ?? 0);
  const returningVisitors = Number(returningRes.rows[0]?.c ?? 0);
  const newVisitors = Math.max(0, visitors - returningVisitors);

  const funnelVisitors = Number(visitorsRes.rows[0]?.c ?? 0);
  const signUps = Number(signUpRes.rows[0]?.c ?? 0);
  const checkoutClicked = Number(checkoutClickRes.rows[0]?.c ?? 0);
  const checkoutStarted = Number(checkoutStartRes.rows[0]?.c ?? 0);
  const converted = Number(convertedRes.rows[0]?.c ?? 0);

  const funnel: FunnelStep[] = [
    { key: "visitors", label: "Unique visitors", count: funnelVisitors },
    { key: "sign_ups", label: "Sign-ups", count: signUps },
    { key: "checkout_clicked", label: "Checkout clicked", count: checkoutClicked },
    { key: "checkout_started", label: "Checkout started", count: checkoutStarted },
    { key: "converted", label: "Subscribed", count: converted },
  ];

  const visitorsByDay = new Map(
    seriesRes.rows.map((r) => [String(r.day), Number(r.visitors ?? 0)]),
  );
  const signupsByDay = new Map(
    signupsSeriesRes.rows.map((r) => [String(r.day), Number(r.signups ?? 0)]),
  );
  const allDays = [...new Set([...visitorsByDay.keys(), ...signupsByDay.keys()])].sort();

  return {
    configured: true,
    error: firstError,
    periodDays,
    summary: {
      visitors,
      returningVisitors,
      newVisitors,
    },
    trafficSeries: allDays.map((day) => ({
      day,
      visitors: visitorsByDay.get(day) ?? 0,
      signups: signupsByDay.get(day) ?? 0,
    })),
    visitorLocations: locationsRes.rows.map((r) => ({
      country: String(r.country),
      visitors: Number(r.visitors ?? 0),
    })),
    topPaths: pathsRes.rows.map((r) => ({
      path: String(r.path),
      views: Number(r.views ?? 0),
    })),
    trafficSources: sourcesRes.rows.map((r) => ({
      source: shortenSource(String(r.source)),
      views: Number(r.views ?? 0),
    })),
    funnel,
    checkoutConversionRate: pct(converted, checkoutStarted),
  };
}

function shortenSource(raw: string): string {
  const value = raw.trim();
  if (!value || value === "direct / none") return "Direct";
  if (value.length <= 48) return value;
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return `${value.slice(0, 45)}…`;
  }
}
