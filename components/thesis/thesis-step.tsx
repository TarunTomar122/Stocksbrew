"use client";

import { useState } from "react";

import { putTheses } from "@/components/thesis/store";
import { StockLogo } from "@/components/stock-logo";
import { trackThesisSaved } from "@/lib/product-analytics";
import { MAX_THESIS_REASON, THESIS_KINDS, THESIS_PICKS, type Thesis, type ThesisKind } from "@/lib/thesis";

export type ThesisStock = { instrument_id: string; ticker: string; name: string | null };

type Answer = { kind: ThesisKind | null; reason: string };

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * "Why do you own NVDA?": one stock at a time, a quick pick and an optional
 * line of your own. Every question can be skipped, and so can the whole step.
 * Answers are saved together at the end, on the person's own account.
 */
export function ThesisStep({
  stocks,
  onDone,
}: {
  stocks: ThesisStock[];
  /** Called after saving (with how many were saved) or when the person skips the rest. */
  onDone: (saved: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stock = stocks[index];
  if (!stock) return null;
  const answer = answers[stock.instrument_id] ?? { kind: null, reason: "" };
  const last = index === stocks.length - 1;
  const answered = Object.entries(answers).filter(([, value]) => value.kind || value.reason.trim());

  function set(next: Partial<Answer>) {
    setAnswers((current) => ({ ...current, [stock!.instrument_id]: { ...answer, ...next } }));
  }

  async function save() {
    if (answered.length === 0) {
      onDone(0);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: answered.map(([instrument_id, value]) => ({ instrument_id, kind: value.kind, reason: value.reason.trim() || null })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { theses?: Record<string, Thesis>; error?: string };
      if (!res.ok || !data.theses) throw new Error(data.error ?? "error");
      putTheses(data.theses);
      trackThesisSaved({
        count: answered.length,
        kinds: answered.map(([, value]) => value.kind ?? "text"),
        with_text: answered.filter(([, value]) => value.reason.trim()).length,
        asked: stocks.length,
      });
      onDone(answered.length);
    } catch {
      setError("We could not save your reasons. Try again, or skip for now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="oa-caption">
          {index + 1} of {stocks.length}
        </p>
        {/* Leaving early keeps what was already answered. */}
        <button
          type="button"
          onClick={() => (answered.length > 0 ? void save() : onDone(0))}
          disabled={busy}
          className={`inline-flex min-h-10 items-center text-[13px] text-oa-muted-fg underline underline-offset-2 hover:text-oa-fg ${FOCUS}`}
        >
          {answered.length > 0 ? "Save and stop here" : "Skip this step"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <StockLogo ticker={stock.ticker} size={32} circle className="shrink-0" />
        <div className="min-w-0">
          <h3 className="text-pretty text-[19px] font-semibold leading-6 text-oa-fg">Why do you own {stock.ticker}?</h3>
          {stock.name ? <p className="text-[13px] leading-[18px] text-oa-muted-fg">{stock.name}</p> : null}
        </div>
      </div>

      <div role="radiogroup" aria-label={`Why you own ${stock.ticker}`} className="flex flex-wrap gap-2">
        {THESIS_KINDS.map((kind) => {
          const on = answer.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ kind: on ? null : kind })}
              className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] transition-colors ${FOCUS} ${
                on ? "border-oa-primary bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] font-medium text-oa-fg" : "border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30"
              }`}
            >
              {THESIS_PICKS[kind]}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-oa-muted-fg">In your own words (optional)</span>
        <textarea
          value={answer.reason}
          maxLength={MAX_THESIS_REASON}
          rows={2}
          onChange={(event) => set({ reason: event.target.value })}
          placeholder={`What would make you sell ${stock.ticker}?`}
          className={`w-full resize-none rounded border border-oa-border bg-oa-card px-3 py-2 text-[14px] leading-5 text-oa-fg placeholder:text-oa-muted-fg ${FOCUS}`}
        />
      </label>

      {error ? <p role="alert" className="text-[13px] text-signal-bearish">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-oa-border pt-3">
        <button
          type="button"
          disabled={index === 0 || busy}
          onClick={() => setIndex(index - 1)}
          className={`inline-flex h-10 items-center rounded border border-oa-border px-3 text-[14px] text-oa-fg disabled:opacity-40 ${FOCUS}`}
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {!last ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setIndex(index + 1)}
              className={`inline-flex h-10 items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 ${FOCUS}`}
            >
              {answer.kind || answer.reason.trim() ? "Next" : "Skip this one"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className={`inline-flex h-10 items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:opacity-60 ${FOCUS}`}
            >
              {busy ? "Saving" : answered.length === 0 ? "Finish" : `Save ${answered.length === 1 ? "your reason" : `${answered.length} reasons`}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
