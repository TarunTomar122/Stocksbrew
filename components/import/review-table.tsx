"use client";

import { useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { mergeHolding, type Held, type MergeMode } from "@/lib/import/merge";
import { LIMITS, parseAmount } from "@/lib/import/normalize";
import { aliasFor, type ImportRow } from "@/lib/import/resolve";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const INPUT = `oa-mono h-9 w-full min-w-0 rounded border border-oa-border bg-oa-card px-2 text-right text-[13px] tabular-nums text-oa-fg placeholder:text-oa-muted-fg ${FOCUS}`;

/** Look a typed ticker up in the same index the import checks against, with the same aliases (GOOG is GOOGL). */
async function lookupTicker(typed: string): Promise<{ instrument_id: string; ticker: string; name: string } | null> {
  const q = typed.trim().toUpperCase().replace(/^\$/, "");
  if (!q) return null;
  async function exact(symbol: string) {
    const res = await fetch(`/api/search-index?market=US&limit=8&q=${encodeURIComponent(symbol)}`);
    const data = (await res.json()) as { entries?: Array<{ instrument_id: string; ticker: string; name: string }> };
    const alt = symbol.replace(/[-/ ]/g, ".");
    return data.entries?.find((entry) => entry.ticker.toUpperCase() === symbol || entry.ticker.toUpperCase() === alt) ?? null;
  }
  try {
    const found = await exact(q);
    if (found) return found;
    const alias = aliasFor(q);
    return alias ? await exact(alias) : null;
  } catch {
    return null;
  }
}

function fmtNumber(value: number | null): string {
  if (value === null) return "";
  return String(Math.round(value * 10_000) / 10_000);
}

function ConfidenceNote({ row }: { row: ImportRow }) {
  if (row.status === "unknown") return null;
  if (row.currency) {
    return (
      <span className="block text-pretty text-[12px] leading-4 text-oa-label">
        Your screen showed {row.currency}, so we left the cost out. Add it in dollars if you know it.
      </span>
    );
  }
  if (row.status === "suggested") return null;
  if (row.confidence === "high") return null;
  return (
    <span className="text-[12px] leading-4 text-oa-label">{row.confidence === "medium" ? "Check this row" : "Not sure we read this right"}</span>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  max,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  /** Larger numbers are refused here, as the save would refuse them. */
  max: number;
  /** The row keeps the numbers already saved, so these are not used. */
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(fmtNumber(value));
  const [bad, setBad] = useState(false);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = event.target.value.trim() ? parseAmount(event.target.value) : null;
        const ok = parsed === null ? !event.target.value.trim() : parsed > 0 && parsed <= max;
        setBad(!ok);
        if (ok) onChange(parsed);
      }}
      className={`${INPUT} ${bad ? "!border-signal-bearish" : ""} disabled:bg-oa-bg disabled:text-oa-muted-fg disabled:line-through`}
    />
  );
}

function TickerFix({ row, onResolved }: { row: ImportRow; onResolved: (entry: { instrument_id: string; ticker: string; name: string } | null, typed: string) => void }) {
  const [typed, setTyped] = useState(row.status === "unknown" ? row.ticker ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [missed, setMissed] = useState(false);
  async function check() {
    if (!typed.trim()) return;
    setBusy(true);
    const entry = await lookupTicker(typed);
    setBusy(false);
    setMissed(!entry);
    onResolved(entry, typed);
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        aria-label="Ticker"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value.toUpperCase());
          setMissed(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void check();
          }
        }}
        placeholder="Ticker"
        className={`oa-mono h-9 w-24 rounded border bg-oa-card px-2 text-[13px] uppercase text-oa-fg placeholder:normal-case placeholder:text-oa-muted-fg ${missed ? "border-signal-bearish" : "border-oa-border"} ${FOCUS}`}
      />
      <button
        type="button"
        onClick={() => void check()}
        disabled={busy || !typed.trim()}
        className={`inline-flex h-9 items-center rounded border border-oa-border px-2.5 text-[13px] font-medium text-oa-fg disabled:opacity-50 ${FOCUS}`}
      >
        {busy ? "Checking" : "Check"}
      </button>
    </span>
  );
}

function RequestButton({ ticker }: { ticker: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <span className="text-[12.5px] text-oa-muted-fg">Asked. We will add it if we can.</span>;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/stock-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: ticker }),
        }).catch(() => null);
        setState(res?.ok ? "done" : "error");
      }}
      className={`text-[12.5px] font-medium text-oa-primary underline-offset-2 hover:underline ${FOCUS}`}
    >
      {state === "error" ? "That did not go through. Try again" : `Ask us to add ${ticker}`}
    </button>
  );
}

/** What the row is: a stock we cover, a guess to confirm, or one we do not have. */
function StockCell({
  row,
  canRequest,
  held,
  repeat = false,
  update,
}: {
  row: ImportRow;
  canRequest: boolean;
  /** What the person already has of this stock, if anything. */
  held?: Held;
  /** The same stock is on an earlier row, which is the one saved. */
  repeat?: boolean;
  update: (patch: Partial<ImportRow>) => void;
}) {
  const [fixing, setFixing] = useState(row.status === "unknown");
  if (fixing || row.status === "unknown") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <TickerFix
          row={row}
          onResolved={(entry, typed) => {
            if (entry) {
              setFixing(false);
              update({ status: "matched", instrument_id: entry.instrument_id, ticker: entry.ticker, name: entry.name, confidence: row.confidence === "low" ? "medium" : row.confidence });
            } else update({ status: "unknown", instrument_id: null, ticker: typed.trim().toUpperCase() || row.ticker });
          }}
        />
        <span className="text-pretty text-[12.5px] leading-4 text-oa-muted-fg">
          {row.ticker || row.raw ? (
            <>
              We do not cover <span className="oa-mono text-oa-fg">{row.ticker || row.raw}</span> yet, so it is left out.{" "}
            </>
          ) : (
            "Type a ticker and check it. "
          )}
          {canRequest && row.ticker ? <RequestButton ticker={row.ticker} /> : null}
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <StockLogo ticker={row.ticker ?? ""} size={24} circle className="mt-px shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <button
            type="button"
            onClick={() => setFixing(true)}
            title="Change the ticker"
            aria-label={`${row.ticker}, change the ticker`}
            className={`oa-mono inline-flex items-center gap-1 rounded text-[14px] font-medium text-oa-fg underline decoration-oa-border decoration-dotted underline-offset-4 hover:decoration-oa-fg ${FOCUS}`}
          >
            {row.ticker}
            <svg viewBox="0 0 16 16" className="size-3 text-oa-muted-fg" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <span className="block text-pretty text-[12.5px] leading-4 text-oa-muted-fg">{row.name}</span>
        {row.status === "suggested" ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] leading-4 text-oa-label">
            Your screen said {row.raw}. Is it {row.ticker}?
            <button
              type="button"
              onClick={() => update({ status: "matched" })}
              className={`font-medium text-oa-primary underline-offset-2 hover:underline ${FOCUS}`}
            >
              Yes
            </button>
          </span>
        ) : null}
        {repeat ? (
          <span className="mt-0.5 block text-pretty text-[12.5px] leading-4 text-oa-label">
            {row.ticker} is already on this list above, so this row is left out. Change the ticker or remove the row.
          </span>
        ) : (
          <>
            <ConfidenceNote row={row} />
            {held ? <HeldNote row={row} held={held} update={update} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function fmtShares(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtCost(value: number): string {
  // Two decimals like a broker shows them; a penny stock keeps four so it does not read as $0.00.
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 4 : 2 });
}

function sharesAt(shares: number | null, cost: number | null): string {
  if (shares !== null && cost !== null) return `${fmtShares(shares)} ${shares === 1 ? "share" : "shares"} at ${fmtCost(cost)}`;
  if (shares !== null) return `${fmtShares(shares)} ${shares === 1 ? "share" : "shares"}`;
  if (cost !== null) return `a cost of ${fmtCost(cost)}`;
  return "";
}

/** Which of this row's numbers are not used, because the row keeps what the person saved before. */
function lockedFields(row: ImportRow, held: Held | undefined): { shares: boolean; cost: boolean } {
  const keeps = Boolean(held && held.kind === "holding" && (row.merge ?? "keep") === "keep");
  return { shares: keeps && held!.shares !== null, cost: keeps && held!.average_cost !== null };
}

/**
 * A stock the person already has. Holdings keep their saved numbers unless the
 * person picks otherwise here; the line under the choice says what the save
 * will write.
 */
function HeldNote({ row, held, update }: { row: ImportRow; held: Held; update: (patch: Partial<ImportRow>) => void }) {
  if (held.kind === "watchlist") {
    return <span className="mt-0.5 block text-pretty text-[12.5px] leading-4 text-oa-muted-fg">On your watchlist now. Saving moves it to the stocks you own.</span>;
  }
  const mine = sharesAt(held.shares, held.average_cost);
  if (held.shares === null) {
    return <span className="mt-0.5 block text-pretty text-[12.5px] leading-4 text-oa-muted-fg">Already in your portfolio without shares. Saving fills them in.</span>;
  }
  const mode: MergeMode = row.merge ?? "keep";
  const canAdd = held.shares !== null && row.shares !== null;
  const theirs = sharesAt(row.shares, row.average_cost);
  const after = mergeHolding({ quantity: held.shares, average_cost: held.average_cost }, row, mode);
  const result = sharesAt(after.quantity, after.average_cost);
  return (
    <span className="mt-1 flex flex-col gap-1">
      <span className="text-pretty text-[12.5px] leading-4 text-oa-fg">You already have {mine} saved.</span>
      <select
        aria-label={`What to do with the ${row.ticker} you already have`}
        value={mode}
        onChange={(event) => update({ merge: event.target.value as MergeMode })}
        className={`h-9 w-full max-w-[18rem] rounded border border-oa-border bg-oa-card px-2 text-[13px] text-oa-fg ${FOCUS}`}
      >
        <option value="keep">Keep what I saved</option>
        {theirs ? <option value="replace">Use {theirs} from this import</option> : null}
        {canAdd ? <option value="add">Add them together</option> : null}
      </select>
      {mode === "add" && result ? <span className="text-pretty text-[12.5px] leading-4 text-oa-muted-fg">Saving makes it {result}.</span> : null}
    </span>
  );
}

/**
 * The list to check before saving. Every row can be fixed: ticker, shares,
 * average cost, or removed. Rows we do not cover stay visible, marked as
 * left out, so nothing disappears without the person seeing it.
 */
export function ReviewTable({
  rows,
  onChange,
  canRequest = false,
  held = {},
  fixedHeight = false,
}: {
  rows: ImportRow[];
  onChange: (rows: ImportRow[]) => void;
  /** Signed-in only: offer "Ask us to add" on stocks we do not cover. */
  canRequest?: boolean;
  /** Signed-in only: what the person already tracks, by instrument id. */
  held?: Record<string, Held>;
  /** On a page (not in the sheet, which scrolls already): about eight rows, then the list scrolls inside. */
  fixedHeight?: boolean;
}) {
  const heldOf = (row: ImportRow) => (row.instrument_id ? held[row.instrument_id] : undefined);
  // The first row for a stock is the one saved (components/import/client.ts includedRows); later ones are marked.
  const firstKey = new Map<string, string>();
  for (const row of rows) if (row.instrument_id && row.status !== "unknown" && !firstKey.has(row.instrument_id)) firstKey.set(row.instrument_id, row.key);
  const isRepeat = (row: ImportRow) => Boolean(row.instrument_id && row.status !== "unknown" && firstKey.get(row.instrument_id) !== row.key);
  const ready = firstKey.size;
  const leftOut = rows.filter((row) => row.status === "unknown").length;
  const toCheck = rows.filter((row) => !isRepeat(row) && (row.status === "suggested" || (row.status === "matched" && row.confidence !== "high"))).length;
  // Held with saved numbers: the ones "keep" protects. A holding without shares just gets them filled in.
  const owned = rows.filter((row) => row.status !== "unknown" && !isRepeat(row) && heldOf(row)?.kind === "holding" && heldOf(row)?.shares != null).length;

  function update(key: string, patch: Partial<ImportRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col">
      <p className="text-pretty px-3 py-2.5 text-[14px] leading-5 text-oa-fg">
        {rows.length === 0
          ? "No holdings yet. Add a stock below."
          : `${ready} ${ready === 1 ? "stock is" : "stocks are"} ready to save.`}
        {toCheck > 0 ? <span className="text-oa-muted-fg"> {toCheck === 1 ? "One row needs" : `${toCheck} rows need`} a quick look.</span> : null}
        {leftOut > 0 ? <span className="text-oa-muted-fg"> {leftOut === 1 ? "One we do not cover is" : `${leftOut} we do not cover are`} left out.</span> : null}
        {owned > 0 ? (
          <span className="text-oa-muted-fg">
            {" "}
            {owned === 1 ? "One you already own keeps" : `${owned} you already own keep`} the numbers you saved unless you pick otherwise.
          </span>
        ) : null}
      </p>
      <div className={`hidden border-t border-oa-border sm:block ${fixedHeight ? "max-h-[27rem] overflow-y-auto" : ""}`}>
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead className={fixedHeight ? "sticky top-0 z-[1] bg-oa-card" : ""}>
            <tr className="border-b border-oa-border text-left">
              <th className="oa-caption px-3 py-2 font-normal">Stock</th>
              <th className="oa-caption w-32 px-2 py-2 text-right font-normal">Shares</th>
              <th className="oa-caption w-36 px-2 py-2 text-right font-normal">Average cost</th>
              <th className="w-12 px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b border-oa-border align-top last:border-b-0 ${row.status === "unknown" || isRepeat(row) ? "bg-oa-bg" : ""}`}>
                <td className="px-3 py-2.5">
                  <StockCell row={row} canRequest={canRequest} held={heldOf(row)} repeat={isRepeat(row)} update={(patch) => update(row.key, patch)} />
                </td>
                <td className="px-2 py-2.5">
                  <NumberField label={`Shares of ${row.ticker ?? row.raw}`} value={row.shares} placeholder="Shares" max={LIMITS.shares} disabled={lockedFields(row, heldOf(row)).shares} onChange={(shares) => update(row.key, { shares })} />
                </td>
                <td className="px-2 py-2.5">
                  <NumberField label={`Average cost of ${row.ticker ?? row.raw}`} value={row.average_cost} placeholder="$ per share" max={LIMITS.price} disabled={lockedFields(row, heldOf(row)).cost} onChange={(average_cost) => update(row.key, { average_cost })} />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <RemoveButton label={row.ticker ?? row.raw} onClick={() => onChange(rows.filter((item) => item.key !== row.key))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={`divide-y divide-oa-border border-t border-oa-border sm:hidden ${fixedHeight ? "max-h-[36rem] overflow-y-auto" : ""}`}>
        {rows.map((row) => (
          <li key={row.key} className={`flex flex-col gap-2 px-3 py-3 ${row.status === "unknown" || isRepeat(row) ? "bg-oa-bg" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <StockCell row={row} canRequest={canRequest} held={heldOf(row)} repeat={isRepeat(row)} update={(patch) => update(row.key, patch)} />
              <RemoveButton label={row.ticker ?? row.raw} onClick={() => onChange(rows.filter((item) => item.key !== row.key))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="oa-caption">Shares</span>
                <NumberField label={`Shares of ${row.ticker ?? row.raw}`} value={row.shares} placeholder="Shares" max={LIMITS.shares} disabled={lockedFields(row, heldOf(row)).shares} onChange={(shares) => update(row.key, { shares })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="oa-caption">Average cost</span>
                <NumberField label={`Average cost of ${row.ticker ?? row.raw}`} value={row.average_cost} placeholder="$ per share" max={LIMITS.price} disabled={lockedFields(row, heldOf(row)).cost} onChange={(average_cost) => update(row.key, { average_cost })} />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-oa-border px-3 py-2">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...rows,
              { key: `added-${Date.now()}`, raw: "", status: "unknown", instrument_id: null, ticker: null, name: null, shares: null, average_cost: null, market_value: null, confidence: "high" },
            ])
          }
          className={`inline-flex h-9 items-center text-[13px] font-medium text-oa-primary hover:underline ${FOCUS}`}
        >
          + Add a stock
        </button>
      </div>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${label}`}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded border border-transparent text-[16px] leading-none text-oa-muted-fg hover:border-oa-border hover:text-oa-fg ${FOCUS}`}
    >
      ×
    </button>
  );
}
