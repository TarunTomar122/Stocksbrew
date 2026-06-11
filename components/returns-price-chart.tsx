"use client";

import { useMemo, useRef, useState } from "react";

import { PRICE_HISTORY_CHART_MIN, type PriceHistoryPoint } from "@/lib/price-history-chart";

const MAX_CHART_POINTS = 252;

const WIDTH = 640;
const HEIGHT = 168;
const MARGIN = { top: 10, right: 12, bottom: 28, left: 56 };

function shortChartDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function formatPrice(value: number, currency: string): string {
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.ceil(raw / magnitude) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    if (v >= min - step * 0.01 && v <= max + step * 0.01) ticks.push(v);
    if (ticks.length > count + 2) break;
  }
  if (!ticks.includes(min)) ticks.unshift(min);
  if (!ticks.includes(max)) ticks.push(max);
  return [...new Set(ticks.map((v) => Number(v.toFixed(2))))].sort((a, b) => a - b);
}

type Props = {
  series: PriceHistoryPoint[];
  ticker: string;
  currency: string;
};

export function ReturnsPriceChart({ series, ticker, currency }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const window = useMemo(
    () =>
      series
        .filter((p) => typeof p.close === "number" && Number.isFinite(p.close))
        .slice(-MAX_CHART_POINTS),
    [series],
  );

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const chart = useMemo(() => {
    if (window.length < PRICE_HISTORY_CHART_MIN) return null;

    const closes = window.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const positive = closes[closes.length - 1] >= closes[0];
    const stroke = positive ? "#10b981" : "#ef4444";
    const step = plotWidth / Math.max(1, closes.length - 1);

    const pts = closes.map((v, i) => ({
      x: MARGIN.left + i * step,
      y: MARGIN.top + (1 - (v - min) / range) * plotHeight,
      close: v,
      date: window[i].date,
    }));

    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const areaPath = [
      linePath,
      `L ${pts[pts.length - 1].x.toFixed(2)} ${MARGIN.top + plotHeight}`,
      `L ${pts[0].x.toFixed(2)} ${MARGIN.top + plotHeight}`,
      "Z",
    ].join(" ");

    const periodReturn =
      closes[0] > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : null;

    const yTicks = niceTicks(min, max, 4);
    const yToPx = (v: number) => MARGIN.top + (1 - (v - min) / range) * plotHeight;

    return {
      pts,
      linePath,
      areaPath,
      stroke,
      positive,
      min,
      max,
      periodReturn,
      yTicks,
      yToPx,
      fillId: `returns-chart-${ticker.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    };
  }, [window, plotHeight, plotWidth, ticker]);

  if (!chart) return null;

  const active = hoverIndex != null ? chart.pts[hoverIndex] : null;

  const handlePointer = (clientX: number) => {
    const root = rootRef.current;
    if (!root || chart.pts.length === 0) return;
    const rect = root.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const x = Math.max(MARGIN.left, Math.min(MARGIN.left + plotWidth, ratio * WIDTH));
    const idx = Math.round(((x - MARGIN.left) / plotWidth) * (chart.pts.length - 1));
    setHoverIndex(Math.max(0, Math.min(chart.pts.length - 1, idx)));
  };

  return (
    <div ref={rootRef} className="flex max-w-[640px] flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-3 text-[#6b7280]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full" style={{ background: chart.stroke }} aria-hidden />
            <span className="font-medium text-[#374151]">Daily close</span>
          </span>
          <span className="text-[#9ca3af]">{ticker}</span>
        </div>
        {chart.periodReturn != null &&
        Number.isFinite(chart.periodReturn) &&
        Math.abs(chart.periodReturn) >= 0.05 ? (
          <span
            className={`font-semibold tabular-nums ${chart.positive ? "text-[#10b981]" : "text-[#ef4444]"}`}
          >
            {chart.periodReturn >= 0 ? "+" : ""}
            {chart.periodReturn.toFixed(1)}% over {window.length} sessions
          </span>
        ) : null}
      </div>

      <div className="relative">
        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 shadow-[0_4px_16px_rgba(17,24,39,0.08)]"
            style={{
              left: `${(active.x / WIDTH) * 100}%`,
              top: Math.max(0, active.y - 44),
            }}
          >
            <p className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-[#111111]">
              {formatPrice(active.close, currency)}
            </p>
            <p className="whitespace-nowrap text-[10px] text-[#9ca3af]">
              {shortChartDate(active.date)}
            </p>
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[168px] w-full touch-none select-none"
          role="img"
          aria-label={`${ticker} daily close price chart`}
          onMouseMove={(e) => handlePointer(e.clientX)}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) handlePointer(touch.clientX);
          }}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (touch) handlePointer(touch.clientX);
          }}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={chart.fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chart.stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={chart.stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {chart.yTicks.map((tick) => {
            const y = chart.yToPx(tick);
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="#f3f4f6"
                  strokeWidth="1"
                />
                <text
                  x={MARGIN.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#9ca3af] text-[10px]"
                >
                  {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
          />

          <path d={chart.areaPath} fill={`url(#${chart.fillId})`} />
          <path
            d={chart.linePath}
            fill="none"
            stroke={chart.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active ? (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke={chart.stroke}
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.55"
              />
              <circle cx={active.x} cy={active.y} r="4" fill="#ffffff" stroke={chart.stroke} strokeWidth="2" />
            </g>
          ) : null}

          <text
            x={MARGIN.left}
            y={HEIGHT - 8}
            className="fill-[#9ca3af] text-[10px]"
          >
            {shortChartDate(window[0].date)}
          </text>
          <text
            x={MARGIN.left + plotWidth}
            y={HEIGHT - 8}
            textAnchor="end"
            className="fill-[#9ca3af] text-[10px]"
          >
            {shortChartDate(window[window.length - 1].date)}
          </text>
        </svg>
      </div>
    </div>
  );
}
