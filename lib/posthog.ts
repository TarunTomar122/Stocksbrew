"use client";

import posthog from "posthog-js";

let inited = false;
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

type GtagFn = (...args: unknown[]) => void;

function getGtag() {
  if (typeof window === "undefined") return null;
  if (!GA_MEASUREMENT_ID) return null;

  const win = window as Window & {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  };

  win.dataLayer = win.dataLayer || [];
  win.gtag =
    win.gtag ||
    function gtag(...args: unknown[]) {
      win.dataLayer?.push(args);
    };

  return win.gtag;
}

function normalizeValue(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue).filter((v): v is string | number | boolean => v !== null).join(",");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toGtagParams(properties?: Record<string, unknown>) {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) => {
      const normalized = normalizeValue(value);
      return normalized === null ? [] : [[key, normalized]];
    }),
  );
}

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
  if (inited) client.capture(name, properties);

  if (process.env.NODE_ENV === "production") {
    const gtag = getGtag();
    if (gtag) {
      const eventName = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "") || "event";
      gtag("event", eventName, toGtagParams(properties));
    }
  }
}

export function identifyUser(
  distinctId: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (typeof window === "undefined" || !distinctId) return;
  const client = initPostHog();
  if (inited) client.identify(distinctId, properties);
}

export { posthog };
