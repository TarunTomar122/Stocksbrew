import { appVersion, shouldSendServerEvents } from "@/lib/analytics-env";

type ServerEventProperties = Record<string, string | number | boolean | null | undefined>;

/**
 * Send one event from the server, as the signed-in person (`distinctId` is
 * the Firebase uid, the same id the browser identifies with). Only production
 * sends (lib/analytics-env.ts). Throws on a failed send so callers that care
 * can log it; most call it with `.catch(() => undefined)`. Use
 * `captureServerEventSafe` where a failure must never matter.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: ServerEventProperties = {},
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey || !distinctId) return;
  if (!shouldSendServerEvents(process.env)) return;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

  const clean = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    body: JSON.stringify({
      api_key: apiKey,
      event,
      properties: {
        distinct_id: distinctId,
        $host: "stocksbrew.online",
        $environment: "production",
        app_version: appVersion(process.env.VERCEL_GIT_COMMIT_SHA),
        source: "server",
        ...clean,
      },
    }),
  });
  if (!response.ok) throw new Error(`PostHog capture failed (${response.status})`);
}

/**
 * captureServerEvent that never throws and waits at most 1.5 seconds, for
 * events sent from a request a person is waiting on (tracking a stock).
 */
export async function captureServerEventSafe(
  distinctId: string | null | undefined,
  event: string,
  properties: ServerEventProperties = {},
): Promise<void> {
  if (!distinctId) return;
  try {
    await captureServerEvent(distinctId, event, properties, { timeoutMs: 1500 });
  } catch {
    // analytics never decides a response
  }
}
