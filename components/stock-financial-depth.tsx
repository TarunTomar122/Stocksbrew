"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { metricContextLine } from "@/components/percentile-rail";
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
      <CartesianGrid stroke="var(--outline-variant)" strokeDasharray="3 6" vertical={false} />
      <XAxis dataKey="period" tick={{ fill: "var(--on-surface-variant)", fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis width={62} tickFormatter={(value) => valueLabel(Number(value))} tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip
        formatter={(value, name) => [valueLabel(Number(value)), series.find((item) => item.key === name)?.label ?? String(name)]}
        labelStyle={{ color: "var(--inverse-on-surface)", fontWeight: 700 }}
        contentStyle={{ background: "var(--inverse-surface)", border: 0, color: "var(--inverse-on-surface)", borderRadius: 4, fontSize: 12 }}
        itemStyle={{ color: "var(--inverse-on-surface)" }}
        cursor={{ fill: "color-mix(in srgb, var(--primary) 6%, transparent)" }}
      />
    </>
  );

  return (
    <div className="h-[280px] w-full" role="img" aria-label={`${mode} history chart`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 280 }}>
        {mode === "margins" ? (
          <LineChart {...common}>
            {axes}
            {series.map((item) => <Line key={item.key} dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={3} dot={{ r: 3, fill: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls />)}
          </LineChart>
        ) : (
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
        )}
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

function RatioRow({ label, value, note, guidance }: { label: string; value: string; note: string; guidance: Guidance }) {
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[#eceff3] py-3.5 transition-colors hover:bg-surface-container-low/60 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6b7280]">{note}</p>
        <p className="mt-1.5 text-[10.5px] font-medium leading-relaxed" style={{ color: SIGNAL_COLOR[guidance.signal] }}>
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: SIGNAL_COLOR[guidance.signal] }} />
          {guidance.label} <span className="font-normal text-on-surface-variant">· {guidance.detail}</span>
        </p>
      </div>
      <p className="self-center text-[17px] font-semibold tabular-nums" style={{ color: SIGNAL_COLOR[guidance.signal] }}>{value}</p>
    </div>
  );
}

function MixBreakdown({ title, mix, currency }: { title: string; mix?: StockRevenueMix | null; currency: string }) {
  const items = mix?.items?.filter((item) => finite(item.value) && finite(item.share_pct)) ?? [];
  if (!items.length) return null;
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#111827] pb-2.5">
        <h4 className="text-[15px] font-semibold text-[#111827]">{title}</h4>
        {mix?.period ? <span className="text-[11px] text-[#6b7280]">{mix.period}</span> : null}
      </div>
      <div className="divide-y divide-[#eceff3]">
        {items.map((item, index) => (
          <div key={item.name} className="py-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-[12px] font-medium text-[#374151]">{item.name}</span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#111827]">
                {item.share_pct.toFixed(1)}% <span className="font-normal text-[#9ca3af]">· {compactMoney(item.value, currency)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#eef0f3]">
              <div
                className={title === "Business mix" ? "h-full rounded-full bg-[#7c3aed]" : "h-full rounded-full bg-[#111827]"}
                style={{ width: `${Math.max(2, Math.min(100, item.share_pct))}%`, opacity: Math.max(0.5, 1 - index * 0.09) }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
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
    detail: metricContextLine(metric) || metric.summary || "Compared with sector peers",
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

function TargetRange({ facts, currentPrice, currency }: { facts: StockFacts; currentPrice?: number | null; currency: string }) {
  const target = facts.analyst_trend?.target;
  const low = target?.low;
  const average = target?.average;
  const median = target?.median;
  const high = target?.high;
  if (![low, average, high].every(finite)) return null;
  const averageMove = finite(currentPrice) && currentPrice !== 0
    ? ((average! - currentPrice) / currentPrice) * 100
    : null;
  const averageAbove = finite(averageMove) && averageMove >= 0;

  return (
    <div className="pt-4">
      <div className="grid overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f8fafc] sm:grid-cols-2">
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">Current price</p>
          <p className="mt-1 text-[24px] font-bold tabular-nums text-[#111827]">
            {finite(currentPrice) ? compactMoney(currentPrice, currency) : "-"}
          </p>
        </div>
        <div className="border-t border-[#e5e7eb] p-4 sm:border-l sm:border-t-0 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">Average analyst target</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-[24px] font-bold tabular-nums text-[#111827]">{compactMoney(average, currency)}</p>
            {finite(averageMove) ? (
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: averageAbove ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                {averageAbove ? "+" : ""}{averageMove.toFixed(1)}% from now
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] font-semibold text-[#374151]">Analyst target range</p>
      <div className="mt-2 grid grid-cols-3 divide-x divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white text-[11px]">
        <div className="px-3 py-3"><span className="block text-[#9ca3af]">Low</span><b className="mt-0.5 block tabular-nums">{compactMoney(low, currency)}</b></div>
        <div className="px-3 py-3 text-center"><span className="block text-[#9ca3af]">Median</span><b className="mt-0.5 block tabular-nums">{compactMoney(median, currency)}</b></div>
        <div className="px-3 py-3 text-right"><span className="block text-[#9ca3af]">High</span><b className="mt-0.5 block tabular-nums">{compactMoney(high, currency)}</b></div>
      </div>
    </div>
  );
}

function AnalystTrend({ facts }: { facts: StockFacts }) {
  const trend = facts.analyst_trend?.recommendation_trend ?? [];
  if (!trend.length) return null;
  const data = trend.slice(-6).map((row) => ({
    period: row.period,
    Buy: (row.strong_buy ?? 0) + (row.buy ?? 0),
    Hold: row.hold ?? 0,
    Sell: (row.sell ?? 0) + (row.strong_sell ?? 0),
  }));
  return (
    <div className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-[#374151]">Recommendation trend</p>
        <div className="flex gap-3 text-[10px] text-[#6b7280]">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#10b981]" />Buy</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#d1d5db]" />Hold</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#ef4444]" />Sell</span>
        </div>
      </div>
      <div className="h-28 w-full" role="img" aria-label="Analyst recommendation history">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 112 }}>
          <BarChart data={data} barGap={2} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="period" tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              formatter={(value, name) => [Number(value).toFixed(0), String(name)]}
              contentStyle={{ background: "var(--inverse-surface)", border: 0, color: "var(--inverse-on-surface)", borderRadius: 4, fontSize: 12 }}
              itemStyle={{ color: "var(--inverse-on-surface)" }}
              cursor={{ fill: "color-mix(in srgb, var(--primary) 6%, transparent)" }}
            />
            <Bar dataKey="Buy" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Hold" fill="#d1d5db" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Sell" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StockAnalystDepth({ facts, currentPrice, currency = "$" }: Pick<Props, "facts" | "currentPrice" | "currency">) {
  const hasAnalyst = Boolean(facts?.analyst_trend?.recommendation_trend?.length || facts?.analyst_trend?.target?.average);
  if (!facts || !hasAnalyst) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Wall Street</p>
      <h3 className="border-b border-[#111827] pb-3 text-[19px] font-semibold text-[#111827]">Analyst targets and ratings</h3>
      <TargetRange facts={facts} currentPrice={currentPrice} currency={currency} />
      <AnalystTrend facts={facts} />
    </div>
  );
}

export function StockFinancialDepth({ facts, currency = "$", intelPro, ticker }: Props) {
  const [mode, setMode] = useState<ChartMode>("revenue");
  const history = useMemo(() => [...(facts?.financial_history ?? [])].reverse(), [facts?.financial_history]);
  const series = useMemo(() => chartSeries(mode, history), [history, mode]);
  const periods = history.map((row) => row.period);
  const balance = facts?.balance;
  const valuation = facts?.valuation;
  const quality = facts?.quality;
  const hasBalance = [balance?.cash_and_investments, balance?.total_debt, balance?.net_cash].some(finite);
  const hasRatios = [...Object.values(valuation ?? {}), ...Object.values(quality ?? {})].some(finite);
  const hasMix = Boolean(facts?.business_segments?.items?.length || facts?.geographic_mix?.items?.length);

  if (!history.length && !hasBalance && !hasRatios && !hasMix) return null;

  const maxCapital = Math.max(balance?.cash_and_investments ?? 0, balance?.total_debt ?? 0, 1);
  const sourceSlug = ticker.toLowerCase();
  const sources = new Set((facts?.source_status?.sources ?? []).map((source) => source.toLowerCase()));
  const usesStockAnalysis = sources.has("stockanalysis") || sources.size === 0;
  const usesYahoo = sources.has("yfinance");
  const forwardPeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Forward P/E"])) ?? bandGuidance(valuation?.forward_pe, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Below 20x forward earnings", yellowCopy: "A moderate earnings multiple", redCopy: "Above 35x forward earnings" });
  const priceSalesGuidance = bandGuidance(valuation?.price_to_sales, { green: 3, yellow: 8, lowerIsBetter: true, greenCopy: "Under 3x annual sales", yellowCopy: "Between 3x and 8x sales", redCopy: "Above 8x annual sales" });
  const priceFcfGuidance = bandGuidance(valuation?.price_to_fcf, { green: 20, yellow: 35, lowerIsBetter: true, greenCopy: "Under 20x free cash flow", yellowCopy: "Between 20x and 35x free cash flow", redCopy: "Above 35x free cash flow" });
  const evEbitdaGuidance = bandGuidance(valuation?.ev_to_ebitda, { green: 12, yellow: 22, lowerIsBetter: true, greenCopy: "Under 12x operating cash earnings", yellowCopy: "Between 12x and 22x EBITDA", redCopy: "Above 22x EBITDA" });
  const roicGuidance = bandGuidance(quality?.roic_pct, { green: 15, yellow: 8, greenCopy: "At least 15% return on capital", yellowCopy: "An 8% to 15% return on capital", redCopy: "Below 8% return on capital" });
  const roeGuidance = guidanceFromMetric(matchingMetric(intelPro, ["ROE", "Return on equity"])) ?? bandGuidance(quality?.roe_pct, { green: 20, yellow: 10, greenCopy: "At least 20% return on equity", yellowCopy: "A 10% to 20% return on equity", redCopy: "Below 10% return on equity" });
  const debtEquityGuidance = guidanceFromMetric(matchingMetric(intelPro, ["Debt / Equity", "Debt to equity"])) ?? bandGuidance(quality?.debt_to_equity, { green: 0.5, yellow: 1.5, lowerIsBetter: true, greenCopy: "Debt is under half of equity", yellowCopy: "Manageable balance-sheet leverage", redCopy: "Debt is above 1.5x equity" });
  const currentRatioGuidance = bandGuidance(quality?.current_ratio, { green: 1.5, yellow: 1, greenCopy: "Comfortable short-term liquidity", yellowCopy: "Assets still cover near-term liabilities", redCopy: "Near-term liabilities exceed current assets" });

  return (
    <section id="stock-financial-depth" className="flex flex-col gap-12 border-t border-outline-variant bg-transparent py-7 sm:py-9">
      {history.length <= 1 ? (
        <p className="border-b border-[#eceff3] pb-4 text-[11px] leading-relaxed text-[#6b7280]">
          Five-year statements are not available from our current sources yet. Missing figures stay blank.
        </p>
      ) : null}
      {history.length > 1 ? (
        <section>
          <div className="flex flex-col gap-4 border-b border-[#111827] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c3aed]">Operating record</p>
              <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.025em] text-[#111827]">What the business has actually produced</h3>
            </div>
            <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Financial chart metric">
              {CHART_MODES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={mode === item.key}
                  onClick={() => setMode(item.key)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors ${mode === item.key ? "border-[#7c3aed] text-[#111827]" : "border-transparent text-[#6b7280] hover:text-[#111827]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-5">
            <div className="mb-1 flex flex-wrap gap-x-5 gap-y-2">
              {series.map((item) => <span key={item.label} className="text-[11px] font-medium text-[#6b7280]"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
            </div>
            <FinancialChart periods={periods} series={series} mode={mode} currency={currency} />
          </div>
        </section>
      ) : null}

      {(hasBalance || hasRatios) ? (
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          {hasBalance ? (
            <div>
              <div className="border-b border-[#111827] pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Capital structure</p>
                <h3 className="mt-1 text-[19px] font-semibold text-[#111827]">Cash versus debt</h3>
              </div>
              <div className="space-y-5 pt-5">
                {finite(balance?.cash_and_investments) ? (
                  <div><div className="mb-1.5 flex justify-between text-[12px]"><span>Cash & investments</span><b>{compactMoney(balance.cash_and_investments, currency)}</b></div><div className="h-2 rounded-full bg-[#eef0f3]"><div className="h-full rounded-full bg-[#10b981]" style={{ width: `${balance.cash_and_investments / maxCapital * 100}%` }} /></div></div>
                ) : null}
                {finite(balance?.total_debt) ? (
                  <div><div className="mb-1.5 flex justify-between text-[12px]"><span>Total debt</span><b>{compactMoney(balance.total_debt, currency)}</b></div><div className="h-2 rounded-full bg-[#eef0f3]"><div className="h-full rounded-full bg-[#ef4444]" style={{ width: `${balance.total_debt / maxCapital * 100}%` }} /></div></div>
                ) : null}
                {finite(balance?.net_cash) ? <div className="flex items-baseline justify-between border-t border-[#eceff3] pt-4"><span className="text-[12px] text-[#6b7280]">Net cash after debt</span><b className={balance.net_cash >= 0 ? "text-[20px] text-[#10b981]" : "text-[20px] text-[#ef4444]"}>{compactMoney(balance.net_cash, currency)}</b></div> : null}
              </div>
            </div>
          ) : null}
          {hasRatios ? (
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <div className="border-b border-[#111827] pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Valuation</p><h3 className="mt-1 text-[19px] font-semibold text-[#111827]">What the market charges</h3></div>
                <RatioRow label="Forward P/E" value={ratio(valuation?.forward_pe)} note="Price against expected earnings" guidance={forwardPeGuidance} />
                <RatioRow label="Price / sales" value={ratio(valuation?.price_to_sales)} note="Value assigned to each sales dollar" guidance={priceSalesGuidance} />
                <RatioRow label="Price / FCF" value={ratio(valuation?.price_to_fcf)} note="Price against free cash generation" guidance={priceFcfGuidance} />
                <RatioRow label="EV / EBITDA" value={ratio(valuation?.ev_to_ebitda)} note="Operating value including debt" guidance={evEbitdaGuidance} />
              </div>
              <div>
                <div className="border-b border-[#111827] pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Quality</p><h3 className="mt-1 text-[19px] font-semibold text-[#111827]">How efficiently it compounds</h3></div>
                <RatioRow label="ROIC" value={pct(quality?.roic_pct)} note="Return earned on invested capital" guidance={roicGuidance} />
                <RatioRow label="ROE" value={pct(quality?.roe_pct)} note="Profit generated from shareholder equity" guidance={roeGuidance} />
                <RatioRow label="Debt / equity" value={ratio(quality?.debt_to_equity)} note="Balance-sheet leverage" guidance={debtEquityGuidance} />
                <RatioRow label="Current ratio" value={ratio(quality?.current_ratio)} note="Short-term assets against liabilities" guidance={currentRatioGuidance} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasMix ? <section className="grid gap-10 lg:grid-cols-2 lg:gap-14"><MixBreakdown title="Business mix" mix={facts?.business_segments} currency={currency} /><MixBreakdown title="Geographic mix" mix={facts?.geographic_mix} currency={currency} /></section> : null}

      <p className="border-t border-[#eceff3] pt-4 text-[10px] leading-relaxed text-[#9ca3af]">
        Selected financial data sourced from{" "}
        {usesStockAnalysis ? (
          <a className="underline decoration-[#c4b5fd] underline-offset-2 hover:text-[#6d28d9]" href={`https://stockanalysis.com/stocks/${sourceSlug}/`} target="_blank" rel="noreferrer">StockAnalysis</a>
        ) : null}
        {usesStockAnalysis && usesYahoo ? " and " : null}
        {usesYahoo ? (
          <a className="underline decoration-[#c4b5fd] underline-offset-2 hover:text-[#6d28d9]" href={`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/financials/`} target="_blank" rel="noreferrer">Yahoo Finance</a>
        ) : null}
        {" "}and refreshed weekly. Figures may be delayed and are for research context, not investment advice.
      </p>
    </section>
  );
}
