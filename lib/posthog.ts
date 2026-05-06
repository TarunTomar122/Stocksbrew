"use client";

import posthog from "posthog-js";

let inited = false;

export function initPostHog() {
  if (inited) return posthog;
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

export { posthog };

