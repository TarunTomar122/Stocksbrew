/**
 * Where the first look lives: a field on the person's own user doc (`first_look`), additive. Pure, so the rules for
 * when /agent shows the panel, the one-time offer, or nothing can be tested.
 */

import { FIRST_LOOK_DAYS, type FirstLookState, type FirstLookView } from "./types";

/** The `?first-look=1` preview: any signed-in person sees the panel, and nothing is written until they tap. */
export const PREVIEW_PARAM = "first-look";

const SOURCES = new Set(["onboarding", "agent", "landing"]);

const isTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** The stored state, or null when the person has never had a first look (or the field is unreadable). */
export function readFirstLook(doc: unknown): FirstLookState | null {
  const raw = (doc as { first_look?: unknown } | null)?.first_look;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isTime(value.started_at)) return null;
  return {
    started_at: value.started_at,
    dismissed_at: isTime(value.dismissed_at) ? value.dismissed_at : null,
    ...(typeof value.source === "string" && SOURCES.has(value.source) ? { source: value.source as FirstLookState["source"] } : {}),
  };
}

/**
 * The panel shows for a person whose first look started (onboarding, or the one-time offer), until they dismiss it,
 * their first agent run after it lands, or FIRST_LOOK_DAYS pass. Someone with stocks who never had one gets the offer
 * once; signed out, or with no stocks, nothing.
 */
export function firstLookView(input: {
  signedIn: boolean;
  stocks: number;
  state: FirstLookState | null;
  preview: boolean;
  /** When their newest agent run ran (ISO), if any. */
  lastRunAt: string | null;
  now: Date;
}): FirstLookView {
  if (!input.signedIn || input.stocks <= 0) return { show: "none" };
  if (input.preview) return { show: "panel", preview: true };
  const state = input.state;
  if (!state) return { show: "offer" };
  if (state.dismissed_at) return { show: "none" };
  const started = Date.parse(state.started_at);
  if (input.now.getTime() - started > FIRST_LOOK_DAYS * 86_400_000) return { show: "none" };
  if (input.lastRunAt && Date.parse(input.lastRunAt) > started) return { show: "none" };
  return { show: "panel", preview: false };
}

export type FirstLookAction = "start" | "dismiss";

/**
 * The next stored state for an action, or null when nothing should be written. Start only ever starts once (a second
 * start never brings a dismissed look back); dismiss only closes a look that exists, or records a preview closed.
 */
export function nextFirstLook(current: FirstLookState | null, action: FirstLookAction, now: Date, source: FirstLookState["source"] = "agent"): FirstLookState | null {
  const stamp = now.toISOString();
  if (action === "start") return current ? null : { started_at: stamp, dismissed_at: null, source };
  if (current?.dismissed_at) return null;
  return { started_at: current?.started_at ?? stamp, dismissed_at: stamp, source: current?.source ?? source };
}
