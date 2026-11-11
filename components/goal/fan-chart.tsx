"use client";

import * as React from "react";

import type { Band } from "@/lib/goal/bootstrap";
import { moneyWords } from "@/lib/goal/read";

/**
 * The range of replays over time: the middle half and the middle eight in
 * ten as copper bands, the middle replay as a line, the goal as a dashed
 * line and the money put in as a dotted one. Hover or drag for a year.
 * When the strongest replays run far above the goal, the scale stops short
 * of them so the goal stays readable, and the chart says so.
 */

const PAD = { left: 8, right: 58, top: 14, bottom: 24 };

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

function axisMoney(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1e9) return `$${+(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${+(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${+(value / 1e3).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

export function FanChart({
  bands,
  target,
  startAge,
  putIn,
}: {
  bands: Band[];
  target: number;
  startAge: number;
  /** Money put in by each year (the start plus every monthly amount), same length as `bands`. */
  putIn: number[];
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(640);
  const [hover, setHover] = React.useState<number | null>(null);
  const clipId = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const update = () => setWidth(Math.max(280, Math.round(node.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = bands.length;
  if (count < 2) return null;
  const end = bands[count - 1]!;
  const height = width < 520 ? 230 : 280;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // Show the strongest one in ten unless it would squash the goal and the middle into the bottom third.
  const anchor = Math.max(target, end.p50, putIn[count - 1] ?? 0);
  const clipped = end.p90 > anchor * 2.6;
  const top = clipped ? Math.max(anchor * 1.5, end.p75 * 1.12) : Math.max(end.p90, target) * 1.08;
  const step = niceStep(top, width < 520 ? 3 : 4);
  const hi = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= hi + step / 2; value += step) ticks.push(value);

  const x = (index: number) => PAD.left + (index / (count - 1)) * plotW;
  const y = (value: number) => PAD.top + (1 - Math.max(0, value) / hi) * plotH;
  const line = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const area = (lo: number[], up: number[]) =>
    `${line(up)}${lo
      .map((value, index) => ({ value, index }))
      .reverse()
      .map(({ value, index }) => `L${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .join("")}Z`;

  const p10 = bands.map((band) => band.p10);
  const p25 = bands.map((band) => band.p25);
  const p50 = bands.map((band) => band.p50);
  const p75 = bands.map((band) => band.p75);
  const p90 = bands.map((band) => band.p90);

  const everyAge = Math.max(1, Math.ceil((count * 34) / plotW));
  const niceEvery = [1, 2, 5, 10, 20].find((n) => n >= everyAge) ?? everyAge;
  // Every few ages, plus the first ("Age 35", the widest label) and the last, with room kept around both ends.
  const gapX = plotW / (count - 1);
  const shownAges = bands
    .map((_, index) => index)
    .filter((index) => {
      if (index === 0 || index === count - 1) return true;
      if ((startAge + index) % niceEvery !== 0) return false;
      return index * gapX >= 52 && (count - 1 - index) * gapX >= 30;
    });

  const goalY = y(target);
  const goalShown = target <= hi;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left - PAD.left) / plotW;
    setHover(Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1)))));
  };
  const at = hover ?? count - 1;
  const tipW = 236;
  const tipLeft = Math.min(Math.max(x(at) - tipW / 2, 0), Math.max(0, width - tipW));

  return (
    <div ref={wrap} className="relative w-full min-w-0 select-none">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        // Scales with its box until the first measure, so a phone never sees a clipped 640px chart.
        style={{ width: "100%", height: "auto" }}
        aria-label={`The range of replays from age ${startAge} to ${startAge + count - 1}. At ${startAge + count - 1} the middle replay is ${moneyWords(end.p50)}, the weakest one in ten ${moneyWords(end.p10)} and the strongest one in ten ${moneyWords(end.p90)}, against a goal of ${moneyWords(target)}.`}
        className="block touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top - 1} width={plotW + 1} height={plotH + 1} />
          </clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth="1" />
            {/* The goal's own label wins when a tick label would sit on top of it. */}
            {goalShown && Math.abs(y(tick) - goalY) < 13 ? null : (
              <text x={PAD.left + plotW + 8} y={y(tick) + 4} className="oa-mono fill-oa-muted-fg text-[11px]">
                {axisMoney(tick)}
              </text>
            )}
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          <path d={area(p10, p90)} fill="var(--oa-primary)" fillOpacity="0.15" />
          <path d={area(p25, p75)} fill="var(--oa-primary)" fillOpacity="0.25" />
          <path d={line(putIn)} fill="none" stroke="var(--oa-muted-fg)" strokeWidth="1.5" strokeDasharray="1.5 3.5" strokeLinecap="round" />
          <path d={line(p50)} fill="none" stroke="var(--oa-primary)" strokeWidth="2" strokeLinejoin="round" />
        </g>
        {goalShown ? (
          <g>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={goalY} y2={goalY} stroke="var(--oa-fg)" strokeWidth="1.25" strokeDasharray="6 4" opacity="0.8" />
            <text x={PAD.left + plotW + 8} y={goalY + 4} className="oa-mono fill-oa-fg text-[11px] font-medium">
              Goal
            </text>
          </g>
        ) : null}
        {shownAges.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
            className="oa-mono fill-oa-muted-fg text-[11px]"
          >
            {index === 0 ? `Age ${startAge}` : startAge + index}
          </text>
        ))}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--oa-fg)" strokeWidth="1" opacity="0.35" />
            {bands[at]!.p50 <= hi ? (
              <circle cx={x(at)} cy={y(bands[at]!.p50)} r="4" fill="var(--oa-primary)" stroke="var(--oa-card)" strokeWidth="2" />
            ) : null}
          </g>
        ) : end.p50 <= hi ? (
          <circle cx={x(count - 1)} cy={y(end.p50)} r="3.5" fill="var(--oa-primary)" stroke="var(--oa-card)" strokeWidth="2" pointerEvents="none" />
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-oa-border bg-oa-card px-3 py-2 text-[12.5px] shadow-[0_8px_24px_-12px_rgba(40,25,5,0.45)]"
          style={{ left: tipLeft, width: tipW }}
        >
          <p className="oa-mono text-[11px] text-oa-muted-fg">
            Age {startAge + at}
            {at === 0 ? ", today" : `, in ${at === 1 ? "a year" : `${at} years`}`}
          </p>
          <TipRow label="Strongest 1 in 10" value={bands[at]!.p90} />
          <TipRow label="Middle replay" value={bands[at]!.p50} strong />
          <TipRow label="Weakest 1 in 10" value={bands[at]!.p10} />
          <p className="mt-1 flex justify-between gap-2 border-t border-oa-border pt-1 text-oa-muted-fg">
            <span className="whitespace-nowrap">Put in by then</span>
            <span className="oa-mono whitespace-nowrap tabular-nums">{moneyWords(putIn[at] ?? 0)}</span>
          </p>
        </div>
      ) : null}
      {clipped ? (
        <p className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">
          The strongest replays run above the top of the chart: one in ten ends above {moneyWords(end.p90)}.
        </p>
      ) : null}
    </div>
  );
}

function TipRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <p className={`mt-0.5 flex justify-between gap-2 ${strong ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>
      <span className="whitespace-nowrap">{label}</span>
      <span className="oa-mono whitespace-nowrap tabular-nums">{moneyWords(value)}</span>
    </p>
  );
}

/** The chart's key, as small swatches that match the marks. */
export function FanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] leading-4 text-oa-muted-fg">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-oa-primary" />
        <span className="text-oa-fg">Middle replay</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[color-mix(in_srgb,var(--oa-primary)_36%,transparent)]" />
        Middle half
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[color-mix(in_srgb,var(--oa-primary)_15%,transparent)]" />
        8 in 10 replays
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="w-4 border-t-[1.5px] border-dashed border-oa-fg" />
        Goal
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="w-4 border-t-2 border-dotted border-oa-muted-fg" />
        Money put in
      </span>
    </div>
  );
}
