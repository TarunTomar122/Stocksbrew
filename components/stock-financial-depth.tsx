"use client";

import { useMemo, useState } from "react";

import type { StockFacts, StockRevenueMix } from "@/lib/stock";

type Props = {
  facts: StockFacts | null;
  currentPrice?: number | null;
  currency?: string;
  ticker: string;
};

type ChartMode = "revenue" | "profit" | "fcf" | "margins";
type Series = { label: string; color: string; values: Array<number | null> };

const CHART_MODES: Array<{ key: ChartMode; label: string }> = [
  { key: "revenue", label: "Revenue" },
  { key: "profit", label: "Profit" },
  { key: "fcf", label: "Free cash flow" },
  { key: "margins", label: "Margins" },
];

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
    return [{ label: "Revenue", color: "#7c3aed", values: history.map((row) => row.revenue ?? null) }];
  }
  if (mode === "profit") {
    return [
      { label: "Gross profit", color: "#7c3aed", values: history.map((row) => row.gross_profit ?? null) },
      { label: "Operating income", color: "#111827", values: history.map((row) => row.operating_income ?? null) },
      { label: "Net income", color: "#10b981", values: history.map((row) => row.net_income ?? null) },
    ];
  }
  if (mode === "fcf") {
    return [{ label: "Free cash flow", color: "#7c3aed", values: history.map((row) => row.free_cash_flow ?? null) }];
  }
  return [
    { label: "Gross margin", color: "#7c3aed", values: history.map((row) => row.gross_margin_pct ?? null) },
    { label: "Operating margin", color: "#111827", values: history.map((row) => row.operating_margin_pct ?? null) },
    { label: "Profit margin", color: "#10b981", values: history.map((row) => row.profit_margin_pct ?? null) },
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
  const width = 760;
  const height = 280;
  const pad = { left: 66, right: 18, top: 20, bottom: 44 };
  const all = series.flatMap((item) => item.values).filter(finite);
  if (!all.length || periods.length < 2) return null;
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const min = rawMin < 0 ? rawMin * 1.08 : 0;
  const max = rawMax === min ? rawMax + 1 : rawMax * 1.08;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (index / Math.max(1, periods.length - 1)) * plotW;
  const y = (value: number) => pad.top + ((max - value) / (max - min)) * plotH;
  const valueLabel = (value: number) => mode === "margins" ? `${value.toFixed(0)}%` : compactMoney(value, currency);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[620px] w-full"
        role="img"
        aria-label={`${mode} history chart`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = max - (max - min) * tick;
          const cy = pad.top + plotH * tick;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={cy} y2={cy} stroke="#e5e7eb" strokeDasharray="3 5" />
              <text x={pad.left - 10} y={cy + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                {valueLabel(value)}
              </text>
            </g>
          );
        })}
        {periods.map((period, index) => (
          <text key={period} x={x(index)} y={height - 14} textAnchor="middle" fontSize="11" fill="#6b7280">
            {period.replace("FY ", "")}
          </text>
        ))}
        {series.map((item) => {
          const points = item.values
            .map((value, index) => finite(value) ? `${x(index)},${y(value)}` : null)
            .filter(Boolean)
            .join(" ");
          return (
            <g key={item.label}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {item.values.map((value, index) => finite(value) ? (
                <circle key={`${item.label}-${periods[index]}`} cx={x(index)} cy={y(value)} r="4" fill="#ffffff" stroke={item.color} strokeWidth="2.5">
                  <title>{`${item.label}, ${periods[index]}: ${valueLabel(value)}`}</title>
                </circle>
              ) : null)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RatioRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[#eceff3] py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6b7280]">{note}</p>
      </div>
      <p className="self-center text-[17px] font-semibold tabular-nums text-[#111827]">{value}</p>
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

function TargetRange({ facts, currentPrice, currency }: { facts: StockFacts; currentPrice?: number | null; currency: string }) {
  const target = facts.analyst_trend?.target;
  const low = target?.low;
  const average = target?.average;
  const median = target?.median;
  const high = target?.high;
  if (![low, average, high].every(finite)) return null;
  const values = [low!, average!, high!, currentPrice].filter(finite);
  const floor = Math.min(...values);
  const ceiling = Math.max(...values);
  const span = Math.max(1, ceiling - floor);
  const position = (value: number) => ((value - floor) / span) * 100;

  return (
    <div className="pt-2">
      <div className="relative h-12">
        <div className="absolute left-0 right-0 top-5 h-1 rounded-full bg-[#e5e7eb]" />
        <div className="absolute top-5 h-1 rounded-full bg-[#ddd6fe]" style={{ left: `${position(low!)}%`, right: `${100 - position(high!)}%` }} />
        {finite(currentPrice) ? (
          <div className="absolute top-1 -translate-x-1/2" style={{ left: `${position(currentPrice)}%` }}>
            <span className="block whitespace-nowrap rounded bg-[#111827] px-2 py-1 text-[10px] font-semibold text-white">Now {compactMoney(currentPrice, currency)}</span>
            <span className="mx-auto block h-5 w-px bg-[#111827]" />
          </div>
        ) : null}
        <span className="absolute top-3 h-5 w-0.5 -translate-x-1/2 bg-[#7c3aed]" style={{ left: `${position(average!)}%` }} />
      </div>
      <div className="grid grid-cols-4 gap-3 text-[11px]">
        <div><span className="block text-[#9ca3af]">Low</span><b>{compactMoney(low, currency)}</b></div>
        <div><span className="block text-[#9ca3af]">Average</span><b className="text-[#7c3aed]">{compactMoney(average, currency)}</b></div>
        <div><span className="block text-[#9ca3af]">Median</span><b>{compactMoney(median, currency)}</b></div>
        <div className="text-right"><span className="block text-[#9ca3af]">High</span><b>{compactMoney(high, currency)}</b></div>
      </div>
    </div>
  );
}

function AnalystTrend({ facts }: { facts: StockFacts }) {
  const trend = facts.analyst_trend?.recommendation_trend ?? [];
  if (!trend.length) return null;
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
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
        {trend.slice(-6).map((row) => {
          const buy = (row.strong_buy ?? 0) + (row.buy ?? 0);
          const hold = row.hold ?? 0;
          const sell = (row.sell ?? 0) + (row.strong_sell ?? 0);
          const total = Math.max(1, buy + hold + sell);
          return (
            <div key={row.period}>
              <div className="flex h-20 items-end gap-0.5" aria-label={`${row.period}: ${buy} buy, ${hold} hold, ${sell} sell`}>
                <div className="w-1/3 rounded-t-sm bg-[#10b981]" style={{ height: `${Math.max(3, buy / total * 100)}%` }} />
                <div className="w-1/3 rounded-t-sm bg-[#d1d5db]" style={{ height: `${Math.max(3, hold / total * 100)}%` }} />
                <div className="w-1/3 rounded-t-sm bg-[#ef4444]" style={{ height: `${Math.max(3, sell / total * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-center text-[10px] font-medium text-[#6b7280]">{row.period}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StockFinancialDepth({ facts, currentPrice, currency = "$", ticker }: Props) {
  const [mode, setMode] = useState<ChartMode>("revenue");
  const history = useMemo(() => [...(facts?.financial_history ?? [])].reverse(), [facts?.financial_history]);
  const series = useMemo(() => chartSeries(mode, history), [history, mode]);
  const periods = history.map((row) => row.period);
  const balance = facts?.balance;
  const valuation = facts?.valuation;
  const quality = facts?.quality;
  const dividends = facts?.dividends;
  const hasBalance = [balance?.cash_and_investments, balance?.total_debt, balance?.net_cash].some(finite);
  const hasRatios = [...Object.values(valuation ?? {}), ...Object.values(quality ?? {})].some(finite);
  const hasDividends = finite(dividends?.annual_dividend) || Boolean(dividends?.history?.length);
  const hasMix = Boolean(facts?.business_segments?.items?.length || facts?.geographic_mix?.items?.length);
  const hasAnalyst = Boolean(facts?.analyst_trend?.recommendation_trend?.length || facts?.analyst_trend?.target?.average);

  if (!history.length && !hasBalance && !hasRatios && !hasDividends && !hasMix && !hasAnalyst) return null;

  const maxCapital = Math.max(balance?.cash_and_investments ?? 0, balance?.total_debt ?? 0, 1);
  const sourceSlug = ticker.toLowerCase().replace(".", "-");

  return (
    <section id="stock-financial-depth" className="flex flex-col gap-12 border-t border-outline-variant bg-transparent py-7 sm:py-9">
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
                <RatioRow label="Forward P/E" value={ratio(valuation?.forward_pe)} note="Price against expected earnings" />
                <RatioRow label="Price / sales" value={ratio(valuation?.price_to_sales)} note="Value assigned to each sales dollar" />
                <RatioRow label="Price / FCF" value={ratio(valuation?.price_to_fcf)} note="Price against free cash generation" />
                <RatioRow label="EV / EBITDA" value={ratio(valuation?.ev_to_ebitda)} note="Operating value including debt" />
              </div>
              <div>
                <div className="border-b border-[#111827] pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Quality</p><h3 className="mt-1 text-[19px] font-semibold text-[#111827]">How efficiently it compounds</h3></div>
                <RatioRow label="ROIC" value={pct(quality?.roic_pct)} note="Return earned on invested capital" />
                <RatioRow label="ROE" value={pct(quality?.roe_pct)} note="Profit generated from shareholder equity" />
                <RatioRow label="Debt / equity" value={ratio(quality?.debt_to_equity)} note="Balance-sheet leverage" />
                <RatioRow label="Current ratio" value={ratio(quality?.current_ratio)} note="Short-term assets against liabilities" />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasDividends ? (
        <section>
          <div className="border-b border-[#111827] pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Capital return</p><h3 className="mt-1 text-[19px] font-semibold text-[#111827]">Dividend record</h3></div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 py-5 sm:grid-cols-4 lg:grid-cols-7">
            {finite(dividends?.annual_dividend) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Annual</span><b className="mt-1 block text-[17px]">{compactMoney(dividends.annual_dividend, currency)}</b></div> : null}
            {finite(dividends?.yield_pct) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Yield</span><b className="mt-1 block text-[17px]">{pct(dividends.yield_pct)}</b></div> : null}
            {finite(dividends?.payout_ratio_pct) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Payout</span><b className="mt-1 block text-[17px]">{pct(dividends.payout_ratio_pct)}</b></div> : null}
            {finite(dividends?.growth_pct) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Growth</span><b className="mt-1 block text-[17px]">{pct(dividends.growth_pct)}</b></div> : null}
            {finite(dividends?.growth_years) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Growth streak</span><b className="mt-1 block text-[17px]">{dividends.growth_years.toFixed(0)}y</b></div> : null}
            {finite(dividends?.buyback_yield_pct) ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Buyback yield</span><b className="mt-1 block text-[17px]">{pct(dividends.buyback_yield_pct)}</b></div> : null}
            {dividends?.next_ex_dividend_date ? <div><span className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Next ex-date</span><b className="mt-1 block text-[14px]">{dividends.next_ex_dividend_date}</b></div> : null}
          </div>
          {dividends?.history?.length ? (
            <div className="overflow-x-auto border-y border-[#eceff3]">
              <table className="w-full min-w-[620px] text-left text-[12px]"><thead className="text-[10px] uppercase tracking-[0.08em] text-[#6b7280]"><tr><th className="py-2.5 pr-4">Ex-date</th><th className="py-2.5 pr-4">Amount</th><th className="py-2.5 pr-4">Record date</th><th className="py-2.5">Paid</th></tr></thead><tbody className="divide-y divide-[#f0f1f3]">{dividends.history.slice(0, 8).map((row) => <tr key={`${row.ex_date}-${row.amount}`}><td className="py-3 pr-4 font-medium">{row.ex_date}</td><td className="py-3 pr-4 font-semibold tabular-nums">{compactMoney(row.amount, currency)}</td><td className="py-3 pr-4 text-[#6b7280]">{row.record_date ?? "-"}</td><td className="py-3 text-[#6b7280]">{row.pay_date ?? "-"}</td></tr>)}</tbody></table>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasMix ? <section className="grid gap-10 lg:grid-cols-2 lg:gap-14"><MixBreakdown title="Business mix" mix={facts?.business_segments} currency={currency} /><MixBreakdown title="Geographic mix" mix={facts?.geographic_mix} currency={currency} /></section> : null}

      {hasAnalyst && facts ? (
        <section>
          <div className="border-b border-[#111827] pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">Wall Street</p><h3 className="mt-1 text-[19px] font-semibold text-[#111827]">Target range and conviction</h3></div>
          <TargetRange facts={facts} currentPrice={currentPrice} currency={currency} />
          <AnalystTrend facts={facts} />
        </section>
      ) : null}

      <p className="border-t border-[#eceff3] pt-4 text-[10px] leading-relaxed text-[#9ca3af]">
        Selected financial data sourced from <a className="underline decoration-[#c4b5fd] underline-offset-2 hover:text-[#6d28d9]" href={`https://stockanalysis.com/stocks/${sourceSlug}/`} target="_blank" rel="noreferrer">StockAnalysis</a> and refreshed weekly. Figures may be delayed and are for research context, not investment advice.
      </p>
    </section>
  );
}
