"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { metricRelativeTier } from "@/components/percentile-rail";
import type { StockFacts, StockRevenueMix } from "@/lib/stock";
import type { StockIntelMetric, StockIntelPro, StockIntelSignal } from "@/lib/types";

type Props = {
  facts: StockFacts | null;
  currentPrice?: number | null;
  currency?: string;
  intelPro?: StockIntelPro | null;
  ticker: string;
};

type ChartMode = "revenue" | "profit" | "fcf" | "margins";
type Series = { key: string; label: string; color: string; values: Array<number | null> };
type Guidance = { label: string; detail: string; signal: StockIntelSignal };

const CHART_MODES: Array<{ key: ChartMode; label: string }> = [
  { key: "revenue", label: "Revenue" },
  { key: "profit", label: "Profit" },
  { key: "fcf", label: "Free cash flow" },
  { key: "margins", label: "Margins" },
];

// Financial measures are separate categories, so use distinct hues instead of
// an ordered single-color scale. Red stays reserved for values below zero.
const FINANCIAL_CHART_COLORS = {
  revenue: "#2563eb",
  gross: "#2563eb",
  operating: "#d97706",
  net: "#059669",
  negative: "#dc2626",
} as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compactMoney(value?: number | null, currency = "$"): string {
  if (!finite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${currency}${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${currency}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`;
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function ratio(value?: number | null, suffix = "x"): string {
  return finite(value) ? `${value.toFixed(2)}${suffix}` : "-";
}

function pct(value?: number | null): string {
  return finite(value) ? `${value.toFixed(1)}%` : "-";
}

function chartSeries(mode: ChartMode, history: NonNullable<StockFacts["financial_history"]>): Series[] {
  if (mode === "revenue") {
    return [{ key: "revenue", label: "Revenue", color: FINANCIAL_CHART_COLORS.revenue, values: history.map((row) => row.revenue ?? null) }];
  }
  if (mode === "profit") {
    return [
      { key: "grossProfit", label: "Gross profit", color: FINANCIAL_CHART_COLORS.gross, values: history.map((row) => row.gross_profit ?? null) },
      { key: "operatingIncome", label: "Operating income", color: FINANCIAL_CHART_COLORS.operating, values: history.map((row) => row.operating_income ?? null) },
      { key: "netIncome", label: "Net income", color: FINANCIAL_CHART_COLORS.net, values: history.map((row) => row.net_income ?? null) },
    ];
  }
  if (mode === "fcf") {
    return [{ key: "freeCashFlow", label: "Free cash flow", color: FINANCIAL_CHART_COLORS.net, values: history.map((row) => row.free_cash_flow ?? null) }];
  }
  return [
    { key: "grossMargin", label: "Gross margin", color: FINANCIAL_CHART_COLORS.gross, values: history.map((row) => row.gross_margin_pct ?? null) },
    { key: "operatingMargin", label: "Operating margin", color: FINANCIAL_CHART_COLORS.operating, values: history.map((row) => row.operating_margin_pct ?? null) },
    { key: "profitMargin", label: "Profit margin", color: FINANCIAL_CHART_COLORS.net, values: history.map((row) => row.profit_margin_pct ?? null) },
  ];
}

function FinancialChart({
  periods,
  series,
  mode,
  currency,
}: {
  periods: string[];
  series: Series[];
  mode: ChartMode;
  currency: string;
}) {
  const all = series.flatMap((item) => item.values).filter(finite);
  if (!all.length || periods.length < 2) return null;
  const data = periods.map((period, index) => {
    const row: Record<string, string | number | null> = { period: period.replace("FY ", "") };
    series.forEach((item) => { row[item.key] = item.values[index] ?? null; });
    return row;
  });
  const valueLabel = (value: number) => mode === "margins" ? `${value.toFixed(1)}%` : compactMoney(value, currency);
  const common = {
    data,
    margin: { top: 14, right: 8, bottom: 2, left: 2 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 7" vertical={false} />
      <XAxis dataKey="period" tick={{ fill: "var(--on-surface-variant)", fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis width={62} tickFormatter={(value) => valueLabel(Number(value))} tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip
        formatter={(value, name) => [valueLabel(Number(value)), series.find((item) => item.key === name)?.label ?? String(name)]}
        labelStyle={{ color: "var(--chart-tooltip-text)", fontWeight: 700, fontSize: 13, marginBottom: 4 }}
        contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)", borderRadius: 8, fontSize: 13.5, padding: "10px 12px" }}
        itemStyle={{ color: "var(--chart-tooltip-text)", fontWeight: 500, padding: "2px 0" }}
        cursor={{ fill: "color-mix(in srgb, var(--primary) 6%, transparent)" }}
      />
    </>
  );

  return (
    <div className="h-[280px] w-full" role="img" aria-label={`${mode} history chart`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 280 }}>
        <BarChart {...common} barGap={3}>
          {axes}
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.key} fill={item.color} radius={[3, 3, 0, 0]} maxBarSize={56}>
              {data.map((row, index) => {
                const value = row[item.key];
                const fill = typeof value === "number" && value < 0 ? FINANCIAL_CHART_COLORS.negative : item.color;
                return <Cell key={`${item.key}-${index}`} fill={fill} />;
              })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SIGNAL_COLOR: Record<StockIntelSignal, string> = {
  green: "var(--signal-bullish)",
  yellow: "var(--signal-neutral)",
  red: "var(--signal-bearish)",
  na: "var(--on-surface-variant)",
};

function practicalTakeaway(label: string, signal: StockIntelSignal): string {
  const metric = label.toLowerCase();
  const positive = signal === "green";
  const negative = signal === "red";

  if (metric.includes("forward p/e")) {
    if (positive) return "Investors aren't pricing in much earnings growth, so there's room to be pleasantly surprised.";
    if (negative) return "The price already assumes strong earnings growth that still has to show up.";
    return "The multiple sits in normal territory for a business like this.";
  }
  if (metric.includes("price / sales")) {
    if (positive) return "You're paying a modest amount for each dollar of revenue coming in.";
    if (negative) return "Revenue alone can't justify this price; profits need to catch up fast.";
    return "The price and the top line are roughly in step.";
  }
  if (metric.includes("price / fcf")) {
    if (positive) return "Real cash coming through the door backs up what you're paying.";
    if (negative) return "Cash generation hasn't caught up to the price tag yet.";
    return "Cash flow is keeping pace with the valuation, nothing more.";
  }
  if (metric.includes("ev / ebitda")) {
    if (positive) return "Operating earnings comfortably cover what the market is charging.";
    if (negative) return "The price leans on operating earnings that haven't materialized.";
    return "Operating earnings and price are reasonably matched.";
  }
  if (metric === "roic") {
    if (positive) return "Money put back into the business keeps coming back out as profit, a hallmark of a durable moat.";
    if (negative) return "Capital plowed back into the business isn't earning much for its trouble.";
    return "Capital is earning an unremarkable, middling return.";
  }
  if (metric === "roe") {
    if (positive) return "Shareholder capital is compounding at a rate worth paying attention to.";
    if (negative) return "Shareholders aren't seeing much return on the money tied up in this business.";
    return "Returns to shareholders are steady but nothing special.";
  }
  if (metric.includes("debt")) {
    if (positive) return "Light borrowing means a rough patch wouldn't threaten the balance sheet.";
    if (negative) return "Heavy borrowing means a downturn would hit harder than it otherwise would.";
    return "Leverage runs a bit high, though not alarmingly so.";
  }
  if (metric.includes("current ratio")) {
    if (positive) return "What's on hand comfortably covers the bills due over the next year.";
    if (negative) return "Near-term bills are outrunning what's on hand to pay them.";
    return "Short-term assets and near-term bills are roughly balanced.";
  }
  return "Compared with sector peers where available.";
}

function RatioRow({ label, value, guidance }: { label: string; value: string; guidance: Guidance }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-outline-variant py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-on-surface">{label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
          <span className="font-medium" style={{ color: SIGNAL_COLOR[guidance.signal] }}>{guidance.label}</span>
          {guidance.detail ? <span> · {guidance.detail.replace(/[.]+$/, "")}</span> : null}
        </p>
      </div>
      <p className="self-center font-mono text-[16px] font-medium tabular-nums" style={{ color: SIGNAL_COLOR[guidance.signal] }}>{value}</p>
    </div>
  );
}

function MixBreakdown({ title, mix, currency }: { title: string; mix?: StockRevenueMix | null; currency: string }) {
  const items = mix?.items?.filter((item) => finite(item.value) && finite(item.share_pct)) ?? [];
  if (!items.length) return null;
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-medium text-on-surface">{title}</h4>
        {mix?.period ? <span className="text-[12px] text-on-surface-variant">{mix.period}</span> : null}
      </div>
      <div className="mt-3 divide-y divide-outline-variant">
        {items.map((item, index) => (
          <div key={item.name} className="py-3.5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium text-on-surface">{item.name}</span>
              <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-on-surface">
                {item.share_pct.toFixed(1)}% <span className="text-on-surface-variant">· {compactMoney(item.value, currency)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, Math.min(100, item.share_pct))}%`,
                  opacity: Math.max(0.62, 1 - index * 0.07),
                  background: title === "Business mix" ? "var(--primary)" : "var(--chart-geo)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Third page section: what the business has actually produced over time — revenue/profit/margins history plus business and geographic mix. */
export function StockOperatingRecord({ facts, currency = "$" }: Pick<Props, "facts" | "currency">) {
  const [mode, setMode] = useState<ChartMode>("revenue");
  const history = useMemo(() => [...(facts?.financial_history ?? [])].reverse(), [facts?.financial_history]);
  const series = useMemo(() => chartSeries(mode, history), [history, mode]);
  const periods = history.map((row) => row.period);
  if (history.length < 2) return null;

  return (
    <div className="flex flex-col gap-10">
      {history.length > 1 ? (
        <div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Financial chart metric">
            {CHART_MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={mode === item.key}
                onClick={() => setMode(item.key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                  mode === item.key
                    ? "border-primary text-primary"
                    : "border-outline-variant bg-surface text-on-surface-variant hover:border-on-surface hover:text-on-surface"
                }`}
                style={
                  mode === item.key
                    ? { background: "color-mix(in srgb, var(--primary) 10%, var(--surface))" }
                    : undefined
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <div className="mb-2 flex flex-wrap gap-x-5 gap-y-2">
              {series.map((item) => (
                <span key={item.label} className="text-[12px] font-medium text-on-surface-variant">
                  <i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
            <FinancialChart periods={periods} series={series} mode={mode} currency={currency} />
          </div>
        </div>
      ) : null}

    </div>
  );
}

function normalizedLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchingMetric(intelPro: StockIntelPro | null | undefined, labels: string[]): StockIntelMetric | null {
  const wanted = labels.map(normalizedLabel);
  const metrics = [
    ...(intelPro?.pillars.valuation.metrics ?? []),
    ...(intelPro?.pillars.quality.metrics ?? []),
  ];
  return metrics.find((metric) => wanted.includes(normalizedLabel(metric.label))) ?? null;
}

function guidanceFromMetric(metric: StockIntelMetric | null): Guidance | null {
  if (!metric || metric.signal === "na") return null;
  const labels: Record<Exclude<StockIntelSignal, "na">, string> = {
    green: "Favorable",
    yellow: "Middle ground",
    red: "Needs attention",
  };
  const label = labels[metric.signal];
  const tierText = metricRelativeTier(metric).text;
  const detail = tierText && tierText.toLowerCase() !== label.toLowerCase() ? tierText : metric.summary?.trim();
  // When there's no real number or sentence to show, "Favorable · Favorable"
  // just repeats the label. Bail out so the caller's hand-written bandGuidance
  // copy (real, specific detail) is used instead.
  if (!detail || detail.toLowerCase() === label.toLowerCase()) return null;
  return { label, detail, signal: metric.signal };
}

function bandGuidance(
  value: number | null | undefined,
  bands: { green: number; yellow: number; lowerIsBetter?: boolean; greenCopy: string; yellowCopy: string; redCopy: string },
): Guidance {
  if (!finite(value)) return { label: "No signal", detail: "Not enough data to judge", signal: "na" };
  const lowerIsBetter = bands.lowerIsBetter ?? false;
  const green = lowerIsBetter ? value <= bands.green : value >= bands.green;
  const yellow = lowerIsBetter ? value <= bands.yellow : value >= bands.yellow;
  if (green) return { label: "Strong", detail: bands.greenCopy, signal: "green" };
  if (yellow) return { label: "Reasonable", detail: bands.yellowCopy, signal: "yellow" };
  return { label: lowerIsBetter ? "Rich" : "Weak", detail: bands.redCopy, signal: "red" };
}

type TargetMarker = { label: string; value: number; color: string };

function TargetSlider({ markers, currency }: { markers: TargetMarker[]; currency: string }) {
  // Sort ascending and alternate between two heights so adjacent markers never
  // collide, without the tall staircase four strictly-increasing tiers would need.
  const sorted = [...markers].sort((a, b) => a.value - b.value);
  // Position by rank, not by value: a lone high-side outlier (e.g. one analyst
  // target far above the rest) would otherwise squeeze low/median/current into
  // an unreadable cluster on a linear scale. Even ordinal spacing keeps every
  // label legible; the gradient track still communicates low-to-high direction.
  const step = sorted.length > 1 ? 80 / (sorted.length - 1) : 0;
  const baseGap = 44;
  const tierGap = 34;
  const trackTop = baseGap + tierGap + 50; // extra room for the two-line pill labels

  const barBottom = 4; // px offset of the track from the container floor
  const barCenter = barBottom + 4; // track is 8px tall

  return (
    <div className="mt-4 overflow-x-hidden">
      <div className="relative" style={{ height: trackTop + 12 }}>
        <div
          className="absolute inset-x-0 h-2 rounded-full"
          style={{ bottom: barBottom, background: "linear-gradient(90deg, var(--signal-bullish), var(--signal-neutral), var(--signal-bearish))" }}
        />
        {sorted.map((marker, index) => {
          const pct = 10 + step * index;
          const lineHeight = baseGap + tierGap * (index % 2);
          return (
            <div key={marker.label} className="absolute bottom-0" style={{ left: `${pct}%` }}>
              <div
                className="absolute left-0 -translate-x-1/2 border-l border-dashed"
                style={{ bottom: barCenter, height: lineHeight, borderColor: marker.color, opacity: 0.55 }}
              />
              <div
                className="absolute left-0 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-center sm:px-2.5 sm:py-1.5"
                style={{ bottom: barCenter + lineHeight + 8, background: `color-mix(in srgb, ${marker.color} 12%, var(--surface))` }}
              >
                <p className="text-[9.5px] font-medium leading-tight sm:text-[11px]" style={{ color: marker.color }}>
                  {marker.label}
                </p>
                <p className="font-mono text-[10.5px] font-medium leading-tight tabular-nums sm:text-[12.5px]" style={{ color: marker.color }}>
                  {compactMoney(marker.value, currency)}
                </p>
              </div>
              <span
                className="absolute left-0 -translate-x-1/2 h-2.5 w-2.5 rounded-full border-2 border-surface"
                style={{ bottom: barCenter - 5, background: marker.color }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-on-surface-variant">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function TargetRange({ facts, currentPrice, currency }: { facts: StockFacts; currentPrice?: number | null; currency: string }) {
  const target = facts.analyst_trend?.target;
  const low = target?.low;
  const average = target?.average;
  const median = target?.median;
  const high = target?.high;
  if (![low, average, high].every(finite)) return null;
  const midpoint = finite(median) ? median : average;

  const markers: TargetMarker[] = [
    { label: "Lowest", value: low!, color: "var(--on-surface-variant)" },
    { label: "Highest", value: high!, color: "var(--on-surface-variant)" },
    ...(finite(midpoint) ? [{ label: "Median target", value: midpoint!, color: "var(--primary)" }] : []),
    ...(finite(currentPrice) ? [{ label: "Current price", value: currentPrice!, color: "var(--signal-bullish)" }] : []),
  ];

  return <TargetSlider markers={markers} currency={currency} />;
}

export function StockAnalystDepth({ facts, currentPrice, currency = "$" }: Pick<Props, "facts" | "currentPrice" | "currency">) {
  const hasAnalyst = Boolean(facts?.analyst_trend?.target?.average);
  if (!facts || !hasAnalyst) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-[16px] font-medium text-on-surface">Analyst price targets</h3>
      <div className="mt-6">
        <TargetRange facts={facts} currentPrice={currentPrice} currency={currency} />
      </div>
    </div>
  );
}

export function StockFinancialDepth({ facts, currency = "$", intelPro }: Props) {
  const balance = facts?.balance;
  const valuation = facts?.valuation;
  const quality = facts?.quality;
  const hasBalance = [balance?.cash_and_investments, balance?.total_debt, balance?.net_cash].some(finite);
  const hasRatios = [...Object.values(valuation ?? {}), ...Object.values(quality ?? {})].some(finite);

  if (!hasBalance && !hasRatios) return null;

  const forwardPeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Forward P/E"])) ?? bandGuidance(valuation?.forward_pe, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Cheaper than peers", yellowCopy: "Average valuation", redCopy: "Expensive growth bet" });
  const priceSalesGuidance = bandGuidance(valuation?.price_to_sales, { green: 3, yellow: 8, lowerIsBetter: true, greenCopy: "Low price-to-sales", yellowCopy: "Fair sales multiple", redCopy: "Overpriced by revenue" });
  const priceFcfGuidance = bandGuidance(valuation?.price_to_fcf, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Cash flow supports price", yellowCopy: "Fair cash flow price", redCopy: "Expensive vs. cash flow" });
  const evEbitdaGuidance = bandGuidance(valuation?.ev_to_ebitda, { green: 12, yellow: 22, lowerIsBetter: true, greenCopy: "Earnings support price", yellowCopy: "Moderate earnings multiple", redCopy: "Earnings can't support price" });
  const roicGuidance = bandGuidance(quality?.roic_pct, { green: 15, yellow: 8, greenCopy: "Excellent capital returns", yellowCopy: "Average capital returns", redCopy: "Weak capital efficiency" });
  const roeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["ROE", "Return on equity"])) ?? bandGuidance(quality?.roe_pct, { green: 20, yellow: 10, greenCopy: "Strong shareholder returns", yellowCopy: "Average shareholder returns", redCopy: "Weak shareholder returns" });
  const debtEquityGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Debt / Equity", "Debt to equity"])) ?? bandGuidance(quality?.debt_to_equity, { green: 0.5, yellow: 1.5, lowerIsBetter: true, greenCopy: "Low debt, strong balance", yellowCopy: "Moderate debt levels", redCopy: "Too much debt" });
  const currentRatioGuidance = bandGuidance(quality?.current_ratio, { green: 1.5, yellow: 1, greenCopy: "Good liquidity position", yellowCopy: "Tight cash position", redCopy: "Low cash for bills" });

  const ratios = hasRatios ? [
    { label: "Forward P/E", value: ratio(valuation?.forward_pe), guidance: forwardPeGuidance },
    { label: "Price / sales", value: ratio(valuation?.price_to_sales), guidance: priceSalesGuidance },
    { label: "Price / FCF", value: ratio(valuation?.price_to_fcf), guidance: priceFcfGuidance },
    { label: "EV / EBITDA", value: ratio(valuation?.ev_to_ebitda), guidance: evEbitdaGuidance },
    { label: "ROIC", value: pct(quality?.roic_pct), guidance: roicGuidance },
    { label: "ROE", value: pct(quality?.roe_pct), guidance: roeGuidance },
    { label: "Debt / equity", value: ratio(quality?.debt_to_equity), guidance: debtEquityGuidance },
    { label: "Current ratio", value: ratio(quality?.current_ratio), guidance: currentRatioGuidance },
  ] : [];

  const goodThings = ratios.filter((r) => r.guidance.signal === "green");
  const badThings = ratios.filter((r) => r.guidance.signal === "red");

  return (
    <section id="stock-financial-depth" className="flex flex-col gap-12 bg-transparent">
      {hasRatios ? (
        <section>
          <div className="grid gap-8 sm:grid-cols-2">
            {goodThings.length > 0 && (
              <div>
                <h3 className="border-b border-emerald-600/30 pb-2.5 text-[16px] font-medium text-on-surface">✓ Good things about the company</h3>
                {goodThings.map((r) => (
                  <RatioRow key={r.label} label={r.label} value={r.value} guidance={r.guidance} />
                ))}
              </div>
            )}
            {badThings.length > 0 && (
              <div>
                <h3 className="border-b border-red-600/30 pb-2.5 text-[16px] font-medium text-on-surface">⚠ Things to watch</h3>
                {badThings.map((r) => (
                  <RatioRow key={r.label} label={r.label} value={r.value} guidance={r.guidance} />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

    </section>
  );
}
