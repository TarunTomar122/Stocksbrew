"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureEvent } from "@/lib/posthog";
import { cancelSearchNoResults, trackSearchNoResults, trackSearchPerformed } from "@/lib/product-analytics";
import type { SearchEntry } from "@/lib/search";
import { FundTag } from "@/components/fund-page/fund-tag";
import { getClientSearchIndex, prefetchSearchIndex } from "@/lib/search-index-client";
import { formatSearchPct, scoreSearchEntry } from "@/lib/ticker-search-utils";

// Opens only when a search finds nothing; loaded then, so its animation library stays out of every page.
const StockRequestModal = dynamic(() => import("@/components/stock-request-modal").then((mod) => mod.StockRequestModal), { ssr: false });

export function OaHeaderSearchButton({ trigger = "icon" }: { trigger?: "icon" | "row" } = {}) {
  const router = useRouter();
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>(() => getClientSearchIndex("US"));
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

  // The index loads on first intent (hover, focus or opening search), not with the page:
  // most visits never search. Both mounted triggers share one request (lib/search-index-client).
  const loadIndex = useCallback(() => {
    if (searchIndex.length > 0) return;
    prefetchSearchIndex("US")
      .then((entries) => {
        if (entries.length > 0) setSearchIndex(entries);
      })
      .catch(() => undefined); // keep empty index; raw submits still navigate
  }, [searchIndex.length]);

  useEffect(() => {
    if (open) loadIndex();
  }, [open, loadIndex]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    // Cmd/Ctrl+K opens search from anywhere. Only the sidebar row listens, so
    // two mounted triggers never open two dialogs.
    if (trigger !== "row") return;
    function onShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (window.matchMedia("(min-width: 1024px)").matches) {
          e.preventDefault();
          setOpen(true);
        }
      }
    }
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [trigger]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open]);

  // Queries that match nothing, once typing pauses: which stocks people want that we lack.
  useEffect(() => {
    if (query.trim() && searchIndex.length > 0 && results.length === 0) trackSearchNoResults("header", query);
    else cancelSearchNoResults("header");
  }, [query, results.length, searchIndex.length]);

  function go(ticker: string, instrumentId: string | null) {
    cancelSearchNoResults("header");
    trackSearchPerformed({ surface: "header", query: query || ticker, results_count: results.length, found: instrumentId !== null, ticker });
    captureEvent("stock_search_selected", {
      ticker,
      instrument_id: instrumentId,
      market: "US",
      source: "oa_header_search",
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
    <>
      {trigger === "row" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerEnter={loadIndex}
          onFocus={loadIndex}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-oa-border bg-oa-card px-3 text-left text-[14px] text-oa-muted-fg transition-colors hover:text-oa-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-4 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 truncate">Search a stock</span>
          <kbd className="oa-mono rounded border border-oa-border px-1 text-[11px]">⌘K</kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerEnter={loadIndex}
          onFocus={loadIndex}
          aria-label="Search stocks"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Search modal */}
          <div ref={containerRef} className="relative z-50 w-full max-w-2xl mx-4">
            <div className="rounded-2xl border border-oa-border bg-oa-card shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="flex items-center gap-3 px-5 py-4 border-b border-oa-border"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5 shrink-0 text-oa-muted-fg">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (results.length > 0) setActiveIndex((i) => (i - 1 + results.length) % results.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Search AAPL, NVDA, TSLA…"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ outline: 'none' }}
                  className="flex-1 bg-transparent text-[16px] text-oa-fg outline-none placeholder:text-oa-muted-fg"
                />
                <button type="submit" className="text-sm font-medium text-oa-primary px-3 py-1.5 rounded-lg hover:bg-oa-accent">
                  Search
                </button>
              </form>

              {showDropdown ? (
                <div className="max-h-[360px] overflow-y-auto">
                  {results.length === 0 ? (
                    <div className="flex flex-col gap-2 px-5 py-4">
                      <p className="text-[15px] text-oa-muted-fg">
                        No matches for <span className="font-medium text-oa-fg">{query.trim().toUpperCase()}</span>.
                      </p>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          captureEvent("stock_request_clicked", {
                            query: query.trim().toUpperCase(),
                            source: "oa_header_search",
                          });
                          setOpen(false);
                          setRequestQuery(query.trim().toUpperCase());
                        }}
                        className="inline-flex items-center gap-1.5 self-start rounded-lg bg-oa-secondary px-3 py-1.5 text-[14px] font-medium text-oa-secondary-fg transition-all hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-4">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Request {query.trim().toUpperCase()}
                      </button>
                    </div>
                  ) : (
                    <ul className="py-1">
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
                              {r.fund ? <FundTag /> : null}
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
            </div>
          </div>
        </div>
      )}

      {requestQuery ? <StockRequestModal query={requestQuery} onClose={() => setRequestQuery(null)} /> : null}
    </>
  );
}
