"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { PortfolioSearch } from "@/components/portfolio-search";
import { TrackInRadarButton } from "@/components/track-in-radar-button";
import { captureEvent } from "@/lib/posthog";
import type { SearchEntry } from "@/lib/search";
import type { CompareStock, CompareStocksResult } from "@/lib/compare-stocks";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TICKERS = 5;
const POPULAR_TICKERS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "AMD", "NFLX", "JPM"];
const POPULAR_BUCKETS: { label: string; tickers: string[] }[] = [
  { label: "Mega-cap tech", tickers: ["NVDA", "AAPL", "MSFT", "GOOGL", "META"] },
  { label: "AI & semis", tickers: ["NVDA", "AMD", "AVGO", "MU", "TSM"] },
  { label: "EVs & energy", tickers: ["TSLA", "F", "RIVN", "XOM", "CVX"] },
  { label: "Banks", tickers: ["JPM", "BAC", "GS", "MS", "WFC"] },
];

const VERDICT_META: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: "#ecfdf5", text: "#065f46", label: "Strong" },
  solid:  { bg: "#d1fae5", text: "#065f46", label: "Solid" },
  mixed:  { bg: "#fef3c7", text: "#92400e", label: "Mixed" },
  weak:   { bg: "#fef2f2", text: "#991b1b", label: "Weak" },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtPrice(p: number | null): string {
  if (p === null) return "—";
  return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(p: number | null, opts: { signed?: boolean } = {}): string {
  if (p === null) return "—";
  const { signed = true } = opts;
  return `${signed && p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

function fmtLarge(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtScore(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}`;
}

function scoreColor(s: number | null): string {
  if (s === null) return "#9ca3af";
  if (s >= 75) return "#10b981";
  if (s >= 60) return "#111111";
  if (s >= 40) return "#6b7280";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "build" | "loading" | "results" | "error";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) {
    return <span className="text-[12px] text-[#9ca3af]">—</span>;
  }
  const m = VERDICT_META[verdict] ?? { bg: "#f3f4f6", text: "#6b7280", label: verdict };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: m.bg, color: m.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.text }} />
      {m.label}
    </span>
  );
}

function MetricCell({
  value,
  highlight = false,
  align = "center",
  sub,
}: {
  value: React.ReactNode;
  highlight?: boolean;
  align?: "left" | "center" | "right";
  sub?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col ${align === "right" ? "items-end" : align === "left" ? "items-start" : "items-center"} justify-center gap-0.5 ${
        highlight ? "rounded-lg bg-[#ecfdf5] py-1.5 px-2" : ""
      }`}
    >
      <span
        className={`text-[14px] font-semibold tabular-nums ${
          highlight ? "text-[#065f46]" : "text-[#111111]"
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-[#6b7280]">{sub}</span>}
    </div>
  );
}

function BestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#10b981] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
      <span className="material-symbols-outlined" style={{ fontSize: 10, fontVariationSettings: "'wght' 700" }}>
        star
      </span>
      Best
    </span>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

type Row = {
  key: string;
  label: string;
  /** Optional grouping label rendered as a section divider row. */
  section?: string;
  /** A small sublabel shown under the metric label. */
  hint?: string;
  /** Lower is better. Default false. */
  lowerIsBetter?: boolean;
  render: (stock: CompareStock) => { display: React.ReactNode; numeric: number | null; sub?: React.ReactNode };
};

const ROWS: Row[] = [
  { key: "ticker", label: "Ticker", render: (s) => ({ display: s.ticker, numeric: null }) },
  {
    key: "sector",
    label: "Sector",
    render: (s) => ({ display: s.sector || "—", numeric: null }),
  },
  {
    key: "price",
    label: "Price",
    hint: "Today's last price",
    render: (s) => ({ display: fmtPrice(s.price), numeric: s.price }),
  },
  {
    key: "day_change",
    label: "Day change",
    render: (s) => ({
      display: (
        <span style={{ color: (s.day_change_pct ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
          {fmtPct(s.day_change_pct)}
        </span>
      ),
      numeric: s.day_change_pct,
    }),
  },
  {
    key: "market_cap",
    label: "Market cap",
    render: (s) => ({ display: fmtLarge(s.market_cap), numeric: s.market_cap }),
  },
  {
    key: "pe",
    label: "P/E (TTM)",
    lowerIsBetter: true,
    render: (s) => ({
      display: s.pe_ttm === null ? "—" : s.pe_ttm.toFixed(1),
      numeric: s.pe_ttm,
      sub: s.pe_ttm !== null && s.pe_ttm < 0 ? "Loss" : undefined,
    }),
  },
  {
    key: "div_yield",
    label: "Dividend yield",
    render: (s) => ({
      display: s.dividend_yield === null ? "—" : `${s.dividend_yield.toFixed(2)}%`,
      numeric: s.dividend_yield,
    }),
  },
  {
    key: "high52",
    label: "52w high",
    render: (s) => ({ display: fmtPrice(s.week_52_high), numeric: s.week_52_high }),
  },
  {
    key: "low52",
    label: "52w low",
    lowerIsBetter: true,
    render: (s) => ({ display: fmtPrice(s.week_52_low), numeric: s.week_52_low }),
  },
  {
    key: "beta",
    label: "Beta",
    lowerIsBetter: true,
    hint: "vs S&P 500",
    render: (s) => ({
      display: s.beta === null ? "—" : s.beta.toFixed(2),
      numeric: s.beta,
    }),
  },
  {
    key: "rsi",
    label: "RSI (14)",
    hint: "30=oversold · 70=overbought",
    render: (s) => {
      const rsi = s.rsi;
      const color = rsi === null ? "#9ca3af" : rsi >= 70 ? "#dc2626" : rsi <= 30 ? "#059669" : "#111111";
      return {
        display: <span style={{ color }}>{rsi === null ? "—" : rsi.toFixed(1)}</span>,
        numeric: rsi,
        sub: rsi !== null && rsi >= 70 ? "Overbought" : rsi !== null && rsi <= 30 ? "Oversold" : undefined,
      };
    },
  },
  {
    key: "target",
    label: "Analyst target",
    render: (s) => {
      if (s.analyst_target_price === null || s.price === null) {
        return { display: "—", numeric: null };
      }
      const upside = ((s.analyst_target_price - s.price) / s.price) * 100;
      return {
        display: (
          <span className="flex flex-col items-center gap-0.5">
            <span>{fmtPrice(s.analyst_target_price)}</span>
            <span
              className="text-[10px] font-semibold tabular-nums"
              style={{ color: upside >= 0 ? "#059669" : "#dc2626" }}
            >
              {fmtPct(upside)} upside
            </span>
          </span>
        ),
        numeric: upside,
      };
    },
  },
  {
    key: "overall",
    label: "Overall score",
    hint: "0–100 stocksbrew score",
    render: (s) => ({
      display: (
        <span className="flex items-center gap-1.5" style={{ color: scoreColor(s.scores.overall) }}>
          <span className="text-[18px] font-bold tabular-nums">{fmtScore(s.scores.overall)}</span>
          <span className="text-[10px] text-[#9ca3af]">/100</span>
        </span>
      ),
      numeric: s.scores.overall,
      sub: s.verdict ? <VerdictBadge verdict={s.verdict} /> : undefined,
    }),
  },
  {
    key: "valuation",
    label: "Valuation",
    hint: "Pillar score",
    render: (s) => ({
      display: <span style={{ color: scoreColor(s.scores.valuation) }}>{fmtScore(s.scores.valuation)}</span>,
      numeric: s.scores.valuation,
    }),
  },
  {
    key: "growth",
    label: "Growth",
    hint: "Pillar score",
    render: (s) => ({
      display: <span style={{ color: scoreColor(s.scores.growth) }}>{fmtScore(s.scores.growth)}</span>,
      numeric: s.scores.growth,
    }),
  },
  {
    key: "quality",
    label: "Quality",
    hint: "Pillar score",
    render: (s) => ({
      display: <span style={{ color: scoreColor(s.scores.quality) }}>{fmtScore(s.scores.quality)}</span>,
      numeric: s.scores.quality,
    }),
  },
  {
    key: "momentum",
    label: "Momentum",
    hint: "Pillar score",
    render: (s) => ({
      display: <span style={{ color: scoreColor(s.scores.momentum) }}>{fmtScore(s.scores.momentum)}</span>,
      numeric: s.scores.momentum,
    }),
  },
  {
    key: "1m",
    label: "1m return",
    render: (s) => ({
      display: (
        <span style={{ color: (s.one_month_return ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
          {fmtPct(s.one_month_return)}
        </span>
      ),
      numeric: s.one_month_return,
    }),
  },
  {
    key: "3m",
    label: "3m return",
    render: (s) => ({
      display: (
        <span style={{ color: (s.three_month_return ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
          {fmtPct(s.three_month_return)}
        </span>
      ),
      numeric: s.three_month_return,
    }),
  },
  {
    key: "6m",
    label: "6m return",
    render: (s) => ({
      display: (
        <span style={{ color: (s.six_month_return ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
          {fmtPct(s.six_month_return)}
        </span>
      ),
      numeric: s.six_month_return,
    }),
  },
  {
    key: "1y",
    label: "1y return",
    render: (s) => ({
      display: (
        <span style={{ color: (s.one_year_return ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
          {fmtPct(s.one_year_return)}
        </span>
      ),
      numeric: s.one_year_return,
    }),
  },
];

function bestIndex(numerics: (number | null)[], lowerIsBetter: boolean): number | null {
  let bestIdx: number | null = null;
  let bestVal = lowerIsBetter ? Infinity : -Infinity;
  for (let i = 0; i < numerics.length; i += 1) {
    const v = numerics[i];
    if (v === null || !Number.isFinite(v)) continue;
    if (lowerIsBetter ? v < bestVal : v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  if (bestIdx === null) return null;
  // Highlight only if there are 2+ non-null values and the best is clearly distinct.
  const nonNull = numerics.filter((n) => n !== null && Number.isFinite(n));
  if (nonNull.length < 2) return null;
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Stock column header (sticky, on top of the table)
// ---------------------------------------------------------------------------

function StockHeader({ stock, onRemove }: { stock: CompareStock; onRemove?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} size={48} market={stock.market} />
      <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
        <Link
          href={`/stock/${encodeURIComponent(stock.ticker)}`}
          className="text-[16px] font-bold text-[#111111] tracking-[-0.02em] hover:text-[#0052ff] transition-colors"
        >
          {stock.ticker}
        </Link>
        <span className="text-[11px] text-[#6b7280] truncate w-full text-center">{stock.name}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[15px] font-semibold text-[#111111] tabular-nums">{fmtPrice(stock.price)}</span>
        {stock.day_change_pct !== null && (
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: stock.day_change_pct >= 0 ? "#059669" : "#dc2626" }}
          >
            {fmtPct(stock.day_change_pct)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="text-[22px] font-bold tracking-[-0.03em] tabular-nums"
          style={{ color: scoreColor(stock.scores.overall) }}
        >
          {fmtScore(stock.scores.overall)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">stocksbrew</span>
      </div>
      <VerdictBadge verdict={stock.verdict} />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${stock.ticker}`}
          className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#9ca3af] hover:bg-[#fef2f2] hover:text-[#ef4444] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function MissingStockHeader({
  ticker,
  onRemove,
}: {
  ticker: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="w-12 h-12 rounded-xl bg-[#fef2f2] flex items-center justify-center text-[#ef4444]">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v4M10 13.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[15px] font-bold text-[#111111] tracking-[-0.02em]">{ticker}</span>
        <span className="text-[11px] text-[#ef4444]">No data</span>
      </div>
      <p className="text-[11px] text-[#6b7280] text-center leading-snug max-w-[180px]">
        Delisted, renamed, or not in our coverage.
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 inline-flex h-8 items-center gap-1 rounded-full border border-[#fecaca] bg-white px-3 text-[11px] font-semibold text-[#991b1b] hover:bg-[#fef2f2] transition-colors"
      >
        Remove
      </button>
    </div>
  );
}

function EmptyStockSlot({ idx, onAdd }: { idx: number; onAdd: (t: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="w-12 h-12 rounded-xl border-2 border-dashed border-[#e5e7eb] flex items-center justify-center text-[#9ca3af]">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Slot {idx + 1}</span>
        <span className="text-[11px] text-[#6b7280]">Add a stock to compare</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = query.trim().toUpperCase();
          if (t) {
            onAdd(t);
            setQuery("");
          }
        }}
        className="w-full max-w-[200px]"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Ticker"
          maxLength={8}
          className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#0052ff] transition-colors uppercase"
        />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompareStocksInteractive({ searchIndex }: { searchIndex: SearchEntry[] }) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("build");
  const [result, setResult] = useState<CompareStocksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const canCompare = tickers.length >= 2;

  function addTicker(t: string) {
    const upper = t.trim().toUpperCase();
    if (!upper) return;
    let added = false;
    let totalSelected = 0;
    setTickers((prev) => {
      if (prev.includes(upper)) return prev;
      if (prev.length >= MAX_TICKERS) return prev;
      added = true;
      totalSelected = prev.length + 1;
      return [...prev, upper];
    });
    if (added) {
      captureEvent("compare_ticker_added", {
        ticker: upper,
        total_selected: totalSelected,
      });
    }
  }

  function removeTicker(t: string) {
    let removed = false;
    let totalSelected = 0;
    setTickers((prev) => {
      const next = prev.filter((x) => x !== t);
      removed = next.length !== prev.length;
      totalSelected = next.length;
      return next;
    });
    if (removed) {
      captureEvent("compare_ticker_removed", {
        ticker: t,
        total_selected: totalSelected,
      });
    }
  }

  function reset() {
    setTickers([]);
    setResult(null);
    setError(null);
    setPhase("build");
  }

  async function handleCompare() {
    if (!canCompare) return;
    setPhase("loading");
    setError(null);
    captureEvent("compare_started", {
      count: tickers.length,
      tickers: tickers.join(","),
    });
    try {
      const res = await fetch("/api/compare-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Request failed");
      }
      const data: CompareStocksResult = await res.json();
      setResult(data);
      setPhase("results");
      captureEvent("compare_succeeded", {
        count: tickers.length,
        tickers: tickers.join(","),
      });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
      captureEvent("compare_failed", {
        count: tickers.length,
        tickers: tickers.join(","),
      });
    }
  }

  // Build mode: empty state with hero call to add stocks.
  if (phase === "build" && tickers.length === 0) {
    return (
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-14 md:py-20 flex flex-col gap-10">
        <Hero
          searchIndex={searchIndex}
          selected={tickers}
          onAdd={addTicker}
          onRemove={removeTicker}
          onCompare={handleCompare}
          canCompare={canCompare}
          phase={phase}
        />
        <PopularStarters onPick={addTicker} />
        <HowItWorksPreview />
      </div>
    );
  }

  // Build mode with at least 1 ticker, or loading/error/results.
  return (
    <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-14 md:py-20 flex flex-col gap-10">
      <Hero
        searchIndex={searchIndex}
        selected={tickers}
        onAdd={addTicker}
        onRemove={removeTicker}
        onCompare={handleCompare}
        canCompare={canCompare}
        phase={phase}
      />

      {phase === "error" && error && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 flex items-start gap-2.5">
          <span className="text-[14px] mt-0.5">⚠️</span>
          <div>
            <p className="text-[13px] font-semibold text-[#991b1b]">{error}</p>
            <button
              onClick={() => setPhase("build")}
              className="mt-1 text-[12px] text-[#6b7280] hover:text-[#111111] transition-colors"
            >
              ← Back to builder
            </button>
          </div>
        </div>
      )}

      {phase === "loading" && <LoadingSkeleton count={tickers.length} />}

      {phase === "results" && result && (
        <div ref={resultsRef}>
          <ResultsSection
            result={result}
            onRemoveTicker={removeTicker}
            onAddTicker={addTicker}
            onEdit={reset}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero / input section
// ---------------------------------------------------------------------------

function Hero({
  searchIndex,
  selected,
  onAdd,
  onRemove,
  onCompare,
  canCompare,
  phase,
}: {
  searchIndex: SearchEntry[];
  selected: string[];
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  onCompare: () => void;
  canCompare: boolean;
  phase: Phase;
}) {
  const remaining = MAX_TICKERS - selected.length;
  const isFull = remaining === 0;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 max-w-[760px]">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0052ff]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
          Free tool
        </span>
        <h1 className="text-[40px] md:text-[54px] font-bold tracking-[-0.035em] text-[#111111] leading-[1.04]">
          Compare stocks<br className="hidden md:block" /> side by side
        </h1>
        <p className="text-[16px] text-[#6b7280] max-w-[560px] leading-[1.6]">
          Add up to {MAX_TICKERS} US tickers and we&apos;ll line up price, score, fundamentals, and returns in one table — so you can see which name actually wins, not just which one is louder on Twitter.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-5 md:p-6">
        {/* Selected chips */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#374151]">
              {selected.length === 0
                ? `Add 2 to ${MAX_TICKERS} tickers to compare`
                : selected.length === 1
                  ? "1 ticker selected — add at least one more"
                  : `${selected.length} of ${MAX_TICKERS} tickers selected`}
            </span>
            {selected.length > 0 && (
              <span className="text-[11px] text-[#9ca3af] tabular-nums">
                {selected.length}/{MAX_TICKERS}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[34px]">
            {selected.length === 0 ? (
              <span className="text-[12px] text-[#9ca3af] italic">Your tickers will appear here as chips</span>
            ) : (
              selected.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-[#111111] pl-3 pr-1.5 py-1 text-[12px] font-semibold text-white"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => onRemove(t)}
                    aria-label={`Remove ${t}`}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-[#374151]">Add a ticker</label>
          <PortfolioSearch
            searchIndex={searchIndex}
            onSelect={(t) => onAdd(t)}
          />
          <p className="text-[11px] text-[#9ca3af]">
            Search by ticker or company name. Press Enter or click to add.
          </p>
        </div>

        {/* Quick add chips */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-[#374151]">Or jump in with</span>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_TICKERS.map((t) => {
              const added = selected.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={isFull || added}
                  onClick={() => onAdd(t)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                    added
                      ? "border-[#10b981] bg-[#ecfdf5] text-[#065f46] cursor-default"
                      : isFull
                        ? "border-[#e5e7eb] bg-white text-[#9ca3af] cursor-not-allowed"
                        : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff]"
                  }`}
                >
                  {added ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Compare button */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[#f3f4f6]">
          <button
            type="button"
            onClick={onCompare}
            disabled={!canCompare || phase === "loading"}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#111111] px-6 text-[13px] font-semibold text-white hover:bg-black active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {phase === "loading" ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Comparing…
              </>
            ) : (
              <>
                Compare {canCompare ? `${selected.length}` : ""} stocks
                <span aria-hidden>→</span>
              </>
            )}
          </button>
          <span className="text-[12px] text-[#6b7280]">
            {canCompare
              ? "Free. No sign-in required."
              : "Pick at least 2 tickers to start."}
          </span>
        </div>
      </div>
    </section>
  );
}

function PopularStarters({ onPick }: { onPick: (t: string) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[20px] font-semibold text-[#111111] tracking-[-0.02em]">
        Popular comparisons
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {POPULAR_BUCKETS.map((bucket) => (
          <div
            key={bucket.label}
            className="flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-4"
          >
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
              {bucket.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {bucket.tickers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPick(t)}
                  className="rounded-full border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorksPreview() {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[#e5e7eb] bg-white p-6">
      <h2 className="text-[18px] font-semibold text-[#111111] tracking-[-0.02em]">
        How comparing stocks works here
      </h2>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            n: "1",
            t: "Add 2 to 5 tickers",
            b: "Search by ticker or company name, paste a list, or tap a quick-add chip. Up to 5 stocks at once.",
          },
          {
            n: "2",
            t: "See them lined up",
            b: "Price, market cap, scores, valuation, returns, RSI, analyst target — all in one side-by-side table.",
          },
          {
            n: "3",
            t: "Spot the winner fast",
            b: "Each row highlights the best stock with a green badge so you can scan and decide in seconds.",
          },
        ].map((s) => (
          <li
            key={s.n}
            className="flex flex-col gap-2 rounded-xl border border-[#f3f4f6] bg-[#fafaf7] p-4"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[12px] font-bold text-white">
              {s.n}
            </span>
            <span className="text-[14px] font-semibold text-[#111111]">{s.t}</span>
            <p className="text-[12px] text-[#6b7280] leading-[1.55]">{s.b}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ count }: { count: number }) {
  const slots = Math.max(count, 2);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden animate-pulse">
        <div className="flex border-b border-[#e5e7eb]">
          <div className="p-4 w-[220px] shrink-0" />
          {Array.from({ length: slots }).map((_, i) => (
            <div key={i} className="flex-1 min-w-[160px] p-4 flex flex-col items-center gap-2 border-l border-[#f3f4f6]">
              <div className="w-12 h-12 rounded-xl bg-[#f3f4f6]" />
              <div className="h-3 w-14 rounded-full bg-[#f3f4f6]" />
              <div className="h-2.5 w-20 rounded-full bg-[#f3f4f6]" />
              <div className="h-3 w-12 rounded-full bg-[#f3f4f6]" />
            </div>
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex border-b border-[#f3f4f6] last:border-0">
            <div className="p-3 w-[220px] shrink-0">
              <div className="h-2.5 w-20 rounded-full bg-[#f3f4f6]" />
            </div>
            {Array.from({ length: slots }).map((_, j) => (
              <div key={j} className="flex-1 min-w-[160px] p-3 border-l border-[#f3f4f6] flex justify-center">
                <div className="h-3 w-12 rounded-full bg-[#f3f4f6]" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="p-4 flex items-center justify-center">
        <p className="text-[12px] text-[#9ca3af]">Scoring and lining up {slots} stocks…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results section
// ---------------------------------------------------------------------------

function ResultsSection({
  result,
  onRemoveTicker,
  onAddTicker,
  onEdit,
}: {
  result: CompareStocksResult;
  onRemoveTicker: (t: string) => void;
  onAddTicker: (t: string) => void;
  onEdit: () => void;
}) {
  const { stocks, missing_tickers } = result;
  const columnCount = stocks.length + missing_tickers.length;
  const emptySlotCount = Math.max(0, MAX_TICKERS - columnCount);

  const instrumentIds = useMemo(
    () => stocks.map((s) => s.instrument_id).filter((id) => !!id),
    [stocks],
  );

  return (
    <section className="flex flex-col gap-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-[#374151]">
            Comparing {stocks.length} stock{stocks.length !== 1 ? "s" : ""}
            {missing_tickers.length > 0 && ` (${missing_tickers.length} missing)`}
          </span>
          {stocks.map((s) => (
            <span
              key={s.ticker}
              className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#374151]"
            >
              {s.ticker}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[12px] font-semibold text-[#374151] hover:border-[#111111] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7 3L4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit selection
          </button>
          {stocks.length > 0 && (
            <TrackInRadarButton
              instrumentIds={instrumentIds}
              positionType="watchlist"
              label={`Track ${stocks.length} in Radar`}
              className="!h-9 !px-4 !text-[12px]"
            />
          )}
        </div>
      </div>

      {missing_tickers.length > 0 && <MissingTickersNote missing={missing_tickers} />}

      {/* Comparison table */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#fafaf7]">
                <th className="p-3 text-left align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                      Metric
                    </span>
                    <span className="text-[10px] text-[#9ca3af]">Best in green</span>
                  </div>
                </th>
                {stocks.map((s) => (
                  <th key={s.ticker} className="p-0 align-top border-l border-[#f3f4f6]">
                    <StockHeader stock={s} onRemove={() => onRemoveTicker(s.ticker)} />
                  </th>
                ))}
                {missing_tickers.map((t) => (
                  <th key={`missing-${t}`} className="p-0 align-top border-l border-[#f3f4f6]">
                    <MissingStockHeader ticker={t} onRemove={() => onRemoveTicker(t)} />
                  </th>
                ))}
                {Array.from({ length: emptySlotCount }).map((_, i) => (
                  <th key={`slot-${i}`} className="p-0 align-top border-l border-[#f3f4f6]">
                    <EmptyStockSlot
                      idx={stocks.length + missing_tickers.length + i}
                      onAdd={onAddTicker}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = stocks.map((s) => row.render(s));
                const numerics = values.map((v) => v.numeric);
                const best = row.key === "ticker" || row.key === "sector" ? null : bestIndex(numerics, !!row.lowerIsBetter);
                return (
                  <tr key={row.key} className="border-b border-[#f3f4f6] last:border-0">
                    <td className="p-3 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-semibold text-[#111111]">{row.label}</span>
                        {row.hint && (
                          <span className="text-[10px] text-[#9ca3af]">{row.hint}</span>
                        )}
                      </div>
                    </td>
                    {values.map((v, i) => {
                      const isBest = best === i && best !== null;
                      return (
                        <td key={i} className="p-3 align-middle text-center border-l border-[#f3f4f6]">
                          <div className="flex flex-col items-center gap-1.5">
                            <MetricCell
                              value={v.display}
                              highlight={isBest}
                              sub={v.sub}
                            />
                            {isBest && <BestBadge />}
                          </div>
                        </td>
                      );
                    })}
                    {missing_tickers.map((t) => (
                      <td key={`m-${t}`} className="p-3 align-middle text-center border-l border-[#f3f4f6]">
                        <span className="text-[12px] text-[#9ca3af]">—</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom action bar */}
      {stocks.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-[#111111] bg-[#111111] p-6 text-white">
          <div className="flex flex-col gap-1 max-w-[480px]">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
              Like the comparison? Track them all.
            </h2>
            <p className="text-[13px] text-white/70 leading-relaxed">
              Add these {stocks.length} stocks to your Radar for daily directives, alerts when setups shift, and pillar breakdowns.
              Free for 3 stocks, Pro for unlimited.
            </p>
          </div>
          <TrackInRadarButton
            instrumentIds={instrumentIds}
            positionType="watchlist"
            label={`Track all ${stocks.length} in Radar`}
            className="!bg-white !text-[#111111] hover:!bg-white/90"
          />
        </div>
      )}
    </section>
  );
}

function MissingTickersNote({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return (
    <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 flex items-start gap-2.5">
      <span className="text-[14px] mt-0.5">⚠️</span>
      <div>
        <p className="text-[12px] font-semibold text-[#92400e]">
          Couldn&apos;t resolve: {missing.join(", ")}
        </p>
        <p className="text-[11px] text-[#b45309] mt-0.5">
          These may be delisted, renamed, or not in our universe. Add more tickers or remove these to see the full comparison.
        </p>
      </div>
    </div>
  );
}
