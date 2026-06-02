"use client";

import posthog from "posthog-js";

let inited = false;

export function initPostHog() {
  if (inited) return posthog;
  if (typeof window === "undefined") return posthog;
  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");
  if (isLocal || process.env.NODE_ENV !== "production") return posthog;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return posthog;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: true,
    capture_pageview: false,
  });
  inited = true;
  return posthog;
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const client = initPostHog();
  if (!inited) return;
  client.capture(name, properties);
}

export { posthog };
