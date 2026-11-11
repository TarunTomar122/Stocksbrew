"use client";

import * as React from "react";

import { SERIES_VARS } from "@/components/backtest/format";
import { curveSlots, niceTicks, signedPct, weekGap } from "@/lib/memo/format";
import type { MemoCurvePoint } from "@/lib/memo/types";
import { shortDay, weekdayName } from "@/lib/memo/week";

/**
 * The week as two lines, the portfolio and the S&P 500, each as percent from
 * the close before Monday. Six fixed slots (that close, then Monday to
 * Friday), so a week still running shows the days it has left. The gap
 * between the two at the last close is labelled at the end. Hover or drag for
 * a day's values; the hidden table carries them for screen readers.
 */

const SLOTS = 6;
const PAD = { left: 48, right: 70, top: 12, bottom: 26 };
const HEIGHT = 196;
const SLOT_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

export function WeekChart({ curve, subject }: { curve: MemoCurvePoint[]; subject: "mine" | "example" }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(640);
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

  const slots = curveSlots(curve);
  if (slots.length < 2) return null;
  const portfolioName = subject === "example" ? "Example portfolio" : "Your portfolio";

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const values = slots.flatMap(({ point }) => (point.market === null ? [point.portfolio] : [point.portfolio, point.market]));
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const x = (slot: number) => PAD.left + (slot / (SLOTS - 1)) * plotW;
  const y = (value: number) => PAD.top + (1 - (value - lo) / (hi - lo || 1)) * plotH;
  const path = (pick: (point: MemoCurvePoint) => number | null) => {
    let d = "";
    for (const { slot, point } of slots) {
      const value = pick(point);
      if (value === null) continue;
      d += `${d ? "L" : "M"}${x(slot).toFixed(1)},${y(value).toFixed(1)}`;
    }
    return d;
  };

  const last = slots[slots.length - 1]!;
  const end = last.point;
  // Rounded once, the same way as the headline and the list of weeks.
  const gap = end.market === null ? null : weekGap(end.portfolio, end.market);
  const endX = x(last.slot);
  const shown = hover === null ? null : slots.find((row) => row.slot === hover) ?? null;

  /** The nearest day with a close under the pointer. */
  const slotAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left - PAD.left) / (box.width - PAD.left - PAD.right);
    const slot = Math.round(fraction * (SLOTS - 1));
    return slots.reduce((best, row) => (Math.abs(row.slot - slot) < Math.abs(best.slot - slot) ? row : best), slots[0]!).slot;
  };
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => setHover(slotAt(event));
  // A second tap on the same day hides it again on a phone.
  const onDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const slot = slotAt(event);
    setHover(event.pointerType !== "mouse" && slot === hover ? null : slot);
  };

  const label = `${portfolioName} ${signedPct(end.portfolio)}${end.market === null ? "" : ` against the S&P 500's ${signedPct(end.market)}`} from ${shortDay(slots[0]!.point.day)} to ${weekdayName(end.day)}, ${shortDay(end.day)}`;
  const tipLeft = shown ? Math.min(Math.max(x(shown.slot) - 80, 0), Math.max(0, width - 168)) : 0;

  return (
    <div className={`${SERIES_VARS} min-w-0`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-oa-fg">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[var(--series-a)]" />
          {portfolioName}
          <span className="oa-mono tabular-nums text-oa-muted-fg">{signedPct(end.portfolio)}</span>
        </span>
        {end.market !== null ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[var(--series-b)]" />
            S&amp;P 500
            <span className="oa-mono tabular-nums text-oa-muted-fg">{signedPct(end.market)}</span>
          </span>
        ) : null}
      </div>
      <div ref={wrap} className="relative w-full select-none">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={label}
          className="block max-w-full touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onDown}
          // A tap on a phone also ends in pointerleave; keep its day showing until the next tap.
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHover(null);
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--oa-muted-fg)" : "var(--oa-border)"}
                strokeOpacity={tick === 0 ? 0.5 : 1}
                strokeWidth="1"
              />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="oa-mono fill-oa-muted-fg text-[11px]">
                {tick === 0 ? "0%" : `${tick > 0 ? "+" : "−"}${Math.abs(tick)}%`}
              </text>
            </g>
          ))}
          {Array.from({ length: SLOTS }, (_, slot) => {
            const has = slots.some((row) => row.slot === slot);
            const text = slot === 0 ? shortDay(slots[0]!.point.day) : SLOT_LABELS[slot];
            return (
              <text
                key={slot}
                x={x(slot)}
                y={HEIGHT - 6}
                textAnchor={slot === SLOTS - 1 && !has ? "end" : "middle"}
                className={`oa-mono text-[11px] ${has ? "fill-oa-muted-fg" : "fill-oa-border"}`}
              >
                {text}
              </text>
            );
          })}
          {end.market !== null ? (
            <path d={path((point) => point.market)} fill="none" stroke="var(--series-b)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          <path d={path((point) => point.portfolio)} fill="none" stroke="var(--series-a)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {gap !== null && end.market !== null ? (
            <g pointerEvents="none">
              <line x1={endX + 10} x2={endX + 10} y1={y(end.portfolio)} y2={y(end.market)} stroke="var(--oa-muted-fg)" strokeWidth="1" />
              <line x1={endX + 6} x2={endX + 10} y1={y(end.portfolio)} y2={y(end.portfolio)} stroke="var(--oa-muted-fg)" strokeWidth="1" />
              <line x1={endX + 6} x2={endX + 10} y1={y(end.market)} y2={y(end.market)} stroke="var(--oa-muted-fg)" strokeWidth="1" />
              {gap.side === "in step" ? (
                <text x={endX + 15} y={(y(end.portfolio) + y(end.market)) / 2 + 4} className="fill-oa-muted-fg text-[11px]">
                  in step
                </text>
              ) : (
                <>
                  <text x={endX + 15} y={(y(end.portfolio) + y(end.market)) / 2 - 2} className="oa-mono fill-oa-fg text-[11.5px] font-medium">
                    {Math.abs(gap.points).toFixed(1)} pts
                  </text>
                  <text x={endX + 15} y={(y(end.portfolio) + y(end.market)) / 2 + 11} className="fill-oa-muted-fg text-[11px]">
                    {gap.side}
                  </text>
                </>
              )}
            </g>
          ) : null}

          {shown ? (
            <g pointerEvents="none">
              <line x1={x(shown.slot)} x2={x(shown.slot)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--oa-fg)" strokeOpacity="0.3" strokeWidth="1" />
              {shown.point.market !== null ? (
                <circle cx={x(shown.slot)} cy={y(shown.point.market)} r="4" fill="var(--series-b)" stroke="var(--oa-card)" strokeWidth="2" />
              ) : null}
              <circle cx={x(shown.slot)} cy={y(shown.point.portfolio)} r="4" fill="var(--series-a)" stroke="var(--oa-card)" strokeWidth="2" />
            </g>
          ) : (
            <g pointerEvents="none">
              {end.market !== null ? <circle cx={endX} cy={y(end.market)} r="4" fill="var(--series-b)" stroke="var(--oa-card)" strokeWidth="2" /> : null}
              <circle cx={endX} cy={y(end.portfolio)} r="4" fill="var(--series-a)" stroke="var(--oa-card)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {shown ? (
          <div
            className="pointer-events-none absolute top-0 z-[1] w-[168px] rounded border border-oa-border bg-oa-card px-2.5 py-1.5 text-[12px] leading-[18px] shadow-sm"
            style={{ left: tipLeft }}
          >
            <p className="font-medium text-oa-fg">{shown.slot === 0 ? `${shortDay(shown.point.day)} close` : `${weekdayName(shown.point.day)}, ${shortDay(shown.point.day)}`}</p>
            <p className="flex justify-between gap-2 text-oa-muted-fg">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-[var(--series-a)]" />
                {subject === "example" ? "Example" : "Yours"}
              </span>
              <span className="oa-mono tabular-nums text-oa-fg">{signedPct(shown.point.portfolio)}</span>
            </p>
            {shown.point.market !== null ? (
              <p className="flex justify-between gap-2 text-oa-muted-fg">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-full bg-[var(--series-b)]" />
                  S&amp;P 500
                </span>
                <span className="oa-mono tabular-nums text-oa-fg">{signedPct(shown.point.market)}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>Each close this week, percent from {shortDay(slots[0]!.point.day)}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{portfolioName}</th>
            <th scope="col">S&amp;P 500</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(({ point }) => (
            <tr key={point.day}>
              <th scope="row">{shortDay(point.day)}</th>
              <td>{signedPct(point.portfolio)}</td>
              <td>{point.market === null ? "No close" : signedPct(point.market)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
