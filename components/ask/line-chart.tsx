"use client";

import * as React from "react";

import { NUM, fmtDay } from "@/components/ask/atoms";

/**
 * A small line chart for cards: one or two series on one axis, a crosshair
 * and tooltip on hover, the last value of each series labelled at the line's
 * end. Two series get a legend; a single series is named by the card.
 *
 * The first series is the subject (solid copper). The second is context
 * (dashed, muted), so the pair never relies on colour alone.
 */

export type ChartSeries = { name: string; values: number[] };

const W = 640;
const H = 200;
const PAD = { top: 12, right: 58, bottom: 22, left: 44 };

function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const rough = span / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

export function LineChart({
  dates,
  series,
  format,
  label,
}: {
  dates: string[];
  series: ChartSeries[];
  /** How a value is written on the axis and in the tooltip. */
  format: (value: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const count = dates.length;
  if (count < 2 || series.length === 0) return null;

  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.06;
  const min = lo - pad;
  const max = hi + pad;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (count - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH * (1 - (v - min) / (max - min));
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const ticks = niceTicks(lo, hi);
  const strokes = ["var(--oa-primary)", "var(--oa-muted-fg)"];

  // End labels sit at each line's last value; nudge them apart when they collide.
  const ends = series.map((s, index) => ({ index, value: s.values[count - 1]!, at: y(s.values[count - 1]!) }));
  if (ends.length === 2 && Math.abs(ends[0]!.at - ends[1]!.at) < 13) {
    const upper = ends[0]!.at <= ends[1]!.at ? ends[0]! : ends[1]!;
    const lower = upper === ends[0] ? ends[1]! : ends[0]!;
    const mid = (upper.at + lower.at) / 2;
    upper.at = mid - 6.5;
    lower.at = mid + 6.5;
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const index = Math.round(((px - PAD.left) / innerW) * (count - 1));
    setHover(Math.min(count - 1, Math.max(0, index)));
  };

  const tipLeft = hover === null ? 0 : (x(hover) / W) * 100;

  return (
    <figure className="m-0">
      {series.length > 1 ? (
        <figcaption className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-oa-muted-fg">
          {series.map((s, index) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="18" y2="3" stroke={strokes[index]} strokeWidth="2" strokeDasharray={index === 1 ? "4 3" : undefined} />
              </svg>
              {s.name}
            </span>
          ))}
        </figcaption>
      ) : null}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={label}
          className="block h-auto w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" className={NUM} fontSize="10.5" fill="var(--oa-muted-fg)">
                {format(tick)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className={NUM} fontSize="10.5" fill="var(--oa-muted-fg)">
            {fmtDay(dates[0], true)}
          </text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className={NUM} fontSize="10.5" fill="var(--oa-muted-fg)">
            {fmtDay(dates[count - 1], true)}
          </text>
          {/* Context first, subject on top. */}
          {[...series.keys()].reverse().map((index) => (
            <path
              key={series[index]!.name}
              d={path(series[index]!.values)}
              fill="none"
              stroke={strokes[index]}
              strokeWidth={index === 0 ? 2 : 1.5}
              strokeDasharray={index === 1 ? "4 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {ends.map((end) => (
            <text key={end.index} x={W - PAD.right + 6} y={end.at + 3.5} className={NUM} fontSize="11" fontWeight={end.index === 0 ? 600 : 400} fill={end.index === 0 ? "var(--oa-fg)" : "var(--oa-muted-fg)"}>
              {format(end.value)}
            </text>
          ))}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--oa-muted-fg)" strokeWidth="1" strokeDasharray="2 3" />
              {series.map((s, index) => (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r="4" fill={strokes[index]} stroke="var(--oa-card)" strokeWidth="2" />
              ))}
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 w-max max-w-[60%] rounded-md border border-oa-border bg-oa-card px-2.5 py-1.5 text-[12px] shadow-sm"
            style={tipLeft > 55 ? { right: `${100 - tipLeft + 1.5}%` } : { left: `${tipLeft + 1.5}%` }}
          >
            <p className={`${NUM} text-oa-muted-fg`}>{fmtDay(dates[hover], true)}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-baseline justify-between gap-3">
                <span className="text-oa-muted-fg">{s.name}</span>
                <span className={`${NUM} font-medium text-oa-fg`}>{format(s.values[hover]!)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
