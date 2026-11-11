"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { LockCard } from "@/components/oa/gate";
import { Menu } from "@/components/screener/menu";
import type { Plan } from "@/lib/entitlements";
import { savedScreenHref, SAVED_SCREEN_NAME_MAX, type SavedScreen } from "@/lib/screener-saved";
import { trackLimitHit, trackScreenSaved } from "@/lib/product-analytics";

/** "Save screen": names the screen in the address bar and keeps it on the person's account. */
export function SaveScreen({
  query,
  canSave,
  plan,
  limit,
  count,
  trialEligible,
  suggestedName,
}: {
  /** The current screen as a query string. Empty when there is nothing to save. */
  query: string;
  canSave: boolean;
  plan: Plan;
  /** How many screens this plan keeps. */
  limit: number;
  count: number;
  trialEligible: boolean;
  suggestedName: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(suggestedName);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  React.useEffect(() => {
    setName(suggestedName);
    setMessage(null);
  }, [suggestedName, query]);

  const atLimit = Number.isFinite(limit) && count >= limit;

  async function save(close: () => void) {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/screener/screens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, query }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      trackScreenSaved({ ok: response.ok, reason: response.ok ? undefined : body.error ?? `status_${response.status}` });
      if (body.error === "limit_reached") trackLimitHit({ feature: "saved_screens", plan, limit: Number.isFinite(limit) ? limit : null });
      if (body.error === "call_filters_locked") trackLimitHit({ feature: "screener_call_filters", plan });
      if (response.ok) {
        setMessage({ tone: "ok", text: "Saved. It is in your saved screens." });
        router.refresh();
        window.setTimeout(close, 900);
      } else if (body.error === "limit_reached") {
        setMessage({ tone: "bad", text: "Your plan's saved screens are full. Remove one first." });
      } else if (body.error === "empty_screen") {
        setMessage({ tone: "bad", text: "Add at least one filter before saving." });
      } else if (body.error === "call_filters_locked") {
        setMessage({ tone: "bad", text: "This screen uses our call, which is part of Pro." });
      } else if (response.status === 401) {
        setMessage({ tone: "bad", text: "Sign in to save screens." });
      } else {
        setMessage({ tone: "bad", text: "Could not save this screen. Try again." });
      }
    } catch {
      setMessage({ tone: "bad", text: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Menu
      align="right"
      width="w-[21rem]"
      label={
        <>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 2.5h8v11l-4-2.6-4 2.6z" />
          </svg>
          <span className="sm:hidden">Save</span>
          <span className="max-sm:hidden">Save screen</span>
        </>
      }
    >
      {(close) =>
        !canSave || (atLimit && plan !== "pro") ? (
          <div className="p-2">
            <LockCard feature="saved_screens" plan={plan} trialEligible={trialEligible} className="!flex-col !items-start border-0 bg-transparent !p-2" />
          </div>
        ) : !query ? (
          <p className="p-3.5 text-[13.5px] leading-5 text-oa-muted-fg">Set at least one filter, then save the screen to come back to it.</p>
        ) : (
          <form
            className="flex flex-col gap-2.5 p-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save(close);
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="oa-caption">Name this screen</span>
              <input
                autoFocus
                value={name}
                maxLength={SAVED_SCREEN_NAME_MAX}
                onChange={(event) => setName(event.target.value)}
                className="h-8 rounded-md border border-oa-border bg-oa-page px-2.5 text-[13.5px] text-oa-fg outline-none focus:border-oa-primary"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="oa-mono text-[11.5px] text-oa-muted-fg">
                {Number.isFinite(limit) ? `${count} of ${limit} used` : `${count} saved`}
              </span>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="inline-flex h-8 items-center rounded-md bg-oa-fg px-3 text-[13px] font-medium text-oa-page outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-50"
              >
                {busy ? "Saving" : "Save"}
              </button>
            </div>
            {message ? (
              <p role="status" className={`text-[13px] leading-5 ${message.tone === "ok" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                {message.text}
              </p>
            ) : null}
          </form>
        )
      }
    </Menu>
  );
}

/** The person's own screens as chips, each with a remove button. */
export function MyScreens({ screens, currentQuery, className = "" }: { screens: SavedScreen[]; currentQuery: string; className?: string }) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState<string | null>(null);
  if (screens.length === 0) return null;

  async function remove(id: string) {
    setRemoving(id);
    try {
      await fetch(`/api/screener/screens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="oa-caption mr-1">Yours</span>
      {screens.map((screen) => {
        const active = screen.query === currentQuery;
        return (
          <span
            key={screen.id}
            className={`inline-flex h-8 items-center rounded-md border text-[14px] transition-colors ${
              active ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg" : "border-oa-border bg-oa-card text-oa-fg"
            } ${removing === screen.id ? "opacity-50" : ""}`}
          >
            <a href={savedScreenHref(screen)} className="max-w-[16rem] truncate rounded-l-md py-1 pl-2.5 pr-1.5 outline-none hover:underline focus-visible:underline">
              {screen.name}
            </a>
            <button
              type="button"
              onClick={() => void remove(screen.id)}
              disabled={removing !== null}
              aria-label={`Remove the saved screen ${screen.name}`}
              className="flex h-full w-6 items-center justify-center rounded-r-md opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100"
            >
              <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </span>
        );
      })}
    </div>
  );
}
