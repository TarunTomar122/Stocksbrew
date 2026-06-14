"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PRICE_HISTORY_CHART_MIN, type PriceHistoryPoint } from "@/lib/price-history-chart";

const MAX_CHART_POINTS = 252;

const WIDTH = 640;
const DESKTOP_HEIGHT = 168;
const MOBILE_HEIGHT = 196;
const DESKTOP_MARGIN = { top: 10, right: 12, bottom: 28, left: 56 };
const MOBILE_MARGIN = { top: 8, right: 4, bottom: 22, left: 4 };

function shortChartDate(iso: string, compact = false): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-US",
    compact
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "2-digit" },
  );
}

function formatPrice(value: number, currency: string): string {
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function niceStep(span: number, tickCount: number): number {
  const raw = span / Math.max(1, tickCount - 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice =
    normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1;
  return nice * magnitude;
}

function nicePriceAxis(
  dataMin: number,
  dataMax: number,
  tickCount = 4,
): { axisMin: number; axisMax: number; ticks: number[] } {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return { axisMin: 0, axisMax: 1, ticks: [] };
  }
  if (dataMin === dataMax) {
    const pad = Math.max(Math.abs(dataMin) * 0.02, 0.5);
    return {
      axisMin: dataMin - pad,
      axisMax: dataMax + pad,
      ticks: [dataMin],
    };
  }

  const step = niceStep(dataMax - dataMin, tickCount);
  const axisMin = Math.floor(dataMin / step) * step;
  const axisMax = Math.ceil(dataMax / step) * step;
  const decimals = step < 1 ? 2 : step < 10 ? 1 : 0;
  const ticks: number[] = [];
  for (let v = axisMin; v <= axisMax + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(decimals)));
  }
  return { axisMin, axisMax, ticks };
}

function formatAxisPrice(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

type Props = {
  series: PriceHistoryPoint[];
  ticker: string;
  currency: string;
};

export function ReturnsPriceChart({ series, ticker, currency }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const height = compact ? MOBILE_HEIGHT : DESKTOP_HEIGHT;
  const margin = compact ? MOBILE_MARGIN : DESKTOP_MARGIN;

  const pricePoints = useMemo(
    () =>
      series
        .filter((p) => typeof p.close === "number" && Number.isFinite(p.close))
        .slice(-MAX_CHART_POINTS),
    [series],
  );

  const plotWidth = WIDTH - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const chart = useMemo(() => {
    if (pricePoints.length < PRICE_HISTORY_CHART_MIN) return null;

    const closes = pricePoints.map((p) => p.close);
    const dataMin = Math.min(...closes);
    const dataMax = Math.max(...closes);
    const { axisMin, axisMax, ticks: yTicks } = nicePriceAxis(
      dataMin,
      dataMax,
      compact ? 3 : 4,
    );
    const range = axisMax - axisMin || 1;
    const positive = closes[closes.length - 1] >= closes[0];
    const stroke = positive ? "#10b981" : "#ef4444";
    const step = plotWidth / Math.max(1, closes.length - 1);
    const valueToY = (v: number) => margin.top + (1 - (v - axisMin) / range) * plotHeight;

    const pts = closes.map((v, i) => ({
      x: margin.left + i * step,
      y: valueToY(v),
      close: v,
      date: pricePoints[i].date,
    }));

    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const areaPath = [
      linePath,
      `L ${pts[pts.length - 1].x.toFixed(2)} ${margin.top + plotHeight}`,
      `L ${pts[0].x.toFixed(2)} ${margin.top + plotHeight}`,
      "Z",
    ].join(" ");

    const periodReturn =
      closes[0] > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : null;

    return {
      pts,
      linePath,
      areaPath,
      stroke,
      positive,
      periodReturn,
      yTicks,
      valueToY,
      fillId: `returns-chart-${ticker.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    };
  }, [compact, height, margin, plotHeight, plotWidth, ticker, pricePoints]);

  if (!chart) return null;

  const active = hoverIndex != null ? chart.pts[hoverIndex] : null;

  const handlePointer = (clientX: number) => {
    const root = rootRef.current;
    if (!root || chart.pts.length === 0) return;
    const rect = root.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const x = Math.max(margin.left, Math.min(margin.left + plotWidth, ratio * WIDTH));
    const idx = Math.round(((x - margin.left) / plotWidth) * (chart.pts.length - 1));
    setHoverIndex(Math.max(0, Math.min(chart.pts.length - 1, idx)));
  };

  const periodReturnLabel =
    chart.periodReturn != null &&
    Number.isFinite(chart.periodReturn) &&
    Math.abs(chart.periodReturn) >= 0.05
      ? compact
        ? `${chart.periodReturn >= 0 ? "+" : ""}${chart.periodReturn.toFixed(1)}% · ${pricePoints.length}d`
        : `${chart.periodReturn >= 0 ? "+" : ""}${chart.periodReturn.toFixed(1)}% over ${pricePoints.length} sessions`
      : null;

  return (
    <div ref={rootRef} className="flex w-full max-w-[640px] flex-col gap-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 text-[11px]">
        <div className="flex items-center gap-2.5 text-[#6b7280]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-4 rounded-full" style={{ background: chart.stroke }} aria-hidden />
            <span className="font-medium text-[#374151]">Daily close</span>
          </span>
          <span className="text-[#9ca3af]">{ticker}</span>
        </div>
        {periodReturnLabel ? (
          <span
            className={`font-semibold tabular-nums ${chart.positive ? "text-[#10b981]" : "text-[#ef4444]"}`}
          >
            {periodReturnLabel}
          </span>
        ) : null}
      </div>

      <div className="relative">
        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 shadow-[0_4px_16px_rgba(17,24,39,0.08)]"
            style={{
              left: `${Math.min(92, Math.max(8, (active.x / WIDTH) * 100))}%`,
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
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-[196px] w-full touch-none select-none sm:h-[168px]"
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
            const y = chart.valueToY(tick);
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  x2={margin.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="#f3f4f6"
                  strokeWidth="1"
                />
                {!compact ? (
                  <text
                    x={margin.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[#9ca3af] text-[10px]"
                  >
                    {formatAxisPrice(tick)}
                  </text>
                ) : null}
              </g>
            );
          })}

          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
          />

          <path d={chart.areaPath} fill={`url(#${chart.fillId})`} />
          <path
            d={chart.linePath}
            fill="none"
            stroke={chart.stroke}
            strokeWidth={compact ? 2.25 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active ? (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={margin.top}
                y2={margin.top + plotHeight}
                stroke={chart.stroke}
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.55"
              />
              <circle cx={active.x} cy={active.y} r="4" fill="#ffffff" stroke={chart.stroke} strokeWidth="2" />
            </g>
          ) : null}

          <text
            x={margin.left}
            y={height - 6}
            className="fill-[#9ca3af] text-[10px]"
          >
            {shortChartDate(pricePoints[0].date, compact)}
          </text>
          <text
            x={margin.left + plotWidth}
            y={height - 6}
            textAnchor="end"
            className="fill-[#9ca3af] text-[10px]"
          >
            {shortChartDate(pricePoints[pricePoints.length - 1].date, compact)}
          </text>
        </svg>
      </div>
    </div>
  );
}
