"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuthButton } from "@/components/auth-button";
import { useUser } from "@/lib/auth-context";
import type { Market } from "@/lib/types";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex: SearchEntry[];
  market: Market;
};

const NAV_ITEMS = [
  { href: "/heat", label: "Heat" },
  { href: "/news", label: "News" },
];

function formatPct(pct?: number): { text: string; positive: boolean } | null {
  if (typeof pct !== "number") return null;
  const positive = pct >= 0;
  return {
    text: `${positive ? "+" : ""}${pct.toFixed(2)}%`,
    positive,
  };
}

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

export function Header({ searchIndex, market }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .map((entry) => ({ entry, score: scoreEntry(entry, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.entry);
  }, [query, searchIndex]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function navigateTo(entry: SearchEntry) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/stock/${encodeURIComponent(entry.ticker)}`);
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
      const picked = results[activeIndex];
      if (picked) {
        navigateTo(picked);
      } else if (query.trim()) {
        const ticker = query.trim().toUpperCase();
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
        router.push(`/stock/${encodeURIComponent(ticker)}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim().length > 0;

  const navItems = user
    ? [...NAV_ITEMS, { href: "/watchlist", label: "Watchlist" }]
    : NAV_ITEMS;

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-[#e5e7eb]">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-6 md:px-10 lg:px-16">
        {/* Left: wordmark + primary nav */}
        <div className="flex items-center gap-10">
          <a
            href="/"
            className="flex items-center gap-2 text-[20px] font-semibold text-[#111111] tracking-[-0.04em] leading-none"
          >
            tikrr
          </a>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-[14px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Right: search + market + auth */}
        <div className="flex items-center gap-3">
          <div ref={containerRef} className="relative hidden sm:block">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#6b7280]">
              search
            </span>
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
              placeholder="Search ticker…"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-56 rounded-lg border border-[#e5e7eb] bg-white pl-10 pr-3 text-[14px] text-[#111111] placeholder:text-[#898989] outline-none transition-all duration-200 focus:w-72 focus:border-[#111111]"
            />

            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#e5e7eb] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                {results.length === 0 ? (
                  <div className="px-4 py-3 text-[14px] text-[#6b7280]">
                    No matches. Press Enter to try{" "}
                    <span className="font-semibold text-[#111111]">
                      {query.trim().toUpperCase()}
                    </span>
                    .
                  </div>
                ) : (
                  <ul className="max-h-[380px] overflow-y-auto py-1.5">
                    {results.map((r, i) => {
                      const pct = formatPct(r.day_change_pct);
                      const isActive = i === activeIndex;
                      return (
                        <li key={r.instrument_id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveIndex(i)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              navigateTo(r);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isActive ? "bg-[#f5f5f5]" : "hover:bg-[#f8f9fa]"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-semibold text-[#111111]">
                                {r.ticker}
                              </div>
                              <div className="text-[13px] text-[#6b7280] truncate">
                                {r.name}
                              </div>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0">
                              {typeof r.price === "number" && (
                                <span className="text-[13px] font-semibold text-[#111111] tabular-nums">
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
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] font-medium text-[#111111]"
            aria-label={`Market: ${market}`}
          >
            United States
          </div>

          <AuthButton />
        </div>
      </div>
    </header>
  );
}
