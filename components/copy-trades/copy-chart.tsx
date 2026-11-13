"use client";

import * as React from "react";

import { copyChartGeometry, fmtDollars, START_VALUE } from "@/lib/copy-trades-shared";
import { fmtDate } from "@/lib/follow-shared";

type Row = [string, number, number, number?];

const LINES = [
  { key: "copy", stroke: "var(--oa-primary)", width: 2, dash: undefined, swatch: "bg-oa-primary" },
  { key: "spy", stroke: "var(--oa-muted-fg)", width: 1.25, dash: undefined, swatch: "bg-oa-muted-fg/70" },
  { key: "hold", stroke: "var(--oa-fg)", width: 1.25, dash: "5 4", swatch: "border-t border-dashed border-oa-fg/60 bg-transparent" },
] as const;

/**
 * What $10,000 became: the copy against the S&P 500 and against not trading,
 * on a linear dollar scale so the picture matches the numbers beside it.
 * Hover (or touch) reads the three values on any day.
 */
/**
 * `shownAtEnd`: how many of the lines' end values the panel already shows as figures beside the chart (the copy and
 * the S&P 500 tiles): at rest the legend leaves those out and says them only for the day under the pointer.
 */
export function CopyChart({ curve, name, holdLabel, shownAtEnd = 0 }: { curve: Row[]; name: string; holdLabel: string | null; shownAtEnd?: number }) {
  const geometry = React.useMemo(() => copyChartGeometry(curve), [curve]);
  const [hover, setHover] = React.useState<number | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  if (!geometry) return null;

  const rows = curve.filter((row) => row[1] > 0 && row[2] > 0);
  const last = rows.length - 1;
  const active = hover ?? last;
  const row = rows[active]!;
  const hasHold = rows[0]!.length > 3 && holdLabel != null;
  const labels = [`Copying ${name}`, "S&P 500", holdLabel ?? ""];
  const yOf = (value: number) => 1 - (value - geometry.bottom) / (geometry.top - geometry.bottom);

  function track(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setHover(Math.round(ratio * last));
  }

  const lines = LINES.slice(0, hasHold ? 3 : 2);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          {lines.map((line, index) => {
            const value = row[index + 1] as number | undefined;
            return (
              <li key={line.key} className="inline-flex items-baseline gap-1.5">
                <span aria-hidden="true" className={`inline-block h-0.5 w-4 translate-y-[-3px] ${line.swatch}`} />
                <span className={index === 0 ? "text-oa-fg" : "text-oa-muted-fg"}>{labels[index]}</span>
                <span className={`oa-mono tabular-nums ${index === 0 ? "font-medium text-oa-fg" : "text-oa-fg"}`}>
                  {value != null && (hover != null || index >= shownAtEnd) ? fmtDollars(value * START_VALUE) : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <span className="oa-mono text-[12px] text-oa-muted-fg">{hover != null ? fmtDate(row[0]) : `${fmtDate(rows[0]![0])} to ${fmtDate(row[0])}`}</span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_48px] gap-x-2">
        <div
          ref={boxRef}
          className="relative h-[220px] touch-pan-y sm:h-[300px]"
          onPointerMove={(event) => track(event.clientX)}
          onPointerDown={(event) => track(event.clientX)}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`$10,000 copying ${name} from ${fmtDate(rows[0]![0])} to ${fmtDate(rows[last]![0])}: ${fmtDollars(rows[last]![1] * START_VALUE)}, against ${fmtDollars(rows[last]![2] * START_VALUE)} in the S&P 500.`}
        >
          {geometry.ticks.map((tick) => (
            <span
              key={tick.label}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${tick.label === "$10K" ? "border-oa-fg/25" : "border-dashed border-oa-border"}`}
              style={{ top: `${tick.y * 100}%` }}
            />
          ))}
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {lines
              .map((line, index) => ({ line, path: geometry.paths[index] }))
              .reverse()
              .map(({ line, path }) => (
                <path
                  key={line.key}
                  d={path}
                  fill="none"
                  stroke={line.stroke}
                  strokeOpacity={line.key === "copy" ? 1 : 0.6}
                  strokeWidth={line.width}
                  strokeDasharray={line.dash}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </svg>
          {hover != null ? (
            <>
              <span aria-hidden="true" className="absolute inset-y-0 w-px bg-oa-fg/30" style={{ left: `${(active / last) * 100}%` }} />
              <span
                aria-hidden="true"
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-oa-card bg-oa-primary"
                style={{ left: `${(active / last) * 100}%`, top: `${yOf(row[1]) * 100}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-oa-muted-fg"
                style={{ left: `${(active / last) * 100}%`, top: `${yOf(row[2]) * 100}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="relative h-[220px] sm:h-[300px]" aria-hidden="true">
          {geometry.ticks.map((tick) => (
            <span key={tick.label} className="oa-mono absolute left-0 -translate-y-1/2 text-[11px] text-oa-muted-fg" style={{ top: `${tick.y * 100}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <div className="relative mt-1 h-4" aria-hidden="true">
          {geometry.years.map((year) => (
            <span key={year.label} className="oa-mono absolute -translate-x-1/2 text-[11px] text-oa-muted-fg" style={{ left: `${year.x * 100}%` }}>
              {year.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
