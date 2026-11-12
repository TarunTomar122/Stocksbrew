"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  checkHoldings,
  clearPending,
  fetchRead,
  includedRows,
  isCsvFile,
  isSpreadsheetFile,
  parseImport,
  readCsvFile,
  readPending,
  rowsValue,
  savedSentence,
  saveableRows,
  saveImportRows,
  writePending,
  type ParseResponse,
  type ReadResponse,
} from "@/components/import/client";
import { ColumnMap } from "@/components/import/column-map";
import { ImportInput, type ImportInputValue } from "@/components/import/import-input";
import { PortfolioReadView } from "@/components/import/portfolio-read";
import { ReviewTable } from "@/components/import/review-table";
import { ThesisStep } from "@/components/thesis/thesis-step";
import { BROKER_NAMES, parseMappedCsv, skippedGroups, type BrokerCsv, type CsvTable } from "@/lib/import/brokers";
import type { Held } from "@/lib/import/merge";
import type { ImportRow } from "@/lib/import/resolve";
import { buildPortfolioRead } from "@/lib/import/read-shared";
import type { CsvMeta } from "@/lib/import/text";
import { trackImportParsed, trackImportSaved, trackImportStarted } from "@/lib/product-analytics";
import { POST_SIGNUP_ONBOARDING_PENDING, signInWithGoogle } from "@/lib/sign-in";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:opacity-60 ${FOCUS}`;
const PLAIN = `inline-flex h-10 items-center justify-center rounded border border-oa-border bg-oa-card px-3.5 text-[14px] text-oa-fg hover:border-oa-fg/30 disabled:opacity-60 ${FOCUS}`;

/**
 * input:  paste, upload a CSV, or add screenshots.
 * map:    a CSV we do not recognise; the person picks two columns.
 * review: holdings with share counts (a broker export, or pasted "NVDA 25 @ 120"): every row checked, then saved.
 * read:   a list of tickers only: our read on them first, the list behind a button.
 * saved:  after a save of tickers only, the "why do you own it" step.
 */
type Stage = "input" | "map" | "review" | "read" | "saved";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "your Fidelity export", "your file", "what you pasted". */
function sourceWords(meta: CsvMeta | null, from: "file" | "paste" | "screenshot"): string {
  const broker = meta ? BROKER_NAMES[meta.broker] : null;
  if (broker) return `your ${broker} ${meta!.trades ? "activity file" : "export"}`;
  if (from === "file") return "your file";
  if (from === "screenshot") return "your screenshots";
  return "what you pasted";
}

/**
 * /import: bring your holdings in. Upload the CSV your broker exports (or drop
 * it anywhere on the page), paste lines like "NVDA 25 @ 120", or add
 * screenshots. Holdings with share counts open a review of every row, with
 * what each is worth today and what was left out of the file and why; saving
 * adds them next to what the person already tracks and lands on My stocks.
 * A list of tickers alone gets our read on them first, as before.
 *
 * Signed out, "Save" keeps the list in this browser, signs in, and saves it
 * through the same route. Nothing about a signed-out visitor is written on our
 * side except the daily count of screenshot reads, and a CSV file never leaves
 * the browser: only the holdings read from it are sent to be checked.
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
  const [from, setFrom] = useState<"file" | "paste" | "screenshot">("paste");
  const [meta, setMeta] = useState<CsvMeta | null>(null);
  const [mapping, setMapping] = useState<{ table: CsvTable; fileName: string } | null>(null);
  const [read, setRead] = useState<ReadResponse | null>(null);
  const [readFor, setReadFor] = useState<string>("");
  const [busy, setBusy] = useState<null | "parse" | "read" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<number>(0);
  const [saved, setSaved] = useState<{ added: number; updated: number; kept: number; stocks: Array<{ instrument_id: string; ticker: string; name: string | null }> } | null>(null);
  const [pageDrag, setPageDrag] = useState(false);
  const [incoming, setIncoming] = useState<{ files: File[]; at: number } | null>(null);
  const top = useRef<HTMLDivElement>(null);

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

  function startOver() {
    setStage("input");
    setRows([]);
    setRead(null);
    setMeta(null);
    setMapping(null);
    setEditing(false);
    setError(null);
    setIncoming(null);
  }

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

  /** Every input ends here: holdings with shares go to the review, a bare list of tickers to the read. */
  async function took(parsed: ParseResponse, how: "file" | "paste" | "screenshot", csv: CsvMeta | null) {
    const matched = parsed.rows.filter((row) => row.status !== "unknown").length;
    trackImportParsed({ surface: "try", input: parsed.input, ok: true, via: parsed.via, rows: parsed.rows.length, matched, unknown: parsed.rows.length - matched });
    if (parsed.not_holdings || parsed.rows.length === 0) {
      const groups = csv ? skippedGroups(csv.skipped) : [];
      setError(
        groups.length > 0
          ? `We found no stocks or funds in ${sourceWords(csv, how)}, only ${groups.map((group) => group.words.toLowerCase()).join(" and ")}.`
          : parsed.not_holdings
            ? "That does not look like a list of holdings. Try the screen in your broker app that lists your positions."
            : "We could not find any tickers in that. Try one per line, like NVDA 25 @ 120.",
      );
      setStage("input");
      return;
    }
    setSource(parsed.input === "image" ? "screenshot" : "manual");
    setFrom(how);
    setMeta(csv);
    setRows(parsed.rows);
    setEditing(false);
    // Share counts make it a portfolio to check and save; tickers alone get our read first.
    if (parsed.input === "csv" || parsed.rows.some((row) => row.shares !== null)) {
      setStage("review");
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    await loadRead(parsed.rows);
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
    await took(parsed, input === "image" ? "screenshot" : "paste", parsed.csv ?? null);
  }

  /** Holdings read from a file in this browser, checked against the stocks we cover. */
  async function checkFile(csv: BrokerCsv) {
    const { rows: holdings, ...rest } = csv;
    if (holdings.length === 0) {
      await took({ rows: [], input: "csv", via: "rules", not_holdings: false, remaining: null }, "file", rest);
      return;
    }
    setBusy("parse");
    const checked = await checkHoldings(holdings);
    setBusy(null);
    if ("code" in checked) {
      trackImportParsed({ surface: "try", input: "csv", ok: false, error_code: checked.code });
      setError(checked.message);
      return;
    }
    await took(checked, "file", rest);
  }

  async function takeFile(file: File) {
    if (busy !== null) return;
    trackImportStarted({ surface: "try", input: "csv", images: 0 });
    setError(null);
    setBusy("parse");
    const out = await readCsvFile(file);
    setBusy(null);
    if ("code" in out) {
      trackImportParsed({ surface: "try", input: "csv", ok: false, error_code: out.code });
      setError(out.message);
      setStage("input");
      return;
    }
    if (out.kind === "map") {
      setMapping({ table: out.table, fileName: file.name });
      setStage("map");
      return;
    }
    if (out.kind === "text") {
      await submit({ files: [], text: out.text });
      return;
    }
    await checkFile(out.csv);
  }

  // Drop a CSV anywhere on the page. Screenshots dropped outside the box join the box.
  const takeFileRef = useRef(takeFile);
  takeFileRef.current = takeFile;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Without this the browser opens the file in place of the page.
      event.preventDefault();
      if (stageRef.current !== "input" && stageRef.current !== "map") return;
      setPageDrag(true);
      clearTimeout(timer);
      timer = setTimeout(() => setPageDrag(false), 180);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Read before preventDefault below: true here means the drop box took the files already.
      const handled = event.defaultPrevented;
      event.preventDefault();
      setPageDrag(false);
      if (handled) return;
      if (stageRef.current !== "input" && stageRef.current !== "map") return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      const sheet = files.find((file) => isCsvFile(file) || isSpreadsheetFile(file));
      if (sheet) void takeFileRef.current(sheet);
      else if (files.length > 0) {
        setStage("input");
        setIncoming({ files, at: Date.now() });
      }
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

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
    if ("code" in res) {
      setBusy(null);
      setError(res.message);
      return;
    }
    clearPending();
    setPending(0);
    const withShares = payload.filter((row) => row.shares !== null).length;
    trackImportSaved({ surface: "try", added: res.added.length, updated: res.updated.length, with_shares: withShares, pending: !signedIn || from === "pending" });
    // Share counts mean My stocks can show what they are worth and what they made: go straight there.
    if (withShares > 0) {
      router.push("/portfolio");
      // A visit to My stocks earlier in this session may be in the router cache; this fetches it fresh.
      router.refresh();
      return;
    }
    setBusy(null);
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
          <h2 className="text-pretty text-[19px] font-semibold leading-6 text-oa-fg">{savedSentence(saved.added, saved.updated, saved.kept)}</h2>
          <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
            One more thing, if you have a minute: tell us why you own each one. We keep it next to the stock so you can see it later.
          </p>
        </section>
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <ThesisStep
            stocks={saved.stocks.slice(0, 20)}
            onDone={() => {
              router.push("/portfolio");
            }}
          />
        </section>
        <Link href="/portfolio" className="self-start px-2 text-[14px] text-oa-muted-fg underline underline-offset-4 hover:text-oa-fg sm:px-0">
          Go to your portfolio
        </Link>
      </div>
    );
  }

  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-3">
      {pageDrag ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[color-mix(in_srgb,var(--oa-page)_82%,transparent)] p-4">
          <div className="rounded-lg border-2 border-dashed border-oa-primary bg-oa-card px-6 py-5 text-center shadow-lg">
            <p className="text-[16px] font-semibold text-oa-fg">Drop your file to read it</p>
            <p className="mt-1 text-[13.5px] text-oa-muted-fg">A CSV from your broker, or screenshots of your holdings.</p>
          </div>
        </div>
      ) : null}

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
        <section data-import-drop className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <ImportInput
            busy={busy !== null}
            error={error}
            submitLabel="Read my holdings"
            textPlaceholder={"NVDA 25 @ 120\nAAPL, 10\nor just tickers: MSFT, AMZN"}
            onSubmit={(value) => void submit(value)}
            onCsv={(file) => void takeFile(file)}
            incoming={incoming}
            note={signedIn ? "Nothing connects to your broker. Screenshots are read once and not kept." : "No account needed to try it. Nothing connects to your broker."}
          />
        </section>
      ) : null}

      {stage === "map" && mapping ? (
        <section data-import-drop className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <ColumnMap
            key={`${mapping.fileName}|${mapping.table.headers.join("|")}`}
            table={mapping.table}
            fileName={mapping.fileName}
            busy={busy !== null}
            onCancel={startOver}
            onPick={(pick) => void checkFile(parseMappedCsv(mapping.table, pick))}
          />
          {error ? (
            <p role="alert" className="mt-3 text-pretty text-[13px] leading-[18px] text-signal-bearish">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {stage === "review" ? (
        <ReviewStage
          rows={rows}
          setRows={setRows}
          held={held}
          signedIn={signedIn}
          meta={meta}
          from={from}
          busy={busy}
          error={error}
          onSave={() => void save(rows, "now")}
          onStartOver={startOver}
        />
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
          <button type="button" onClick={startOver} className="self-start px-2 text-[14px] text-oa-muted-fg underline underline-offset-4 hover:text-oa-fg sm:px-0">
            Start over with other stocks
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Rows for a stock the person already owns with saved numbers, where this import says something different. */
function differingOwned(rows: ImportRow[], held: Record<string, Held>): ImportRow[] {
  return includedRows(rows).filter((row) => {
    const had = held[row.instrument_id!];
    if (!had || had.kind !== "holding" || had.shares === null) return false;
    return (row.shares !== null && row.shares !== had.shares) || (row.average_cost !== null && had.average_cost !== null && row.average_cost !== had.average_cost);
  });
}

/**
 * The review of a portfolio with share counts: one line on what we found and
 * what it is worth today, what was left out of the file and why, a single
 * choice for stocks the person already owns, then every row to check.
 */
function ReviewStage({
  rows,
  setRows,
  held,
  signedIn,
  meta,
  from,
  busy,
  error,
  onSave,
  onStartOver,
}: {
  rows: ImportRow[];
  setRows: (rows: ImportRow[]) => void;
  held: Record<string, Held>;
  signedIn: boolean;
  meta: CsvMeta | null;
  from: "file" | "paste" | "screenshot";
  busy: null | "parse" | "read" | "save";
  error: string | null;
  onSave: () => void;
  onStartOver: () => void;
}) {
  const included = includedRows(rows);
  const count = included.length;
  const { value, priced } = rowsValue(rows);
  const groups = meta ? skippedGroups(meta.skipped) : [];
  const differing = differingOwned(rows, held);
  const allReplace = differing.length > 0 && differing.every((row) => row.merge === "replace");
  const noun = count === 1 ? "holding" : "holdings";
  const headline =
    count === 0
      ? `None of the stocks in ${sourceWords(meta, from)} are ones we cover yet.`
      : `We found ${count} ${noun} in ${sourceWords(meta, from)}${priced > 0 ? `, worth ${money(value)} today` : ""}.`;

  return (
    <>
      <section className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-pretty text-[17px] font-semibold leading-6 text-oa-fg">{headline}</h2>
            <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
              {meta?.trades
                ? `${BROKER_NAMES[meta.broker] ?? "This broker"} exports trades, not holdings, so we added up the buys and sells in the file. If it does not go back to your first buy, fix the shares below. `
                : null}
              {meta && meta.truncated > 0
                ? `The file has ${meta.truncated} more holdings than we read at once, so these are ${rows.some((row) => row.market_value !== null) ? `its ${rows.length} biggest` : `the first ${rows.length}`}. `
                : null}
              Check each row, then save. {signedIn ? "Nothing you already have is removed." : "You sign in with Google to save, and nothing you add is shared."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className={PLAIN} disabled={busy !== null} onClick={onStartOver}>
              Start over
            </button>
            <button type="button" className={PRIMARY} disabled={busy !== null || count === 0} onClick={onSave}>
              {busy === "save" ? "Saving" : signedIn ? `Save ${count} ${noun}` : `Sign in and save ${count}`}
            </button>
          </div>
        </div>
        {groups.length > 0 ? (
          <div className="mt-3 border-t border-oa-border pt-2.5">
            <p className="text-pretty text-[13.5px] font-medium leading-5 text-oa-fg">
              We left out {meta!.skipped.length} {meta!.skipped.length === 1 ? "line" : "lines"} that are not stocks or funds you hold.
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {groups.map((group) => (
                <li key={group.reason} className="text-pretty text-[13px] leading-[19px] text-oa-muted-fg">
                  <span className="text-oa-fg">{group.words}:</span> <span className="oa-mono text-[12.5px]">{group.labels.join(", ")}</span>
                  {group.more > 0 ? ` and ${group.more} more` : ""}.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {differing.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-oa-border pt-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-pretty text-[13.5px] leading-5 text-oa-fg">
              {allReplace
                ? `The ${differing.length === 1 ? "one" : differing.length} you already own will take the numbers from this import.`
                : `${differing.length === 1 ? "One stock you already own has" : `${differing.length} stocks you already own have`} other numbers saved. ${differing.length === 1 ? "It keeps" : "They keep"} what you saved unless you choose otherwise.`}
            </p>
            <button
              type="button"
              className={`${PLAIN} shrink-0`}
              disabled={busy !== null}
              onClick={() => {
                const ids = new Set(differing.map((row) => row.instrument_id));
                setRows(rows.map((row) => (ids.has(row.instrument_id) ? { ...row, merge: allReplace ? "keep" : "replace" } : row)));
              }}
            >
              {allReplace ? "Keep what I saved" : differing.length === 1 ? "Use the new numbers" : `Use the new numbers for all ${differing.length}`}
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2.5 text-pretty text-[13px] leading-[18px] text-signal-bearish">
            {error}
          </p>
        ) : null}
      </section>
      <section className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <ReviewTable rows={rows} onChange={setRows} canRequest={signedIn} held={held} fixedHeight />
      </section>
    </>
  );
}
