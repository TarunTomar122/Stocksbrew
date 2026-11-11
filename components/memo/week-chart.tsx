"use client";

import Link from "next/link";
import * as React from "react";

import { SERIES_VARS } from "@/components/backtest/format";
import { StockLogo } from "@/components/stock-logo";
import { curveSlots, niceTicks, signedPct, weekGap } from "@/lib/memo/format";
import type { MemoCurvePoint } from "@/lib/memo/types";
import { shortDay, weekdayName } from "@/lib/memo/week";

import type { DayExplain } from "./explain";

/**
 * The week as two lines, the portfolio and the S&P 500, each as percent from
 * the close before Monday. Six fixed slots (that close, then Monday to
 * Friday), so a week still running shows the days it has left. The gap
 * between the two at the last close is labelled at the end. Hover or drag for
 * a day's values; the hidden table carries them for screen readers. A tap or
 * click on a day (or Enter on its point) opens what moved it under the chart:
 * the holdings' explained moves and reports that day, with their sources, and
 * Ask about that day.
 */

const SLOTS = 6;
const PAD = { left: 48, right: 70, top: 12, bottom: 26 };
const HEIGHT = 196;
const SLOT_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

export function WeekChart({ curve, subject, days = [] }: { curve: MemoCurvePoint[]; subject: "mine" | "example"; days?: DayExplain[] }) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(640);
  const [hover, setHover] = React.useState<number | null>(null);
  /** The day opened under the chart, by slot. */
  const [pinned, setPinned] = React.useState<number | null>(null);
  const panelId = React.useId();
  /** Where the pointer went down, so a drag is not taken for a click. */
  const downAt = React.useRef<number | null>(null);
  /** The day points, so closing a day hands focus back to its point. */
  const points = React.useRef(new Map<number, HTMLButtonElement>());

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
  const open = pinned === null ? null : slots.find((row) => row.slot === pinned) ?? null;
  const openDay = open ? days.find((entry) => entry.day === open.point.day) ?? null : null;
  const toggle = (slot: number) => setPinned((current) => (current === slot ? null : slot));

  /** The nearest day with a close under the pointer. */
  const slotAt = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left - PAD.left) / (box.width - PAD.left - PAD.right);
    const slot = Math.round(fraction * (SLOTS - 1));
    return slots.reduce((best, row) => (Math.abs(row.slot - slot) < Math.abs(best.slot - slot) ? row : best), slots[0]!).slot;
  };
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => setHover(slotAt(event));
  // A second tap on the same day hides its values again on a phone.
  const onDown = (event: React.PointerEvent<SVGSVGElement>) => {
    downAt.current = event.clientX;
    const slot = slotAt(event);
    setHover(event.pointerType !== "mouse" && slot === hover ? null : slot);
  };
  // A click or tap anywhere else on the chart opens the nearest day's story under it; again on the same day closes it.
  // A drag across the days (reading values) does not open one when it ends, and the week's starting close has no story.
  const onClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const dragged = downAt.current !== null && Math.abs(event.clientX - downAt.current) > 6;
    downAt.current = null;
    if (days.length === 0 || dragged) return;
    const slot = slotAt(event);
    if (slot > 0) toggle(slot);
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
          onClick={onClick}
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

          {/* Every day is a point that opens what moved it: filled when the memo explains a move that day. */}
          {days.length > 0 ? (
            <g pointerEvents="none">
              {slots.filter(({ slot }) => slot > 0).map(({ slot, point }) => {
                const told = (days.find((entry) => entry.day === point.day)?.stories.length ?? 0) > 0;
                return (
                  <circle
                    key={point.day}
                    cx={x(slot)}
                    cy={y(point.portfolio)}
                    r={pinned === slot ? 4.5 : told ? 3.5 : 2.5}
                    fill={pinned === slot || told ? "var(--series-a)" : "var(--oa-card)"}
                    stroke="var(--series-a)"
                    strokeWidth="1.5"
                  />
                );
              })}
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
        {/* The points as real buttons over the line, so a keyboard, a screen reader or a tap opens a day. */}
        {days.length > 0
          ? slots
              .filter(({ slot }) => slot > 0)
              .map(({ slot, point }) => (
              <button
                key={point.day}
                ref={(node) => {
                  if (node) points.current.set(slot, node);
                  else points.current.delete(slot);
                }}
                type="button"
                aria-label={`${weekdayName(point.day)}, ${shortDay(point.day)}: what moved it`}
                aria-expanded={pinned === slot}
                aria-controls={panelId}
                onClick={() => toggle(slot)}
                className="absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
                style={{ left: x(slot), top: y(point.portfolio) }}
              />
            ))
          : null}
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
      {days.length > 0 ? (
        <div id={panelId} aria-live="polite">
          {open && openDay ? (
            <DayPanel
              day={openDay}
              point={open.point}
              previous={slots[slots.indexOf(open) - 1]?.point ?? null}
              subject={subject}
              onClose={() => {
                points.current.get(open.slot)?.focus();
                setPinned(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
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

/** One day's move from two week-to-date points (percent from the week's starting close). */
function dayMove(now: number, before: number | null): number {
  if (before === null) return now;
  return ((1 + now / 100) / (1 + before / 100) - 1) * 100;
}

/** What moved one day: the day's two figures, the holdings' explained moves and reports, and Ask about it. */
function DayPanel({
  day,
  point,
  previous,
  subject,
  onClose,
}: {
  day: DayExplain;
  point: MemoCurvePoint;
  /** The close before, so the panel shows the day's own move, not the week so far. */
  previous: MemoCurvePoint | null;
  subject: "mine" | "example";
  onClose: () => void;
}) {
  const link = "rounded font-medium text-oa-primary underline-offset-2 hover:underline";
  return (
    <div className="mt-2 rounded border border-oa-border bg-oa-bg px-3 py-2.5 text-[13.5px] leading-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-oa-fg">
          <span className="font-medium">{`${weekdayName(point.day)}, ${shortDay(point.day)}`}</span>
          <span className="oa-mono ml-2 text-[12.5px] tabular-nums text-oa-muted-fg">
            {subject === "example" ? "Example" : "Yours"} {signedPct(dayMove(point.portfolio, previous?.portfolio ?? null))}
            {point.market !== null ? ` · S&P 500 ${signedPct(dayMove(point.market, previous?.market ?? null))}` : ""}
          </span>
        </p>
        <button type="button" onClick={onClose} aria-label="Close this day" className="-mr-1 -mt-0.5 rounded px-1 text-[15px] leading-5 text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]">
          ×
        </button>
      </div>
      {day.stories.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-2">
          {day.stories.map((story, index) => (
            <li key={`${story.ticker}-${index}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2">
              <StockLogo ticker={story.ticker} size={18} className="mt-px" />
              <div className="min-w-0">
                <p className="text-pretty text-oa-fg">{story.text}</p>
                <p className="mt-0.5 text-[12px] leading-4 text-oa-muted-fg">
                  {story.source}
                  {" · "}
                  <Link href={story.evidence.href} prefetch={false} className={link}>
                    {story.evidence.label}
                  </Link>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[13px] leading-[22px]">
        <Link href={day.ask.href} prefetch={false} data-track-target="ask" className={link}>
          {day.ask.label}&nbsp;→
        </Link>
      </p>
    </div>
  );
}
