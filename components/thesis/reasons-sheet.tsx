"use client";

import { useEffect, useRef, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { ConditionsPicker, draftOf, parseDrafts, type DraftCondition } from "@/components/thesis/conditions-picker";
import { ThesisLine } from "@/components/thesis/thesis-line";
import { ThesisStep, type ThesisStock } from "@/components/thesis/thesis-step";
import { getCheck, loadTheses, removeReasons, saveReasons, useAllTheses, useCheck, useStoreVersion } from "@/components/thesis/store";
import { trackThesisSaved } from "@/lib/product-analytics";
import { MAX_THESIS_REASON, THESIS_KINDS, THESIS_PICKS, thesisSentence, type ThesisKind } from "@/lib/thesis";
import { VERDICT_RANK, type Verdict } from "@/lib/thesis-watch/rules";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
/**
 * The kit's primary button colours (components/oa/button.tsx): 6.6:1 light, 5.6:1 dark. Disabled is a quiet well with
 * muted text (7.1:1 light, 9.1:1 dark), never the primary faded by opacity, which fell under 4.5:1 in dark mode.
 */
const PRIMARY = `inline-flex h-10 items-center justify-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] px-4 text-[14px] font-medium text-oa-primary-fg hover:border-[color-mix(in_srgb,var(--oa-primary)_70%,#3a3480)] hover:bg-oa-primary disabled:border-oa-border disabled:bg-oa-bg disabled:text-oa-muted-fg ${FOCUS}`;
const PLAIN = `inline-flex h-10 items-center justify-center rounded border border-oa-border bg-oa-card px-3.5 text-[14px] text-oa-fg hover:border-oa-fg/30 disabled:opacity-60 ${FOCUS}`;

/* ── one reason, edited ─────────────────────────────────────────────────── */

/** Pick a kind, add your own words, save; or remove the reason. Saves on the person's own account only. */
export function ReasonEditor({ stock, onDone }: { stock: ThesisStock; onDone: () => void }) {
  const all = useAllTheses();
  const current = all?.[stock.instrument_id] ?? null;
  const [kind, setKind] = useState<ThesisKind | null>(current?.kind ?? null);
  const [reason, setReason] = useState(current?.reason ?? "");
  const [drafts, setDrafts] = useState<DraftCondition[]>(() => (current?.conditions ?? []).map(draftOf));
  const [busy, setBusy] = useState<null | "save" | "remove">(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const conditions = parseDrafts(drafts);
  const conditionsChanged = JSON.stringify(conditions) !== JSON.stringify(current?.conditions ?? []);
  const changed = kind !== (current?.kind ?? null) || reason.trim() !== (current?.reason ?? "") || conditionsChanged;

  async function save() {
    setBusy("save");
    setError("");
    try {
      // The lines go only when they changed: a save of the words alone keeps the stored ones.
      await saveReasons([{ instrument_id: stock.instrument_id, kind, reason: reason.trim() || null, ...(conditionsChanged && conditions ? { conditions } : {}) }]);
      trackThesisSaved({ count: 1, kinds: [kind ?? "text"], with_text: reason.trim() ? 1 : 0, asked: 1 });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not save your reason. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError("");
    try {
      await removeReasons([stock.instrument_id]);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not remove it. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <StockLogo ticker={stock.ticker} size={32} circle className="shrink-0" />
        <div className="min-w-0">
          <h3 className="text-pretty text-[19px] font-semibold leading-6 text-oa-fg">Why do you own {stock.ticker}?</h3>
          {stock.name ? <p className="text-[13px] leading-[18px] text-oa-muted-fg">{stock.name}</p> : null}
        </div>
      </div>
      <div role="radiogroup" aria-label={`Why you own ${stock.ticker}`} className="flex flex-wrap gap-2">
        {THESIS_KINDS.map((option) => {
          const on = kind === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(on ? null : option)}
              className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] transition-colors ${FOCUS} ${
                on ? "border-oa-primary bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] font-medium text-oa-fg" : "border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30"
              }`}
            >
              {THESIS_PICKS[option]}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-oa-muted-fg">In your own words (optional)</span>
        <textarea
          value={reason}
          maxLength={MAX_THESIS_REASON}
          rows={2}
          onChange={(event) => setReason(event.target.value)}
          placeholder={`What would make you sell ${stock.ticker}?`}
          className={`w-full resize-none rounded border border-oa-border bg-oa-card px-3 py-2 text-[14px] leading-5 text-oa-fg placeholder:text-oa-muted-fg ${FOCUS}`}
        />
      </label>
      {stock.instrument_id.startsWith("US_") ? <ConditionsPicker instrumentId={stock.instrument_id} drafts={drafts} onChange={setDrafts} /> : null}
      {error ? (
        <p role="alert" className="text-[13px] text-signal-bearish">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-oa-border pt-3">
        {current ? (
          confirm ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-oa-fg">Remove your reason for {stock.ticker}?</span>
              <button type="button" onClick={() => void remove()} disabled={busy !== null} className={`${PLAIN} border-current text-signal-bearish`}>
                {busy === "remove" ? "Removing" : "Yes, remove it"}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className={PLAIN}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} disabled={busy !== null} className={`${PLAIN} text-signal-bearish`}>
              Remove reason
            </button>
          )
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2">
          <button type="button" onClick={onDone} disabled={busy !== null} className={PLAIN}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy !== null || (!kind && !reason.trim()) || !changed || conditions === null} className={PRIMARY}>
            {busy === "save" ? "Saving" : "Save"}
          </button>
        </span>
      </div>
    </div>
  );
}

/* ── the sheet ──────────────────────────────────────────────────────────── */

function ReasonRow({ stock, onOpen }: { stock: ThesisStock; onOpen: () => void }) {
  const all = useAllTheses();
  const thesis = all?.[stock.instrument_id] ?? null;
  const { check, locked } = useCheck(stock.instrument_id);
  return (
    <li>
      <button type="button" onClick={onOpen} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-oa-accent ${FOCUS}`}>
        <StockLogo ticker={stock.ticker} size={24} circle className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="oa-mono text-[14px] font-medium text-oa-fg">{stock.ticker}</span>
            {thesis ? <ThesisLine instrumentId={stock.instrument_id} /> : <span className="text-[12px] text-oa-primary">Add a reason</span>}
          </span>
          <span className="mt-0.5 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
            {thesis ? thesisSentence(thesis) : "No reason saved yet."}
            {check && check.verdict !== "holds" ? ` ${check.signals[0]?.text ?? ""}` : ""}
            {locked ? " Free checks the reasons on your covered stocks only." : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

type View = { mode: "list" } | { mode: "edit"; stock: ThesisStock } | { mode: "rest" };

/**
 * Every holding and the reason saved for it, in one sheet: open a row to
 * change or remove its reason, or answer the ones without a reason one after
 * another. Rows with a weaker or broken reason come first.
 */
export function ReasonsSheet({ stocks, start, onClose }: { stocks: ThesisStock[]; start?: ThesisStock | null; onClose: () => void }) {
  const all = useAllTheses();
  useStoreVersion();
  const [view, setView] = useState<View>(start ? { mode: "edit", stock: start } : { mode: "list" });
  const panel = useRef<HTMLDivElement>(null);

  // The parent passes a new onClose on every render; the sheet must not refocus itself (and steal the cursor) each time.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  const missing = stocks.filter((stock) => !all?.[stock.instrument_id]);
  const title = view.mode === "list" ? "Why you own them" : view.mode === "rest" ? "Add your reasons" : `Your reason for ${view.stock.ticker}`;
  const back = () => (start ? onClose() : setView({ mode: "list" }));

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:px-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-oa-border bg-oa-page shadow-xl outline-none md:max-w-[40rem] md:rounded-xl">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-oa-border bg-oa-card px-4 py-2">
          <h2 className="min-w-0 text-pretty text-[15px] font-semibold leading-5 text-oa-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`inline-flex size-9 shrink-0 items-center justify-center rounded text-[18px] leading-none text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {view.mode === "list" ? (
            <>
              <p className="border-b border-oa-border px-4 py-3 text-pretty text-[13.5px] leading-5 text-oa-fg">
                Give each holding the reason you bought it. The agent checks each reason against the company&apos;s results, its dividend, our call and its filings, and marks the ones that weaken, break or have done their job.
              </p>
              <ul className="divide-y divide-oa-border">
                {[...stocks]
                  .sort((a, b) => rankOf(a) - rankOf(b) || a.ticker.localeCompare(b.ticker))
                  .map((stock) => (
                    <ReasonRow key={stock.instrument_id} stock={stock} onOpen={() => setView({ mode: "edit", stock })} />
                  ))}
              </ul>
            </>
          ) : view.mode === "edit" ? (
            <div className="px-4 py-4">
              <ReasonEditor stock={view.stock} onDone={back} />
            </div>
          ) : (
            <div className="px-4 py-4">
              <ThesisStep stocks={missing.slice(0, 20)} onDone={() => setView({ mode: "list" })} />
            </div>
          )}
        </div>
        {view.mode === "list" && missing.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-oa-border bg-oa-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
              {missing.length === stocks.length
                ? "None of your holdings has a reason yet."
                : `${missing.length} of your ${stocks.length} holdings ${missing.length === 1 ? "has" : "have"} no reason yet.`}
            </p>
            <button type="button" onClick={() => setView({ mode: "rest" })} className={PRIMARY}>
              {missing.length === stocks.length ? "Start with the first" : "Answer the rest"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  function rankOf(stock: ThesisStock): number {
    if (!all?.[stock.instrument_id]) return 10;
    const check = getCheck(stock.instrument_id).check;
    return check ? VERDICT_RANK[check.verdict] : 5;
  }
}

/* ── the entry on Portfolio ─────────────────────────────────────────────── */

/**
 * One line above the holdings: how many have a reason and what the watcher
 * found, with the one button that opens the reasons sheet. Loads the reasons
 * and checks for the rows as well (live portfolio only).
 */
export function ReasonsStrip({ stocks }: { stocks: ThesisStock[] }) {
  const all = useAllTheses();
  useStoreVersion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadTheses();
    // `?reasons=1` (from My stocks) opens the sheet straight away.
    const url = new URL(window.location.href);
    if (url.searchParams.get("reasons") === "1") {
      setOpen(true);
      // Opened once; a reload should not open it again.
      url.searchParams.delete("reasons");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  if (!all || stocks.length === 0) return null;
  const withReason = stocks.filter((stock) => all[stock.instrument_id]);
  const counts: Record<Verdict, number> = { broken: 0, weaker: 0, played_out: 0, holds: 0 };
  for (const stock of withReason) {
    const check = getCheck(stock.instrument_id).check;
    if (check) counts[check.verdict] += 1;
  }
  const checked = counts.broken + counts.weaker + counts.played_out + counts.holds;
  const parts = [
    counts.broken ? `${counts.broken} ${counts.broken === 1 ? "looks" : "look"} broken` : null,
    counts.weaker ? `${counts.weaker} ${counts.weaker === 1 ? "is" : "are"} weaker` : null,
    counts.played_out ? `${counts.played_out} ${counts.played_out === 1 ? "has" : "have"} played out` : null,
  ].filter(Boolean);
  const found =
    checked === 0
      ? ""
      : parts.length > 0
        ? ` ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}.`
        : ` ${checked === 1 ? (withReason.length === 1 ? "It still holds" : "The one we check still holds") : `All ${checked} we check still hold`}.`;
  const text =
    withReason.length === 0
      ? "Why do you own them? Give each holding a reason and the agent checks it against the company's numbers."
      : `You have given a reason for ${withReason.length} of your ${stocks.length} holdings.${found}`;

  return (
    <div className="flex flex-col gap-2 border-b border-oa-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-pretty text-[13.5px] leading-5 text-oa-fg">{text}</p>
      <button type="button" onClick={() => setOpen(true)} className={`${PLAIN} h-9 shrink-0 self-start text-[13.5px] sm:self-auto`}>
        {withReason.length === 0 ? "Add your reasons" : "Review your reasons"}
      </button>
      {open ? <ReasonsSheet stocks={stocks} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
