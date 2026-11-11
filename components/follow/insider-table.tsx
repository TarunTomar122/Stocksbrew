"use client";

import * as React from "react";

import { InsiderGroupRow, InsiderRow, InsiderTableHead } from "@/components/follow/insider-rows";
import type { InsiderTrade } from "@/lib/follow-shared";
import { groupInsiderTrades } from "@/lib/insider-groups";

type Side = "all" | "buy" | "sell";
const SIDES: { id: Side; label: string }[] = [
  { id: "buy", label: "Buys" },
  { id: "sell", label: "Sales" },
  { id: "all", label: "All" },
];
const SIZES: { value: number; label: string }[] = [
  { value: 0, label: "Any size" },
  { value: 100_000, label: "$100K and up" },
  { value: 1_000_000, label: "$1M and up" },
  { value: 10_000_000, label: "$10M and up" },
];
const PAGE = 60;

/** Recent open-market insider trades with the three filters people reach for. */
export function InsiderTable({
  trades,
  initialSide = "buy",
  group = true,
}: {
  trades: InsiderTrade[];
  initialSide?: Side;
  /** Fold near-identical rows into one. Off on a stock's own insider page, which lists every filing. */
  group?: boolean;
}) {
  const [side, setSide] = React.useState<Side>(initialSide);
  const [minValue, setMinValue] = React.useState(0);
  const [hidePlans, setHidePlans] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);

  const needle = query.trim().toLowerCase();
  const filtered = trades.filter((trade) => {
    if (side !== "all" && trade.tx_type !== side) return false;
    if (minValue > 0 && (trade.value ?? 0) < minValue) return false;
    if (hidePlans && trade.plan_10b5_1) return false;
    if (
      needle &&
      !(
        trade.symbol.toLowerCase().startsWith(needle) ||
        trade.insider.toLowerCase().includes(needle) ||
        trade.company.toLowerCase().includes(needle)
      )
    ) {
      return false;
    }
    return true;
  });
  // Near-identical rows (a dozen vice presidents buying through one window) fold into one row.
  const items = group ? groupInsiderTrades(filtered) : filtered.map((trade) => ({ kind: "trade" as const, trade }));
  const visible = items.slice(0, shown);

  function reset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setShown(PAGE);
    };
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <div
          role="tablist"
          aria-label="Side"
          className="inline-flex gap-1.5"
        >
          {SIDES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={side === item.id}
              data-side={item.id}
              onClick={() => reset(setSide)(item.id)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:h-8 ${
                side === item.id
                  ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg"
                  : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
              }`}
            >
              {item.label}
              <span className="oa-mono hidden text-[12.5px] text-oa-muted-fg sm:inline">
                {item.id === "all"
                  ? trades.length
                  : trades.filter((trade) => trade.tx_type === item.id).length}
              </span>
            </button>
          ))}
        </div>
        <label className="inline-flex items-center">
          <span className="sr-only">Smallest trade to show</span>
          <select
            value={minValue}
            onChange={(event) => reset(setMinValue)(Number(event.target.value))}
            className="h-10 rounded-md border border-oa-border bg-oa-card px-2.5 text-[14px] text-oa-fg outline-none focus:border-oa-primary sm:h-8"
          >
            {SIZES.map((size) => (
              <option key={size.value} value={size.value}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 px-2 text-[14px] text-oa-muted-fg hover:text-oa-fg sm:h-8 sm:px-1">
          <input
            type="checkbox"
            checked={hidePlans}
            onChange={(event) => reset(setHidePlans)(event.target.checked)}
            className="size-3.5 accent-[var(--oa-primary)]"
          />
          <span className="sm:hidden">Hide planned</span>
          <span className="hidden sm:inline">Hide planned trades</span>
        </label>
        <label className="relative block min-w-0 flex-1 sm:ml-auto sm:w-56 sm:flex-none">
          <span className="sr-only">
            Search a ticker, a company or an insider
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => reset(setQuery)(event.target.value)}
            placeholder="Ticker, company, insider"
            className="h-10 w-full rounded-md border border-oa-border bg-oa-card px-3 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary sm:h-8"
          />
        </label>
      </div>

      <div className="oa-surface mt-3 overflow-hidden border border-oa-border bg-oa-card">
        <InsiderTableHead showSide={side === "all"} />
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-[14px] leading-6 text-oa-muted-fg">
            {trades.length === 0
              ? "No Form 4 trades have been read yet."
              : "No trade matches those filters."}
          </p>
        ) : (
          <ul className="divide-y divide-oa-border">
            {visible.map((item) =>
              item.kind === "group" ? (
                <InsiderGroupRow key={item.key} group={item} showSide={side === "all"} />
              ) : (
                <InsiderRow key={item.trade.id} trade={item.trade} showSide={side === "all"} />
              ),
            )}
          </ul>
        )}
        {items.length > shown ? (
          <button
            type="button"
            onClick={() => setShown((current) => current + PAGE * 2)}
            className="flex h-10 w-full items-center justify-center border-t border-oa-border text-[13px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
          >
            Show more ({items.length - shown} left)
          </button>
        ) : null}
      </div>
    </div>
  );
}
