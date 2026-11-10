"use client";

import posthog from "posthog-js";

import {
  ANALYTICS_DEBUG_KEY,
  analyticsEnvironment,
  appVersion,
  isPrivatePath,
  maskReplayText,
  shouldSendClientEvents,
  type AnalyticsEnvironment,
} from "@/lib/analytics-env";

/**
 * The one way the browser talks to PostHog (and GA4). Every call here is
 * best-effort: it never throws, never awaits the network and does nothing on
 * the server. Only the production site sends (lib/analytics-env.ts); with
 * localStorage `sb_analytics_debug=1` any environment prints events to the
 * console instead, which is how tracking is tested locally.
 */

type Mode = "idle" | "live" | "debug" | "off";

let mode: Mode = "idle";
let environment: AnalyticsEnvironment = "dev";
/** Debug mode only: whether identify ran, standing in for PostHog's own `$user_state`. */
let debugIdentified = false;
/** Super properties, mirrored here so debug mode prints what production would send. */
const superProps: Record<string, unknown> = {};

/** PostHog's own events that carry clicked or copied element text (`$el_text`, `$elements`). */
const ELEMENT_TEXT_EVENTS = new Set(["$autocapture", "$rageclick", "$dead_click", "$copy_autocapture"]);

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

function readDebugFlag(): boolean {
  try {
    return window.localStorage.getItem(ANALYTICS_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Drop undefined values so payloads stay small and PostHog never stores "undefined". */
export function compactProps(properties?: Record<string, unknown>): Record<string, unknown> {
  if (!properties) return {};
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}

export function initPostHog() {
  if (typeof window === "undefined" || mode !== "idle") return posthog;
  try {
    environment = analyticsEnvironment({
      hostname: window.location.hostname,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    });
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const base = {
      $environment: environment === "production" ? "production" : "dev",
      // CLI deploys carry no git metadata, so the deploy passes NEXT_PUBLIC_APP_VERSION (the commit) as a build env.
      app_version: appVersion(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION),
    };
    Object.assign(superProps, base);
    if (shouldSendClientEvents(environment, key)) {
      posthog.init(key as string, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        person_profiles: "identified_only",
        autocapture: true,
        // $pageview is sent by components/posthog-pageview.tsx on every app-router navigation.
        capture_pageview: false,
        capture_pageleave: true,
        // window.onerror and unhandled rejections arrive as $exception.
        capture_exceptions: true,
        // Replay (switched on in the project settings) never records typed
        // input, and masks all text on portfolio and account pages.
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
          maskTextFn: (text) => maskReplayText(text, window.location.pathname),
        },
        // Autocaptured clicks (and rage/dead clicks, copies) carry the element's
        // text, which on a portfolio page can be a value or a share count: drop them there.
        before_send: (event) => (event && ELEMENT_TEXT_EVENTS.has(event.event) && isPrivatePath(window.location.pathname) ? null : event),
        loaded: (client) => {
          client.register(base);
        },
      });
      mode = "live";
    } else {
      mode = readDebugFlag() ? "debug" : "off";
    }
  } catch {
    mode = "off";
  }
  return posthog;
}

/** Which environment this page counts as; "dev" before init. */
export function analyticsMode(): { mode: Mode; environment: AnalyticsEnvironment } {
  return { mode, environment };
}

function debugLog(kind: string, name: string, properties?: Record<string, unknown>) {
  try {
    console.info(`[analytics] ${kind} ${name}`, JSON.stringify({ ...superProps, ...(properties ?? {}) }));
  } catch {
    // console can be missing in odd embeds
  }
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    initPostHog();
    const props = compactProps(properties);
    if (mode === "live") posthog.capture(name, props);
    else if (mode === "debug") debugLog("capture", name, props);
    else return;

    if (mode === "live") {
      const gtag = getGtag();
      if (gtag) {
        const eventName = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "") || "event";
        gtag("event", eventName, toGtagParams(props));
      }
    }
  } catch {
    // analytics must never break the page
  }
}

/** Properties sent with every later event (plan, signed_in). Persisted by PostHog across visits. */
export function registerSuperProperties(properties: Record<string, string | number | boolean | null>) {
  if (typeof window === "undefined") return;
  try {
    initPostHog();
    Object.assign(superProps, properties);
    if (mode === "live") posthog.register(properties);
    else if (mode === "debug") debugLog("register", "super_properties", properties);
  } catch {
    // never throw from analytics
  }
}

/**
 * Tie this browser to the Firebase uid. Only the uid and non-identifying
 * account facts (plan) go to PostHog: no email, no name.
 */
export function identifyUser(
  distinctId: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (typeof window === "undefined" || !distinctId) return;
  try {
    initPostHog();
    const props = compactProps(properties);
    if (mode === "live") {
      if (posthog.get_distinct_id() !== distinctId) posthog.identify(distinctId, props);
      else if (Object.keys(props).length > 0) posthog.setPersonProperties(props);
    } else if (mode === "debug") {
      if (!debugIdentified) debugLog("identify", distinctId, props);
      debugIdentified = true;
    }
  } catch {
    // never throw from analytics
  }
}

/**
 * Forget the signed-in person on this browser, but only when PostHog holds an
 * identified person. Firebase reports "no user" on every anonymous page load
 * too; resetting then would mint a new anonymous id each visit and make every
 * returning visitor look new.
 */
export function resetAnalyticsIfIdentified() {
  if (typeof window === "undefined") return;
  try {
    initPostHog();
    const identified = mode === "live" ? posthog.get_property("$user_state") === "identified" : debugIdentified;
    if (!identified) return;
    debugIdentified = false;
    for (const key of Object.keys(superProps)) {
      if (key !== "$environment" && key !== "app_version") delete superProps[key];
    }
    if (mode === "live") {
      posthog.reset();
      posthog.register({ $environment: superProps.$environment, app_version: superProps.app_version });
    } else if (mode === "debug") {
      debugLog("reset", "analytics");
    }
  } catch {
    // never throw from analytics
  }
}

/** Report a caught error (an error boundary, a failed request worth seeing). */
export function captureError(error: unknown, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    initPostHog();
    if (mode === "live") posthog.captureException(error, compactProps(properties));
    else if (mode === "debug") debugLog("exception", error instanceof Error ? error.message : String(error), properties);
  } catch {
    // never throw from analytics
  }
}

export { posthog };
