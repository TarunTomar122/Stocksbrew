"use client";

import * as React from "react";

import { InsiderGroupRow, InsiderRow, InsiderTableHead } from "@/components/follow/insider-rows";
import { FADE_BOTTOM, useMoreBelow } from "@/components/follow/use-more-below";
import type { InsiderTradeRow } from "@/lib/follow-shared";
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
/**
 * Rows in the server HTML. The rest join the scroll right after the page loads, so every trade is in the list
 * without the page's HTML carrying a thousand rows of markup.
 */
const FIRST_PAINT = 24;

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Recent open-market insider trades with the three filters people reach for. Every matching row is in the list,
 * about eight in view, the rest scrolling inside it with no bar and nothing to click to see more (owner rule 5).
 */
export function InsiderTable({
  trades,
  initialSide = "buy",
  group = true,
  today,
}: {
  trades: InsiderTradeRow[];
  /** New York's today from the server, for the rows' day words (no server/browser mismatch around midnight). */
  today?: string;
  initialSide?: Side;
  /** Fold near-identical rows into one. Off on a stock's own insider page, which lists every filing. */
  group?: boolean;
}) {
  const [side, setSide] = React.useState<Side>(initialSide);
  const [minValue, setMinValue] = React.useState(0);
  const [hidePlans, setHidePlans] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const scroller = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => setMounted(true), []);

  // Typing stays quick with a thousand rows in the list: the list catches up a moment after the keystroke.
  const needle = React.useDeferredValue(query).trim().toLowerCase();
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
  const visible = mounted ? items : items.slice(0, FIRST_PAINT);

  // The box ends on a whole row, never through one (owner rule 5): its height comes down from the CSS cap (about
  // eight rows) to the bottom of the last row that fits under it. Rows differ in height on a phone, so it is measured.
  useIsoLayoutEffect(() => {
    const list = scroller.current;
    if (!list) return;
    const fit = () => {
      list.style.maxHeight = "";
      const cap = Number.parseFloat(window.getComputedStyle(list).maxHeight);
      if (!Number.isFinite(cap) || list.scrollHeight <= cap) return;
      let bottom = 0;
      for (const row of Array.from(list.children) as HTMLElement[]) {
        const end = row.offsetTop + row.offsetHeight;
        if (end > cap + 0.5) break;
        bottom = end;
      }
      if (bottom > 0) list.style.maxHeight = `${bottom}px`;
    };
    fit();
    // A width change, or a late web font changing a row's height, measures again.
    const observer = new ResizeObserver(fit);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    // Only a change of width: a phone's toolbar hiding fires resize too, and refitting then would nudge the scroll.
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      fit();
    };
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [visible.length, side, minValue, hidePlans, needle]);

  // The bottom edge fades while more trades sit below, so the inner scroll is found without a scrollbar.
  const more = useMoreBelow(scroller, `${visible.length}:${side}:${minValue}:${hidePlans}:${needle}`);

  // A new filter starts its list from the top.
  function reset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      if (scroller.current) scroller.current.scrollTop = 0;
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
          <ul
            ref={scroller}
            // relative: the rows' screen-reader-only text is absolutely placed, and without a positioned scroller it
            // would sit at its row's place far below and stretch the page by the whole hidden list.
            aria-label="Insider trades, newest filing first"
            tabIndex={0}
            className="relative max-h-[42rem] divide-y divide-oa-border overflow-y-auto outline-none [scrollbar-width:none] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-oa-border md:max-h-[23.5rem] [&::-webkit-scrollbar]:hidden"
            style={more ? FADE_BOTTOM : undefined}
          >
            {visible.map((item, index) =>
              item.kind === "group" ? (
                <InsiderGroupRow key={item.key} group={item} showSide={side === "all"} logoAtOnce={index < FIRST_PAINT} today={today} />
              ) : (
                <InsiderRow key={item.trade.id} trade={item.trade} showSide={side === "all"} logoAtOnce={index < FIRST_PAINT} today={today} />
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
