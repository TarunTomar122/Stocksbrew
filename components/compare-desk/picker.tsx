"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ProMark } from "@/components/oa/gate";
import { compareHref } from "@/lib/compare-shared";
import { trackCompareRun } from "@/lib/product-analytics";

/**
 * The compare desk's ticker box. Type a ticker or a company, pick one, and it
 * joins the comparison; the list lives in the URL (/compare?symbols=NVDA,AMD).
 */

type Entry = { symbol: string; name: string };

function rank(entry: Entry, query: string): number {
  const symbol = entry.symbol.toLowerCase();
  const name = entry.name.toLowerCase();
  if (symbol === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (symbol.includes(query) || name.includes(query)) return 4;
  return -1;
}

export function ComparePicker({
  symbols,
  directory,
  limit,
  proLimit,
  colors,
}: {
  symbols: string[];
  directory: Entry[];
  /** How many names this viewer may compare. */
  limit: number;
  /** How many Pro compares; shown when the viewer is below it. */
  proLimit: number;
  colors: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const full = symbols.length >= limit;

  const matches = React.useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return directory
      .map((entry) => ({ entry, score: rank(entry, text) }))
      .filter((item) => item.score >= 0 && !symbols.includes(item.entry.symbol))
      .sort((a, b) => a.score - b.score || a.entry.symbol.localeCompare(b.entry.symbol))
      .slice(0, 8)
      .map((item) => item.entry);
  }, [query, directory, symbols]);

  React.useEffect(() => setCursor(0), [query]);
  React.useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  function go(next: string[]) {
    startTransition(() => {
      router.replace(compareHref(next), { scroll: false });
    });
  }

  function add(symbol: string) {
    if (full || symbols.includes(symbol)) return;
    setQuery("");
    setOpen(false);
    // A comparison runs once there are two names; each added name after that is another run.
    if (symbols.length + 1 >= 2) trackCompareRun({ tickers: [...symbols, symbol] });
    go([...symbols, symbol]);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      {symbols.map((symbol, index) => (
        <span key={symbol} className="inline-flex h-8 items-center gap-2 rounded-md border border-oa-border bg-oa-card pl-2.5 pr-1 text-[13.5px]">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colors[index % colors.length] }} />
          <span className="oa-mono font-medium text-oa-fg">{symbol}</span>
          <button
            type="button"
            onClick={() => go(symbols.filter((item) => item !== symbol))}
            aria-label={`Remove ${symbol} from the comparison`}
            className="flex size-6 items-center justify-center rounded text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
        </span>
      ))}

      {full ? (
        limit < proLimit ? (
          <a href="/pricing#compare" className="inline-flex h-8 items-center gap-2 rounded-md border border-dashed border-oa-border px-2.5 text-[13px] text-oa-muted-fg hover:text-oa-fg">
            <span className="max-sm:hidden">Compare up to {proLimit}</span>
            <span className="sm:hidden">Up to {proLimit}</span> <ProMark />
          </a>
        ) : (
          <span className="text-[13px] text-oa-muted-fg">{limit} is the most that fits side by side.</span>
        )
      ) : (
        <div ref={boxRef} className="relative min-w-[13rem] flex-1 sm:max-w-[20rem]">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-oa-muted-fg">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-controls="compare-picker-list"
            aria-label="Add a stock to compare"
            placeholder={symbols.length === 0 ? "Add a stock: ticker or company" : "Add another stock"}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, matches.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const pick = matches[cursor];
                if (pick) add(pick.symbol);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            className="h-8 w-full rounded-md border border-oa-border bg-oa-card pl-8 pr-2.5 text-[13.5px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary"
          />
          {open && query.trim() ? (
            <ul
              id="compare-picker-list"
              role="listbox"
              className="oa-surface absolute left-0 top-[calc(100%+6px)] z-40 w-full min-w-[16rem] overflow-hidden border border-oa-border bg-oa-card py-1 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.35)]"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-[13px] text-oa-muted-fg">No covered stock matches “{query.trim()}”.</li>
              ) : (
                matches.map((entry, index) => (
                  <li key={entry.symbol} role="option" aria-selected={index === cursor}>
                    <button
                      type="button"
                      onClick={() => add(entry.symbol)}
                      onMouseEnter={() => setCursor(index)}
                      className={`flex w-full items-baseline gap-2.5 px-3 py-1.5 text-left text-[13.5px] outline-none ${index === cursor ? "bg-oa-accent" : ""}`}
                    >
                      <span className="oa-mono w-14 shrink-0 font-medium text-oa-fg">{entry.symbol}</span>
                      <span className="min-w-0 truncate text-oa-muted-fg">{entry.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
