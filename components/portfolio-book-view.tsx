"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PortfolioBucketCanvas } from "@/components/portfolio-bucket-canvas";
import { relativeTime } from "@/lib/freshness";
import { filterPortfolioRows, type PortfolioBookRow } from "@/lib/portfolio-book";
import type {
  PortfolioRebalanceBundle,
  PortfolioRebalancePlan,
  RebalanceStrategyId,
} from "@/lib/portfolio-organize-types";

const STRATEGY_OPTIONS: { id: RebalanceStrategyId; label: string; short: string }[] = [
  { id: "balanced", label: "Balanced fundamentals", short: "Balanced" },
  { id: "quality", label: "Quality compounders", short: "Quality" },
  { id: "ai_momentum", label: "AI momentum", short: "AI momentum" },
  { id: "defensive", label: "Defensive balance", short: "Defensive" },
  { id: "diversification", label: "Diversification first", short: "Diversify" },
];

export function PortfolioBookView({
  rows,
  builtAt,
}: {
  rows: PortfolioBookRow[];
  builtAt?: string;
}) {
  const holdings = useMemo(() => filterPortfolioRows(rows, "holding"), [rows]);
  const holdingsKey = useMemo(
    () => holdings.map((h) => h.instrument_id).join(","),
    [holdings],
  );

  const [strategy, setStrategy] = useState<RebalanceStrategyId>("balanced");
  const [bundle, setBundle] = useState<PortfolioRebalanceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async (strategyId: RebalanceStrategyId, signal: AbortSignal) => {
    const res = await fetch("/api/watchlist/portfolio-organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: strategyId }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "rebalance_failed");
    return data as PortfolioRebalanceBundle;
  }, []);

  useEffect(() => {
    if (holdings.length === 0) {
      setBundle(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPlan(strategy, controller.signal)
      .then((nextBundle) => {
        if (!controller.signal.aborted) {
          setBundle(nextBundle);
          setStrategy(nextBundle.default_strategy);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Could not load rebalance view. Refresh to retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [holdings.length, holdingsKey, fetchPlan]);

  const plan: PortfolioRebalancePlan | null = useMemo(() => {
    if (!bundle) return null;
    return bundle.strategies[strategy] ?? bundle.strategies[bundle.default_strategy] ?? null;
  }, [bundle, strategy]);

  return (
    <div className="flex w-full flex-col gap-7 pb-12">
      <header className="flex flex-col gap-4 border-b border-[#f3f4f6] pb-6">
        <div className="flex flex-col gap-2">
          <Link
            href="/watchlist"
            className="w-fit text-[12px] font-semibold text-[#0052ff] hover:underline"
          >
            ← Radar
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[34px]">
                Rebalance
              </h1>
              {builtAt && relativeTime(builtAt) ? (
                <p className="mt-1 text-[11px] text-[#9ca3af]">Radar · {relativeTime(builtAt)}</p>
              ) : null}
            </div>
            {holdings.length > 0 ? (
              <p className="text-[12px] tabular-nums text-[#6b7280]">
                {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
              </p>
            ) : null}
          </div>
        </div>

        {plan && !error ? (
          <p className="max-w-2xl text-[15px] leading-snug text-[#374151]">{plan.headline}</p>
        ) : null}
      </header>

      {holdings.length === 0 ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 text-center">
          <p className="text-[13px] text-[#6b7280]">
            Mark stocks as holdings on Radar to see your rebalance view.
          </p>
          <Link
            href="/watchlist"
            className="mt-4 inline-flex rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white"
          >
            Go to Radar
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">
                Strategy
              </p>
              <div
                className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="group"
                aria-label="Rebalance strategy"
              >
                {STRATEGY_OPTIONS.map((option) => {
                  const active = strategy === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      title={option.label}
                      disabled={loading && !bundle}
                      onClick={() => setStrategy(option.id)}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-wait active:scale-[0.98] ${
                        active
                          ? "border-[#111111] bg-[#111111] text-white shadow-sm"
                          : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] hover:bg-[#fafafa]"
                      }`}
                    >
                      <span className="whitespace-nowrap sm:hidden">{option.short}</span>
                      <span className="hidden whitespace-nowrap sm:inline">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {plan?.strategy.summary ? (
              <p className="text-[13px] leading-snug text-[#4b5563]">
                {plan.strategy.summary}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
              role="alert"
            >
              <p className="text-[13px] text-[#b91c1c]">{error}</p>
            </div>
          ) : (
            <PortfolioBucketCanvas plan={plan} loading={loading} />
          )}
        </>
      )}
    </div>
  );
}
