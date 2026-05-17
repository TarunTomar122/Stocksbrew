"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex: SearchEntry[];
  onSelect: (ticker: string, name: string) => void;
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

export function PortfolioSearch({ searchIndex, onSelect }: Props) {
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

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function handleSelect(entry: SearchEntry) {
    setOpen(false);
    setQuery("");
    onSelect(entry.ticker, entry.name);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results[activeIndex]) {
      handleSelect(results[activeIndex]);
    } else {
      const clean = query.trim().toUpperCase();
      if (clean && clean.length <= 16) {
        onSelect(clean, clean);
        setQuery("");
      }
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
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex w-full gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
            placeholder="Search ticker or company..."
            maxLength={32}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-[12px] border border-[#e5e7eb] bg-white pl-9 pr-3 py-2.5 text-[13px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#0052ff] focus:ring-2 focus:ring-[#0052ff]/10 transition-all"
          />
        </div>
        <button
          type="submit"
          className="rounded-[10px] bg-[#111111] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-40 shrink-0"
          disabled={!query.trim()}
        >
          Add
        </button>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1.5 rounded-[14px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)] overflow-hidden z-50">
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
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? "bg-[#f5f7ff]" : "hover:bg-[#fafafa]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#111111]">{r.ticker}</span>
                        <span className="text-[12px] text-[#6b7280] truncate">{r.name}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end">
                      {typeof r.price === "number" && (
                        <span className="text-[12px] font-semibold text-[#111111] tabular-nums">
                          ${r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {pct && (
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: positive ? "#10b981" : "#ef4444" }}>
                          {pct}
                        </span>
                      )}
                    </div>
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
