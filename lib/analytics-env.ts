/**
 * Where analytics may send from. Pure (no browser or server imports) so the
 * client, the server and the tests share one rule.
 *
 * Only the production site sends to PostHog. Localhost, `next dev`, Vercel
 * preview deployments and any other host stay out of production analytics:
 * they either do nothing or, with the debug flag on, print each event to the
 * console instead of sending it (docs/analytics.md, "Testing locally").
 */

export const PRODUCTION_HOSTS = ["www.stocksbrew.online", "stocksbrew.online"] as const;

export type AnalyticsEnvironment = "production" | "preview" | "dev";

/** localStorage key that turns on console-only event logging in any environment. */
export const ANALYTICS_DEBUG_KEY = "sb_analytics_debug";

export function analyticsEnvironment(input: {
  hostname?: string | null;
  nodeEnv?: string | null;
  vercelEnv?: string | null;
}): AnalyticsEnvironment {
  const host = (input.hostname ?? "").trim().toLowerCase();
  if (input.nodeEnv !== "production") return "dev";
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local")) return "dev";
  if (input.vercelEnv === "preview" || input.vercelEnv === "development") return "preview";
  if ((PRODUCTION_HOSTS as readonly string[]).includes(host)) return "production";
  // Any other host (a *.vercel.app alias, a tunnel, a copy of the site) is not production.
  return "preview";
}

/** Whether the browser should send events to PostHog. */
export function shouldSendClientEvents(env: AnalyticsEnvironment, key: string | null | undefined): boolean {
  return env === "production" && Boolean(key && key.trim());
}

/**
 * Whether the server should send an event. Vercel sets VERCEL_ENV; anywhere
 * else (the VPS jobs, `next start` on a laptop) needs NODE_ENV=production and
 * an explicit POSTHOG_SERVER_CAPTURE=1, so a local run never writes into the
 * production project by accident.
 */
export function shouldSendServerEvents(env: {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  POSTHOG_SERVER_CAPTURE?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
}): boolean {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) return false;
  if (env.POSTHOG_SERVER_CAPTURE === "0") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production" && env.POSTHOG_SERVER_CAPTURE === "1";
}

/**
 * Pages that show a person's own holdings, values or account. Session replay
 * masks every piece of text on them (lib/posthog.ts), so recordings never
 * carry portfolio values or share counts.
 */
const PRIVATE_PATHS = /^\/(watchlist|portfolio|practice|profile|account|admin)(\/|$)/;

export function isPrivatePath(pathname: string | null | undefined): boolean {
  return PRIVATE_PATHS.test(pathname ?? "");
}

/** Replay text masking: stars on private pages, the text itself elsewhere. */
export function maskReplayText(text: string, pathname: string | null | undefined): string {
  return isPrivatePath(pathname) ? text.replace(/\S/g, "*") : text;
}

/** Short commit sha for the `app_version` super property; "dev" off Vercel. */
export function appVersion(sha: string | null | undefined): string {
  const clean = (sha ?? "").trim();
  return clean ? clean.slice(0, 7) : "dev";
}
