"use client";

import { useMemo, useState } from "react";

import { guessColumns, type CsvTable } from "@/lib/import/brokers";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const SELECT = `h-10 w-full min-w-0 rounded border border-oa-border bg-oa-card px-2 text-[14px] text-oa-fg ${FOCUS}`;

/** "Owned (12, 5, 3)": a column's header with its first few values, so the right one is easy to spot. */
function optionLabel(table: CsvTable, index: number): string {
  const sample = table.rows
    .map((row) => (row[index] ?? "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((cell) => (cell.length > 14 ? `${cell.slice(0, 13)}…` : cell));
  return sample.length > 0 ? `${table.headers[index]} (${sample.join(", ")})` : table.headers[index]!;
}

/**
 * A CSV we do not recognise: the person picks the ticker column and the
 * shares column, and the file is read with those. Both picks start on our
 * best guess.
 */
export function ColumnMap({
  table,
  fileName,
  busy,
  onPick,
  onCancel,
}: {
  table: CsvTable;
  fileName: string;
  busy: boolean;
  onPick: (pick: { ticker: number; shares: number }) => void;
  onCancel: () => void;
}) {
  const guess = useMemo(() => guessColumns(table), [table]);
  const [ticker, setTicker] = useState<number | null>(guess.ticker);
  const [shares, setShares] = useState<number | null>(guess.shares);
  const ready = ticker !== null && shares !== null && ticker !== shares;
  const options = table.headers.map((_, index) => (
    <option key={index} value={index}>
      {optionLabel(table, index)}
    </option>
  ));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onPick({ ticker: ticker!, shares: shares! });
      }}
    >
      <div>
        <h2 className="text-pretty text-[16px] font-semibold leading-[22px] text-oa-fg">Which columns hold your tickers and shares?</h2>
        <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
          We do not know the layout of <span className="text-oa-fg">{fileName}</span>. Pick the two columns and we read the {table.rows.length}{" "}
          {table.rows.length === 1 ? "line" : "lines"} under them.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] text-oa-muted-fg">Ticker column</span>
          <select className={SELECT} value={ticker ?? ""} onChange={(event) => setTicker(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Pick a column</option>
            {options}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] text-oa-muted-fg">Shares column</span>
          <select className={SELECT} value={shares ?? ""} onChange={(event) => setShares(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Pick a column</option>
            {options}
          </select>
        </label>
      </div>
      {ticker !== null && ticker === shares ? (
        <p role="alert" className="text-pretty text-[13px] leading-[18px] text-signal-bearish">
          Tickers and shares need two different columns.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!ready || busy}
          className={`inline-flex h-10 items-center gap-2 rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          {busy ? "Reading" : "Read the file"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`inline-flex h-10 items-center rounded border border-oa-border bg-oa-card px-3.5 text-[14px] text-oa-fg hover:border-oa-fg/30 disabled:opacity-60 ${FOCUS}`}
        >
          Use another file
        </button>
      </div>
    </form>
  );
}
