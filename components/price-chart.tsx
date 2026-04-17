"use client";

import { useEffect, useMemo, useState } from "react";

import type { YahooChart, YahooRange } from "@/lib/yahoo-finance";

import { DashboardCard, formatCurrency, pctClass, formatPct } from "./primitives";
import { PillRow } from "./pill-row";
import { Sparkline } from "./sparkline";

type Props = {
  symbol: string;
  market: "us" | "india";
  currency: string;
  /** Chart payload for the default range, pre-fetched on the server. */
  initialChart: YahooChart | null;
  /** Fallback close series if Yahoo is unreachable. */
  fallbackCloses: number[];
  initialRange?: YahooRange;
};

/** Count back N trading days (Mon–Fri) from today and return a short date string. */
function tradingDaysAgo(n: number): string {
  const d = new Date();
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const RANGES: Array<{ id: YahooRange; label: string }> = [
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "1Y", label: "1Y" },
  { id: "5Y", label: "5Y" },
  { id: "MAX", label: "Max" },
];

export function PriceChart({
  symbol,
  market,
  currency,
  initialChart,
  fallbackCloses,
  initialRange = "1Y",
}: Props) {
  const [range, setRange] = useState<YahooRange>(initialRange);
  const [charts, setCharts] = useState<Partial<Record<YahooRange, YahooChart | null>>>(
    () => (initialChart ? { [initialRange]: initialChart } : {}),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (charts[range] !== undefined) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ symbol, market, range });
    fetch(`/api/chart?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setCharts((prev) => ({ ...prev, [range]: (data as YahooChart | null) ?? null }));
      })
      .catch(() => {
        if (!cancelled) setCharts((prev) => ({ ...prev, [range]: null }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, symbol, market, charts]);

  const activeChart = charts[range];

  const { values, tone, rangeLow, rangeHigh, first, last, pct, hasRealData } = useMemo(() => {
    if (activeChart && activeChart.points.length >= 2) {
      const closes = activeChart.points.map((p) => p.close);
      const first = closes[0];
      const last = closes[closes.length - 1];
      const pct = first > 0 ? ((last - first) / first) * 100 : 0;
      return {
        values: closes,
        tone: pct > 0 ? ("green" as const) : pct < 0 ? ("red" as const) : ("neutral" as const),
        rangeLow: Math.min(...closes),
        rangeHigh: Math.max(...closes),
        first,
        last,
        pct,
        hasRealData: true,
      };
    }
    if (fallbackCloses.length >= 2) {
      const first = fallbackCloses[0];
      const last = fallbackCloses[fallbackCloses.length - 1];
      const pct = first > 0 ? ((last - first) / first) * 100 : 0;
      return {
        values: fallbackCloses,
        tone: pct > 0 ? ("green" as const) : pct < 0 ? ("red" as const) : ("neutral" as const),
        rangeLow: Math.min(...fallbackCloses),
        rangeHigh: Math.max(...fallbackCloses),
        first,
        last,
        pct,
        hasRealData: false,
      };
    }
    return {
      values: [],
      tone: "neutral" as const,
      rangeLow: 0,
      rangeHigh: 0,
      first: 0,
      last: 0,
      pct: 0,
      hasRealData: false,
    };
  }, [activeChart, fallbackCloses]);

  const fallbackStartDate = !hasRealData && fallbackCloses.length >= 2
    ? tradingDaysAgo(fallbackCloses.length - 1)
    : null;
  const fallbackEndDate = !hasRealData && fallbackCloses.length >= 2
    ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <DashboardCard
      title="Price chart"
      eyebrow={
        hasRealData
          ? `${range} · Yahoo Finance`
          : fallbackStartDate
          ? `${fallbackCloses.length} daily closes · ${fallbackStartDate} – ${fallbackEndDate}`
          : "Historical closes · live chart unavailable"
      }
      rightSlot={
        hasRealData ? (
          <PillRow
            pills={RANGES.map((r) => ({ id: r.id, label: r.label }))}
            activeId={range}
            onSelect={(id) => setRange(id as YahooRange)}
            size="sm"
          />
        ) : (
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <span
                key={r.id}
                className="rounded-[4px] px-2 py-0.5 text-[10px] font-medium text-[#555E75] opacity-40"
              >
                {r.label}
              </span>
            ))}
          </div>
        )
      }
    >
      {values.length < 2 ? (
        <div className="py-12 text-center text-[13px] text-[#8C94A8]">
          {loading ? "Loading chart…" : "No chart data available for this range."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="font-mono text-[24px] font-semibold tabular-nums text-[#F5F6F8]">
              {formatCurrency(last, currency)}
            </span>
            <span className={`font-mono text-[14px] tabular-nums ${pctClass(pct)}`}>
              {formatPct(pct)} over {RANGES.find((r) => r.id === range)?.label}
            </span>
            {loading && (
              <span className="text-[11px] text-[#8C94A8]">refreshing…</span>
            )}
          </div>

          <div className="relative h-[220px]">
            <Sparkline values={values} tone={tone} height={220} strokeWidth={2} />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#8C94A8]">
            <span>
              Low:{" "}
              <span className="font-mono tabular-nums text-[#F5F6F8]">
                {formatCurrency(rangeLow, currency)}
              </span>
            </span>
            <span>
              Start:{" "}
              <span className="font-mono tabular-nums text-[#F5F6F8]">
                {formatCurrency(first, currency)}
              </span>
            </span>
            <span>
              High:{" "}
              <span className="font-mono tabular-nums text-[#F5F6F8]">
                {formatCurrency(rangeHigh, currency)}
              </span>
            </span>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
