"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { StockRequestModal } from "@/components/stock-request-modal";
import { TrackButton } from "@/components/track-button";
import { captureEvent } from "@/lib/posthog";
import type { SearchEntry } from "@/lib/search";
import { FundTag } from "@/components/fund-page/fund-tag";
import { prefetchSearchIndex } from "@/lib/search-index-client";
import { formatSearchPct, scoreSearchEntry } from "@/lib/ticker-search-utils";
import type { Market } from "@/lib/types";

type Props = {
  variant: "header" | "hero";
  market: Market;
  trackedIds?: string[];
  isSubscribed?: boolean;
  analyticsSource: string;
  /** Lets a contextual surface use the search results without navigating away. */
  onStockSelected?: (entry: SearchEntry) => void;
  onTickerSubmitted?: (ticker: string) => void;
};

export function TickerSearchField({
  variant,
  market,
  trackedIds = [],
  isSubscribed = false,
  analyticsSource,
  onStockSelected,
  onTickerSubmitted,
}: Props) {
  const router = useRouter();
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>([]);
  const [searchIndexReady, setSearchIndexReady] = useState(false);
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
      .slice(0, 8)
      .map((x) => x.entry);
  }, [query, searchIndex]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    // Shared with every other search box on the page: one request per market (lib/search-index-client).
    const marketKey = String(market || "US").toUpperCase() === "IN" ? "IN" : "US";
    const run = async () => {
      try {
        const entries = await prefetchSearchIndex(marketKey);
        if (!cancelled) {
          setSearchIndex(entries);
          setSearchIndexReady(entries.length > 0);
        }
      } catch {
        // keep empty index
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run);
      return () => {
        cancelled = true;
        if ("cancelIdleCallback" in window) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
        }
      };
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [market]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-track-modal-root='true']")) return;
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function navigateTo(entry: SearchEntry) {
    captureEvent("stock_search_selected", {
      ticker: entry.ticker,
      instrument_id: entry.instrument_id,
      market,
      source: analyticsSource,
    });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (onStockSelected) {
      onStockSelected(entry);
      return;
    }
    router.push(`/stock/${encodeURIComponent(entry.ticker)}`);
  }

  function submitQuery() {
    const picked = results[activeIndex];
    if (picked) {
      navigateTo(picked);
      return;
    }
    if (!query.trim()) return;
    const ticker = query.trim().toUpperCase();
    captureEvent("stock_search_selected", {
      ticker,
      instrument_id: null,
      market,
      source: analyticsSource,
      raw_submit: true,
    });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (onTickerSubmitted) {
      onTickerSubmitted(ticker);
      return;
    }
    router.push(`/stock/${encodeURIComponent(ticker)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((i) => (i + 1) % results.length);
        setOpen(true);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
        setOpen(true);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      submitQuery();
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length > 0;
  const isHero = variant === "hero";
  const placeholder = searchIndexReady
    ? isHero
      ? "Search AAPL, NVDA, TSLA…"
      : "Search ticker..."
    : "Preparing search...";

  const inputClass = isHero
    ? "h-12 w-full rounded-full border border-outline-variant bg-surface-container-low pl-12 pr-4 text-[15px] text-on-surface placeholder:text-on-surface-variant outline-none transition-colors focus:border-outline focus:bg-surface"
    : "h-10 w-full rounded-full border border-outline-variant bg-surface-container-low pl-11 pr-4 text-[14px] text-on-surface placeholder:text-on-surface-variant outline-none transition-colors focus:border-outline focus:bg-surface";

  const dropdown = showDropdown ? (
    <div
      className={`absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-[0_4px_12px_rgba(0,0,0,0.08)] ${
        isHero ? "text-left" : ""
      }`}
    >
      {results.length === 0 ? (
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="text-[14px] text-on-surface-variant">
            No matches for{" "}
            <span className="font-semibold text-on-surface">{query.trim().toUpperCase()}</span>.
          </p>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              captureEvent("stock_request_clicked", {
                query: query.trim().toUpperCase(),
                source: analyticsSource,
              });
              setOpen(false);
              setRequestQuery(query.trim().toUpperCase());
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-full bg-on-surface px-3 py-1.5 text-[13px] font-semibold text-surface transition-transform hover:-translate-y-px"
          >
            <AnimatedIcon name="add" size={14} />
            Request {query.trim().toUpperCase()}
          </button>
        </div>
      ) : (
        <ul className="max-h-[380px] overflow-y-auto py-1.5">
          {results.map((r, i) => {
            const pct = formatSearchPct(r.day_change_pct);
            const isActive = i === activeIndex;
            const isTracked = trackedIds.includes(r.instrument_id);
            return (
              <li key={r.instrument_id}>
                <div
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? "bg-surface-container" : "hover:bg-surface-container-low"
                  }`}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      navigateTo(r);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold text-on-surface">
                      {r.ticker}
                      {r.fund ? <FundTag /> : null}
                    </div>
                    <div className="truncate text-[13px] text-on-surface-variant">{r.name}</div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end">
                    {typeof r.price === "number" && (
                      <span className="text-[13px] font-semibold tabular-nums text-on-surface">
                        {r.price.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                    {pct && (
                      <span
                        className={`text-[12px] font-semibold tabular-nums ${
                          pct.positive ? "text-[#10b981]" : "text-[#ef4444]"
                        }`}
                      >
                        {pct.text}
                      </span>
                    )}
                  </div>
                  <TrackButton
                    ticker={r.ticker}
                    instrumentId={r.instrument_id}
                    isTracked={isTracked}
                    isSubscribed={isSubscribed}
                    trackedCount={trackedIds.length}
                    variant="icon"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  ) : null;

  return (
    <>
      <div ref={containerRef} className={isHero ? "relative mx-auto w-full max-w-xl" : "relative w-full max-w-[280px]"}>
        <div className="relative">
          <AnimatedIcon
            name="search"
            size={isHero ? 20 : 18}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-on-surface-variant ${isHero ? "left-4 text-[20px]" : "left-4 text-[18px]"}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          {dropdown}
        </div>
        {isHero ? (
          <button
            type="button"
            onClick={submitQuery}
            className="landing-btn-primary mt-3 w-full justify-center px-6 py-3.5 text-sm"
          >
            Look up ticker →
          </button>
        ) : null}
      </div>
      {requestQuery ? <StockRequestModal query={requestQuery} onClose={() => setRequestQuery(null)} /> : null}
    </>
  );
}
