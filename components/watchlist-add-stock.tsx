"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useMemo, useRef, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex: SearchEntry[];
  trackedIds: string[];
  isSubscribed: boolean;
};

// Pill button + search modal that lets users add a stock to Radar
// (Watching or Holding) without leaving the page. Re-uses TrackButton's modal flow for
// the actual position-type pick.
export function WatchlistAddStock({ searchIndex, trackedIds, isSubscribed }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full bg-[#111111] px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        Add to Watchlist
      </button>
      {open && (
        <SearchModal
          searchIndex={searchIndex}
          trackedIds={trackedIds}
          isSubscribed={isSubscribed}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SearchModal({
  searchIndex,
  trackedIds,
  isSubscribed,
  onClose,
}: {
  searchIndex: SearchEntry[];
  trackedIds: string[];
  isSubscribed: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchIndex.slice(0, 12);
    return searchIndex
      .map((entry) => {
        const ticker = entry.ticker.toLowerCase();
        const name = entry.name.toLowerCase();
        let score = 0;
        if (ticker === q) score = 100;
        else if (ticker.startsWith(q)) score = 80;
        else if (name.startsWith(q)) score = 60;
        else if (ticker.includes(q)) score = 40;
        else if (name.includes(q)) score = 20;
        return { entry, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.entry);
  }, [query, searchIndex]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Add a stock to Watchlist"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#111111]/50 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-[520px] rounded-3xl bg-white shadow-[0_24px_70px_rgba(17,24,39,0.18)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f3f4f6]">
          <AnimatedIcon name="search" size={20} className="text-[#9ca3af]" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or company…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-[15px] text-[#111111] placeholder:text-[#9ca3af] outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#9ca3af] hover:text-[#111111]"
          >
            <AnimatedIcon name="close" size={20} />
          </button>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-5 py-6 text-[13px] text-[#6b7280]">
              No matches for{" "}
              <span className="font-semibold text-[#111111]">
                {query.trim().toUpperCase()}
              </span>
              .
            </li>
          ) : (
            results.map((entry) => (
              <li
                key={entry.instrument_id}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#fafafa] transition-colors"
              >
                <StockLogo
                  ticker={entry.ticker}
                  market={entry.instrument_id.startsWith("IN_") ? "IN" : "US"}
                  size={32}
                />
                <a
                  href={`/stock/${encodeURIComponent(entry.ticker)}`}
                  className="flex-1 min-w-0"
                >
                  <div className="text-[14px] font-semibold text-[#111111]">
                    {entry.ticker}
                  </div>
                  <div className="text-[12px] text-[#6b7280] truncate">
                    {entry.name}
                  </div>
                </a>
                <div className="flex flex-col items-end shrink-0">
                  {typeof entry.price === "number" && (
                    <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                      {entry.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                  {typeof entry.day_change_pct === "number" && (
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        entry.day_change_pct >= 0 ? "text-[#10b981]" : "text-[#ef4444]"
                      }`}
                    >
                      {entry.day_change_pct >= 0 ? "+" : ""}
                      {entry.day_change_pct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <TrackButton
                  ticker={entry.ticker}
                  instrumentId={entry.instrument_id}
                  isTracked={trackedIds.includes(entry.instrument_id)}
                  isSubscribed={isSubscribed}
                  variant="icon"
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
