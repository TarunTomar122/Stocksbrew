"use client";

import * as React from "react";

import {
  CHART_RANGES,
  signalTone,
  formatChange,
  formatDay,
  formatLevel,
  seriesChange,
  sliceSeries,
  type ChangeMode,
  type ChartRange,
  type MarketSeries,
} from "@/lib/markets-shared";

const HEIGHT = 240;

function toneColor(tone: "up" | "down" | "flat"): string {
  if (tone === "up") return "var(--signal-bullish)";
  if (tone === "down") return "var(--signal-bearish)";
  return "var(--oa-muted-fg)";
}

/**
 * Daily closes as an inline SVG line with a range switch. Move over the chart
 * (or drag on a phone) to read any day. Axis labels are HTML so they stay
 * sharp while the plot stretches.
 */
export function PriceChart({
  series,
  unit,
  mode,
  stored,
}: {
  series: MarketSeries | null;
  unit: string;
  mode: ChangeMode;
  /**
   * The stored change for a range, when the data job computed one. The job
   * sees history from before the first point drawn here, so its figure is
   * the one to show; the chart falls back to first-to-last of what it draws.
   */
  stored?: Partial<Record<ChartRange, number | null>>;
}) {
  const [range, setRange] = React.useState<ChartRange>("1Y");
  const [hover, setHover] = React.useState<number | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);

  const view = React.useMemo(() => (series ? sliceSeries(series, range) : { dates: [], values: [] }), [series, range]);
  const count = view.values.length;

  React.useEffect(() => setHover(null), [range]);

  if (!series || series.values.length < 2) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-10 text-center text-[14px] text-oa-muted-fg">
        No price history for this asset yet.
      </div>
    );
  }

  const low = Math.min(...view.values);
  const high = Math.max(...view.values);
  const span = high - low || Math.abs(high) * 0.01 || 1;
  const min = low - span * 0.08;
  const max = high + span * 0.08;
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * 100 : 50);
  const y = (value: number) => (1 - (value - min) / (max - min)) * 100;
  const line = view.values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  const change = stored?.[range] ?? seriesChange(view.values, mode);
  const tone = signalTone(change, mode);
  const color = toneColor(tone);
  const active = hover !== null && hover < count ? hover : null;
  const shownIndex = active ?? count - 1;
  const hoverChange = active !== null ? seriesChange([view.values[0], view.values[active]], mode) : change;
  const ticks = [high, (high + low) / 2, low];

  function locate(clientX: number) {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || count < 2) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setHover(Math.round(ratio * (count - 1)));
  }

  const rangeLabel = CHART_RANGES.find((item) => item.id === range)?.label ?? "";

  return (
    <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-oa-border px-3.5 py-2">
        <p className="oa-mono text-[12.5px] leading-5 tabular-nums text-oa-muted-fg" aria-live="polite">
          <span className="text-oa-fg">{formatLevel(view.values[shownIndex], unit)}</span>
          {" · "}
          {formatDay(view.dates[shownIndex], true)}
          {hoverChange !== null ? (
            <>
              {" · "}
              <span style={{ color: toneColor(signalTone(hoverChange, mode)) }}>{formatChange(hoverChange, mode)}</span>
              {active !== null ? ` since ${formatDay(view.dates[0])}` : ` over ${rangeLabel}`}
            </>
          ) : null}
        </p>
        <div role="group" aria-label="Chart range" className="flex gap-1">
          {CHART_RANGES.map((item) => {
            const on = item.id === range;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                title={item.label}
                onClick={() => setRange(item.id)}
                className={`oa-mono h-7 min-w-9 cursor-pointer rounded-md px-2 text-[12.5px] uppercase tracking-[0.06em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-ring ${
                  on ? "bg-oa-fg text-oa-page" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                }`}
              >
                {item.id}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3.5 pb-2 pt-3">
        <div
          ref={plotRef}
          className="relative touch-pan-y select-none"
          style={{ height: HEIGHT }}
          onPointerMove={(event) => locate(event.clientX)}
          onPointerDown={(event) => locate(event.clientX)}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Daily closes over ${rangeLabel}, from ${formatLevel(view.values[0], unit)} to ${formatLevel(view.values[count - 1], unit)}`}
        >
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
            {ticks.map((tick) => (
              <line key={tick} x1={0} x2={100} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill={color} opacity={0.08} />
            <path d={line} stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {active !== null ? (
            <>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-oa-fg/30" style={{ left: `${x(active)}%` }} />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-oa-card"
                style={{ left: `${x(active)}%`, top: `${y(view.values[active])}%`, background: color }}
              />
            </>
          ) : null}
        </div>
        <div className="relative w-14" style={{ height: HEIGHT }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="oa-mono absolute left-0 -translate-y-1/2 whitespace-nowrap text-[12.5px] leading-none tabular-nums text-oa-muted-fg"
              style={{ top: `${y(tick)}%` }}
            >
              {formatLevel(tick, unit)}
            </span>
          ))}
        </div>
        <div className="oa-mono mt-1.5 flex justify-between text-[12.5px] uppercase tracking-[0.06em] tabular-nums text-oa-muted-fg">
          <span>{formatDay(view.dates[0], true)}</span>
          {count > 2 ? <span className="max-sm:hidden">{formatDay(view.dates[Math.floor(count / 2)], true)}</span> : null}
          <span>{formatDay(view.dates[count - 1], true)}</span>
        </div>
        <div />
      </div>
    </div>
  );
}
