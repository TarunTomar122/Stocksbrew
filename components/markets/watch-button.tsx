"use client";

import * as React from "react";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";

type State = "unknown" | "off" | "on";

/**
 * Watch or unwatch one market asset. The list lives on the signed-in user's
 * own doc; a signed-out visitor is asked to sign in first.
 */
export function WatchButton({ assetId, label }: { assetId: string; label: string }) {
  const { user, initialAuthed } = useUser();
  const signedIn = Boolean(user) || initialAuthed;
  const [state, setState] = React.useState<State>("unknown");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setState("off");
      return;
    }
    fetch("/api/markets/watch", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { ids: [] }))
      .then((data: { ids?: string[] }) => {
        if (!cancelled) setState(Array.isArray(data.ids) && data.ids.includes(assetId) ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, signedIn]);

  async function save(watch: boolean): Promise<boolean> {
    const res = await fetch("/api/markets/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assetId, watch }),
    });
    return res.ok;
  }

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = state !== "on";
    try {
      if (!signedIn) {
        // Signing in also sets the server session cookie the save needs.
        await signInWithGoogle({ surface: "radar_track" });
      }
      if (await save(next)) setState(next ? "on" : "off");
      else setError("Could not save. Try again.");
    } catch {
      setError(signedIn ? "Could not save. Try again." : "Sign-in was not completed.");
    } finally {
      setBusy(false);
    }
  }

  const on = state === "on";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || state === "unknown"}
        aria-pressed={on}
        aria-label={on ? `Stop watching ${label}` : `Watch ${label}`}
        className={`oa-mono inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] uppercase tracking-[0.06em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-ring disabled:cursor-default disabled:opacity-60 ${
          on
            ? "border-oa-border bg-oa-bg text-oa-fg hover:border-oa-fg/40"
            : "border-oa-primary bg-oa-primary text-oa-primary-fg hover:brightness-110"
        }`}
      >
        <span aria-hidden="true">{on ? "✓" : "+"}</span>
        {busy ? "Saving" : on ? "Watching" : "Watch"}
      </button>
      {error ? (
        <span role="alert" className="text-[12.5px] leading-4 text-signal-bearish">
          {error}
        </span>
      ) : null}
    </span>
  );
}
