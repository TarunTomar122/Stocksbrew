"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { captureEvent } from "@/lib/posthog";
import type { SearchEntry } from "@/lib/search";
import { formatSearchPct, scoreSearchEntry } from "@/lib/ticker-search-utils";
import { StockRequestModal } from "@/components/stock-request-modal";

const ANALYZE_PILL =
  "inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] px-4 text-[15px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(58,52,128,0.30)] outline-none transition-all hover:bg-oa-primary active:translate-y-px active:scale-[0.98] sm:px-5";

/** The hero search: one field, one action. Type a company or ticker,
 *  pick a live suggestion or press Analyze to jump straight to the
 *  stock's research page. */
export function OaHeroSearch({ source = "hero" }: { source?: string }) {
  const router = useRouter();
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [requestQuery, setRequestQuery] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.entry);
  }, [query, searchIndex]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/search-index?market=US", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { entries?: SearchEntry[] };
        if (!cancelled && Array.isArray(payload.entries)) setSearchIndex(payload.entries);
      } catch {
        // keep empty index; raw submits still navigate
      }
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run);
      return () => {
        cancelled = true;
        if ("cancelIdleCallback" in window) (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      };
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function go(ticker: string, instrumentId: string | null) {
    captureEvent("stock_search_selected", {
      ticker,
      instrument_id: instrumentId,
      market: "US",
      source,
    });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/stock/${encodeURIComponent(ticker)}`);
  }

  function submit() {
    const picked = results[activeIndex];
    if (picked) {
      go(picked.ticker, picked.instrument_id);
      return;
    }
    const ticker = query.trim().toUpperCase();
    if (!ticker) {
      inputRef.current?.focus();
      return;
    }
    go(ticker, null);
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="oa-hero-search relative w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex h-14 items-center gap-2 rounded-full border border-oa-border bg-oa-card py-1.5 pl-5 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors focus-within:border-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5 shrink-0 text-oa-muted-fg">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (results.length > 0) setActiveIndex((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search AAPL, NVDA, TSLA…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search for a stock"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-oa-fg outline-none placeholder:text-oa-muted-fg"
        />
        <button type="submit" className={ANALYZE_PILL}>
          Analyze
        </button>
      </form>

      {showDropdown ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-oa-border bg-oa-card shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {results.length === 0 ? (
            <div className="flex flex-col gap-2.5 px-5 py-4">
              <p className="text-[15px] text-oa-muted-fg">
                No matches for <span className="font-medium text-oa-fg">{query.trim().toUpperCase()}</span>.
              </p>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  captureEvent("stock_request_clicked", {
                    query: query.trim().toUpperCase(),
                    source,
                  });
                  setOpen(false);
                  setRequestQuery(query.trim().toUpperCase());
                }}
                className="inline-flex w-fit items-center gap-1.5 self-start rounded-lg bg-oa-secondary px-3 py-1.5 text-[14px] font-medium text-oa-secondary-fg transition-all hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] active:translate-y-px"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-4">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Request {query.trim().toUpperCase()}
              </button>
            </div>
          ) : (
            <ul className="py-1.5">
              {results.map((r, i) => {
                const pct = formatSearchPct(r.day_change_pct);
                return (
                  <li key={r.instrument_id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(r.ticker, r.instrument_id);
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                        i === activeIndex ? "bg-oa-accent" : ""
                      }`}
                    >
                      <span className="w-16 shrink-0 font-medium tabular-nums text-oa-fg">{r.ticker}</span>
                      <span className="min-w-0 flex-1 truncate text-oa-muted-fg">{r.name}</span>
                      {typeof r.price === "number" ? (
                        <span className="shrink-0 tabular-nums text-oa-fg">
                          {r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : null}
                      {pct ? (
                        <span className={`w-16 shrink-0 text-right tabular-nums ${pct.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {pct.text}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
      {requestQuery ? <StockRequestModal query={requestQuery} onClose={() => setRequestQuery(null)} /> : null}
    </div>
  );
}
