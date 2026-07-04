"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; close: number };

export type PriceChartZone = {
  zoneKey?: "add" | "trim" | "break";
  price: number;
  priceTo?: number;
  mode: "shade_below" | "shade_above" | "line" | "band";
  /** When mode is band and priceTo is missing, extend a visible band above/below price. */
  bandExtend?: "above" | "below";
  color: string;
  label: string;
  dashed?: boolean;
  /** Reference line opacity (line mode only). */
  strokeOpacity?: number;
};

function niceStep(span: number, tickCount: number): number {
  const raw = span / Math.max(1, tickCount - 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1;
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
    return { axisMin: dataMin - pad, axisMax: dataMax + pad, ticks: [dataMin] };
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

function formatAxisPrice(value: number, currency: string): string {
  if (value >= 1000) return `${currency}${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return `${currency}${value.toFixed(0)}`;
  if (value >= 10) return `${currency}${value.toFixed(1)}`;
  return `${currency}${value.toFixed(2)}`;
}

function shortChartDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function resolveBandPrices(
  zone: PriceChartZone,
  range: number,
): { low: number; high: number } | null {
  if (zone.mode !== "band") return null;
  if (zone.priceTo != null && Number.isFinite(zone.priceTo)) {
    return {
      low: Math.min(zone.price, zone.priceTo),
      high: Math.max(zone.price, zone.priceTo),
    };
  }
  const span = Math.max(range * 0.18, zone.price * 0.05);
  if (zone.bandExtend === "above") {
    return { low: zone.price, high: zone.price + span };
  }
  if (zone.bandExtend === "below") {
    return { low: zone.price - span, high: zone.price };
  }
  return null;
}

type ChartRow = Point & { dateLabel: string };

type ChartRangeKey = "3m" | "6m" | "max";

const RANGE_SESSIONS: Record<Exclude<ChartRangeKey, "max">, number> = {
  "3m": 63,
  "6m": 126,
};

const RANGE_LABELS: Record<ChartRangeKey, string> = {
  "3m": "3M",
  "6m": "6M",
  max: "Max",
};

function availableRanges(data: Point[]): ChartRangeKey[] {
  if (data.length < 5) return [];
  const ranges: ChartRangeKey[] = [];
  if (data.length >= 35) ranges.push("3m");
  if (data.length >= 90) ranges.push("6m");
  ranges.push("max");
  return ranges;
}

function defaultRange(data: Point[]): ChartRangeKey {
  const ranges = availableRanges(data);
  if (ranges.includes("3m")) return "3m";
  if (ranges.includes("6m")) return "6m";
  return "max";
}

function sliceByRange(data: Point[], key: ChartRangeKey): Point[] {
  if (key === "max" || data.length < 5) return data;
  const sessions = RANGE_SESSIONS[key];
  return data.length > sessions ? data.slice(-sessions) : data;
}

function periodReturnPct(data: Point[], endPrice?: number): number | null {
  if (data.length < 2) return null;
  const start = data[0]!.close;
  const end = typeof endPrice === "number" && Number.isFinite(endPrice) ? endPrice : data[data.length - 1]!.close;
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end)) return null;
  return ((end - start) / start) * 100;
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  const money = (v: number) =>
    `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-1.5 shadow-md">
      <p className="text-[11px] font-semibold tabular-nums text-on-surface">{money(row.close)}</p>
      <p className="text-[10px] text-on-surface-variant">{row.dateLabel}</p>
    </div>
  );
}

function zoneBandTag(zone: PriceChartZone): string | null {
  if (zone.zoneKey === "add") return "accumulate";
  if (zone.zoneKey === "trim") return "trim";
  return null;
}

function ZoneBandLabel({
  viewBox,
  text,
  color,
}: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  text: string;
  color: string;
}) {
  if (viewBox?.x == null || viewBox?.y == null || viewBox?.width == null || viewBox?.height == null) return null;
  if (viewBox.height < 12) return null;

  return (
    <text
      x={viewBox.x + 10}
      y={viewBox.y + viewBox.height / 2 + 3.5}
      fill={color}
      fillOpacity={0.82}
      fontSize={10}
      fontWeight={600}
      letterSpacing="0.11em"
    >
      {text.toUpperCase()}
    </text>
  );
}

function ZoneLayers({
  zones,
  domainMin,
  domainMax,
  roughRange,
}: {
  zones: PriceChartZone[];
  domainMin: number;
  domainMax: number;
  roughRange: number;
}) {
  return (
    <>
      {zones.map((zone, i) => {
        if (zone.mode === "band") {
          const band = resolveBandPrices(zone, roughRange);
          if (!band) return null;
          const tag = zoneBandTag(zone);
          return (
            <ReferenceArea
              key={`zone-band-${i}`}
              y1={band.low}
              y2={band.high}
              fill={zone.color}
              fillOpacity={0.14}
              strokeOpacity={0}
              ifOverflow="hidden"
              label={
                tag
                  ? (props) => <ZoneBandLabel {...props} text={tag} color={zone.color} />
                  : undefined
              }
            />
          );
        }

        if (zone.mode === "shade_below") {
          return (
            <ReferenceArea
              key={`zone-shade-b-${i}`}
              y1={domainMin}
              y2={zone.price}
              fill={zone.color}
              fillOpacity={0.1}
              strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          );
        }

        if (zone.mode === "shade_above") {
          return (
            <ReferenceArea
              key={`zone-shade-a-${i}`}
              y1={zone.price}
              y2={domainMax}
              fill={zone.color}
              fillOpacity={0.1}
              strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          );
        }

        if (zone.mode === "line") {
          return (
            <ReferenceLine
              key={`zone-line-${i}`}
              y={zone.price}
              stroke={zone.color}
              strokeDasharray={zone.dashed ? "6 5" : "4 3"}
              strokeOpacity={zone.strokeOpacity ?? 0.7}
              strokeWidth={1.5}
            />
          );
        }

        return null;
      })}
    </>
  );
}

type ChartLayout = "mobile" | "tablet" | "desktop";

function useChartLayout(): ChartLayout {
  const [layout, setLayout] = useState<ChartLayout>("desktop");

  useEffect(() => {
    const sync = () => {
      const w = window.innerWidth;
      if (w < 640) setLayout("mobile");
      else if (w < 1024) setLayout("tablet");
      else setLayout("desktop");
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return layout;
}

const CHART_MARGIN: Record<ChartLayout, { top: number; right: number; bottom: number; left: number }> = {
  mobile: { top: 24, right: 4, bottom: 2, left: 2 },
  tablet: { top: 36, right: 10, bottom: 4, left: 6 },
  desktop: { top: 28, right: 4, bottom: 2, left: 0 },
};

const LABEL_OFFSET: Record<ChartLayout, { gapX: number; gapY: number }> = {
  mobile: { gapX: 12, gapY: 14 },
  tablet: { gapX: 18, gapY: 22 },
  desktop: { gapX: 14, gapY: 16 },
};

function computeLabelPosition(
  cx: number,
  cy: number,
  boxW: number,
  boxH: number,
  gapX: number,
  gapY: number,
) {
  const nearTop = cy < boxH + gapY + 10;

  if (nearTop) {
    const boxX = Math.max(6, cx - boxW - gapX);
    const boxY = cy - boxH / 2;
    return { boxX, boxY, anchorX: cx - 5, anchorY: cy };
  }

  const boxX = Math.max(6, cx - boxW - gapX);
  const boxY = cy - boxH - gapY;
  return { boxX, boxY, anchorX: cx - 4, anchorY: cy - 4 };
}

function LastPointMarker({
  cx,
  cy,
  index,
  dataLength,
  stroke,
  label,
  gapX,
  gapY,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  dataLength: number;
  stroke: string;
  label: string;
  gapX: number;
  gapY: number;
}) {
  if (cx == null || cy == null || index !== dataLength - 1) return null;

  const padX = 8;
  const boxW = Math.max(84, Math.ceil(label.length * 7.1) + padX * 2);
  const boxH = 20;
  const { boxX, boxY, anchorX, anchorY } = computeLabelPosition(cx, cy, boxW, boxH, gapX, gapY);

  return (
    <g>
      <line
        x1={cx}
        y1={cy}
        x2={anchorX}
        y2={anchorY}
        stroke={stroke}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeDasharray="3 3"
      />
      <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="var(--surface)" strokeWidth={2} />
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={6}
        fill="var(--surface)"
        stroke="var(--outline-variant)"
        strokeOpacity={0.55}
      />
      <text
        x={boxX + padX}
        y={boxY + 14}
        textAnchor="start"
        fontSize={11}
        fontWeight={600}
        fill="var(--on-surface)"
      >
        {label}
      </text>
    </g>
  );
}

/** Price line with optional zones, y-axis range, and hover tooltip. */
export function PriceChart({
  data,
  sma50,
  sma200,
  currency,
  zoneBelow,
  zoneAbove,
  zones,
  zoneColor = "var(--signal-bullish)",
  zoneLabel,
  lineColor,
  embedded,
  currentPrice,
  height: heightProp,
}: {
  data: Point[];
  sma50?: number;
  sma200?: number;
  currency: string;
  zoneBelow?: number;
  zoneAbove?: number;
  zones?: PriceChartZone[];
  zoneColor?: string;
  zoneLabel?: string;
  lineColor?: string;
  /** Drop card chrome — for inline hero charts. */
  embedded?: boolean;
  /** Highlight live quote on the right edge of the chart. */
  currentPrice?: number;
  /** Override chart height in px (embedded layouts). */
  height?: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  const layout = useChartLayout();
  const chartMargin = CHART_MARGIN[layout];
  const labelOffset = LABEL_OFFSET[layout];

  const legacyZones: PriceChartZone[] = [];
  if (typeof zoneBelow === "number" && Number.isFinite(zoneBelow)) {
    legacyZones.push({
      price: zoneBelow,
      mode: "shade_below",
      color: zoneColor,
      label: zoneLabel ?? "",
      dashed: false,
    });
  }
  if (typeof zoneAbove === "number" && Number.isFinite(zoneAbove)) {
    legacyZones.push({
      price: zoneAbove,
      mode: "shade_above",
      color: zoneColor,
      label: zoneLabel ?? "",
      dashed: false,
    });
  }
  const chartZones = zones?.length ? zones : legacyZones;

  const chartData = useMemo<ChartRow[]>(
    () =>
      data.map((p) => ({
        ...p,
        dateLabel: shortChartDate(p.date),
      })),
    [data],
  );

  const scale = useMemo(() => {
    const closes = data.map((p) => p.close);
    const scaleValues = [
      ...closes,
      sma50,
      sma200,
      currentPrice,
      ...chartZones.map((z) => z.price),
      ...chartZones.map((z) => z.priceTo).filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
    ].filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    let dataLo = Math.min(...scaleValues);
    let dataHi = Math.max(...scaleValues);
    const roughRange = Math.max(dataHi - dataLo, 1);

    for (const zone of chartZones) {
      const band = resolveBandPrices(zone, roughRange);
      if (band) {
        dataLo = Math.min(dataLo, band.low);
        dataHi = Math.max(dataHi, band.high);
      }
    }

    const { axisMin, axisMax, ticks } = nicePriceAxis(dataLo, dataHi, 4);
    const pad = Math.max((axisMax - axisMin) * 0.1, roughRange * 0.04);

    return {
      domainMin: axisMin - pad,
      domainMax: axisMax + pad,
      yTicks: ticks,
      roughRange,
    };
  }, [chartZones, currentPrice, data, sma200, sma50]);

  const priceStroke = lineColor ?? "var(--signal-bullish)";
  const livePrice =
    typeof currentPrice === "number" && Number.isFinite(currentPrice)
      ? currentPrice
      : data[data.length - 1]?.close;
  const money = (v: number) =>
    `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const height =
    heightProp ??
    (embedded ? (layout === "tablet" ? 236 : 228) : layout === "tablet" ? 252 : 244);

  return (
    <div
      className={`w-full select-none ${embedded ? "px-1 sm:px-0 md:px-1" : "overflow-hidden rounded-xl border border-outline-variant/40 bg-surface"}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={chartMargin}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={priceStroke} stopOpacity={0.22} />
              <stop offset="95%" stopColor={priceStroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--outline-variant)"
            strokeOpacity={0.28}
          />

          <XAxis
            dataKey="dateLabel"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={{ fontSize: 10, fill: "var(--on-surface-variant)", opacity: 0.75 }}
            dy={6}
          />

          <YAxis
            orientation="right"
            domain={[scale.domainMin, scale.domainMax]}
            ticks={scale.yTicks}
            axisLine={false}
            tickLine={false}
            width={48}
            tick={{ fontSize: 10, fill: "var(--on-surface-variant)", opacity: 0.8 }}
            tickFormatter={(v) => formatAxisPrice(v, currency)}
          />

          <Tooltip
            cursor={{ stroke: "var(--on-surface-variant)", strokeWidth: 1, strokeDasharray: "4 3", opacity: 0.35 }}
            content={<ChartTooltip currency={currency} />}
          />

          <ZoneLayers
            zones={chartZones}
            domainMin={scale.domainMin}
            domainMax={scale.domainMax}
            roughRange={scale.roughRange}
          />

          {typeof sma200 === "number" && Number.isFinite(sma200) && (
            <ReferenceLine
              y={sma200}
              stroke="var(--on-surface-variant)"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
          )}
          {typeof sma50 === "number" && Number.isFinite(sma50) && (
            <ReferenceLine
              y={sma50}
              stroke="var(--on-surface-variant)"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              strokeWidth={1}
            />
          )}

          <Area
            type="monotone"
            dataKey="close"
            stroke={priceStroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={
              typeof livePrice === "number" && Number.isFinite(livePrice)
                ? (props) => (
                    <LastPointMarker
                      cx={props.cx}
                      cy={props.cy}
                      index={props.index}
                      dataLength={chartData.length}
                      stroke={priceStroke}
                      label={`Now ${money(livePrice)}`}
                      gapX={labelOffset.gapX}
                      gapY={labelOffset.gapY}
                    />
                  )
                : false
            }
            activeDot={{
              r: 4,
              fill: priceStroke,
              stroke: "var(--surface)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
