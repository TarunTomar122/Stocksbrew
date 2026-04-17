"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useRef, useState, useTransition } from "react";

import type { MarketIndex, Stock } from "@/lib/api-types";
import { searchStocksUniverse, type StockEntry } from "@/lib/stocks-universe";

type Props = {
  children: ReactNode;
  /** Watchlist stocks shown in the scrolling ticker ribbon. */
  ribbonStocks?: Stock[];
  /** Watchlist stocks with live prices — used only for the empty-state dropdown. */
  searchStocks?: Stock[];
  /** Indices shown in the chrome market bar. */
  indices?: MarketIndex[];
  /** Current page — used to highlight the nav item. */
  activeNav?: "dashboard" | "signals" | "markets" | "stock" | "sector";
};

function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function pctColor(pct: number): string {
  if (pct > 0) return "text-[#22C55E]";
  if (pct < 0) return "text-[#EF4444]";
  return "text-[#8C94A8]";
}

function MarketSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentMarket = searchParams?.get("market") === "india" ? "india" : "us";

  function switchTo(market: "us" | "india") {
    if (market === currentMarket || isPending) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (market === "us") params.delete("market");
    else params.set("market", "india");
    const qs = params.toString();
    startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`));
  }

  return (
    <div
      className="flex items-center overflow-hidden rounded-[6px] border border-[#252E42] bg-[#141A26]"
      style={{ opacity: isPending ? 0.6 : 1 }}
    >
      <button
        type="button"
        onClick={() => switchTo("us")}
        className={`px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
          currentMarket === "us"
            ? "bg-[#1F2738] text-[#F5F6F8]"
            : "text-[#8C94A8] hover:text-[#F5F6F8]"
        }`}
      >
        US
      </button>
      <button
        type="button"
        onClick={() => switchTo("india")}
        className={`px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
          currentMarket === "india"
            ? "bg-[#1F2738] text-[#F5F6F8]"
            : "text-[#8C94A8] hover:text-[#F5F6F8]"
        }`}
      >
        IN
      </button>
    </div>
  );
}

function TickerRibbon({ stocks }: { stocks: Stock[] }) {
  if (stocks.length === 0) return null;
  // Duplicate the list so the CSS marquee loops seamlessly.
  const doubled = [...stocks, ...stocks];
  return (
    <div className="relative flex h-8 w-full items-center overflow-hidden border-b border-[#1F2738] bg-[#0A0E16]">
      <div className="animate-tikrr-marquee flex min-w-max items-center gap-8 whitespace-nowrap px-6 font-mono text-[11px] tabular-nums">
        {doubled.map((s, i) => (
          <span key={`${s.symbol}-${i}`} className="flex items-center gap-2 text-[#8C94A8]">
            <span className="font-semibold text-[#F5F6F8]">{s.symbol}</span>
            <span>{s.price.current.toFixed(2)}</span>
            <span className={pctColor(s.price.changePct)}>{formatPct(s.price.changePct)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
  disabled,
}: {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed text-[12px] font-medium text-[#555E75]">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`text-[12px] font-medium transition-colors ${
        active ? "text-[#F5F6F8]" : "text-[#8C94A8] hover:text-[#F5F6F8]"
      }`}
    >
      {label}
    </Link>
  );
}

function StockSearch({ watchlist = [] }: { watchlist?: Stock[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Build a price lookup from the live watchlist data
  const priceBySymbol = new Map(watchlist.map((s) => [s.symbol.toUpperCase(), s]));

  // When no query, show watchlist; otherwise search the full static universe
  const results: StockEntry[] = query.trim().length === 0
    ? watchlist.slice(0, 8).map((s) => ({
        symbol: s.symbol,
        name: s.name || s.symbol,
        market: s.market === "india" ? "IN" : "US",
        sector: s.sector || "",
      }))
    : searchStocksUniverse(query, 8);

  function navigate(symbol: string) {
    setQuery("");
    setOpen(false);
    router.push(`/stock/${symbol.toUpperCase()}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sym = query.trim();
    if (sym) navigate(sym);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "/" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        ref.current?.querySelector("input")?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div ref={ref} className="relative hidden md:block">
      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-2 rounded-[8px] border border-[#252E42] bg-[#141A26] px-3 py-1.5 transition-colors focus-within:border-[#3A4560]">
          <svg className="h-3.5 w-3.5 shrink-0 text-[#555E75]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <circle cx="7" cy="7" r="5" />
            <path strokeLinecap="round" d="M11 11l3 3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search stock…"
            className="w-36 bg-transparent text-[12px] text-[#F5F6F8] placeholder-[#555E75] outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-[3px] border border-[#252E42] px-1 py-0.5 text-[9px] text-[#555E75] lg:block">
            /
          </kbd>
        </div>
      </form>

      {open && (results.length > 0 || query.trim().length > 0) && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-64 overflow-hidden rounded-[10px] border border-[#252E42] bg-[#0F1420] shadow-2xl">
          {query.trim() === "" && (
            <p className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#555E75]">
              Your watchlist
            </p>
          )}
          {results.map((s) => {
            const live = priceBySymbol.get(s.symbol.toUpperCase());
            return (
              <button
                key={s.symbol}
                type="button"
                onMouseDown={() => navigate(s.symbol)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[#1A2130]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[#F5F6F8]">{s.symbol}</span>
                    <span className="rounded-[3px] bg-[#1A2130] px-1 py-px text-[9px] text-[#555E75]">
                      {s.market}
                    </span>
                  </div>
                  <span className="truncate text-[10px] text-[#555E75]">{s.name}</span>
                </div>
                {live ? (
                  <div className="ml-2 flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-[12px] tabular-nums text-[#F5F6F8]">
                      {live.price.current.toFixed(2)}
                    </span>
                    <span className={`font-mono text-[10px] tabular-nums ${pctColor(live.price.changePct)}`}>
                      {formatPct(live.price.changePct)}
                    </span>
                  </div>
                ) : (
                  <svg className="ml-2 h-3.5 w-3.5 shrink-0 text-[#3A4560]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12l4-4-4-4" />
                  </svg>
                )}
              </button>
            );
          })}
          {query.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={() => navigate(query.trim())}
              className="flex w-full items-center gap-2 border-t border-[#1F2738] px-3 py-2.5 text-left transition-colors hover:bg-[#1A2130]"
            >
              <svg className="h-3 w-3 shrink-0 text-[#555E75]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                <circle cx="7" cy="7" r="5" /><path strokeLinecap="round" d="M11 11l3 3" />
              </svg>
              <span className="text-[12px] text-[#8C94A8]">
                Go to <span className="font-semibold text-[#F5F6F8]">{query.trim().toUpperCase()}</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IndicesStrip({ indices }: { indices: MarketIndex[] }) {
  if (indices.length === 0) return null;
  return (
    <div className="hidden items-center gap-5 font-mono text-[11px] tabular-nums md:flex">
      {indices.slice(0, 3).map((idx) => (
        <span key={idx.name} className="flex items-baseline gap-1.5">
          <span className="text-[#8C94A8]">{idx.name}</span>
          <span className="text-[#F5F6F8]">
            {idx.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
          <span className={pctColor(idx.changePct)}>{formatPct(idx.changePct)}</span>
        </span>
      ))}
    </div>
  );
}

export function Shell({ children, ribbonStocks = [], searchStocks, indices = [], activeNav }: Props) {
  return (
    <div className="min-h-screen bg-[#0A0E16] font-body text-[#F5F6F8]">
      <header className="sticky top-0 z-50 w-full border-b border-[#1F2738] bg-[#0F1420]/95 backdrop-blur">
        <TickerRibbon stocks={ribbonStocks} />
        <div className="mx-auto flex h-[56px] max-w-[1440px] items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 no-underline">
              <span className="text-[17px] font-bold tracking-tight text-[#F5F6F8]">
                ti<span className="text-[#D4AF37]">k</span>rr
              </span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <NavLink href="/dashboard" label="Dashboard" active={activeNav === "dashboard"} />
              <NavLink href="/dashboard/signals" label="Signals" active={activeNav === "signals"} />
            </nav>
            <StockSearch watchlist={searchStocks ?? ribbonStocks} />
          </div>

          <div className="flex items-center gap-5">
            <IndicesStrip indices={indices} />
            <MarketSwitcher />
            <Link
              href="/profile"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#1A2130] text-[10px] font-bold text-[#F5F6F8] transition-colors hover:bg-[#252E42]"
              aria-label="Profile"
            >
              TT
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6">{children}</main>
    </div>
  );
}
