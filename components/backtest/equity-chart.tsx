"use client";

import * as React from "react";

import { SERIES_VARS, longDay, signedPct } from "./format";

/**
 * Two lines on one scale (growth of 100, log scale so equal percentage moves
 * look equal) and a drawdown strip underneath that shares the time axis.
 * Hover or drag for the values on a day. The yearly table beside it is the
 * table view of the same data.
 */

export type EquityChartCurve = {
  dates: string[];
  strategy: number[];
  benchmark: number[];
  dd_strategy?: number[];
  dd_benchmark?: number[];
};

const TICKS = [10, 25, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800];
const PAD = { left: 8, right: 52, top: 10 };
const MAIN_H = 240;
const GAP = 26;
const DD_H = 64;
const AXIS_H = 20;

function drawdowns(values: number[]): number[] {
  let peak = 100;
  return values.map((value) => {
    peak = Math.max(peak, value);
    return value / peak - 1;
  });
}

export function EquityChart({
  curve,
  strategyLabel,
  benchmarkLabel,
  unit = "index",
  note = true,
}: {
  curve: EquityChartCurve;
  strategyLabel: string;
  benchmarkLabel: string;
  /** "index": growth of 100. "money": account value in dollars. */
  unit?: "index" | "money";
  /** false drops the line under the chart that says how to read it (the backtest page says it in its read). */
  note?: boolean;
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(760);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const update = () => setWidth(Math.max(280, Math.round(node.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = curve.dates.length;
  const ddS = curve.dd_strategy ?? drawdowns(curve.strategy);
  const ddB = curve.dd_benchmark ?? drawdowns(curve.benchmark);
  if (count < 2) return null;

  const plotW = width - PAD.left - PAD.right;
  const all = [...curve.strategy, ...curve.benchmark];
  const useLog = unit === "index";
  const scale = (value: number) => (useLog ? Math.log(value) : value);
  const rawLow = Math.min(...all);
  const rawHigh = Math.max(...all);
  const padSpan = (scale(rawHigh) - scale(rawLow)) * 0.06 || 0.01;
  const low = scale(rawLow) - padSpan;
  const high = scale(rawHigh) + padSpan;
  const x = (index: number) => PAD.left + (index / (count - 1)) * plotW;
  const y = (value: number) => PAD.top + (1 - (scale(value) - low) / (high - low)) * MAIN_H;

  const ddTop = PAD.top + MAIN_H + GAP;
  const ddMin = Math.min(-0.01, ...ddS, ...ddB);
  const yd = (value: number) => ddTop + (value / ddMin) * DD_H;
  const totalH = ddTop + DD_H + AXIS_H;

  const line = (values: number[], fn: (value: number) => number) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${fn(value).toFixed(1)}`).join("");
  const ddArea = `${line(ddS, yd)}L${x(count - 1).toFixed(1)},${ddTop}L${x(0).toFixed(1)},${ddTop}Z`;

  let ticks: number[];
  if (useLog) {
    ticks = TICKS.filter((tick) => scale(tick) >= low && scale(tick) <= high);
    if (ticks.length > 6) ticks = ticks.filter((_, index) => index % 2 === 0);
  } else {
    const step = (rawHigh - rawLow) / 3 || 1;
    ticks = [0, 1, 2, 3].map((index) => rawLow + step * index);
  }
  const tickLabel = (value: number) =>
    unit === "money" ? `$${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : String(value);

  // One label per year, thinned so they never collide.
  const yearMarks: { index: number; label: string }[] = [];
  for (let index = 1; index < count; index += 1) {
    if (curve.dates[index].slice(0, 4) !== curve.dates[index - 1].slice(0, 4)) {
      yearMarks.push({ index, label: curve.dates[index].slice(0, 4) });
    }
  }
  const everyYear = Math.max(1, Math.ceil((yearMarks.length * 44) / plotW));
  const shownYears = yearMarks.filter((_, index) => index % everyYear === 0);
  const edgeLabels = yearMarks.length < 2;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left - PAD.left) / plotW;
    setHover(Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1)))));
  };

  const at = hover ?? count - 1;
  const value = (number: number) =>
    unit === "money" ? `$${number.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : number.toFixed(1);
  const change = (values: number[]) => values[at] / values[0] - 1;
  const tipLeft = Math.min(Math.max(x(at) - 96, 0), Math.max(0, width - 196));

  return (
    <div ref={wrap} className={`${SERIES_VARS} relative w-full min-w-0 select-none`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-oa-fg">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-[var(--series-a)]" />
          {strategyLabel}
          <span className="oa-mono tabular-nums text-oa-muted-fg">{signedPct(curve.strategy[count - 1] / curve.strategy[0] - 1)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-dashed border-[var(--series-b)]" />
          {benchmarkLabel}
          <span className="oa-mono tabular-nums text-oa-muted-fg">{signedPct(curve.benchmark[count - 1] / curve.benchmark[0] - 1)}</span>
        </span>
      </div>
      <svg
        width={width}
        height={totalH}
        viewBox={`0 0 ${width} ${totalH}`}
        role="img"
        aria-label={`${strategyLabel} against ${benchmarkLabel} from ${longDay(curve.dates[0])} to ${longDay(curve.dates[count - 1])}, with a drawdown strip below`}
        className="block touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth="1" />
            <text x={PAD.left + plotW + 8} y={y(tick) + 4} className="oa-mono fill-oa-muted-fg text-[11px]">
              {tickLabel(tick)}
            </text>
          </g>
        ))}
        <path d={line(curve.benchmark, y)} fill="none" stroke="var(--series-b)" strokeWidth="1.5" strokeDasharray="5 3" strokeLinejoin="round" />
        <path d={line(curve.strategy, y)} fill="none" stroke="var(--series-a)" strokeWidth="2" strokeLinejoin="round" />

        <text x={PAD.left} y={ddTop - 8} className="oa-mono fill-oa-muted-fg text-[10px] uppercase tracking-[0.08em]">
          Fall from the high
        </text>
        <line x1={PAD.left} x2={PAD.left + plotW} y1={ddTop} y2={ddTop} stroke="var(--oa-border)" strokeWidth="1" />
        <path d={ddArea} fill="var(--series-a)" opacity="0.22" />
        <path d={line(ddS, yd)} fill="none" stroke="var(--series-a)" strokeWidth="1.25" />
        <path d={line(ddB, yd)} fill="none" stroke="var(--series-b)" strokeWidth="1.25" strokeDasharray="4 3" />
        <text x={PAD.left + plotW + 8} y={ddTop + 4} className="oa-mono fill-oa-muted-fg text-[11px]">0%</text>
        <text x={PAD.left + plotW + 8} y={ddTop + DD_H + 4} className="oa-mono fill-oa-muted-fg text-[11px]">
          {(ddMin * 100).toFixed(0)}%
        </text>

        {edgeLabels ? (
          <>
            <text x={PAD.left} y={totalH - 5} className="oa-mono fill-oa-muted-fg text-[11px]">{longDay(curve.dates[0])}</text>
            <text x={PAD.left + plotW} y={totalH - 5} textAnchor="end" className="oa-mono fill-oa-muted-fg text-[11px]">
              {longDay(curve.dates[count - 1])}
            </text>
          </>
        ) : (
          shownYears.map((mark) => (
            <text key={mark.label} x={Math.max(x(mark.index), PAD.left + 16)} y={totalH - 5} textAnchor="middle" className="oa-mono fill-oa-muted-fg text-[11px]">
              {mark.label}
            </text>
          ))
        )}

        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={ddTop + DD_H} stroke="var(--oa-fg)" strokeWidth="1" opacity="0.35" />
            <circle cx={x(at)} cy={y(curve.benchmark[at])} r="4" fill="var(--series-b)" stroke="var(--oa-card)" strokeWidth="2" />
            <circle cx={x(at)} cy={y(curve.strategy[at])} r="4" fill="var(--series-a)" stroke="var(--oa-card)" strokeWidth="2" />
          </g>
        ) : (
          <g pointerEvents="none">
            <circle cx={x(count - 1)} cy={y(curve.benchmark[count - 1])} r="3.5" fill="var(--series-b)" stroke="var(--oa-card)" strokeWidth="2" />
            <circle cx={x(count - 1)} cy={y(curve.strategy[count - 1])} r="3.5" fill="var(--series-a)" stroke="var(--oa-card)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-8 z-10 w-[196px] rounded-md border border-oa-border bg-oa-card px-3 py-2 text-[12px] shadow-[0_8px_24px_-12px_rgba(40,25,5,0.45)]"
          style={{ left: tipLeft }}
        >
          <p className="oa-mono text-[11px] text-oa-muted-fg">{longDay(curve.dates[at])}</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--series-a)]" />
              <span className="truncate">{strategyLabel}</span>
            </span>
            <span className="oa-mono shrink-0 tabular-nums">{value(curve.strategy[at])}</span>
          </p>
          <p className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--series-b)]" />
              <span className="truncate">{benchmarkLabel}</span>
            </span>
            <span className="oa-mono shrink-0 tabular-nums">{value(curve.benchmark[at])}</span>
          </p>
          <p className="mt-1 flex justify-between gap-2 border-t border-oa-border pt-1 text-oa-muted-fg">
            <span>Since start</span>
            <span className="oa-mono tabular-nums">
              {signedPct(change(curve.strategy))} / {signedPct(change(curve.benchmark))}
            </span>
          </p>
          <p className="flex justify-between gap-2 text-oa-muted-fg">
            <span>Below high</span>
            <span className="oa-mono tabular-nums">
              {(ddS[at] * 100).toFixed(1)}% / {(ddB[at] * 100).toFixed(1)}%
            </span>
          </p>
        </div>
      ) : null}
      {note ? (
      <p className="mt-1 text-[12px] leading-5 text-oa-muted-fg">
        {unit === "index"
          ? "Both lines start at 100. The scale is logarithmic, so the same percentage move is the same height anywhere on the chart."
          : "Account value at each close, against the same starting money held in the comparison fund."}
      </p>
      ) : null}
    </div>
  );
}
