"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  clearPending,
  includedRows,
  parseImport,
  readPending,
  savedSentence,
  saveableRows,
  saveImportRows,
} from "@/components/import/client";
import { ImportInput, type ImportInputValue } from "@/components/import/import-input";
import { ReviewTable } from "@/components/import/review-table";
import { loadTheses } from "@/components/thesis/store";
import { ThesisStep, type ThesisStock } from "@/components/thesis/thesis-step";
import type { Held } from "@/lib/import/merge";
import type { ImportRow } from "@/lib/import/resolve";
import { trackImportParsed, trackImportSaved, trackImportStarted } from "@/lib/product-analytics";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:opacity-60 ${FOCUS}`;

type Stage = "input" | "review" | "thesis";

/**
 * The Portfolio entry point: "Import from a screenshot". Opens a sheet that
 * reads screenshots, pasted holdings or a CSV, lets the person fix every row,
 * saves them as holdings next to what is already tracked, then asks why they
 * own each new one. Also loads the saved reasons shown on the rows.
 */
export function ImportButton({
  className,
  positions = [],
}: {
  className?: string;
  /** What the portfolio already has, so the review shows which rows are already owned. */
  positions?: Array<{ instrument_id: string; kind: "holding" | "watchlist"; shares: number | null; avgCost: number | null }>;
}) {
  const router = useRouter();
  const held = useMemo(() => {
    const out: Record<string, Held> = {};
    for (const position of positions) out[position.instrument_id] = { kind: position.kind, shares: position.shares, average_cost: position.avgCost };
    return out;
  }, [positions]);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [source, setSource] = useState<"screenshot" | "manual">("manual");
  const [busy, setBusy] = useState<null | "parse" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [fromPending, setFromPending] = useState(false);
  const [asked, setAsked] = useState<ThesisStock[]>([]);
  const [savedNote, setSavedNote] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  // The reasons on each row come from here: this button only renders on a live portfolio.
  useEffect(() => {
    loadTheses();
    // A list saved from the landing page before signing in, if it never made it.
    const left = readPending();
    if (left && left.rows.some((row) => row.instrument_id && row.status !== "unknown")) {
      setRows(left.rows);
      setSource(left.source);
      setFromPending(true);
      setStage("review");
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy === null) close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  function reset() {
    setStage("input");
    setRows([]);
    setError(null);
    setFromPending(false);
    setAsked([]);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit(value: ImportInputValue) {
    const input = value.files.length > 0 ? "image" : "text";
    trackImportStarted({ surface: "watchlist", input, images: value.files.length });
    setError(null);
    setBusy("parse");
    const parsed = await parseImport(value);
    setBusy(null);
    if ("code" in parsed) {
      trackImportParsed({ surface: "watchlist", input, ok: false, error_code: parsed.code });
      setError(parsed.message);
      return;
    }
    const matched = parsed.rows.filter((row) => row.status !== "unknown").length;
    trackImportParsed({ surface: "watchlist", input: parsed.input, ok: true, via: parsed.via, rows: parsed.rows.length, matched, unknown: parsed.rows.length - matched });
    if (parsed.not_holdings || parsed.rows.length === 0) {
      setError(
        parsed.not_holdings
          ? "That does not look like a list of holdings. Try the screen in your broker app that lists your positions."
          : "We could not find any holdings in that. Try one per line, like AAPL 10 182.50.",
      );
      return;
    }
    setSource(parsed.input === "image" ? "screenshot" : "manual");
    setRows(parsed.rows);
    setStage("review");
  }

  async function save() {
    const payload = saveableRows(rows);
    if (payload.length === 0) return;
    setError(null);
    setBusy("save");
    const res = await saveImportRows(payload, source);
    setBusy(null);
    if ("code" in res) {
      setError(res.message);
      return;
    }
    if (fromPending) clearPending();
    trackImportSaved({
      surface: "watchlist",
      added: res.added.length,
      updated: res.updated.length,
      with_shares: payload.filter((row) => row.shares !== null).length,
      pending: fromPending,
    });
    const byId = new Map(rows.map((row) => [row.instrument_id, row]));
    // Ask about the stocks that are new to the portfolio; updated ones may already have a reason.
    const ids = res.added.length > 0 ? res.added : res.updated.length > 0 ? res.updated : res.kept;
    setAsked(ids.slice(0, 20).map((id) => ({ instrument_id: id, ticker: byId.get(id)?.ticker ?? id.replace(/^US_/, ""), name: byId.get(id)?.name ?? null })));
    setSavedNote(savedSentence(res.added.length, res.updated.length, res.kept.length));
    setStage("thesis");
    // The new rows appear behind the sheet while the person answers.
    router.refresh();
  }

  const ready = includedRows(rows).length;
  const title = stage === "input" ? "Import your holdings" : stage === "review" ? "Check what we read" : savedNote;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Import from a screenshot
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:px-4" role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={() => (busy === null ? close() : undefined)} />
          <div
            ref={panel}
            tabIndex={-1}
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-oa-border bg-oa-page shadow-xl outline-none md:max-w-[44rem] md:rounded-xl"
          >
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-oa-border bg-oa-card px-4 py-2">
              <h2 className="min-w-0 text-pretty text-[15px] font-semibold leading-5 text-oa-fg">{title}</h2>
              <button
                type="button"
                onClick={close}
                disabled={busy !== null}
                aria-label="Close"
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded text-[18px] leading-none text-oa-muted-fg hover:text-oa-fg disabled:opacity-40 ${FOCUS}`}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {stage === "input" ? (
                <div className="flex flex-col gap-3 px-4 py-4">
                  <p className="text-pretty text-[14px] leading-5 text-oa-fg">
                    Take a screenshot of the holdings screen in your broker app, or paste the list. We read the tickers, shares and average cost, and you check every row before anything is saved.
                  </p>
                  <ImportInput
                    busy={busy === "parse"}
                    error={error}
                    onSubmit={(value) => void submit(value)}
                    note="Screenshots are read once and not kept. Nothing connects to your broker."
                  />
                </div>
              ) : null}
              {stage === "review" ? (
                <div className="flex flex-col">
                  {fromPending ? (
                    <p className="border-b border-oa-border bg-oa-bg px-3 py-2 text-pretty text-[13px] leading-[18px] text-oa-fg">
                      This is the list you made before signing in. Check it, then save.
                    </p>
                  ) : null}
                  <ReviewTable rows={rows} onChange={setRows} canRequest held={held} />
                </div>
              ) : null}
              {stage === "thesis" ? (
                <div className="px-4 py-4">
                  <ThesisStep stocks={asked} onDone={close} />
                </div>
              ) : null}
            </div>
            {stage === "review" ? (
              <div className="flex flex-col gap-2 border-t border-oa-border bg-oa-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                {error ? (
                  <p role="alert" className="text-pretty text-[13px] leading-[18px] text-signal-bearish">
                    {error}
                  </p>
                ) : (
                  <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">Saved as holdings next to what you already track. Nothing is removed.</p>
                )}
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (fromPending) clearPending();
                      reset();
                    }}
                    className={`inline-flex h-10 items-center rounded border border-oa-border bg-oa-card px-3.5 text-[14px] text-oa-fg disabled:opacity-60 ${FOCUS}`}
                  >
                    {fromPending ? "Discard" : "Start over"}
                  </button>
                  <button type="button" className={PRIMARY} disabled={busy !== null || ready === 0} onClick={() => void save()}>
                    {busy === "save" ? "Saving" : `Save ${ready} ${ready === 1 ? "holding" : "holdings"}`}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
