import * as React from "react";

import { day, money, signedPct, times } from "@/lib/research/format";
import type { ResearchCharts } from "@/lib/research/types";

/**
 * The small honest charts in a research report: inline SVG, no chart library.
 * Every chart is drawn from evidence our code read (never from model text),
 * has one axis, starts bars at zero, labels values directly in ink and gives
 * every mark a hover title. Copper is the stock itself; green and red only
 * mean up and down.
 */

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;
const UP = "var(--signal-bullish)";
const DOWN = "var(--signal-bearish)";
const SELF = "var(--oa-primary)";
const OTHER = "var(--oa-muted-fg)";

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg">{children}</p>;
}

/* ── a year of price, against the S&P 500 ───────────────────────────────── */

/** Drawn twice: a phone-sized frame below `sm` and a wide one above, so the labels stay readable on both. */
export function PriceChart({ chart, ticker }: { chart: NonNullable<ResearchCharts["price"]>; ticker: string }) {
  return (
    <>
      <div className="sm:hidden">
        <PriceFrame chart={chart} ticker={ticker} W={360} H={210} />
      </div>
      <div className="max-sm:hidden">
        <PriceFrame chart={chart} ticker={ticker} W={640} H={190} />
      </div>
    </>
  );
}

function PriceFrame({ chart, ticker, W, H }: { chart: NonNullable<ResearchCharts["price"]>; ticker: string; W: number; H: number }) {
  const pad = { l: 44, r: 64, t: 10, b: 22 };
  const base = chart.points[0]!.close;
  const stock = chart.points.map((point) => ({ date: point.date, pct: (point.close / base - 1) * 100 }));
  const benchBase = chart.benchmark?.[0]?.close ?? null;
  const bench = chart.benchmark && benchBase ? chart.benchmark.map((point) => ({ date: point.date, pct: (point.close / benchBase - 1) * 100 })) : [];
  const all = [...stock, ...bench].map((point) => point.pct);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const first = Date.parse(stock[0]!.date);
  const last = Date.parse(stock[stock.length - 1]!.date);
  const x = (date: string) => pad.l + ((Date.parse(date) - first) / Math.max(1, last - first)) * (W - pad.l - pad.r);
  const y = (value: number) => pad.t + (1 - (value - lo) / span) * (H - pad.t - pad.b);
  const path = (rows: Array<{ date: string; pct: number }>) => rows.map((row, i) => `${i ? "L" : "M"}${x(row.date).toFixed(1)},${y(row.pct).toFixed(1)}`).join(" ");
  const ticks = [lo, 0, hi].filter((value, i, list) => list.indexOf(value) === i);
  const stockEnd = stock[stock.length - 1]!;
  const benchEnd = bench[bench.length - 1];
  const hits = stock.filter((_, i) => i % Math.max(1, Math.floor(stock.length / 40)) === 0 || i === stock.length - 1);
  const benchAt = (date: string) => {
    let best: { date: string; pct: number } | undefined;
    for (const row of bench) if (row.date <= date) best = row;
    return best;
  };
  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-oa-muted-fg">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: SELF }} />{ticker}</span>
        {bench.length > 0 ? <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: OTHER }} />S&amp;P 500 (SPY)</span> : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ticker} over the last year: ${signedPct(chart.return_pct)}${chart.benchmark_return_pct !== null ? `, S&P 500 ${signedPct(chart.benchmark_return_pct)}` : ""}`} className="block h-auto w-full">
        {ticks.map((value) => (
          <g key={value}>
            <line x1={pad.l} x2={W - pad.r} y1={y(value)} y2={y(value)} stroke="var(--oa-border)" strokeWidth={1} strokeDasharray={value === 0 ? undefined : "2 4"} />
            <text x={pad.l - 6} y={y(value) + 4} textAnchor="end" className="fill-[var(--oa-muted-fg)] text-[11px]" style={MONO}>{signedPct(value, 0)}</text>
          </g>
        ))}
        {bench.length > 1 ? <path d={path(bench)} fill="none" stroke={OTHER} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} /> : null}
        <path d={path(stock)} fill="none" stroke={SELF} strokeWidth={2} strokeLinejoin="round" />
        <text x={x(stockEnd.date) + 6} y={y(stockEnd.pct) + 4} className="fill-[var(--oa-fg)] text-[12px] font-medium" style={MONO}>{signedPct(stockEnd.pct)}</text>
        {benchEnd ? (
          <text x={x(benchEnd.date) + 6} y={y(benchEnd.pct) + (Math.abs(y(benchEnd.pct) - y(stockEnd.pct)) < 14 ? 16 : 4)} className="fill-[var(--oa-muted-fg)] text-[11px]" style={MONO}>{signedPct(benchEnd.pct)}</text>
        ) : null}
        <text x={pad.l} y={H - 4} className="fill-[var(--oa-muted-fg)] text-[11px]" style={MONO}>{day(stock[0]!.date)}</text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-[var(--oa-muted-fg)] text-[11px]" style={MONO}>{day(stockEnd.date)}</text>
        {hits.map((row, i) => {
          const left = i === 0 ? pad.l : (x(hits[i - 1]!.date) + x(row.date)) / 2;
          const right = i === hits.length - 1 ? W - pad.r : (x(row.date) + x(hits[i + 1]!.date)) / 2;
          const b = benchAt(row.date);
          return (
            <rect key={row.date} x={left} y={pad.t} width={Math.max(1, right - left)} height={H - pad.t - pad.b} fill="transparent">
              <title>{`${day(row.date)}: ${ticker} ${signedPct(row.pct)}${b ? `, S&P 500 ${signedPct(b.pct)}` : ""}`}</title>
            </rect>
          );
        })}
      </svg>
    </figure>
  );
}

/* ── revenue by year, with the operating margin under each bar ──────────── */

export function RevenueBars({ chart }: { chart: NonNullable<ResearchCharts["revenue"]> }) {
  const rows = chart.rows;
  const max = Math.max(...rows.map((row) => Math.abs(row.revenue)), 1);
  return (
    <figure>
      <div role="img" aria-label={`Revenue by year: ${rows.map((row) => `${row.period} ${money(row.revenue)}`).join(", ")}`} className="flex h-44 items-end gap-1.5 border-b border-oa-border sm:gap-3">
        {rows.map((row, i) => {
          const latest = i === rows.length - 1;
          return (
            <div key={row.period} title={`${row.period}: revenue ${money(row.revenue)}${row.op_margin_pct !== null ? `, operating margin ${row.op_margin_pct.toFixed(1)}%` : ""}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="oa-mono mb-1 whitespace-nowrap text-[11px] font-medium tabular-nums text-oa-fg sm:text-[12px]">{money(row.revenue)}</span>
              <span className="block w-full max-w-[3.5rem] rounded-t-[4px]" style={{ height: `${Math.max(2, (Math.max(0, row.revenue) / max) * 100)}%`, maxHeight: "calc(100% - 20px)", background: SELF, opacity: latest ? 1 : 0.55 }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 pt-1.5 sm:gap-3">
        {rows.map((row) => (
          <div key={row.period} className="oa-mono min-w-0 flex-1 text-center text-[11px] leading-4 tabular-nums">
            <span className="block break-words text-oa-fg">{row.period.replace(/^FY\s*/i, "FY")}</span>
            <span className="block break-words text-oa-muted-fg">{row.op_margin_pct !== null ? `${row.op_margin_pct.toFixed(0)}% op.` : "n/a"}</span>
          </div>
        ))}
      </div>
      <Caption>Revenue by fiscal year and the last 12 months. Under each bar: operating margin, the share of revenue left after running costs.</Caption>
    </figure>
  );
}

/* ── how the stock moved on its last reports ─────────────────────────────── */

export function ReactionBars({ chart }: { chart: NonNullable<ResearchCharts["reactions"]> }) {
  const rows = chart.rows;
  const max = Math.max(...rows.map((row) => Math.abs(row.pct)), 1);
  const said = (surprise: (typeof rows)[number]["surprise"]) => (surprise === "beat" ? "beat" : surprise === "miss" ? "missed" : surprise === "in-line" ? "in line" : "");
  return (
    <figure>
      <ul role="img" aria-label={`Move on each earnings report: ${rows.map((row) => `${day(row.date)} ${signedPct(row.pct)}`).join(", ")}`} className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const up = row.pct >= 0;
          const width = `${Math.max(1.5, (Math.abs(row.pct) / max) * 100)}%`;
          return (
            <li key={row.date} title={`${day(row.date)}: ${signedPct(row.pct)} on the report${said(row.surprise) ? `, earnings ${said(row.surprise)} the estimate` : ""}`} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-x-2 text-[12px] sm:grid-cols-[7.5rem_1fr_1fr]">
              {/* Date, then the result on its own line: the label wraps instead of being cut off. */}
              <span className="oa-mono leading-4 tabular-nums text-oa-fg">
                {day(row.date)}
                {said(row.surprise) ? <span className="block text-oa-muted-fg">{said(row.surprise)}</span> : null}
              </span>
              <span className="flex h-4 items-center justify-end border-r border-oa-border pr-px">
                {!up ? <span className="block h-full rounded-l-[4px]" style={{ width, background: DOWN }} /> : null}
              </span>
              <span className="flex h-4 items-center gap-1.5 pl-px">
                {up ? <span className="block h-full rounded-r-[4px]" style={{ width, background: UP }} /> : null}
                <span className="oa-mono shrink-0 font-medium tabular-nums text-oa-fg">{signedPct(row.pct)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <Caption>The stock&apos;s close-to-close move on each report, and whether earnings per share beat or missed the estimate.</Caption>
    </figure>
  );
}

/* ── valuation against peers ─────────────────────────────────────────────── */

export function PeerBars({ chart }: { chart: NonNullable<ResearchCharts["peers"]> }) {
  const rows = [...chart.rows].sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((row) => row.value), chart.median ?? 0, 1);
  const metric = chart.metric === "pe" ? "P/E" : "Price to sales";
  const at = (value: number) => `${(value / max) * 100}%`;
  return (
    <figure>
      <div role="img" aria-label={`${metric}: ${rows.map((row) => `${row.ticker} ${times(row.value)}`).join(", ")}`} className="grid grid-cols-[3.5rem_1fr] items-center gap-x-2 gap-y-1.5 text-[12px]">
        {rows.map((row) => (
          <React.Fragment key={row.ticker}>
            <span className={`oa-mono ${row.self ? "font-semibold text-oa-fg" : "text-oa-muted-fg"}`}>{row.ticker}</span>
            <span title={`${row.ticker}: ${metric} ${times(row.value)}`} className="relative flex h-4 items-center pr-14">
              <span className="relative block h-full flex-1">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: at(row.value), background: row.self ? SELF : OTHER, opacity: row.self ? 1 : 0.45 }} />
                {chart.median !== null ? <span aria-hidden="true" className="absolute -inset-y-1 border-l border-dashed border-oa-fg/60" style={{ left: at(chart.median) }} /> : null}
                <span className="oa-mono absolute top-1/2 ml-1 -translate-y-1/2 bg-oa-card px-0.5 tabular-nums text-oa-fg" style={{ left: at(row.value) }}>
                  {times(row.value)}
                </span>
              </span>
            </span>
          </React.Fragment>
        ))}
      </div>
      {chart.median !== null ? <p className="oa-mono mt-1.5 pl-[4rem] text-[11.5px] text-oa-muted-fg">dashed line: peer median {times(chart.median)}</p> : null}
      <Caption>{metric} for the stock and the closest companies by size in its group. Lower means less is paid for each dollar of {chart.metric === "pe" ? "earnings" : "sales"}.</Caption>
    </figure>
  );
}

/* ── the P/E today against its own history ──────────────────────────────── */

export function OwnHistory({ chart }: { chart: NonNullable<ResearchCharts["valuation"]> }) {
  if (chart.pctile === null) return null;
  const pos = Math.min(100, Math.max(0, chart.pctile));
  return (
    <figure className="mt-1">
      <div className="flex items-baseline justify-between text-[12px] text-oa-muted-fg" style={MONO}>
        <span>cheapest</span>
        <span>dearest</span>
      </div>
      <div className="relative mt-1 h-2.5 rounded-full bg-oa-bg" title={`P/E ${times(chart.pe)} is above ${pos.toFixed(0)}% of the daily readings we hold`}>
        <span className="absolute top-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card" style={{ left: `${pos}%`, background: SELF }} />
      </div>
      <Caption>
        Today&apos;s P/E of {times(chart.pe)} is higher than on {pos.toFixed(0)}% of the days we hold
        {chart.from && chart.to ? ` from ${day(chart.from)} to ${day(chart.to)}` : chart.from ? ` since ${day(chart.from)}` : ""}
        {chart.median !== null ? `; its median over that time is ${times(chart.median)}` : ""}.
      </Caption>
    </figure>
  );
}
