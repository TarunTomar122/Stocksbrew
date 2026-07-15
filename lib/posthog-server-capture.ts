type ServerEventProperties = Record<string, string | number | boolean | null | undefined>;

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: ServerEventProperties = {},
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey || !distinctId) return;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

  const response = await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      properties: {
        distinct_id: distinctId,
        $host: "stocksbrew.online",
        source: "server",
        ...properties,
      },
    }),
  });
  if (!response.ok) throw new Error(`PostHog capture failed (${response.status})`);
}
