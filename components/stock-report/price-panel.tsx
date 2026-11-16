"use client";

import { useEffect, useMemo, useState } from "react";

import { placeMarkers, spreadLane, unpackChartRanges, type ChartEvent, type ChartEventKind, type ChartRange, type ChartRangeKey, type PackedChartRanges } from "@/lib/stock-chart";

import { fmtDate, signedPct } from "./format";

/**
 * The price chart at the top of the stock report.
 *
 * Ranges switch on the client without a request: the server sends every range
 * already thinned. The line is inline SVG stretched to the box with
 * non-scaling strokes; every label is HTML over it, so text stays readable on
 * a phone. Event markers sit in a lane under the plot and the tooltip lists
 * what happened on that day.
 */

export type PanelZone = {
  key: string;
  price: number;
  /** Which side of the price the zone covers. */
  side: "below" | "above";
  label: string;
  tone: "up" | "down";
};

export type PanelLevel = { key: string; price: number; label: string };

const GRID = "color-mix(in srgb, var(--oa-fg) 8%, transparent)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TONE = { up: "var(--signal-bullish)", down: "var(--signal-bearish)" } as const;

// A "move" has no letter: its box shows the move itself (▼11%), which needs no legend lesson (owner rule: plain numbers
// beat clever encodings).
const MARKER_LETTER: Record<ChartEventKind, string> = { call: "C", earnings: "E", move: "M", congress: "T", insider: "T" };
const MARKER_NAME: Record<ChartEventKind, string> = {
  call: "Our call changed",
  earnings: "Earnings",
  move: "Big move",
  congress: "Large disclosed trade",
  insider: "Large disclosed trade",
};

function Arrow({ up, className = "" }: { up: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" className={`shrink-0 fill-current ${className}`}>
      <path d={up ? "M5 1.5 9 8H1z" : "M5 8.5 1 2h8z"} />
    </svg>
  );
}

/** "−11%" in the lane, "−11.0%" in the tooltip: whole numbers in the box from 10% up, one decimal under it. */
function movePct(pct: number, exact = false): string {
  const digits = exact || Math.abs(pct) < 10 ? 1 : 0;
  return `${Math.abs(pct).toFixed(digits)}%`;
}

function moveSpan(event: ChartEvent): string {
  if (!event.endDate || event.endDate === event.date) return fmtDate(event.date, false);
  const sameMonth = event.date.slice(0, 7) === event.endDate.slice(0, 7);
  return sameMonth ? `${fmtDate(event.date, false)}–${Number(event.endDate.slice(8, 10))}` : `${fmtDate(event.date, false)} – ${fmtDate(event.endDate, false)}`;
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toPrecision(10)));
  return ticks;
}

function axisPrice(value: number, currency: string): string {
  if (value >= 10_000) return `${currency}${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `${currency}${(value / 1000).toFixed(1)}k`;
  if (value >= 10) return `${currency}${value.toFixed(0)}`;
  return `${currency}${value.toFixed(2)}`;
}

function money(value: number, currency: string): string {
  return `${currency}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PlotLabel = {
  key: string;
  side: "left" | "right";
  /** Where the label wants to sit, in percent of the plot height. */
  want: number;
  text: string;
  /** A zone label takes its zone's colour; a level label stays quiet. */
  tone: "up" | "down" | null;
};

/**
 * Move labels apart so no two sit closer than `gap` percent, keeping their
 * order and keeping every one inside the plot. Returns the top of each label
 * by key.
 */
function spreadLabels(labels: PlotLabel[], gap: number): Map<string, number> {
  const sorted = [...labels].sort((a, b) => a.want - b.want);
  const lo = gap / 2;
  const hi = 100 - gap / 2;
  const tops: number[] = [];
  sorted.forEach((label, index) => {
    tops.push(Math.max(lo, label.want, index > 0 ? tops[index - 1]! + gap : lo));
  });
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const ceiling = index === sorted.length - 1 ? hi : tops[index + 1]! - gap;
    if (tops[index]! > ceiling) tops[index] = ceiling;
  }
  return new Map(sorted.map((label, index) => [label.key, tops[index]!]));
}

/** Up to six labels along the time axis: days, months or years depending on the span. */
/** The chart's return said as a period a person would name ("over the past year", not "over 1Y"). */
const PERIOD_WORDS: Record<string, string> = {
  // Short enough to sit beside the range tabs on a 390px phone.
  "1M": "in a month",
  "6M": "in 6 months",
  "1Y": "in a year",
  "5Y": "in 5 years",
  MAX: "all time",
};

function timeMarks(points: ChartRange["points"]): Array<{ x: number; label: string }> {
  const n = points.length;
  if (n < 2) return [];
  const spanDays = (Date.parse(points[n - 1]!.date) - Date.parse(points[0]!.date)) / 86_400_000;
  const marks: Array<{ x: number; label: string }> = [];
  const at = (index: number) => (index / (n - 1)) * 100;
  if (spanDays <= 45) {
    const stride = Math.max(1, Math.round(n / 5));
    for (let i = stride; i < n - 1; i += stride) {
      const date = points[i]!.date;
      marks.push({ x: at(i), label: `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}` });
    }
    return marks;
  }
  const byYear = spanDays > 800;
  let prev = "";
  points.forEach((point, index) => {
    const key = byYear ? point.date.slice(0, 4) : point.date.slice(0, 7);
    if (key !== prev) {
      if (prev) {
        const month = Number(point.date.slice(5, 7));
        marks.push({
          x: at(index),
          label: byYear ? point.date.slice(0, 4) : month === 1 ? `Jan ${point.date.slice(2, 4)}` : MONTHS[month - 1] ?? "",
        });
      }
      prev = key;
    }
  });
  const stride = Math.max(1, Math.ceil(marks.length / 6));
  // Drop labels at the edges and any that would sit on top of the one before.
  const spaced: Array<{ x: number; label: string }> = [];
  for (const mark of marks.filter((_, index) => index % stride === 0)) {
    if (mark.x <= 3 || mark.x >= 95) continue;
    const prev = spaced[spaced.length - 1];
    if (prev && mark.x - prev.x < 9) continue;
    spaced.push(mark);
  }
  return spaced;
}

export function PricePanel({
  ticker,
  ranges: rangesProp,
  packed,
  events,
  zones = [],
  levels = [],
  currency,
  defaultRange = "1Y",
}: {
  ticker: string;
  /** The ranges as they are, or `packed` (one shared series, see packChartRanges), which is smaller to send. */
  ranges?: ChartRange[];
  packed?: PackedChartRanges | null;
  events: ChartEvent[];
  zones?: PanelZone[];
  levels?: PanelLevel[];
  currency: string;
  defaultRange?: ChartRangeKey;
}) {
  const ranges = useMemo(() => rangesProp ?? (packed ? unpackChartRanges(packed) : []), [rangesProp, packed]);
  const initial = ranges.find((range) => range.key === defaultRange)?.key ?? ranges[ranges.length - 1]?.key;
  const [activeKey, setActiveKey] = useState<ChartRangeKey | undefined>(initial);
  const [hover, setHover] = useState<number | null>(null);
  // The lane box last pointed at or focused (its position in `markers`): a move and another marker can share a day,
  // and the tooltip must show the one under the pointer.
  const [laneHover, setLaneHover] = useState<number | null>(null);

  const range = ranges.find((item) => item.key === activeKey) ?? ranges[ranges.length - 1];
  const points = useMemo(() => range?.points ?? [], [range]);
  // The lane's width in pixels and whether the numbers show (sm up), so boxes that would overlap can be spread apart.
  // Before the first measure (server render) every box sits on its own day.
  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
  const [lane, setLane] = useState<{ px: number; wide: boolean } | null>(null);
  useEffect(() => {
    if (!plotEl || typeof ResizeObserver === "undefined") return;
    const wideQuery = window.matchMedia("(min-width: 640px)");
    const measure = () => setLane({ px: plotEl.clientWidth, wide: wideQuery.matches });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plotEl);
    wideQuery.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wideQuery.removeEventListener("change", measure);
    };
  }, [plotEl]);
  const markers = useMemo(() => placeMarkers(points, events), [points, events]);
  // The marker lane only takes room when there are markers; without it the month labels sit right under the line.
  const plotBottom = markers.length ? "bottom-11" : "bottom-6";
  // One legend entry per letter: Congress and insider trades share "T".
  const markerKinds = useMemo(() => {
    const seen = new Set<string>();
    const kinds: ChartEventKind[] = [];
    for (const marker of markers) {
      const letter = MARKER_LETTER[marker.kind];
      if (seen.has(letter)) continue;
      seen.add(letter);
      kinds.push(marker.kind);
    }
    return kinds;
  }, [markers]);

  if (!range || points.length < 5) return null;

  const n = points.length;
  const closes = points.map((point) => point.close);
  const last = closes[n - 1]!;
  const dataMin = Math.min(...closes);
  const dataMax = Math.max(...closes);
  const dataSpan = Math.max(dataMax - dataMin, dataMax * 0.02);

  // A zone may stretch the axis by up to 30% of the price range on either side.
  // Further away than that it is pinned to the edge with an arrow, so a distant
  // level never squashes the price line into a sliver.
  let lo = dataMin;
  let hi = dataMax;
  for (const price of [...zones.map((zone) => zone.price), ...levels.map((level) => level.price)]) {
    if (price < dataMin && dataMin - price <= dataSpan * 0.3) lo = Math.min(lo, price);
    if (price > dataMax && price - dataMax <= dataSpan * 0.3) hi = Math.max(hi, price);
  }
  const pad = (hi - lo) * 0.07;
  lo -= pad;
  hi += pad;

  const y = (value: number) => ((hi - value) / (hi - lo)) * 100;
  const clampY = (value: number) => Math.max(0, Math.min(100, y(value)));
  const off = (value: number): "above" | "below" | null => (value > hi ? "above" : value < lo ? "below" : null);
  const x = (index: number) => (index / (n - 1)) * 100;

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.close).toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  const lastY = clampY(last);
  const ticks = niceTicks(lo, hi, 4).filter((tick) => y(tick) > 5 && y(tick) < 95);
  const marks = timeMarks(points);
  const up = range.changePct >= 0;
  const lineColor = up ? TONE.up : TONE.down;

  // Every label over the plot, placed in one pass so none can sit on another.
  // A label goes on the far side of its line from the price: under a level
  // below the price, over a level above it, so the line's end stays clear.
  // At most two labels inside the plot: the last price on the axis, plus the
  // one zone nearest to it when that zone is on the chart's scale. A zone off
  // the scale gets no label and no arrow; the range bar above the chart
  // carries both zones in full.
  const nearestZone = zones
    .filter((zone) => !off(zone.price))
    .sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last))[0];
  const plotLabels: PlotLabel[] = nearestZone
    ? [
        {
          key: `zone-${nearestZone.key}`,
          side: "left",
          want: nearestZone.side === "below" ? clampY(nearestZone.price) + 6 : clampY(nearestZone.price) - 6,
          text: nearestZone.label,
          tone: nearestZone.tone,
        },
      ]
    : [];
  // The plot is 252px tall from the sm breakpoint and 192px below it, and a
  // label is 20px. Wide: the two sides have room to pass each other, so each
  // side is spread on its own. Narrow: a left and a right label can meet in
  // the middle, so all of them share one stack.
  const wideTops = new Map([
    ...spreadLabels(plotLabels.filter((label) => label.side === "left"), 9.5),
    ...spreadLabels(plotLabels.filter((label) => label.side === "right"), 9.5),
  ]);
  const narrowTops = spreadLabels(plotLabels, 12);

  const hoverPoint = hover != null ? points[hover] : null;
  const nearestMarker =
    hover != null
      ? markers.reduce<(typeof markers)[number] | null>((best, marker) => {
          const distance = Math.abs(marker.index - hover);
          if (distance > Math.max(1, n * 0.012)) return best;
          return !best || distance < Math.abs(best.index - hover) ? marker : best;
        }, null)
      : null;
  const pinnedMarker = laneHover != null ? markers[laneHover] : undefined;
  // From a lane box: that box. From the plot: everything on the nearest marked day, since a move keeps its own box
  // even on a day that has another marker.
  const hoverMarker =
    pinnedMarker && pinnedMarker.index === hover
      ? pinnedMarker
      : nearestMarker
        ? { ...nearestMarker, events: markers.filter((marker) => marker.index === nearestMarker.index).flatMap((marker) => marker.events) }
        : null;
  const hoverX = hover != null ? x(hover) : 0;

  // A move that ran over several days on one story (Nvidia's CEO, Nov 9–12) shades the days it covers.
  const bands = markers.flatMap((marker, markerIndex) => {
    const lead = marker.events[0];
    if (marker.kind !== "move" || !lead?.endDate || lead.endDate === lead.date) return [];
    let end = marker.index;
    while (end + 1 < n && points[end + 1]!.date <= lead.endDate) end += 1;
    // The band starts at the close before the move, so it covers the whole drop or climb on the line.
    const start = Math.max(0, marker.index - 1);
    return end > start ? [{ key: `band-${markerIndex}`, from: x(start), to: x(end), up: (lead.pct ?? 0) >= 0 }] : [];
  });
  const moveUp = (marker: (typeof markers)[number]) => (marker.events[0]?.pct ?? 0) >= 0;
  // Each box's width in pixels, from what it shows: a 20px square, plus the arrow and number from sm up. The lane's
  // text-[10px] renders at 13px (the type floor in globals.css), where a tabular figure is about 7.2px, "." 4px and
  // "%" 9.5px, a pixel or so over what the browser measures. Move box: 1px borders, px-1, 8px arrow, 2px gap, then
  // the number. Earnings box: the same plus the "E" (9.5px) and its 2px margin. Boxes that would touch are spread
  // apart, each as near its own day as room allows.
  const boxWidth = (marker: (typeof markers)[number]) => {
    const pct = marker.events[0]?.pct;
    if (!lane?.wide || pct === undefined || (marker.kind !== "move" && marker.kind !== "earnings")) return 20;
    const text = [...movePct(pct)].reduce((sum, char) => sum + (char === "." ? 4 : char === "%" ? 9.5 : 7.2), 0);
    return Math.ceil(marker.kind === "move" ? 2 + 8 + 8 + 2 + text : 2 + 8 + 9.5 + 2 + 8 + 2 + text);
  };
  const laneLeft =
    lane && lane.px > 0 && n > 1
      ? spreadLane(markers.map((marker) => ({ x: (x(marker.index) / 100) * lane.px, width: boxWidth(marker) })), lane.px).map(
          (centre) => `${centre}px`,
        )
      : markers.map((marker) => `${x(marker.index)}%`);

  const pointAt = (index: number | null, markerIndex: number | null) => {
    setHover(index);
    setLaneHover(markerIndex);
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setHover(Math.round(fraction * (n - 1)));
    setLaneHover(null);
  };

  return (
    <figure className="m-0">
      <div className="flex items-center justify-between gap-x-3 px-3.5 pb-2 pt-3 sm:px-4">
        <div className="flex items-center gap-0.5 rounded-lg bg-oa-bg p-0.5" role="group" aria-label="Chart range">
          {ranges.map((item) => {
            const active = item.key === range.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveKey(item.key);
                  setHover(null);
                  setLaneHover(null);
                }}
                className={`oa-mono h-10 min-w-9 rounded-md px-1.5 text-[12.5px] font-medium min-[360px]:min-w-10 min-[360px]:px-2 sm:h-7 sm:min-w-9 sm:text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
                  active ? "bg-oa-card text-oa-fg shadow-[0_1px_2px_rgba(40,25,5,0.14)]" : "text-oa-muted-fg hover:text-oa-fg"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="oa-mono shrink-0 whitespace-nowrap text-[12px] leading-5 text-oa-muted-fg">
          <span className="font-medium" style={{ color: lineColor }}>
            {signedPct(range.changePct, Math.abs(range.changePct) >= 100 ? 0 : 1)}
          </span>{" "}
          <span className="max-[359px]:hidden sm:hidden">{PERIOD_WORDS[range.key] ?? `over ${range.label}`}</span>
          <span className="hidden sm:inline">since {fmtDate(range.fromDate)}</span>
        </p>
      </div>

      <div
        className="relative mb-3 h-[210px] w-full select-none sm:h-[340px]"
        role="img"
        aria-label={`${ticker} price, ${range.label} range: ${money(points[0]!.close, currency)} on ${fmtDate(points[0]!.date)} to ${money(last, currency)} on ${fmtDate(points[n - 1]!.date)}, ${signedPct(range.changePct)}. ${markers.length} marked events.`}
      >
        {/* plot */}
        <div
          ref={setPlotEl}
          className={`absolute ${plotBottom} left-0 right-14 top-1 touch-pan-y`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {ticks.map((tick) => (
              <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {zones.map((zone) => {
              const at = clampY(zone.price);
              const top = zone.side === "below" ? at : 0;
              const height = zone.side === "below" ? 100 - at : at;
              if (height <= 0.5) return null;
              return (
                <rect key={`${zone.key}-fill`} x="0" width="100" y={top} height={height} fill={`color-mix(in srgb, ${TONE[zone.tone]} 9%, transparent)`} />
              );
            })}
            {bands.map((band) => (
              <rect
                key={band.key}
                x={band.from}
                width={band.to - band.from}
                y="0"
                height="100"
                fill={`color-mix(in srgb, ${band.up ? TONE.up : TONE.down} 10%, transparent)`}
              />
            ))}
            <path d={area} fill={`color-mix(in srgb, ${lineColor} 7%, transparent)`} />
            {zones.map((zone) =>
              off(zone.price) ? null : (
                <line
                  key={`${zone.key}-line`}
                  x1="0"
                  x2="100"
                  y1={y(zone.price)}
                  y2={y(zone.price)}
                  stroke={TONE[zone.tone]}
                  strokeWidth="1"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
            {levels.map((level) =>
              off(level.price) ? null : (
                <line
                  key={`${level.key}-line`}
                  x1="0"
                  x2="100"
                  y1={y(level.price)}
                  y2={y(level.price)}
                  stroke="var(--oa-muted-fg)"
                  strokeOpacity="0.55"
                  strokeWidth="1"
                  strokeDasharray="1.5 3.5"
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
            {markers.map((marker, markerIndex) => (
              <line
                key={`m-${markerIndex}`}
                x1={x(marker.index)}
                x2={x(marker.index)}
                y1={y(points[marker.index]!.close)}
                y2="100"
                stroke={marker.kind === "call" ? "var(--oa-primary)" : marker.kind === "move" ? (moveUp(marker) ? TONE.up : TONE.down) : "var(--oa-muted-fg)"}
                strokeOpacity={marker.kind === "call" ? 0.7 : marker.kind === "move" ? 0.5 : 0.35}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={line} fill="none" stroke={lineColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hover != null ? (
              <line x1={hoverX} x2={hoverX} y1="0" y2="100" stroke="var(--oa-fg)" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>

          {/* zone labels on the left, level labels on the right */}
          {plotLabels.map((label) => (
            <span
              key={label.key}
              className={`oa-mono pointer-events-none absolute top-[var(--label-narrow)] max-w-[70%] -translate-y-1/2 truncate rounded-[5px] bg-oa-card text-[13px] leading-5 sm:top-[var(--label-wide)] ${
                label.side === "left" ? "left-1.5" : "right-1.5"
              } ${label.tone ? "border border-oa-border px-1.5 font-medium" : "px-1 text-oa-muted-fg"}`}
              style={
                {
                  "--label-narrow": `${narrowTops.get(label.key)}%`,
                  "--label-wide": `${wideTops.get(label.key)}%`,
                  ...(label.tone ? { color: TONE[label.tone] } : {}),
                } as React.CSSProperties
              }
            >
              {label.text}
            </span>
          ))}

          {/* No dot on the line where something happened (owner rule 6: "no clue how to make sense of these dots"):
              the thin rule runs down to its lettered box in the lane, and the caption under the chart names each letter. */}

          {hoverPoint ? (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card"
                style={{ left: `${hoverX}%`, top: `${y(hoverPoint.close)}%`, background: lineColor }}
              />
              <div
                className="pointer-events-none absolute top-1 z-10 w-max rounded-lg border border-oa-border bg-oa-card px-2.5 py-1.5 shadow-[0_8px_24px_-12px_rgba(40,25,5,0.5)]"
                // Never wider than the room on its side (plus the price axis on the right), so a long line wraps
                // instead of running off the card on a phone.
                style={
                  hoverX > 55
                    ? { right: `${100 - hoverX + 1.5}%`, maxWidth: `min(17rem, 80%, ${hoverX - 1.5}%)` }
                    : { left: `${hoverX + 1.5}%`, maxWidth: `min(17rem, 80%, calc(${100 - hoverX - 1.5}% + 3.5rem))` }
                }
              >
                <p className="oa-mono text-[11px] leading-4 text-oa-muted-fg">{fmtDate(hoverPoint.date)}</p>
                <p className="oa-mono text-[14px] font-medium leading-5 text-oa-fg">
                  {money(hoverPoint.close, currency)}{" "}
                  <span className="text-[11px] font-normal text-oa-muted-fg">
                    {signedPct(((hoverPoint.close - points[0]!.close) / points[0]!.close) * 100)} in range
                  </span>
                </p>
                {hoverMarker
                  ? hoverMarker.events.slice(0, 3).map((event, index) =>
                      event.kind === "move" ? (
                        <p key={index} className="mt-1 border-t border-oa-border pt-1 text-[12px] leading-4 text-oa-fg">
                          <span className="oa-mono flex items-center gap-1 text-[11px] leading-4 text-oa-muted-fg">
                            <span
                              className="inline-flex items-center gap-0.5 font-medium"
                              style={{ color: (event.pct ?? 0) >= 0 ? TONE.up : TONE.down }}
                            >
                              <Arrow up={(event.pct ?? 0) >= 0} className="size-2" />
                              {movePct(event.pct ?? 0, true)}
                            </span>
                            · {moveSpan(event)}
                          </span>
                          <span className="block whitespace-normal font-medium">{event.title}</span>
                          {event.detail ? <span className="block whitespace-normal text-oa-muted-fg">{event.detail}</span> : null}
                        </p>
                      ) : (
                        <p key={index} className="mt-1 border-t border-oa-border pt-1 text-[12px] leading-4 text-oa-fg">
                          <span className="oa-mono text-[10px] uppercase tracking-[0.08em] text-oa-label">
                            {MARKER_NAME[event.kind]} · {fmtDate(event.date, false)}
                          </span>
                          <span className="block whitespace-normal">{event.title}</span>
                          {event.detail ? <span className="block whitespace-normal text-oa-muted-fg">{event.detail}</span> : null}
                        </p>
                      ),
                    )
                  : null}
                {hoverMarker && hoverMarker.events.length > 3 ? (
                  <p className="oa-mono mt-1 text-[11px] leading-4 text-oa-muted-fg">and {hoverMarker.events.length - 3} more around this date</p>
                ) : null}
              </div>
            </>
          ) : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0 size-2 -translate-y-1/2 translate-x-1/2 rounded-full border border-oa-card"
              style={{ top: `${lastY}%`, background: lineColor }}
            />
          )}
        </div>

        {/* price axis */}
        <div className={`absolute ${plotBottom} right-0 top-1 w-14`} aria-hidden="true">
          {ticks
            .filter((tick) => Math.abs(y(tick) - lastY) > 7)
            .map((tick) => (
              <span key={tick} className="oa-mono absolute right-2 -translate-y-1/2 text-[13px] leading-none text-oa-muted-fg" style={{ top: `${y(tick)}%` }}>
                {axisPrice(tick, currency)}
              </span>
            ))}
          <span
            className="oa-mono absolute right-1 -translate-y-1/2 rounded-[4px] px-1 py-[3px] text-[13px] font-medium leading-none text-oa-card"
            style={{ top: `${lastY}%`, background: lineColor }}
          >
            {axisPrice(last, currency)}
          </span>
        </div>

        {/* event lane, only when there are events to mark */}
        {markers.length ? (
        <div className="absolute bottom-5 left-0 right-14 h-5 border-t border-oa-border">
          {markers.map((marker, markerIndex) =>
            marker.kind === "move" ? (
              <button
                key={`lane-${markerIndex}`}
                type="button"
                onPointerEnter={() => pointAt(marker.index, markerIndex)}
                onFocus={() => pointAt(marker.index, markerIndex)}
                onBlur={() => pointAt(null, null)}
                onClick={() => pointAt(marker.index, markerIndex)}
                aria-label={`${marker.events[0] ? moveSpan(marker.events[0]) : fmtDate(marker.date)}: ${moveUp(marker) ? "up" : "down"} ${movePct(marker.events[0]?.pct ?? 0, true)}. ${marker.events.map((event) => event.title).join("; ")}`}
                className="oa-mono absolute top-1/2 inline-flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-[4px] border px-1 text-[10px] font-medium leading-none outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]"
                style={{
                  left: laneLeft[markerIndex],
                  color: moveUp(marker) ? TONE.up : TONE.down,
                  borderColor: `color-mix(in srgb, ${moveUp(marker) ? TONE.up : TONE.down} 45%, transparent)`,
                  background: `color-mix(in srgb, ${moveUp(marker) ? TONE.up : TONE.down} 10%, var(--oa-card))`,
                }}
              >
                <Arrow up={moveUp(marker)} className="size-2" />
                {/* The number from sm up; a phone's lane is too narrow for it, the tooltip has it. */}
                <span className="hidden sm:inline">{movePct(marker.events[0]?.pct ?? 0)}</span>
              </button>
            ) : (
            <button
              key={`lane-${markerIndex}`}
              type="button"
              onPointerEnter={() => pointAt(marker.index, markerIndex)}
              onFocus={() => pointAt(marker.index, markerIndex)}
              onBlur={() => pointAt(null, null)}
              onClick={() => pointAt(marker.index, markerIndex)}
              aria-label={`${fmtDate(marker.date)}: ${marker.events
                .map((event) => (event.kind === "earnings" && event.pct !== undefined && event.detail ? `${event.title}. ${event.detail}` : event.title))
                .join("; ")}`}
              className={`oa-mono absolute top-1/2 ${
                marker.kind === "earnings" && marker.events[0]?.pct !== undefined
                  ? "inline-flex h-5 min-w-5 items-center justify-center sm:px-1"
                  : "grid size-5 place-items-center"
              } -translate-x-1/2 -translate-y-1/2 rounded-[4px] text-[10px] font-medium leading-none outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)] ${
                marker.kind === "call"
                  ? "bg-oa-primary text-oa-primary-fg"
                  : marker.kind === "earnings"
                    ? "border border-oa-fg/50 bg-oa-card text-oa-fg"
                    : "bg-oa-secondary text-oa-fg"
              }`}
              style={{ left: laneLeft[markerIndex] }}
            >
              {MARKER_LETTER[marker.kind]}
              {/* The report's reaction, when it moved the stock (foldMovesIntoEarnings): "E ▼15%". */}
              {marker.kind === "earnings" && marker.events[0]?.pct !== undefined ? (
                <span
                  className="ml-0.5 hidden items-center gap-0.5 sm:inline-flex"
                  style={{ color: moveUp(marker) ? TONE.up : TONE.down }}
                >
                  <Arrow up={moveUp(marker)} className="size-2" />
                  {movePct(marker.events[0].pct)}
                </span>
              ) : null}
            </button>
            ),
          )}
        </div>
        ) : null}

        {/* time axis */}
        <div className="absolute bottom-0 left-0 right-14 h-4" aria-hidden="true">
          {marks.map((mark, index) => (
            <span
              key={`${mark.label}-${mark.x}`}
              className={`oa-mono absolute top-0 -translate-x-1/2 text-[13px] leading-none text-oa-muted-fg ${index % 2 === 1 ? "hidden sm:block" : ""}`}
              style={{ left: `${mark.x}%` }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>

      {/* What the letters in the marker lane stand for, only for the kinds this chart shows. */}
      {markerKinds.length ? (
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 pb-2 pt-1 text-[12.5px] leading-5 text-oa-muted-fg sm:px-4">
          {markerKinds.map((kind) =>
            kind === "move" ? (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-flex items-center gap-px">
                  <Arrow up className="size-2.5 text-[var(--signal-bullish)]" />
                  <Arrow up={false} className="size-2.5 text-[var(--signal-bearish)]" />
                </span>
                Big move on company news
              </span>
            ) : (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`oa-mono grid size-4 place-items-center rounded-[3px] text-[9.5px] font-medium leading-none ${
                  kind === "call" ? "bg-oa-primary text-oa-primary-fg" : kind === "earnings" ? "border border-oa-fg/50 bg-oa-card text-oa-fg" : "bg-oa-secondary text-oa-fg"
                }`}
              >
                {MARKER_LETTER[kind]}
              </span>
              {kind === "earnings" ? "Earnings report" : MARKER_NAME[kind]}
            </span>
            ),
          )}
        </figcaption>
      ) : null}
    </figure>
  );
}
