"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuthButton } from "@/components/auth-button";
import { TrackButton } from "@/components/track-button";
import { StockRequestModal } from "@/components/stock-request-modal";
import { ProBadge } from "@/components/pro-badge";
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

const NAV_ITEMS: { href: string; label: string; icon: string; authOnly?: boolean; beta?: boolean; pro?: boolean }[] = [
  { href: "/heat",      label: "Hot Stocks",       icon: "local_fire_department" },
  { href: "/screens",   label: "Screens",          icon: "tune" },
  { href: "/events",    label: "Events",           icon: "bolt" },
  { href: "/anomalies", label: "Market Anomalies", icon: "trending_up", pro: true },
  { href: "/watchlist", label: "Radar",            icon: "radar" },
];

/** Mobile strip: same order as NAV_ITEMS; auth-only items (Radar) omitted when logged out. */
const MOBILE_HEADER_ORDER = ["/heat", "/screens", "/events", "/anomalies", "/watchlist"] as const;

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

const MARKET_OPTIONS: { id: string; flag: string; label: string; available: boolean }[] = [
  { id: "US", flag: "🇺🇸", label: "United States", available: true },
  { id: "IN", flag: "🇮🇳", label: "India", available: false },
  { id: "GB", flag: "🇬🇧", label: "United Kingdom", available: false },
  { id: "EU", flag: "🇪🇺", label: "Europe", available: false },
];

function MarketPicker({ market }: { market: Market }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const active = MARKET_OPTIONS.find((m) => m.id === market) ?? MARKET_OPTIONS[0];

  return (
    <div ref={pickerRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] font-medium text-[#111111] hover:border-[#d1d5db] transition-colors"
        aria-label="Select market"
      >
        <span>{active.flag}</span>
        <span className="hidden sm:inline">{active.label}</span>
        <span
          className="material-symbols-outlined text-[#6b7280]"
          style={{ fontSize: 16, fontVariationSettings: "'wght' 500" }}
        >
          {pickerOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 w-[220px] bg-white rounded-xl border border-[#e5e7eb] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden z-50 py-1.5">
          {MARKET_OPTIONS.map((opt) => (
            <div
              key={opt.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                opt.available
                  ? "cursor-pointer hover:bg-[#f5f5f5]"
                  : "cursor-not-allowed opacity-50"
              }`}
            >
              <span className="text-[16px] leading-none">{opt.flag}</span>
              <span className={`flex-1 text-[14px] ${opt.available ? "text-[#111111] font-medium" : "text-[#9ca3af]"}`}>
                {opt.label}
              </span>
              {opt.id === market && opt.available && (
                <span
                  className="material-symbols-outlined text-[#111111]"
                  style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}
                >
                  check
                </span>
              )}
              {!opt.available && (
                <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af] bg-[#f3f4f6] rounded-full px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [requestQuery, setRequestQuery] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  // Focus mobile input when overlay opens
  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [mobileSearchOpen]);

  // Close mobile search on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navItems = NAV_ITEMS.filter((item) => !item.authOnly || user || initialAuthed);

  const mobileHeaderItems = MOBILE_HEADER_ORDER.map((href) =>
    navItems.find((n) => n.href === href),
  ).filter((item): item is (typeof NAV_ITEMS)[number] => item != null);

  return (
    <header className="sticky top-0 z-[65] w-full bg-white border-b border-[#e5e7eb]">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex h-16 items-center justify-between gap-2 px-6 md:gap-0 md:px-10 lg:px-16">
          {/* Left: wordmark (+ desktop nav md+) */}
          <div className="flex shrink-0 items-center gap-2 md:gap-6">
            <Link
              href="/"
              className="flex shrink-0 flex-col gap-0.5 text-[#111111] leading-none"
            >
              <span className="text-[20px] font-semibold tracking-[-0.04em]">stocksbrew</span>
              <span className="text-[10px] font-medium text-[#9ca3af] tracking-normal">
                (formerly tikrr)
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                      active
                        ? "bg-[#111111] text-white"
                        : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111111]"
                    }`}
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
                              ? "bg-white/20 text-white"
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
                        className={active ? "bg-white/15 text-white border-white/30" : ""}
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
              className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e7eb] text-[#6b7280]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
            </button>

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
                placeholder={searchIndexReady ? "Search ticker…" : "Preparing search…"}
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-56 rounded-lg border border-[#e5e7eb] bg-white pl-10 pr-3 text-[14px] text-[#111111] placeholder:text-[#898989] outline-none transition-all duration-200 focus:w-72 focus:border-[#111111]"
              />

              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#e5e7eb] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                  {results.length === 0 ? (
                    <div className="px-4 py-4 flex flex-col gap-2">
                      <p className="text-[14px] text-[#6b7280]">
                        No matches for{" "}
                        <span className="font-semibold text-[#111111]">
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
                        className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#111111] px-3 py-1.5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
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
                                isActive ? "bg-[#f5f5f5]" : "hover:bg-[#f8f9fa]"
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
                                <div className="text-[14px] font-semibold text-[#111111]">
                                  {r.ticker}
                                </div>
                                <div className="text-[13px] text-[#6b7280] truncate">
                                  {r.name}
                                </div>
                              </button>
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

            <MarketPicker market={market} />

            <AuthButton />
          </div>
        </div>

        <div className="md:hidden border-t border-[#e5e7eb] py-2 px-6">
          <nav
            className="-mx-6 flex gap-1 overflow-x-auto overscroll-x-contain px-6 scrollbar-hide touch-pan-x"
            aria-label="Primary"
          >
            {mobileHeaderItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-[#111111] text-white"
                      : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111111]"
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
                          ? "bg-white/20 text-white"
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
        <div className="sm:hidden fixed inset-0 z-[80] flex flex-col bg-white">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb]">
            <span className="material-symbols-outlined text-[#6b7280]" style={{ fontSize: 20 }}>search</span>
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
              className="flex-1 text-[16px] text-[#111111] placeholder:text-[#9ca3af] outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="text-[14px] font-semibold text-[#6b7280]"
            >
              Cancel
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {query.trim().length === 0 ? (
              <p className="px-5 pt-8 text-[14px] text-[#9ca3af]">Type a ticker or company name</p>
            ) : results.length === 0 ? (
              <div className="px-5 pt-8 flex flex-col gap-4">
                <p className="text-[14px] text-[#6b7280]">
                  No matches for{" "}
                  <span className="font-semibold text-[#111111]">{query.trim().toUpperCase()}</span>.
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
                  className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#111111] px-4 py-2 text-[14px] font-semibold text-white"
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
                    <li key={r.instrument_id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#f3f4f6]">
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => { navigateTo(r); setMobileSearchOpen(false); }}
                      >
                        <div className="text-[15px] font-semibold text-[#111111]">{r.ticker}</div>
                        <div className="text-[13px] text-[#6b7280] truncate">{r.name}</div>
                      </button>
                      <div className="flex flex-col items-end shrink-0">
                        {typeof r.price === "number" && (
                          <span className="text-[14px] font-semibold text-[#111111] tabular-nums">
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
