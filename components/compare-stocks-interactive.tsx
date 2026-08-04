"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { PortfolioSearch } from "@/components/portfolio-search";
import { StockLogo } from "@/components/stock-logo";
import { TrackInRadarButton } from "@/components/track-in-radar-button";
import type { CompareStock, CompareStocksResult } from "@/lib/compare-stocks";
import { captureEvent } from "@/lib/posthog";
import type { SearchEntry } from "@/lib/search";

const MAX_TICKERS = 5;

const PRESETS = [
  { label: "AI chips", tickers: ["NVDA", "AMD"] },
  { label: "Mega-cap", tickers: ["AAPL", "MSFT"] },
  { label: "EVs", tickers: ["TSLA", "RIVN"] },
  { label: "Banks", tickers: ["JPM", "BAC"] },
] as const;

type Phase = "build" | "loading" | "results" | "error";
type MetricCategory = "snapshot" | "fundamentals" | "momentum";
type WinnerMode = "higher" | "lower" | null;

type MetricValue = {
  display: ReactNode;
  numeric: number | null;
};

type Metric = {
  key: string;
  label: string;
  note?: string;
  category: MetricCategory;
  winner: WinnerMode;
  read: (stock: CompareStock) => MetricValue;
};

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  snapshot: "Quick read",
  fundamentals: "Fundamentals",
  momentum: "Momentum",
};

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatLarge(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function formatScore(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}`;
}

function targetUpside(stock: CompareStock): number | null {
  if (stock.analyst_target_price === null || stock.price === null || stock.price === 0) {
    return null;
  }
  return ((stock.analyst_target_price - stock.price) / stock.price) * 100;
}

function toneForNumber(value: number | null): string {
  if (value === null || value === 0) return "text-[#6b7280]";
  return value > 0 ? "text-[#087a5b]" : "text-[#c43c3c]";
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-[#9ca3af]";
  if (score >= 75) return "text-[#087a5b]";
  if (score >= 55) return "text-[#111111]";
  return "text-[#c43c3c]";
}

const METRICS: Metric[] = [
  {
    key: "overall",
    label: "Stocksbrew score",
    note: "Overall, out of 100",
    category: "snapshot",
    winner: "higher",
    read: (stock) => ({
      display: <span className={scoreTone(stock.scores.overall)}>{formatScore(stock.scores.overall)}</span>,
      numeric: stock.scores.overall,
    }),
  },
  {
    key: "target",
    label: "Target room",
    note: "Analyst target vs. price",
    category: "snapshot",
    winner: "higher",
    read: (stock) => {
      const upside = targetUpside(stock);
      return {
        display: <span className={toneForNumber(upside)}>{formatPercent(upside)}</span>,
        numeric: upside,
      };
    },
  },
  {
    key: "day",
    label: "Today",
    category: "snapshot",
    winner: "higher",
    read: (stock) => ({
      display: <span className={toneForNumber(stock.day_change_pct)}>{formatPercent(stock.day_change_pct)}</span>,
      numeric: stock.day_change_pct,
    }),
  },
  {
    key: "price",
    label: "Price",
    category: "snapshot",
    winner: null,
    read: (stock) => ({ display: formatPrice(stock.price), numeric: stock.price }),
  },
  {
    key: "market_cap",
    label: "Market cap",
    category: "snapshot",
    winner: null,
    read: (stock) => ({ display: formatLarge(stock.market_cap), numeric: stock.market_cap }),
  },
  {
    key: "valuation",
    label: "Valuation",
    note: "Pillar score",
    category: "fundamentals",
    winner: "higher",
    read: (stock) => ({
      display: <span className={scoreTone(stock.scores.valuation)}>{formatScore(stock.scores.valuation)}</span>,
      numeric: stock.scores.valuation,
    }),
  },
  {
    key: "growth",
    label: "Growth",
    note: "Pillar score",
    category: "fundamentals",
    winner: "higher",
    read: (stock) => ({
      display: <span className={scoreTone(stock.scores.growth)}>{formatScore(stock.scores.growth)}</span>,
      numeric: stock.scores.growth,
    }),
  },
  {
    key: "quality",
    label: "Quality",
    note: "Pillar score",
    category: "fundamentals",
    winner: "higher",
    read: (stock) => ({
      display: <span className={scoreTone(stock.scores.quality)}>{formatScore(stock.scores.quality)}</span>,
      numeric: stock.scores.quality,
    }),
  },
  {
    key: "pe",
    label: "P/E",
    note: "Trailing 12 months",
    category: "fundamentals",
    winner: null,
    read: (stock) => ({
      display: stock.pe_ttm === null ? "—" : stock.pe_ttm.toFixed(1),
      numeric: stock.pe_ttm,
    }),
  },
  {
    key: "dividend",
    label: "Dividend yield",
    category: "fundamentals",
    winner: "higher",
    read: (stock) => ({
      display: stock.dividend_yield === null ? "—" : `${stock.dividend_yield.toFixed(2)}%`,
      numeric: stock.dividend_yield,
    }),
  },
  {
    key: "momentum",
    label: "Momentum",
    note: "Pillar score",
    category: "momentum",
    winner: "higher",
    read: (stock) => ({
      display: <span className={scoreTone(stock.scores.momentum)}>{formatScore(stock.scores.momentum)}</span>,
      numeric: stock.scores.momentum,
    }),
  },
  {
    key: "1m",
    label: "1 month",
    category: "momentum",
    winner: "higher",
    read: (stock) => ({
      display: <span className={toneForNumber(stock.one_month_return)}>{formatPercent(stock.one_month_return)}</span>,
      numeric: stock.one_month_return,
    }),
  },
  {
    key: "3m",
    label: "3 months",
    category: "momentum",
    winner: "higher",
    read: (stock) => ({
      display: <span className={toneForNumber(stock.three_month_return)}>{formatPercent(stock.three_month_return)}</span>,
      numeric: stock.three_month_return,
    }),
  },
  {
    key: "6m",
    label: "6 months",
    category: "momentum",
    winner: "higher",
    read: (stock) => ({
      display: <span className={toneForNumber(stock.six_month_return)}>{formatPercent(stock.six_month_return)}</span>,
      numeric: stock.six_month_return,
    }),
  },
  {
    key: "1y",
    label: "1 year",
    category: "momentum",
    winner: "higher",
    read: (stock) => ({
      display: <span className={toneForNumber(stock.one_year_return)}>{formatPercent(stock.one_year_return)}</span>,
      numeric: stock.one_year_return,
    }),
  },
  {
    key: "rsi",
    label: "RSI",
    note: "14-day",
    category: "momentum",
    winner: null,
    read: (stock) => ({
      display: stock.rsi === null ? "—" : stock.rsi.toFixed(1),
      numeric: stock.rsi,
    }),
  },
  {
    key: "beta",
    label: "Beta",
    note: "Volatility vs. S&P 500",
    category: "momentum",
    winner: null,
    read: (stock) => ({
      display: stock.beta === null ? "—" : stock.beta.toFixed(2),
      numeric: stock.beta,
    }),
  },
];

function bestIndex(values: (number | null)[], mode: WinnerMode): number | null {
  if (!mode) return null;
  let best: number | null = null;
  let bestValue = mode === "higher" ? -Infinity : Infinity;
  let usable = 0;

  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    usable += 1;
    const beats = mode === "higher" ? value > bestValue : value < bestValue;
    if (beats) {
      best = index;
      bestValue = value;
    }
  });

  return usable >= 2 ? best : null;
}

function scoreLeader(
  stocks: CompareStock[],
  key: keyof CompareStock["scores"],
): CompareStock | null {
  return (
    stocks.reduce<CompareStock | null>((leader, stock) => {
      const score = stock.scores[key];
      if (score === null) return leader;
      if (!leader || (leader.scores[key] ?? -Infinity) < score) return stock;
      return leader;
    }, null)
  );
}

export function CompareStocksInteractive({ searchIndex }: { searchIndex: SearchEntry[] }) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("build");
  const [result, setResult] = useState<CompareStocksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const canCompare = tickers.length >= 2;

  function addTicker(ticker: string) {
    const upper = ticker.trim().toUpperCase();
    if (!upper) return;
    setTickers((current) => {
      if (current.includes(upper) || current.length >= MAX_TICKERS) return current;
      const next = [...current, upper];
      captureEvent("compare_ticker_added", {
        ticker: upper,
        total_selected: next.length,
      });
      return next;
    });
  }

  function removeTicker(ticker: string) {
    setTickers((current) => {
      const next = current.filter((item) => item !== ticker);
      if (next.length !== current.length) {
        captureEvent("compare_ticker_removed", {
          ticker,
          total_selected: next.length,
        });
      }
      return next;
    });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const next = [...preset.tickers];
    setTickers(next);
    captureEvent("compare_preset_selected", {
      preset: preset.label,
      tickers: next.join(","),
    });
  }

  function editComparison() {
    setResult(null);
    setError(null);
    setPhase("build");
  }

  function startOver() {
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
      const response = await fetch("/api/compare-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(payload.error || "Request failed");
      }

      const data: CompareStocksResult = await response.json();
      setResult(data);
      setPhase("results");
      captureEvent("compare_succeeded", {
        count: tickers.length,
        tickers: tickers.join(","),
      });
      setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setPhase("error");
      captureEvent("compare_failed", {
        count: tickers.length,
        tickers: tickers.join(","),
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-6 md:py-12 lg:px-10">
      <AnimatePresence mode="wait">
        {(phase === "build" || phase === "error") && (
          <motion.div
            key="builder"
            initial={false}
            animate={{ y: 0 }}
            exit={{ y: -8 }}
            transition={{ duration: 0.28 }}
          >
            <CompareBuilder
              searchIndex={searchIndex}
              selected={tickers}
              error={error}
              onAdd={addTicker}
              onRemove={removeTicker}
              onClear={() => setTickers([])}
              onPreset={applyPreset}
              onCompare={handleCompare}
            />
          </motion.div>
        )}

        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={false}
          >
            <LoadingArena tickers={tickers} />
          </motion.div>
        )}

        {phase === "results" && result && (
          <motion.div
            key="results"
            ref={resultsRef}
            initial={false}
            animate={{ y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <ResultsExperience
              result={result}
              onEdit={editComparison}
              onStartOver={startOver}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompareBuilder({
  searchIndex,
  selected,
  error,
  onAdd,
  onRemove,
  onClear,
  onPreset,
  onCompare,
}: {
  searchIndex: SearchEntry[];
  selected: string[];
  error: string | null;
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onClear: () => void;
  onPreset: (preset: (typeof PRESETS)[number]) => void;
  onCompare: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const canCompare = selected.length >= 2;
  const isFull = selected.length >= MAX_TICKERS;
  const searchByTicker = useMemo(
    () => new Map(searchIndex.map((entry) => [entry.ticker.toUpperCase(), entry])),
    [searchIndex],
  );

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-[#dde3df] bg-[#f7faf8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-36 h-[420px] w-[420px] rounded-full bg-[#baf3d8]/45 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-44 left-[28%] h-[340px] w-[340px] rounded-full bg-[#e7efcb]/50 blur-3xl"
      />

      <div className="relative grid gap-8 px-5 py-7 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:items-center lg:gap-14 lg:px-12 lg:py-14">
        <motion.div
          initial={reducedMotion ? false : { x: -16 }}
          animate={{ x: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-col items-start"
        >
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cddbd2] bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#087a5b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16a174]" />
            Free · no sign-in
          </span>
          <h1 className="max-w-[590px] text-[42px] font-semibold leading-[0.98] tracking-[-0.055em] text-[#101512] sm:text-[54px] lg:text-[58px]">
            Pick two.
            <br />
            See the trade-off.
          </h1>
          <p className="mt-5 max-w-[470px] text-[15px] leading-7 text-[#59655e] sm:text-[17px]">
            One clean read across quality, valuation, momentum and returns.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#7b8780]">
            <span>Live price</span>
            <span>17 useful metrics</span>
            <span>Up to 5 stocks</span>
          </div>
        </motion.div>

        <motion.div
          initial={reducedMotion ? false : { y: 18, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-[26px] border border-[#d8dfda] bg-white p-4 shadow-[0_24px_70px_rgba(16,48,31,0.10)] sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#667169]">
              Your matchup
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tabular-nums text-[#7b847e]">
                {selected.length}/{MAX_TICKERS}
              </span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-[11px] font-semibold text-[#7b847e] underline decoration-[#cdd5d0] underline-offset-4 hover:text-[#111111]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mb-4 grid min-h-[82px] grid-cols-2 gap-2 sm:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {selected.map((ticker, index) => {
                const entry = searchByTicker.get(ticker);
                return (
                  <motion.div
                    layout
                    key={ticker}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.88, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className={`group relative flex min-w-0 items-center gap-2.5 rounded-2xl border p-3 ${
                      index === 0
                        ? "border-[#17241c] bg-[#17241c] text-white"
                        : "border-[#dfe5e1] bg-[#f8faf9] text-[#17241c]"
                    }`}
                  >
                    <StockLogo ticker={ticker} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold">{ticker}</p>
                      <p className={`truncate text-[9px] ${index === 0 ? "text-white/55" : "text-[#7c8780]"}`}>
                        {entry?.name || "Selected"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${ticker}`}
                      onClick={() => onRemove(ticker)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] transition-colors ${
                        index === 0
                          ? "text-white/55 hover:bg-white/10 hover:text-white"
                          : "text-[#9ba39e] hover:bg-[#e9eeeb] hover:text-[#111111]"
                      }`}
                    >
                      ×
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {Array.from({ length: Math.max(0, Math.min(2, MAX_TICKERS - selected.length)) }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="flex items-center gap-2 rounded-2xl border border-dashed border-[#d8dfda] bg-[#fbfcfb] p-3 text-[#a1aaa4]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2ef] text-[18px]">+</span>
                <span className="text-[11px] font-medium">Add stock</span>
              </div>
            ))}
          </div>

          <div className={isFull ? "pointer-events-none opacity-45" : ""}>
            <PortfolioSearch searchIndex={searchIndex} onSelect={(ticker) => onAdd(ticker)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const selectedPreset = preset.tickers.every((ticker) => selected.includes(ticker));
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onPreset(preset)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-all ${
                    selectedPreset
                      ? "border-[#1b7f5d] bg-[#eaf7f1] text-[#086848]"
                      : "border-[#e0e5e2] bg-white text-[#5e6962] hover:-translate-y-0.5 hover:border-[#9fb8a9] hover:text-[#111111]"
                  }`}
                >
                  {preset.tickers.join(" vs ")}
                </button>
              );
            })}
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-[#fff0f0] px-3 py-2 text-[12px] font-medium text-[#a12f2f]">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onCompare}
            disabled={!canCompare}
            className="mt-5 flex h-12 w-full items-center justify-between rounded-2xl bg-[#111713] px-5 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(17,23,19,0.18)] transition-all hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:bg-[#d9ddda] disabled:text-[#8f9791] disabled:shadow-none"
          >
            <span>{canCompare ? `Compare ${selected.length} stocks` : "Choose at least two"}</span>
            <span className="text-[18px]" aria-hidden>↗</span>
          </button>
        </motion.div>
      </div>
    </section>
  );
}

function LoadingArena({ tickers }: { tickers: string[] }) {
  const reducedMotion = useReducedMotion();
  return (
    <section className="flex min-h-[560px] flex-col items-center justify-center overflow-hidden rounded-[32px] border border-[#dde3df] bg-[#f7faf8] px-6 text-center">
      <div className="relative mb-8 flex h-28 items-center justify-center">
        {tickers.slice(0, 3).map((ticker, index) => (
          <motion.div
            key={ticker}
            initial={reducedMotion ? false : { opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
            animate={
              reducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: [0, -7, 0], rotate: [0, index % 2 === 0 ? -2 : 2, 0] }
            }
            transition={{
              opacity: { duration: 0.25 },
              y: { duration: 1.6, repeat: Infinity, delay: index * 0.16 },
              rotate: { duration: 1.6, repeat: Infinity, delay: index * 0.16 },
            }}
            className="-mx-1 flex h-20 w-20 items-center justify-center rounded-3xl border border-[#d9e2dc] bg-white shadow-[0_14px_36px_rgba(20,55,37,0.12)]"
          >
            <StockLogo ticker={ticker} size={40} />
          </motion.div>
        ))}
      </div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#087a5b]">
        Building the matchup
      </p>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#111713]">
        Finding the actual trade-offs…
      </h1>
      <div className="mt-7 h-1.5 w-52 overflow-hidden rounded-full bg-[#dce4df]">
        <motion.div
          className="h-full rounded-full bg-[#13986b]"
          initial={{ width: "8%" }}
          animate={reducedMotion ? { width: "70%" } : { width: ["8%", "86%", "32%", "92%"] }}
          transition={{ duration: 2.2, repeat: reducedMotion ? 0 : Infinity, ease: "easeInOut" }}
        />
      </div>
    </section>
  );
}

function ResultsExperience({
  result,
  onEdit,
  onStartOver,
}: {
  result: CompareStocksResult;
  onEdit: () => void;
  onStartOver: () => void;
}) {
  const [category, setCategory] = useState<MetricCategory>("snapshot");
  const { stocks, missing_tickers: missingTickers } = result;
  const overallLeader = scoreLeader(stocks, "overall");
  const valuationLeader = scoreLeader(stocks, "valuation");
  const qualityLeader = scoreLeader(stocks, "quality");
  const momentumLeader = scoreLeader(stocks, "momentum");
  const instrumentIds = useMemo(
    () => stocks.map((stock) => stock.instrument_id).filter(Boolean),
    [stocks],
  );

  if (stocks.length < 2) {
    return (
      <section className="rounded-[28px] border border-[#eadfce] bg-[#fffaf1] px-6 py-12 text-center">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#17130f]">
          We need two covered stocks.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-6 text-[#71675b]">
          {missingTickers.length ? `${missingTickers.join(", ")} could not be resolved.` : "Not enough stock data came back."}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="mt-6 rounded-full bg-[#111111] px-5 py-2.5 text-[12px] font-semibold text-white"
        >
          Edit matchup
        </button>
      </section>
    );
  }

  const summaryBits = [
    valuationLeader ? `${valuationLeader.ticker} leads valuation` : null,
    qualityLeader ? `${qualityLeader.ticker} leads quality` : null,
    momentumLeader ? `${momentumLeader.ticker} leads momentum` : null,
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-5 sm:gap-7">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#667169]">
            Matchup
          </span>
          {stocks.map((stock) => (
            <span key={stock.ticker} className="rounded-full bg-[#edf2ef] px-2.5 py-1 text-[10px] font-bold text-[#26332b]">
              {stock.ticker}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-[#dce2de] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#344139] hover:border-[#8a978f]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-full px-3 py-2 text-[11px] font-semibold text-[#6d7771] hover:text-[#111111]"
          >
            New comparison
          </button>
        </div>
      </div>

      {missingTickers.length > 0 && (
        <div className="rounded-2xl border border-[#eadfce] bg-[#fffaf1] px-4 py-3 text-[12px] text-[#7f6542]">
          No current data for {missingTickers.join(", ")}. The comparison below uses the covered stocks.
        </div>
      )}

      <div className="grid overflow-hidden rounded-[30px] border border-[#dce3de] bg-white lg:grid-cols-[0.92fr_1.08fr]">
        <div className="relative overflow-hidden bg-[#102018] px-6 py-8 text-white sm:px-9 sm:py-10">
          <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#35c58d]/20 blur-3xl" />
          <p className="relative font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#85d8b5]">
            The quick read
          </p>
          <div className="relative mt-7 flex items-center gap-4">
            {overallLeader && <StockLogo ticker={overallLeader.ticker} logoUrl={overallLeader.logo_url} size={58} market={overallLeader.market} eager />}
            <div>
              <p className="text-[12px] text-white/55">Strongest overall score</p>
              <h1 className="text-[32px] font-semibold tracking-[-0.04em]">
                {overallLeader?.ticker || "No clear leader"}
              </h1>
            </div>
            {overallLeader?.scores.overall !== null && overallLeader?.scores.overall !== undefined && (
              <span className="ml-auto text-[42px] font-semibold tabular-nums tracking-[-0.05em] text-[#8be0bb]">
                {Math.round(overallLeader.scores.overall)}
              </span>
            )}
          </div>
          <p className="relative mt-7 max-w-lg text-[14px] leading-6 text-white/72">
            {summaryBits.join(" · ")}.
          </p>
          <p className="relative mt-5 text-[10px] uppercase tracking-[0.1em] text-white/40">
            A data lead, not a buy verdict
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#e7ece9] sm:grid-cols-4">
          {[
            { label: "Valuation", stock: valuationLeader },
            { label: "Growth", stock: scoreLeader(stocks, "growth") },
            { label: "Quality", stock: qualityLeader },
            { label: "Momentum", stock: momentumLeader },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 + index * 0.06 }}
              className="flex min-h-[132px] flex-col justify-between bg-[#f8faf9] p-4 sm:min-h-0 sm:p-5"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a857e]">{item.label}</span>
              <div>
                <span className="text-[22px] font-semibold tracking-[-0.03em] text-[#172119]">{item.stock?.ticker || "—"}</span>
                <ScoreBar score={item.stock?.scores[item.label.toLowerCase() as keyof CompareStock["scores"]] ?? null} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <StockScorecards stocks={stocks} overallLeader={overallLeader} />

      <div className="overflow-hidden rounded-[26px] border border-[#dde3df] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#e7ebe8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#161c18]">Compare the details</h2>
            <p className="mt-0.5 text-[11px] text-[#7b857f]">Best comparable value is marked. Neutral metrics are not ranked.</p>
          </div>
          <div role="tablist" aria-label="Comparison metric category" className="grid grid-cols-3 rounded-xl bg-[#f0f3f1] p-1">
            {(Object.keys(CATEGORY_LABELS) as MetricCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={category === key}
                onClick={() => {
                  setCategory(key);
                  captureEvent("compare_category_viewed", { category: key });
                }}
                className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition-all sm:px-4 sm:text-[11px] ${
                  category === key
                    ? "bg-white text-[#111713] shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                    : "text-[#6f7973] hover:text-[#111713]"
                }`}
              >
                {CATEGORY_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={category}
            role="tabpanel"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <ComparisonMatrix
              stocks={stocks}
              metrics={METRICS.filter((metric) => metric.category === category)}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-4 rounded-[24px] bg-[#eef7f2] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#15231b]">Keep following these stocks.</h2>
          <p className="mt-1 text-[12px] text-[#627067]">Track the names and come back when the setup changes.</p>
        </div>
        <TrackInRadarButton
          instrumentIds={instrumentIds}
          positionType="watchlist"
          label={`Add ${stocks.length} to Watchlist`}
          className="w-full sm:w-auto"
        />
      </div>
    </section>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const reducedMotion = useReducedMotion();
  const width = score === null ? 0 : Math.min(100, Math.max(0, score));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dce4df]">
      <motion.div
        className="h-full rounded-full bg-[#15956a]"
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: reducedMotion ? 0 : 0.75, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function StockScorecards({
  stocks,
  overallLeader,
}: {
  stocks: CompareStock[];
  overallLeader: CompareStock | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {stocks.map((stock, index) => {
        const isLeader = overallLeader?.ticker === stock.ticker;
        return (
          <motion.div
            key={stock.ticker}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.06 }}
            className={`relative min-w-0 rounded-[20px] border p-4 ${
              isLeader
                ? "border-[#17241c] bg-[#17241c] text-white shadow-[0_14px_34px_rgba(16,36,24,0.16)]"
                : "border-[#dfe5e1] bg-white text-[#182019]"
            }`}
          >
            {isLeader && (
              <span className="absolute right-3 top-3 rounded-full bg-[#91e0bc] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#123d2c]">
                Leads
              </span>
            )}
            <div className="flex items-center gap-2.5">
              <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} size={34} market={stock.market} />
              <div className="min-w-0">
                <Link
                  href={`/stock/${encodeURIComponent(stock.ticker)}`}
                  className="text-[14px] font-bold hover:underline"
                >
                  {stock.ticker}
                </Link>
                <p className={`truncate text-[9px] ${isLeader ? "text-white/50" : "text-[#7b857f]"}`}>{stock.name}</p>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between gap-2">
              <div>
                <p className={`text-[9px] uppercase tracking-[0.1em] ${isLeader ? "text-white/45" : "text-[#929b95]"}`}>Score</p>
                <p className="mt-0.5 text-[30px] font-semibold tabular-nums tracking-[-0.05em]">{formatScore(stock.scores.overall)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold tabular-nums">{formatPrice(stock.price)}</p>
                <p className={`text-[10px] font-semibold tabular-nums ${isLeader ? "text-[#91e0bc]" : toneForNumber(stock.day_change_pct)}`}>
                  {formatPercent(stock.day_change_pct)}
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function ComparisonMatrix({
  stocks,
  metrics,
}: {
  stocks: CompareStock[];
  metrics: Metric[];
}) {
  return (
    <>
      <div className="hidden md:block">
        <div
          className="grid border-b border-[#e7ebe8] bg-[#fbfcfb]"
          style={{ gridTemplateColumns: `minmax(160px, 0.85fr) repeat(${stocks.length}, minmax(0, 1fr))` }}
        >
          <div className="p-4" />
          {stocks.map((stock) => (
            <div key={stock.ticker} className="flex items-center justify-center gap-2 border-l border-[#edf0ee] p-4">
              <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} size={24} market={stock.market} />
              <span className="text-[12px] font-bold text-[#202a23]">{stock.ticker}</span>
            </div>
          ))}
        </div>

        {metrics.map((metric) => {
          const values = stocks.map(metric.read);
          const winner = bestIndex(values.map((value) => value.numeric), metric.winner);
          return (
            <div
              key={metric.key}
              className="grid border-b border-[#edf0ee] last:border-b-0"
              style={{ gridTemplateColumns: `minmax(160px, 0.85fr) repeat(${stocks.length}, minmax(0, 1fr))` }}
            >
              <div className="flex min-h-[66px] flex-col justify-center px-5 py-3">
                <span className="text-[12px] font-semibold text-[#2d3931]">{metric.label}</span>
                {metric.note && <span className="mt-0.5 text-[9px] text-[#929a95]">{metric.note}</span>}
              </div>
              {values.map((value, index) => {
                const isWinner = winner === index;
                return (
                  <div
                    key={stocks[index].ticker}
                    className={`relative flex min-h-[66px] items-center justify-center border-l border-[#edf0ee] px-2 py-3 text-[13px] font-semibold tabular-nums ${
                      isWinner ? "bg-[#edf9f3]" : ""
                    }`}
                  >
                    <span>{value.display}</span>
                    {isWinner && (
                      <span className="absolute right-2 top-2 rounded-full bg-[#cceedd] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#0b6a49]">
                        Best
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="divide-y divide-[#e9edea] md:hidden">
        {metrics.map((metric) => {
          const values = stocks.map(metric.read);
          const winner = bestIndex(values.map((value) => value.numeric), metric.winner);
          return (
            <div key={metric.key} className="p-4">
              <div className="mb-3 flex items-end justify-between gap-4">
                <span className="text-[12px] font-semibold text-[#28342c]">{metric.label}</span>
                {metric.note && <span className="text-right text-[9px] text-[#929a95]">{metric.note}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {values.map((value, index) => {
                  const isWinner = winner === index;
                  return (
                    <div
                      key={stocks[index].ticker}
                      className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                        isWinner
                          ? "border-[#abd9c2] bg-[#edf9f3]"
                          : "border-[#e5e9e6] bg-[#fafbfa]"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-[#69746d]">{stocks[index].ticker}</span>
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums text-[#1e2821]">
                        {value.display}
                        {isWinner && <span className="h-1.5 w-1.5 rounded-full bg-[#0d8b61]" aria-label="Best value" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
