"use client";

import type { PostHog } from "posthog-js";

import { beaconSignedIn, beaconTrack } from "@/lib/analytics/beacon";
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
 *
 * posthog-js itself (about 60KB) is not in any page's first load: it is
 * imported once the browser is idle or the visitor first interacts
 * (loadPostHog). Calls made before then wait in a queue, in order, and
 * captures keep the time they happened.
 */

type Mode = "idle" | "live" | "debug" | "off";

let mode: Mode = "idle";
let environment: AnalyticsEnvironment = "dev";
/** Debug mode only: whether identify ran, standing in for PostHog's own `$user_state`. */
let debugIdentified = false;
/** Super properties, mirrored here so debug mode prints what production would send. */
const superProps: Record<string, unknown> = {};

/** The loaded client, once posthog-js has arrived and been initialised. */
let client: PostHog | null = null;
/** Calls made in live mode before the client arrived, run in order once it does. */
let queue: Array<(ph: PostHog) => void> = [];
let loading: Promise<void> | null = null;
let loadScheduled = false;
/** posthog-js could not be loaded (blocked or offline): PostHog calls are dropped, GA4 events still go. */
let loadFailed = false;
/** Set by initPostHog in live mode: the options posthog.init gets once the library has loaded. */
let pendingInit: { key: string; base: Record<string, unknown> } | null = null;
/** A queue cap, so a page that never goes idle cannot grow it without bound. */
const MAX_QUEUED = 200;

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
      // PostHog's own keys ($set, $insert_id) mean nothing to GA, and GA names must start with a letter.
      if (key.startsWith("$")) return [];
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

function posthogConfig(base: Record<string, unknown>) {
  return {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only" as const,
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
      maskTextFn: (text: string) => maskReplayText(text, window.location.pathname),
    },
    // Autocaptured clicks (and rage/dead clicks, copies) carry the element's
    // text, which on a portfolio page can be a value or a share count: drop them there.
    // Nothing at all is sent from the owner's /admin pages (autocapture, page leave, exceptions included).
    before_send: (event: { event: string } | null) =>
      !event || onAdminPage() || (ELEMENT_TEXT_EVENTS.has(event.event) && isPrivatePath(window.location.pathname)) ? null : event,
    loaded: (loaded: PostHog) => {
      loaded.register(base);
    },
  };
}

/**
 * Import and start posthog-js now, then run every queued call. Safe to call
 * any number of times; does nothing unless this page sends events.
 */
export function loadPostHog(): Promise<void> {
  if (loading) return loading;
  const init = pendingInit;
  if (!init) return Promise.resolve();
  loading = import("posthog-js")
    .then(({ default: ph }) => {
      // The config's callback parameter types are narrower than posthog-js's own; the shape is the documented one.
      ph.init(init.key, posthogConfig(init.base) as unknown as Parameters<PostHog["init"]>[1]);
      client = ph;
      const waiting = queue;
      queue = [];
      for (const call of waiting) {
        try {
          call(ph);
        } catch {
          // one bad call must not drop the rest
        }
      }
    })
    .catch(() => {
      // Blocked by an extension or offline: stop queueing, the page carries on without PostHog.
      loadFailed = true;
      queue = [];
    });
  return loading;
}

/** Start loading when the browser is idle, or at the first interaction, whichever comes first. */
function scheduleLoad() {
  if (loadScheduled || typeof window === "undefined") return;
  loadScheduled = true;
  const start = () => {
    void loadPostHog();
  };
  try {
    const events = ["pointerdown", "keydown", "scroll"] as const;
    const onFirst = () => {
      for (const name of events) window.removeEventListener(name, onFirst, true);
      start();
    };
    for (const name of events) window.addEventListener(name, onFirst, { capture: true, passive: true, once: true });
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === "function") idle.call(window, start, { timeout: 4000 });
    else setTimeout(start, 2000);
  } catch {
    setTimeout(start, 2000);
  }
}

/** Run a call against PostHog now if it is loaded, or once it is. Live mode only. */
function withPostHog(call: (ph: PostHog) => void) {
  if (loadFailed) return;
  if (client) {
    call(client);
    return;
  }
  if (queue.length < MAX_QUEUED) queue.push(call);
  scheduleLoad();
}

export function initPostHog(): void {
  if (typeof window === "undefined" || mode !== "idle") return;
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
      pendingInit = { key: key as string, base };
      mode = "live";
      scheduleLoad();
    } else {
      mode = readDebugFlag() ? "debug" : "off";
    }
  } catch {
    mode = "off";
  }
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

/** The owner's /admin pages are never counted, by PostHog or by our own beacon. */
function onAdminPage(): boolean {
  try {
    return /^\/admin(\/|$)/.test(window.location.pathname);
  } catch {
    return false;
  }
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (onAdminPage()) return;
  // Our own first-party analytics (/admin/analytics) gets the pageviews and key events in every environment;
  // it keeps only what lib/analytics/beacon.ts allows, and never throws.
  beaconTrack(name, properties);
  try {
    initPostHog();
    const props = compactProps(properties);
    if (mode === "live") {
      // Queued captures keep the moment they happened, not the moment PostHog arrived.
      const timestamp = new Date();
      withPostHog((ph) => {
        ph.capture(name, props, { timestamp });
      });
    } else if (mode === "debug") debugLog("capture", name, props);
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
  if (typeof properties.signed_in === "boolean") beaconSignedIn(properties.signed_in);
  try {
    initPostHog();
    Object.assign(superProps, properties);
    if (mode === "live") withPostHog((ph) => ph.register(properties));
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
      withPostHog((ph) => {
        if (ph.get_distinct_id() !== distinctId) ph.identify(distinctId, props);
        else if (Object.keys(props).length > 0) ph.setPersonProperties(props);
      });
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
    if (mode === "live") {
      // Whether PostHog holds an identified person is only known once it has loaded.
      withPostHog((ph) => {
        if (ph.get_property("$user_state") !== "identified") return;
        clearUserSuperProps();
        ph.reset();
        ph.register({ $environment: superProps.$environment, app_version: superProps.app_version });
      });
    } else if (mode === "debug" && debugIdentified) {
      debugIdentified = false;
      clearUserSuperProps();
      debugLog("reset", "analytics");
    }
  } catch {
    // never throw from analytics
  }
}

function clearUserSuperProps() {
  for (const key of Object.keys(superProps)) {
    if (key !== "$environment" && key !== "app_version") delete superProps[key];
  }
}

/** Report a caught error (an error boundary, a failed request worth seeing). */
export function captureError(error: unknown, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    initPostHog();
    if (mode === "live") {
      const props = compactProps(properties);
      withPostHog((ph) => ph.captureException(error, props));
    }
    else if (mode === "debug") debugLog("exception", error instanceof Error ? error.message : String(error), properties);
  } catch {
    // never throw from analytics
  }
}

