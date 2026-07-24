"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AuthButton } from "@/components/auth-button";
import { TrackButton } from "@/components/track-button";
import { StockRequestModal } from "@/components/stock-request-modal";
import { ProBadge } from "@/components/pro-badge";
import { TickerSearchField } from "@/components/ticker-search-field";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import type { Market } from "@/lib/types";
import type { SearchEntry } from "@/lib/search";
import { formatSearchPct, scoreSearchEntry } from "@/lib/ticker-search-utils";

type Props = {
  searchIndex?: SearchEntry[];
  market: Market;
  trackedIds?: string[];
  isSubscribed?: boolean;
};

type NavItem = { href: string; label: string; icon: string; authOnly?: boolean; beta?: boolean; pro?: boolean };

// Primary nav: market context, social attention, then the user's Radar.
const NAV_ITEMS: NavItem[] = [
  { href: "/pulse",     label: "Pulse",  icon: "monitoring" },
  { href: "/social",    label: "Social", icon: "forum" },
  { href: "/watchlist", label: "Radar",  icon: "radar" },
  { href: "/explore",   label: "Explore", icon: "explore", authOnly: true },
];

export function Header({ searchIndex: initialSearchIndex = [], market, trackedIds = [], isSubscribed = false }: Props) {
  const router = useRouter();
  const { user, initialAuthed } = useUser();
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>(initialSearchIndex);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [requestQuery, setRequestQuery] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";

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
    const url = `/api/search-index?market=${encodeURIComponent(String(market || "US"))}`;
    const run = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { entries?: SearchEntry[] };
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        if (!cancelled) {
          setSearchIndex(entries);
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
      source: "mobile_header",
    });
    setQuery("");
    mobileInputRef.current?.blur();
    router.push(`/stock/${encodeURIComponent(entry.ticker)}`);
  }

  const navItems = NAV_ITEMS.filter((item) => !item.authOnly || user || initialAuthed);

  return (
    <header className="sticky top-0 z-[65] w-full border-b border-outline-variant bg-surface">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16">
        <div className="flex h-14 items-center gap-4 lg:gap-6">
          <div className="flex min-w-0 shrink-0 items-center gap-4 lg:gap-6">
            <Link
              href="/"
              className="shrink-0 font-display text-[17px] font-extrabold leading-none tracking-tight text-landing-brand"
            >
              stocksbrew
            </Link>
            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors ${
                      active ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <AnimatedIcon name={item.icon} size={16} className="shrink-0" aria-hidden />
                    <span className="inline-flex items-center gap-1">
                      {item.label}
                      {item.beta && (
                        <span
                          className={`ml-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                            active
                              ? "bg-surface-container text-on-surface-variant"
                              : "bg-[#fef3c7] text-[#b45309]"
                          }`}
                        >
                          Beta
                        </span>
                      )}
                    </span>
                    {item.pro && !isSubscribed && (
                      <ProBadge isSubscribed={isSubscribed} />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {!isHome ? (
          <div className="hidden min-w-0 flex-1 justify-end px-2 md:flex">
            <TickerSearchField
              variant="header"
              market={market}
              trackedIds={trackedIds}
              isSubscribed={isSubscribed}
              analyticsSource="desktop_header"
            />
          </div>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {!isHome ? (
            <button
              type="button"
              aria-label="Search"
              onClick={() => setMobileSearchOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant md:hidden"
            >
              <AnimatedIcon name="search" size={20} />
            </button>
            ) : null}

            <AuthButton />
          </div>
        </div>

        <div className="border-t border-outline-variant py-2 md:hidden">
          <nav className="flex items-center gap-0.5" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors ${
                    active ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <AnimatedIcon name={item.icon} size={16} className="shrink-0" aria-hidden />
                  {item.label}
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
            <AnimatedIcon name="search" size={20} className="text-on-surface-variant" />
            <input
              ref={mobileInputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
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
                  <AnimatedIcon name="add" size={16} />
                  Request {query.trim().toUpperCase()}
                </button>
              </div>
            ) : (
              <ul>
                {results.map((r, i) => {
                  const pct = formatSearchPct(r.day_change_pct);
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
                        trackedCount={trackedIds.length}
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
