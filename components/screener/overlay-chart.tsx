"use client";

import * as React from "react";

/**
 * Several price lines rebased to the same start, with a range switch and a
 * hover read-out. Inline SVG, sized to its container so the labels stay
 * readable on a phone. Used for a basket against its benchmark and for the
 * compare desk's overlay.
 *
 * The y axis is the change since the start of the window, in percent, so a
 * line at +20% means "20% above where it started", whatever the price was.
 */

export type OverlayPoint = { date: string; value: number };

export type OverlayLine = {
  id: string;
  label: string;
  /** Any CSS colour. */
  color: string;
  dashed?: boolean;
  points: OverlayPoint[];
  /** Change over the window, in percent. */
  pct: number | null;
};

export type OverlayRange = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  lines: OverlayLine[];
  /** Shown under the chart for this window, e.g. which lines were left out. */
  note?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(iso: string, withYear: boolean): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = Number(iso.slice(8, 10));
  return withYear ? `${month} ${day}, ${iso.slice(0, 4)}` : `${month} ${day}`;
}

function axisLabel(iso: string, spanDays: number): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  if (spanDays > 500) return `${month} ’${iso.slice(2, 4)}`;
  return `${month} ${Number(iso.slice(8, 10))}`;
}

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

/** Round tick step so the axis has four to six lines. */
function niceStep(span: number): number {
  const rough = span / 4;
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
  const unit = rough / power;
  return (unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * power;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.round(element.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function OverlayChart({
  ranges,
  initialRange,
  rangeParam,
  emptyText = "There is not enough price history to draw this.",
}: {
  ranges: OverlayRange[];
  initialRange?: string | null;
  /** When set, the chosen range is written to this query parameter so the link keeps it. */
  rangeParam?: string;
  emptyText?: string;
}) {
  const fallback = ranges.find((range) => range.key === "1Y") ?? ranges[ranges.length - 1];
  const [key, setKey] = React.useState(ranges.find((range) => range.key === initialRange)?.key ?? fallback?.key ?? "");
  const [hover, setHover] = React.useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const range = ranges.find((item) => item.key === key) ?? fallback;

  React.useEffect(() => setHover(null), [key]);

  if (!range || range.lines.length === 0) {
    return <p className="px-4 py-10 text-center text-[14px] text-oa-muted-fg">{emptyText}</p>;
  }

  function choose(next: string) {
    setKey(next);
    if (rangeParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(rangeParam, next);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search.replace(/%2C/gi, ",")}`);
    }
  }

  const W = Math.max(width, 280);
  const H = W < 480 ? 220 : 290;
  const pad = { top: 12, right: 12, bottom: 24, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const length = Math.max(...range.lines.map((line) => line.points.length));
  let min = 0;
  let max = 0;
  for (const line of range.lines) {
    for (const point of line.points) {
      const change = point.value - 100;
      if (change < min) min = change;
      if (change > max) max = change;
    }
  }
  const step = niceStep(Math.max(max - min, 1));
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step || step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(Math.round(tick * 1000) / 1000);

  const x = (index: number) => pad.left + (length <= 1 ? 0 : (index / (length - 1)) * plotW);
  const y = (change: number) => pad.top + plotH - ((change - low) / (high - low || 1)) * plotH;

  const base = range.lines[0]!.points;
  const spanDays = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000;
  const labelCount = W < 480 ? 3 : 5;
  const xLabels = Array.from({ length: labelCount }, (_, i) => Math.round((i / (labelCount - 1)) * (base.length - 1)));

  const active = hover !== null && hover < base.length ? hover : null;
  const shownDate = active !== null ? base[active]!.date : range.endDate;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left - pad.left) / plotW;
    setHover(Math.min(length - 1, Math.max(0, Math.round(ratio * (length - 1)))));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pt-3.5">
        <ul className="flex min-w-0 flex-wrap gap-x-5 gap-y-1.5">
          {range.lines.map((line) => {
            const point = active !== null ? line.points[Math.min(active, line.points.length - 1)] : null;
            const value = point ? point.value - 100 : line.pct;
            return (
              <li key={line.id} className="flex items-center gap-2 text-[13.5px]">
                <svg width="18" height="8" aria-hidden="true" className="shrink-0">
                  <line x1="0" y1="4" x2="18" y2="4" stroke={line.color} strokeWidth="2.4" strokeLinecap="round" strokeDasharray={line.dashed ? "4 3" : undefined} />
                </svg>
                <span className="font-medium text-oa-fg">{line.label}</span>
                {value !== null && value !== undefined ? (
                  <span className={`oa-mono tabular-nums ${value > 0 ? "text-signal-bullish" : value < 0 ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
                    {signed(value, 2)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div role="tablist" aria-label="Chart range" className="flex shrink-0 rounded-md border border-oa-border bg-oa-bg p-0.5">
          {ranges.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === range.key}
              onClick={() => choose(item.key)}
              className={`oa-mono h-6 rounded px-2 text-[11.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
                item.key === range.key ? "bg-oa-card font-medium text-oa-fg shadow-[0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:text-oa-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="mt-1 w-full px-1">
        {width > 0 ? (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Change since ${dayLabel(range.startDate, true)}: ${range.lines.map((line) => `${line.label} ${line.pct === null ? "unknown" : signed(line.pct, 1)}`).join(", ")}`}
            className="block touch-pan-y select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--oa-border)"
                  strokeWidth={tick === 0 ? 1.2 : 1}
                  strokeDasharray={tick === 0 ? undefined : "2 4"}
                />
                <text x={pad.left - 7} y={y(tick) + 3.5} textAnchor="end" fontSize="12" fill="var(--oa-muted-fg)" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                  {tick === 0 ? "0%" : signed(tick, Math.abs(step) < 1 ? 1 : 0)}
                </text>
              </g>
            ))}
            {xLabels.map((index, i) => (
              <text
                key={`${index}-${i}`}
                x={x(index)}
                y={H - 7}
                textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
                fontSize="12"
                fill="var(--oa-muted-fg)"
                style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
              >
                {axisLabel(base[index]!.date, spanDays)}
              </text>
            ))}
            {[...range.lines].reverse().map((line) => (
              <path
                key={line.id}
                d={line.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.value - 100).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth={line.dashed ? 1.5 : 1.9}
                strokeDasharray={line.dashed ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {active !== null ? (
              <g pointerEvents="none">
                <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke="var(--oa-fg)" strokeOpacity="0.35" strokeWidth="1" />
                {range.lines.map((line) => {
                  const point = line.points[Math.min(active, line.points.length - 1)];
                  return point ? (
                    <circle key={line.id} cx={x(active)} cy={y(point.value - 100)} r="3.4" fill={line.color} stroke="var(--oa-card)" strokeWidth="1.5" />
                  ) : null;
                })}
              </g>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: 290 }} />
        )}
      </div>

      <p className="oa-mono px-4 pb-3 pt-1 text-[11.5px] leading-4 text-oa-muted-fg">
        {active !== null ? `${dayLabel(shownDate, true)}, change since ${dayLabel(range.startDate, true)}` : `${dayLabel(range.startDate, true)} to ${dayLabel(range.endDate, true)}, each line starts at 0%`}
        {range.note ? ` · ${range.note}` : ""}
      </p>
    </div>
  );
}
