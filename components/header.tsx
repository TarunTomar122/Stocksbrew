"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { setMarket } from "@/app/actions/set-market";
import { AuthButton } from "@/components/auth-button";
import { useUser } from "@/lib/auth-context";
import type { Market } from "@/lib/types";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex: SearchEntry[];
  market: Market;
};

const MARKETS: { id: Market; optionLabel: string }[] = [
  { id: "US", optionLabel: "🇺🇸 United States" },
  { id: "IN", optionLabel: "🇮🇳 India" },
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
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPickMarket(next: Market) {
    if (next === market) return;
    startTransition(async () => {
      await setMarket(next);
      router.refresh();
    });
  }

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

  return (
    <header className="sticky top-0 z-50 w-full bg-surface border-b border-outline-variant/20">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-8">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="font-display text-2xl font-black tracking-tighter text-on-surface"
          >
            ti<span className="text-primary">k</span>rr
          </a>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/heat"
            className="flex items-center gap-1 text-[11px] font-bold tracking-[0.18em] uppercase bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            <span>✦</span>
            <span>Heat</span>
          </a>
          <a
            href="/news"
            className="text-[11px] font-bold tracking-[0.18em] uppercase text-on-surface-variant hover:text-on-surface transition-colors"
          >
            News
          </a>
          {user && (
            <a
              href="/watchlist"
              className="text-[11px] font-bold tracking-[0.18em] uppercase text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Watchlist
            </a>
          )}
          <div className="relative">
            <label htmlFor="header-market" className="sr-only">
              Market
            </label>
            <select
              id="header-market"
              value={market}
              onChange={(e) => onPickMarket(e.target.value as Market)}
              disabled={pending}
              aria-label="Market"
              className={`min-w-[11.5rem] cursor-pointer appearance-none rounded-full border border-outline-variant/40 bg-surface-container-low py-2 pl-3 pr-9 text-[12px] font-bold text-on-surface outline-none transition-[color,box-shadow,border-color] hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/25 ${
                pending ? "opacity-60" : ""
              }`}
            >
              {MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.optionLabel}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined text-[20px]"
              aria-hidden="true"
            >
              expand_more
            </span>
          </div>

          <div ref={containerRef} className="relative hidden sm:block">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-outline">
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
              placeholder="Search tickers, sectors, news…"
              autoComplete="off"
              spellCheck={false}
              className="w-56 bg-surface-container-low border border-outline-variant/40 rounded-full py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-outline outline-none transition-all duration-300 focus:w-72 focus:border-primary"
            />

            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-surface-container-lowest brutalist-border shadow-lg overflow-hidden rounded-xl">
                {results.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] text-on-surface-variant">
                    No matches. Press Enter to try{" "}
                    <span className="font-bold text-on-surface">
                      {query.trim().toUpperCase()}
                    </span>
                    .
                  </div>
                ) : (
                  <ul className="max-h-[380px] overflow-y-auto">
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
                              isActive
                                ? "bg-surface-container-low"
                                : "hover:bg-surface-container-low"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-bold text-on-surface">
                                {r.ticker}
                              </div>
                              <div className="text-[11px] font-semibold text-on-surface-variant truncate">
                                {r.name}
                              </div>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0">
                              {typeof r.price === "number" && (
                                <span className="text-[12px] font-semibold text-on-surface tabular-nums">
                                  {r.price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              )}
                              {pct && (
                                <span
                                  className={`text-[11px] font-bold tabular-nums ${
                                    pct.positive
                                      ? "text-signal-bullish"
                                      : "text-signal-bearish"
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

          <AuthButton />
        </div>
      </div>
    </header>
  );
}
