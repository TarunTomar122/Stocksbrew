"use client";

import * as React from "react";

import { afterInView, SEEN_AFTER_MS } from "@/lib/inbox/seen";
import { INBOX_SEEN_EVENT } from "@/lib/inbox/types";

/**
 * Opening the inbox page or the bell's popover reads it: after about two seconds in view, everything shown is
 * marked read (POST /api/inbox/seen with the newest shown time; the server only moves the mark forward). Following
 * an item marks it at once. The bell's count clears through INBOX_SEEN_EVENT as soon as the save lands. The rows
 * keep their "new" dot for the rest of this view, so people see what was new; the next view draws them read.
 */

/**
 * The newest time this tab has already saved, and for which account (its uid), so the page and the popover never
 * post the same mark twice. Another account in the same tab (sign out, sign in as someone else) starts from nothing.
 */
let saved: { account: string; upTo: number } | null = null;
/** A save on its way, for which account and how far it reaches: a second ask it already covers waits for it. */
let inFlight: { account: string | null; upTo: number; done: Promise<string | null> } | null = null;

/**
 * Saves the mark up to `at` (now, with no time) for the signed-in `account` (its uid). Resolves to the stored mark,
 * or null when it did not save. Without an account nothing is skipped: every ask goes to the server.
 */
export async function postSeen(at: string | null, options: { keepalive?: boolean; account?: string | null } = {}): Promise<string | null> {
  const account = options.account || null;
  const asked = at ? Date.parse(at) : Number.NaN;
  if (account && saved?.account === account && Number.isFinite(asked) && asked <= saved.upTo) return new Date(saved.upTo).toISOString();
  if (account && inFlight?.account === account && Number.isFinite(asked) && asked <= inFlight.upTo) return inFlight.done;
  const done = (async () => {
    try {
      const response = await fetch("/api/inbox/seen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(at ? { at } : {}),
        // Following an item navigates away; keepalive lets the save finish.
        keepalive: options.keepalive,
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { seenAt?: string };
      const seenAt = body.seenAt ?? at ?? new Date().toISOString();
      const stored = Date.parse(seenAt);
      if (account && Number.isFinite(stored)) saved = { account, upTo: saved?.account === account ? Math.max(saved.upTo, stored) : stored };
      window.dispatchEvent(new CustomEvent(INBOX_SEEN_EVENT, { detail: { seenAt } }));
      return seenAt;
    } catch {
      return null;
    }
  })();
  const entry = { account, upTo: Number.isFinite(asked) ? asked : Date.now(), done };
  inFlight = entry;
  void done.finally(() => {
    if (inFlight === entry) inFlight = null;
  });
  return done;
}

export type MarkSeenState = "waiting" | "saving" | "saved" | "failed";

/**
 * `auto`: mark everything up to `at` read once the list has been in view for `delayMs` (off while signed out, with
 * nothing unread, or the popover closed or showing only part of what is unread). `markNow(at)` saves at once up to
 * the item that was followed, for a signed-in person (`signedIn`), whether or not `auto` is on. `account` is the
 * person's uid, which keeps one account's saved mark from standing in for another's.
 */
export function useMarkSeen({
  auto,
  at,
  signedIn,
  account,
  delayMs = SEEN_AFTER_MS,
}: {
  auto: boolean;
  at: string | null;
  signedIn: boolean;
  account: string | null;
  delayMs?: number;
}) {
  const [state, setState] = React.useState<MarkSeenState>("waiting");
  const atRef = React.useRef(at);
  atRef.current = at;
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const save = React.useCallback(
    async (upTo: string | null, keepalive: boolean) => {
      setState("saving");
      const stored = await postSeen(upTo, { keepalive, account });
      if (live.current) setState(stored ? "saved" : "failed");
      return stored;
    },
    [account],
  );

  React.useEffect(() => {
    if (!auto || !at) return;
    setState("waiting");
    return afterInView({
      delayMs,
      fire: () => void save(atRef.current, false),
      isVisible: () => document.visibilityState === "visible",
      onVisibilityChange: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
  }, [auto, at, delayMs, save]);

  const markNow = React.useCallback(
    (upTo: string) => {
      if (signedIn && upTo) void save(upTo, true);
    },
    [signedIn, save],
  );

  return { state, markNow };
}
