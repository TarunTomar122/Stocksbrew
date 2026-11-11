"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  clearPending,
  fetchRead,
  includedRows,
  parseImport,
  readPending,
  savedSentence,
  saveableRows,
  saveImportRows,
  writePending,
  type ReadResponse,
} from "@/components/import/client";
import { ImportInput, type ImportInputValue } from "@/components/import/import-input";
import { PortfolioReadView } from "@/components/import/portfolio-read";
import { ReviewTable } from "@/components/import/review-table";
import { ThesisStep } from "@/components/thesis/thesis-step";
import type { Held } from "@/lib/import/merge";
import type { ImportRow } from "@/lib/import/resolve";
import { buildPortfolioRead } from "@/lib/import/read-shared";
import { trackImportParsed, trackImportSaved, trackImportStarted } from "@/lib/product-analytics";
import { POST_SIGNUP_ONBOARDING_PENDING, signInWithGoogle } from "@/lib/sign-in";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:opacity-60 ${FOCUS}`;
const PLAIN = `inline-flex h-10 items-center justify-center rounded border border-oa-border bg-oa-card px-3.5 text-[14px] text-oa-fg hover:border-oa-fg/30 disabled:opacity-60 ${FOCUS}`;

type Stage = "input" | "read" | "saved";

/**
 * /import: paste tickers or a broker screenshot and get our read on that
 * portfolio, signed in or not. Signed out, "Save this portfolio" keeps the
 * list in this browser, signs in, and saves it through the same route as the
 * Portfolio import. Nothing about a signed-out visitor is written on our side
 * except the daily count of screenshot reads.
 */
export function ImportWorkspace({
  signedIn: initialSignedIn,
  held = {},
}: {
  signedIn: boolean;
  /** Signed in: what the person already tracks, so the list shows which stocks they own already. */
  held?: Record<string, Held>;
}) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const [stage, setStage] = useState<Stage>("input");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [source, setSource] = useState<"screenshot" | "manual">("manual");
  const [read, setRead] = useState<ReadResponse | null>(null);
  const [readFor, setReadFor] = useState<string>("");
  const [busy, setBusy] = useState<null | "parse" | "read" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<number>(0);
  const [saved, setSaved] = useState<{ added: number; updated: number; kept: number; stocks: Array<{ instrument_id: string; ticker: string; name: string | null }> } | null>(null);

  // A list left from before signing in (another tab, a popup that was closed).
  useEffect(() => {
    if (!initialSignedIn) return;
    const left = readPending();
    if (left) setPending(left.rows.filter((row) => row.instrument_id && row.status !== "unknown").length);
  }, [initialSignedIn]);

  const included = useMemo(() => includedRows(rows), [rows]);
  const key = included.map((row) => row.instrument_id).join(",");
  const stale = stage === "read" && key !== readFor;
  const owned = included.filter((row) => held[row.instrument_id!]?.kind === "holding" && held[row.instrument_id!]?.shares != null).length;
  const toCheck = rows.filter((row) => row.status === "suggested" || (row.status === "matched" && row.confidence !== "high")).length;

  const result = useMemo(() => {
    if (!read) return null;
    const shares: Record<string, number | null> = {};
    for (const row of included) shares[row.instrument_id!] = row.shares;
    return buildPortfolioRead(read, shares);
  }, [read, included]);

  async function loadRead(list: ImportRow[]) {
    const wanted = includedRows(list);
    const tickers = wanted.map((row) => row.ticker!);
    if (tickers.length === 0) {
      setError("None of those are stocks we cover yet. Try other tickers, or check the spelling.");
      setStage("input");
      return;
    }
    setBusy("read");
    const data = await fetchRead(tickers);
    setBusy(null);
    if ("code" in data) {
      setError(data.message);
      return;
    }
    setRead(data);
    setReadFor(wanted.map((row) => row.instrument_id).join(","));
    setStage("read");
  }

  async function submit(value: ImportInputValue) {
    const input = value.files.length > 0 ? "image" : "text";
    trackImportStarted({ surface: "try", input, images: value.files.length });
    setError(null);
    setBusy("parse");
    const parsed = await parseImport(value);
    setBusy(null);
    if ("code" in parsed) {
      trackImportParsed({ surface: "try", input, ok: false, error_code: parsed.code });
      setError(parsed.message);
      return;
    }
    const matched = parsed.rows.filter((row) => row.status !== "unknown").length;
    trackImportParsed({ surface: "try", input: parsed.input, ok: true, via: parsed.via, rows: parsed.rows.length, matched, unknown: parsed.rows.length - matched });
    if (parsed.not_holdings || parsed.rows.length === 0) {
      setError(
        parsed.not_holdings
          ? "That does not look like a list of holdings. Try the screen in your broker app that lists your positions."
          : "We could not find any tickers in that. Try one per line, like AAPL 10.",
      );
      return;
    }
    setSource(parsed.input === "image" ? "screenshot" : "manual");
    setRows(parsed.rows);
    // The read comes first; the list opens on request (the bar says when rows need a look).
    setEditing(false);
    await loadRead(parsed.rows);
  }

  async function save(list: ImportRow[], from: "now" | "pending") {
    const payload = saveableRows(list);
    if (payload.length === 0) return;
    setError(null);
    setBusy("save");
    let nowSignedIn = signedIn;
    if (!nowSignedIn) {
      writePending(list, source);
      try {
        await signInWithGoogle({ surface: "import_try" });
        nowSignedIn = true;
        setSignedIn(true);
      } catch {
        setBusy(null);
        setError("Sign-in did not finish. Your list is still here; try again when you are ready.");
        return;
      }
      try {
        // The import is this person's first step; the generic welcome would sit on top of it.
        localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
      } catch {
        // storage blocked: the welcome shows, and the save still goes ahead
      }
    }
    const pendingSource = from === "pending" ? readPending()?.source ?? "manual" : source;
    const res = await saveImportRows(payload, pendingSource);
    setBusy(null);
    if ("code" in res) {
      setError(res.message);
      return;
    }
    clearPending();
    setPending(0);
    trackImportSaved({
      surface: "try",
      added: res.added.length,
      updated: res.updated.length,
      with_shares: payload.filter((row) => row.shares !== null).length,
      pending: !signedIn || from === "pending",
    });
    const byId = new Map(list.map((row) => [row.instrument_id, row]));
    setSaved({
      added: res.added.length,
      updated: res.updated.length,
      kept: res.kept.length,
      stocks: [...res.added, ...res.updated, ...res.kept].map((id) => ({ instrument_id: id, ticker: byId.get(id)?.ticker ?? id.replace(/^US_/, ""), name: byId.get(id)?.name ?? null })),
    });
    setStage("saved");
    router.refresh();
  }

  if (stage === "saved" && saved) {
    return (
      <div className="flex flex-col gap-3">
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <p className="oa-label">Saved</p>
          <h2 className="mt-1 text-pretty text-[19px] font-semibold leading-6 text-oa-fg">
            {savedSentence(saved.added, saved.updated, saved.kept)}
          </h2>
          <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
            One more thing, if you have a minute: tell us why you own each one. We keep it next to the stock so you can see it later.
          </p>
        </section>
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <ThesisStep
            stocks={saved.stocks.slice(0, 20)}
            onDone={() => {
              router.push("/portfolio?tab=holdings");
            }}
          />
        </section>
        <Link href="/portfolio?tab=holdings" className="self-start px-2 text-[14px] text-oa-muted-fg underline underline-offset-4 hover:text-oa-fg sm:px-0">
          Go to your portfolio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending > 0 && stage === "input" ? (
        <section className="oa-surface flex flex-wrap items-center justify-between gap-3 border border-oa-border bg-oa-card px-4 py-3 sm:px-5">
          <p className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">
            You have {pending} {pending === 1 ? "stock" : "stocks"} waiting from before you signed in.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={PLAIN}
              onClick={() => {
                clearPending();
                setPending(0);
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={busy !== null}
              onClick={() => {
                const left = readPending();
                if (left) void save(left.rows, "pending");
              }}
            >
              {busy === "save" ? "Saving" : "Save them to my portfolio"}
            </button>
          </div>
        </section>
      ) : null}

      {stage === "input" ? (
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <ImportInput
            busy={busy !== null}
            error={error}
            submitLabel="See what we think"
            textPlaceholder={"AAPL, MSFT, NVDA\nor one per line with shares: AAPL 10 182.50"}
            onSubmit={(value) => void submit(value)}
            note={
              signedIn
                ? "Screenshots are read once and not kept."
                : "No account needed. Screenshots are read once and not kept; a list of tickers is read instantly."
            }
          />
        </section>
      ) : null}

      {stage === "read" && read && result ? (
        <>
          <section className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-pretty text-[14px] leading-5 text-oa-fg">
                {signedIn ? "Save these to your portfolio to follow them every day." : "Want us to keep watching these for you?"}
              </p>
              <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
                {signedIn
                  ? `They are added next to what you already track. Nothing is removed${owned > 0 ? `, and the ${owned === 1 ? "one you already own keeps its" : `${owned} you already own keep their`} saved numbers` : ""}.`
                  : "Sign in with Google and we save this list as your portfolio. Free, and nothing is connected to your broker."}
                {toCheck > 0 && !editing ? ` ${toCheck === 1 ? "One row needs" : `${toCheck} rows need`} a quick look before you save.` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className={PLAIN} disabled={busy !== null} onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
                {editing ? "Hide the list" : `Check the list (${included.length})`}
              </button>
              <button type="button" className={PRIMARY} disabled={busy !== null || stale || included.length === 0} onClick={() => void save(rows, "now")}>
                {busy === "save" ? "Saving" : signedIn ? "Save to my portfolio" : "Save this portfolio"}
              </button>
            </div>
          </section>
          {error ? (
            <p role="alert" className="px-2 text-pretty text-[13px] leading-[18px] text-signal-bearish sm:px-0">
              {error}
            </p>
          ) : null}
          {editing ? (
            <section className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
              <ReviewTable rows={rows} onChange={setRows} canRequest={signedIn} held={held} fixedHeight />
            </section>
          ) : null}
          {/* Outside the list, so hiding the list never leaves Save disabled without a reason. */}
          {stale ? (
            <section className="oa-surface flex flex-wrap items-center justify-between gap-2 border border-oa-border bg-oa-bg px-3 py-2.5">
              <p className="text-pretty text-[13px] text-oa-fg">The list changed. Update the read before saving.</p>
              <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void loadRead(rows)}>
                {busy === "read" ? "Reading" : "Update the read"}
              </button>
            </section>
          ) : null}
          <PortfolioReadView result={result} stocks={read.stocks} today={read.today} unknown={rows.filter((row) => row.status === "unknown").map((row) => row.ticker ?? row.raw).filter(Boolean)} />
          <button
            type="button"
            onClick={() => {
              setStage("input");
              setRows([]);
              setRead(null);
              setEditing(false);
              setError(null);
            }}
            className="self-start px-2 text-[14px] text-oa-muted-fg underline underline-offset-4 hover:text-oa-fg sm:px-0"
          >
            Start over with other stocks
          </button>
        </>
      ) : null}
    </div>
  );
}
