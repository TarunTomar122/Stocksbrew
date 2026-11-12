"use client";

import * as React from "react";

import { BasketActions } from "@/components/screener/basket-actions";

/**
 * Row selection for the results table. The table cells are rendered on the
 * server; these small client pieces share one set of ticked symbols.
 */

type Selection = {
  selected: ReadonlySet<string>;
  toggle: (symbol: string) => void;
  setMany: (symbols: readonly string[], on: boolean) => void;
  clear: () => void;
};

const SelectionContext = React.createContext<Selection | null>(null);

export function SelectionProvider({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  // A new screen is a new list: ticks from the old one would point at rows that are gone.
  React.useEffect(() => setSelected(new Set()), [resetKey]);

  const value = React.useMemo<Selection>(
    () => ({
      selected,
      toggle: (symbol) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(symbol)) next.delete(symbol);
          else next.add(symbol);
          return next;
        }),
      setMany: (symbols, on) =>
        setSelected((current) => {
          const next = new Set(current);
          for (const symbol of symbols) {
            if (on) next.add(symbol);
            else next.delete(symbol);
          }
          return next;
        }),
      clear: () => setSelected(new Set()),
    }),
    [selected],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection(): Selection {
  const value = React.useContext(SelectionContext);
  if (!value) throw new Error("selection used outside SelectionProvider");
  return value;
}

// The box, tick and dash are .chk-* in app/globals.css: the results table prints one per row.
// "peer" stays on the input so the tick and dash can follow its checked and indeterminate states.
const BOX = "peer chk-in";

function Check({ input }: { input: React.ReactNode }) {
  return (
    <label className="chk">
      <span className="chk-box">
        {input}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="chk-tick"
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
        <span aria-hidden="true" className="chk-dash" />
      </span>
    </label>
  );
}

export function RowCheck({ symbol }: { symbol: string }) {
  const { selected, toggle } = useSelection();
  return (
    <Check
      input={
        <input
          type="checkbox"
          className={BOX}
          checked={selected.has(symbol)}
          onChange={() => toggle(symbol)}
          aria-label={`Select ${symbol}`}
        />
      }
    />
  );
}

export function SelectAllCheck({ symbols }: { symbols: readonly string[] }) {
  const { selected, setMany } = useSelection();
  const count = symbols.filter((symbol) => selected.has(symbol)).length;
  const all = symbols.length > 0 && count === symbols.length;
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <Check
      input={
        <input
          ref={ref}
          type="checkbox"
          className={BOX}
          checked={all}
          onChange={() => setMany(symbols, !all)}
          aria-label={all ? "Clear selection" : "Select every row shown"}
        />
      }
    />
  );
}

/** Appears once something is ticked: what you can do with the selection. */
export function SelectionBar({ order, compareLimit }: { order: readonly string[]; compareLimit: number }) {
  const { selected, clear } = useSelection();
  if (selected.size === 0) {
    return (
      // Phones list stocks without tick boxes, so the hint is for wider screens only.
      <p className="border-t border-oa-border px-4 py-2.5 text-[13px] text-oa-muted-fg max-sm:hidden">
        Tick a few rows to watch them, compare them, or see how they would have done together.
      </p>
    );
  }
  // Keep the table's order so "compare first four" means the four highest on screen.
  const symbols = order.filter((symbol) => selected.has(symbol));
  return (
    <div className="sticky bottom-[76px] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-oa-border bg-oa-card px-4 py-2.5 shadow-[0_-6px_18px_-12px_rgba(0,0,0,0.35)] lg:bottom-0">
      <span className="oa-mono text-[13px] font-medium text-oa-fg">
        {symbols.length} selected
      </span>
      <BasketActions symbols={symbols} compareLimit={compareLimit} />
      <button type="button" onClick={clear} className="ml-auto text-[13px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
        Clear
      </button>
    </div>
  );
}
