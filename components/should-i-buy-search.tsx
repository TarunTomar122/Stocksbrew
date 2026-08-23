"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex: SearchEntry[];
  /** When provided, called instead of navigating to /should-i-buy/[ticker] */
  onSelect?: (ticker: string) => void;
};

function scoreEntry(entry: SearchEntry, q: string): number {
  const ticker = entry.ticker.toLowerCase();
  const name = entry.name.toLowerCase();
  if (ticker === q) return 100;
  if (ticker.startsWith(q)) return 80;
  if (name.startsWith(q)) return 60;
  if (ticker.includes(q)) return 40;
  if (name.includes(q)) return 20;
  return 0;
}

function fmtPct(v?: number): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function ShouldIBuySearch({ searchIndex, onSelect }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .map((e) => ({ entry: e, score: scoreEntry(e, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((x) => x.entry);
  }, [query, searchIndex]);

  useEffect(() => { setActiveIndex(0); }, [results]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function navigateTo(ticker: string) {
    setOpen(false);
    setQuery("");
    if (onSelect) {
      onSelect(ticker);
    } else {
      router.push(`/should-i-buy/${encodeURIComponent(ticker)}`);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const picked = results[activeIndex];
    if (picked) {
      navigateTo(picked.ticker);
    } else {
      const clean = query.trim().toUpperCase();
      if (clean) navigateTo(clean);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length > 0 && results.length > 0;

  return (
    <div ref={containerRef} className="oa-sib-search relative w-full max-w-lg">
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <div className="relative flex-1">
          {/* Search icon */}
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-oa-muted-fg">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Enter a ticker or company name"
            maxLength={32}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-full border border-oa-border bg-oa-card pl-11 pr-4 text-[15px] text-oa-fg outline-none transition-colors placeholder:text-oa-muted-fg focus:border-[color-mix(in_srgb,var(--oa-fg)_30%,transparent)]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center rounded-full bg-oa-primary px-5 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98] disabled:opacity-40"
          disabled={!query.trim()}
        >
          Analyse
        </button>
      </form>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-[92px] top-full z-50 mt-2 overflow-hidden rounded-2xl border border-oa-border bg-oa-card shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
          <ul>
            {results.map((r, i) => {
              const pct = fmtPct(r.day_change_pct);
              const positive = (r.day_change_pct ?? 0) >= 0;
              const isActive = i === activeIndex;
              return (
                <li key={r.instrument_id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      navigateTo(r.ticker);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? "bg-oa-accent" : ""
                    }`}
                  >
                    {/* Ticker + name */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="oa-mono text-[13px] font-medium text-oa-fg">
                          {r.ticker}
                        </span>
                        <span className="truncate text-[13px] text-oa-muted-fg">
                          {r.name}
                        </span>
                      </div>
                    </div>
                    {/* Price + change */}
                    <div className="flex shrink-0 flex-col items-end">
                      {typeof r.price === "number" && (
                        <span className="text-[13px] font-medium tabular-nums text-oa-fg">
                          ${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {pct && (
                        <span
                          className="text-[11px] font-medium tabular-nums"
                          style={{ color: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                        >
                          {pct}
                        </span>
                      )}
                    </div>
                    {/* Arrow hint */}
                    {isActive && (
                      <span className="shrink-0 text-xs font-medium text-oa-primary">
                        Analyse ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
