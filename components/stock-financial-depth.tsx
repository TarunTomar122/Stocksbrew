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
  const hasMix = Boolean(facts?.business_segments?.items?.length);

  if (history.length < 2 && !hasMix) return null;

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

      {hasMix ? (
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-14">
          <MixBreakdown title="Business mix" mix={facts?.business_segments} currency={currency} />
          <MixBreakdown title="Geographic mix" mix={facts?.geographic_mix} currency={currency} />
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
  return {
    label: labels[metric.signal],
    detail: metricRelativeTier(metric).text || metric.summary || "Compared with sector peers",
    signal: metric.signal,
  };
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

  const forwardPeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Forward P/E"])) ?? bandGuidance(valuation?.forward_pe, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Priced cheaper than most earnings-growth stocks", yellowCopy: "Priced about average for its growth rate", redCopy: "Priced for strong growth that still has to show up" });
  const priceSalesGuidance = bandGuidance(valuation?.price_to_sales, { green: 3, yellow: 8, lowerIsBetter: true, greenCopy: "Priced modestly against the revenue it brings in", yellowCopy: "Priced reasonably against its revenue", redCopy: "Priced well above what its revenue alone supports" });
  const priceFcfGuidance = bandGuidance(valuation?.price_to_fcf, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Priced well within what its cash flow supports", yellowCopy: "Priced a bit rich against its cash flow", redCopy: "Priced far above what its cash flow currently supports" });
  const evEbitdaGuidance = bandGuidance(valuation?.ev_to_ebitda, { green: 12, yellow: 22, lowerIsBetter: true, greenCopy: "Operating earnings comfortably support this price", yellowCopy: "Operating earnings make this price a stretch but plausible", redCopy: "Operating earnings don't yet support this price" });
  const roicGuidance = bandGuidance(quality?.roic_pct, { green: 15, yellow: 8, greenCopy: "Comfortably clears the bar for efficient capital use", yellowCopy: "A middling return on the capital it puts to work", redCopy: "Struggling to earn much on the capital it uses" });
  const roeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["ROE", "Return on equity"])) ?? bandGuidance(quality?.roe_pct, { green: 20, yellow: 10, greenCopy: "Strong returns on shareholders' money", yellowCopy: "Average returns on shareholders' money", redCopy: "Weak returns on shareholders' money" });
  const debtEquityGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Debt / Equity", "Debt to equity"])) ?? bandGuidance(quality?.debt_to_equity, { green: 0.5, yellow: 1.5, lowerIsBetter: true, greenCopy: "Very little debt relative to equity", yellowCopy: "A moderate amount of debt to manage", redCopy: "Carrying more debt than equity can comfortably absorb" });
  const currentRatioGuidance = bandGuidance(quality?.current_ratio, { green: 1.5, yellow: 1, greenCopy: "Comfortable room to cover bills due within a year", yellowCopy: "Just enough on hand to cover near-term bills", redCopy: "Not enough on hand to cover near-term bills" });
  const ratioPoints = [
    { label: "Forward P/E", guidance: forwardPeGuidance },
    { label: "Price / sales", guidance: priceSalesGuidance },
    { label: "Price / FCF", guidance: priceFcfGuidance },
    { label: "EV / EBITDA", guidance: evEbitdaGuidance },
    { label: "ROIC", guidance: roicGuidance },
    { label: "ROE", guidance: roeGuidance },
    { label: "Debt / equity", guidance: debtEquityGuidance },
    { label: "Current ratio", guidance: currentRatioGuidance },
  ];
  const pointCopy = ({ label, guidance }: { label: string; guidance: Guidance }) =>
    `${label}: ${practicalTakeaway(label, guidance.signal)}`;
  const netCashPoint = finite(balance?.net_cash)
    ? {
        signal: balance.net_cash >= 0 ? "green" : "red" as StockIntelSignal,
        text: balance.net_cash >= 0
          ? `Cash exceeds debt by ${compactMoney(balance.net_cash, currency)}, leaving a net cash buffer, a good sign.`
          : `Debt exceeds cash by ${compactMoney(Math.abs(balance.net_cash), currency)}, increasing balance-sheet pressure, a warning sign.`,
      }
    : null;
  const goodPoints = [
    ...(netCashPoint?.signal === "green" ? [netCashPoint.text] : []),
    ...ratioPoints.filter((item) => item.guidance.signal === "green").map(pointCopy),
  ].slice(0, 2);
  const badPoints = [
    ...(netCashPoint?.signal === "red" ? [netCashPoint.text] : []),
    ...ratioPoints.filter((item) => item.guidance.signal === "red").map(pointCopy),
  ].slice(0, 2);

  return (
    <section id="stock-financial-depth" className="flex flex-col gap-12 bg-transparent">
      {(goodPoints.length > 0 || badPoints.length > 0) ? (
        <section className="grid gap-6 sm:grid-cols-2">
          {goodPoints.length ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low/50 p-5 sm:p-6">
              <h3 className="text-[17px] font-medium text-on-surface">What&apos;s working</h3>
              <ul className="mt-4 space-y-4 border-t border-outline-variant pt-4">
                {goodPoints.map((text, index) => (
                  <li key={index} className="flex gap-2.5 text-[15px] leading-relaxed text-on-surface text-pretty">
                    <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SIGNAL_COLOR.green }} />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {badPoints.length ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low/50 p-5 sm:p-6">
              <h3 className="text-[17px] font-medium text-on-surface">What to watch</h3>
              <ul className="mt-4 space-y-4 border-t border-outline-variant pt-4">
                {badPoints.map((text, index) => (
                  <li key={index} className="flex gap-2.5 text-[15px] leading-relaxed text-on-surface text-pretty">
                    <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SIGNAL_COLOR.red }} />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasRatios ? (
        <section>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="border-b border-outline-variant pb-2.5 text-[16px] font-medium text-on-surface">What the market charges</h3>
              <RatioRow label="Forward P/E" value={ratio(valuation?.forward_pe)} guidance={forwardPeGuidance} />
              <RatioRow label="Price / sales" value={ratio(valuation?.price_to_sales)} guidance={priceSalesGuidance} />
              <RatioRow label="Price / FCF" value={ratio(valuation?.price_to_fcf)} guidance={priceFcfGuidance} />
              <RatioRow label="EV / EBITDA" value={ratio(valuation?.ev_to_ebitda)} guidance={evEbitdaGuidance} />
            </div>
            <div>
              <h3 className="border-b border-outline-variant pb-2.5 text-[16px] font-medium text-on-surface">How efficiently it compounds</h3>
              <RatioRow label="ROIC" value={pct(quality?.roic_pct)} guidance={roicGuidance} />
              <RatioRow label="ROE" value={pct(quality?.roe_pct)} guidance={roeGuidance} />
              <RatioRow label="Debt / equity" value={ratio(quality?.debt_to_equity)} guidance={debtEquityGuidance} />
              <RatioRow label="Current ratio" value={ratio(quality?.current_ratio)} guidance={currentRatioGuidance} />
            </div>
          </div>
        </section>
      ) : null}

    </section>
  );
}
