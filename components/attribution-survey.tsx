"use client";

import { useState } from "react";

import { ATTRIBUTION_SOURCES, type AttributionSourceId } from "@/lib/attribution";
import { trackAttributionSubmitted } from "@/lib/product-analytics";

type Props = {
  onDone: () => void;
};

export function AttributionSurvey({ onDone }: Props) {
  const [pending, setPending] = useState<AttributionSourceId | null>(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
      return false;
    }
  }

  async function submitSource(source: AttributionSourceId, other?: string) {
    const ok = await persist(
      source === "other" ? { source, other: other?.trim() } : { source },
    );
    if (!ok) return;
    trackAttributionSubmitted({ source, other: other?.trim() || undefined });
    try {
      localStorage.setItem("tikrr_attribution_done", "1");
    } catch {
      // best effort
    }
    onDone();
  }

  async function handlePick(source: AttributionSourceId) {
    if (submitting) return;
    if (source === "other") {
      setPending("other");
      setError(null);
      return;
    }
    await submitSource(source);
  }

  async function handleOtherSubmit() {
    if (submitting || !otherText.trim()) return;
    await submitSource("other", otherText);
  }

  async function handleSkip() {
    if (submitting) return;
    const ok = await persist({ skipped: true });
    if (!ok) return;
    trackAttributionSubmitted({ skipped: true });
    try {
      localStorage.setItem("tikrr_attribution_done", "1");
    } catch {
      // best effort
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
      <div
        className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-6 shadow-lg"
        role="dialog"
        aria-labelledby="attribution-title"
        aria-modal="true"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
          quick question
        </p>
        <h2 id="attribution-title" className="mt-2 text-[22px] font-bold tracking-tight text-on-surface">
          How did you hear about us?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
          One tap helps us know what&apos;s working.
        </p>

        {pending === "other" ? (
          <div className="mt-5 space-y-3">
            <input
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Podcast, newsletter, etc."
              maxLength={120}
              autoFocus
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-2.5 text-[14px] text-on-surface outline-none ring-0 placeholder:text-on-surface-variant focus:border-outline"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setOtherText("");
                  setError(null);
                }}
                disabled={submitting}
                className="rounded-full px-3 py-2 text-[13px] font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleOtherSubmit()}
                disabled={submitting || !otherText.trim()}
                className="ml-auto inline-flex h-10 items-center justify-center rounded-full bg-on-surface px-5 text-[13px] font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ATTRIBUTION_SOURCES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => void handlePick(option.id)}
                disabled={submitting}
                className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-3 text-[13px] font-semibold text-on-surface transition-colors hover:border-outline hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {error ? <p className="mt-3 text-[12px] text-[var(--signal-bearish)]">{error}</p> : null}

        {pending !== "other" ? (
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={submitting}
            className="mt-5 w-full text-center text-[12px] font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            Skip
          </button>
        ) : null}
      </div>
    </div>
  );
}
