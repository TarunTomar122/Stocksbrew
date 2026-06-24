"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuthButton } from "@/components/auth-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TrackButton } from "@/components/track-button";
import { StockRequestModal } from "@/components/stock-request-modal";
import { ProBadge } from "@/components/pro-badge";
import { ProCtaLink } from "@/components/pro-cta";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import type { Market } from "@/lib/types";
import type { SearchEntry } from "@/lib/search";

type Props = {
  searchIndex?: SearchEntry[];
  market: Market;
  trackedIds?: string[];
  isSubscribed?: boolean;
};

type NavItem = { href: string; label: string; icon: string; authOnly?: boolean; beta?: boolean; pro?: boolean };

// Primary nav: Top Movers, Reddit buzz, then the user's Radar.
const NAV_ITEMS: NavItem[] = [
  { href: "/pulse",     label: "Pulse",  icon: "monitoring" },
  { href: "/watchlist", label: "Radar",  icon: "radar" },
];

// Free, browse-only surfaces. Demoted into a "More" menu so they do not crowd
// out the conversion path while staying one click away.
const MORE_ITEMS: NavItem[] = [
  { href: "/events",       label: "Events",       icon: "bolt" },
  { href: "/heat",         label: "Hot Stocks",   icon: "local_fire_department" },
  { href: "/screens",      label: "Screens",      icon: "tune" },
  { href: "/trump-logic",  label: "Trump Logic",  icon: "campaign", beta: true },
];

/** Mobile strip order: conversion items first, free browse items last. */
const MOBILE_HEADER_ORDER = ["/pulse", "/watchlist", "/events", "/heat", "/screens", "/trump-logic"] as const;

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

function MoreMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const anyActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
          anyActive ? "bg-on-surface text-surface" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        }`}
      >
        More
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}
          aria-hidden
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[200px] overflow-hidden rounded-xl border border-outline-variant bg-surface py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.08)] z-50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface hover:bg-surface-container"
            >
              <span
                className="material-symbols-outlined text-on-surface-variant"
                style={{ fontSize: 18, fontVariationSettings: "'wght' 500" }}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GoProPill({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/subscribe"
      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 font-mono text-[13px] font-bold transition-opacity hover:opacity-90 ${className}`}
      style={{ background: "var(--signal-bullish)", color: "var(--background)" }}
    >
      ★ Go Pro
    </Link>
  );
}

export function Header({ searchIndex: initialSearchIndex = [], market, trackedIds = [], isSubscribed = false }: Props) {
  const router = useRouter();
  const { user, initialAuthed } = useUser();
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>(initialSearchIndex);
  const [searchIndexReady, setSearchIndexReady] = useState<boolean>(initialSearchIndex.length > 0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [requestQuery, setRequestQuery] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

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
    let cancelled = false;
    const url = `/api/search-index?market=${encodeURIComponent(String(market || "US"))}`;
    const run = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { entries?: SearchEntry[] };
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        if (!cancelled) {
          setSearchIndex(entries);
          setSearchIndexReady(entries.length > 0);
        }
      } catch {
        // keep local fallback
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
      if (target?.closest("[data-track-modal-root='true']")) {
        return;
      }
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [mobileSearchOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function navigateTo(entry: SearchEntry) {
    captureEvent("stock_search_selected", {
      ticker: entry.ticker,
      instrument_id: entry.instrument_id,
      market,
      source: mobileSearchOpen ? "mobile_header" : "desktop_header",
    });
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

  const navItems = NAV_ITEMS.filter((item) => !item.authOnly || user || initialAuthed);
  const allItems = [...NAV_ITEMS, ...MORE_ITEMS];

  const mobileHeaderItems = MOBILE_HEADER_ORDER.map((href) =>
    allItems.find((n) => n.href === href),
  ).filter((item): item is NavItem => item != null);

  const showGoPro = !isSubscribed;

  return (
    <header className="sticky top-0 z-[65] w-full bg-surface border-b border-outline-variant">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex h-16 items-center justify-between gap-2 px-6 md:gap-0 md:px-10 lg:px-16">
          {/* Left: wordmark (+ desktop nav md+) */}
          <div className="flex shrink-0 items-center gap-2 md:gap-6">
            <Link
              href="/"
              className="shrink-0 font-mono text-[19px] font-bold tracking-[-0.03em] text-on-surface leading-none"
            >
              stocksbrew<span style={{ color: "var(--signal-bullish)" }}>.</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 font-mono text-[13px] font-medium transition-colors ${
                      active ? "" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    }`}
                    style={active ? { color: "var(--signal-bullish)", background: "color-mix(in srgb, var(--signal-bullish) 12%, transparent)" } : undefined}
                  >
                    <span
                      className="material-symbols-outlined shrink-0"
                      style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}
                      aria-hidden
                    >
                      {item.icon}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {item.label}
                      {item.beta && (
                        <span
                          className={`ml-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                            active
                              ? "bg-surface/20 text-white"
                              : "bg-[#fef3c7] text-[#b45309]"
                          }`}
                        >
                          Beta
                        </span>
                      )}
                    </span>
                    {item.pro && !isSubscribed && (
                      <ProBadge
                        isSubscribed={isSubscribed}
                        className={active ? "bg-surface/15 text-white border-white/30" : ""}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: search icon (mobile) + search input (sm+) + market + auth */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Mobile search trigger */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => setMobileSearchOpen(true)}
              className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
            </button>

            <div ref={containerRef} className="relative hidden sm:block">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
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
                placeholder={searchIndexReady ? "Search ticker…" : "Preparing search…"}
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-56 rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-[14px] text-on-surface placeholder:text-on-surface-variant outline-none transition-all duration-200 focus:w-72 focus:border-on-surface"
              />

              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-xl border border-outline-variant shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                  {results.length === 0 ? (
                    <div className="px-4 py-4 flex flex-col gap-2">
                      <p className="text-[14px] text-on-surface-variant">
                        No matches for{" "}
                        <span className="font-semibold text-on-surface">
                          {query.trim().toUpperCase()}
                        </span>
                        .
                      </p>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          captureEvent("stock_request_clicked", {
                            query: query.trim().toUpperCase(),
                            source: "desktop_header",
                          });
                          setOpen(false);
                          setRequestQuery(query.trim().toUpperCase());
                        }}
                        className="inline-flex items-center gap-1.5 self-start rounded-full bg-on-surface px-3 py-1.5 text-[13px] font-semibold text-surface hover:-translate-y-[1px] active:translate-y-0 transition-transform"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'wght' 600" }}>add</span>
                        Request {query.trim().toUpperCase()}
                      </button>
                    </div>
                  ) : (
                    <ul className="max-h-[380px] overflow-y-auto py-1.5">
                      {results.map((r, i) => {
                        const pct = formatPct(r.day_change_pct);
                        const isActive = i === activeIndex;
                        const isTracked = trackedIds.includes(r.instrument_id);
                        return (
                          <li key={r.instrument_id}>
                            <div
                              onMouseEnter={() => setActiveIndex(i)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isActive ? "bg-surface-container" : "hover:bg-surface-container-low"
                              }`}
                            >
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  navigateTo(r);
                                }}
                                className="flex-1 min-w-0 text-left"
                              >
                                <div className="text-[14px] font-semibold text-on-surface">
                                  {r.ticker}
                                </div>
                                <div className="text-[13px] text-on-surface-variant truncate">
                                  {r.name}
                                </div>
                              </button>
                              <div className="flex flex-col items-end flex-shrink-0">
                                {typeof r.price === "number" && (
                                  <span className="text-[13px] font-semibold text-on-surface tabular-nums">
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
                                variant="icon"
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <ThemeToggle className="hidden sm:inline-grid" />

            {showGoPro && <GoProPill className="hidden sm:inline-flex" />}

            <AuthButton />
          </div>
        </div>

        <div className="md:hidden border-t border-outline-variant py-2 px-6">
          <nav
            className="-mx-6 flex gap-1 overflow-x-auto overscroll-x-contain px-6 scrollbar-hide touch-pan-x"
            aria-label="Primary"
          >
            {showGoPro && (
              <ProCtaLink
                href="/subscribe"
                size="sm"
                showStar
                className="whitespace-nowrap px-3 py-1.5"
              >
                Go Pro
              </ProCtaLink>
            )}
            {mobileHeaderItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-on-surface text-surface"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  {item.label}
                  {item.beta && (
                    <span
                      className={`ml-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                        active
                          ? "bg-surface/20 text-white"
                          : "bg-[#fef3c7] text-[#b45309]"
                      }`}
                    >
                      Beta
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Stock request modal */}
      {requestQuery && (
        <StockRequestModal
          query={requestQuery}
          onClose={() => setRequestQuery(null)}
        />
      )}

      {/* Mobile full-screen search overlay */}
      {mobileSearchOpen && (
        <div className="sm:hidden fixed inset-0 z-[80] flex flex-col bg-surface">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>search</span>
            <input
              ref={mobileInputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const picked = results[activeIndex];
                  if (picked) { navigateTo(picked); setMobileSearchOpen(false); }
                  else if (query.trim()) {
                    router.push(`/stock/${encodeURIComponent(query.trim().toUpperCase())}`);
                    setMobileSearchOpen(false);
                    setQuery("");
                  }
                }
              }}
              placeholder="Search ticker or company…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 text-[16px] text-on-surface placeholder:text-on-surface-variant outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="text-[14px] font-semibold text-on-surface-variant"
            >
              Cancel
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {query.trim().length === 0 ? (
              <p className="px-5 pt-8 text-[14px] text-on-surface-variant">Type a ticker or company name</p>
            ) : results.length === 0 ? (
              <div className="px-5 pt-8 flex flex-col gap-4">
                <p className="text-[14px] text-on-surface-variant">
                  No matches for{" "}
                  <span className="font-semibold text-on-surface">{query.trim().toUpperCase()}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    captureEvent("stock_request_clicked", {
                      query: query.trim().toUpperCase(),
                      source: "mobile_header",
                    });
                    setMobileSearchOpen(false);
                    setRequestQuery(query.trim().toUpperCase());
                  }}
                  className="inline-flex items-center gap-1.5 self-start rounded-full bg-on-surface px-4 py-2 text-[14px] font-semibold text-surface"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}>add</span>
                  Request {query.trim().toUpperCase()}
                </button>
              </div>
            ) : (
              <ul>
                {results.map((r, i) => {
                  const pct = formatPct(r.day_change_pct);
                  const isTracked = trackedIds.includes(r.instrument_id);
                  return (
                    <li key={r.instrument_id} className="flex items-center gap-3 px-5 py-3.5 border-b border-outline-variant">
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => { navigateTo(r); setMobileSearchOpen(false); }}
                      >
                        <div className="text-[15px] font-semibold text-on-surface">{r.ticker}</div>
                        <div className="text-[13px] text-on-surface-variant truncate">{r.name}</div>
                      </button>
                      <div className="flex flex-col items-end shrink-0">
                        {typeof r.price === "number" && (
                          <span className="text-[14px] font-semibold text-on-surface tabular-nums">
                            {r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                        {pct && (
                          <span className={`text-[12px] font-semibold tabular-nums ${pct.positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
                            {pct.text}
                          </span>
                        )}
                      </div>
                      <TrackButton
                        ticker={r.ticker}
                        instrumentId={r.instrument_id}
                        isTracked={isTracked}
                        isSubscribed={isSubscribed}
                        variant="icon"
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
