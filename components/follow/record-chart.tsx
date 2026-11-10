"use client";

import * as React from "react";

import { chartGeometry, chartY, fmtDate, fmtFrac } from "@/lib/follow-shared";

/**
 * The record against the S&P 500, both starting at the first filing date.
 * The lines stretch with the box (non-scaling strokes); labels are HTML so
 * the type stays crisp at any width. Log scale.
 */
export function RecordChart({
  curve,
  name,
  ended,
}: {
  curve: [string, number, number][];
  name: string;
  ended?: boolean;
}) {
  const geometry = React.useMemo(() => chartGeometry(curve), [curve]);
  const [hover, setHover] = React.useState<number | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  if (!geometry) return null;

  const rows = curve.filter((row) => row[1] > 0 && row[2] > 0);
  const last = rows.length - 1;
  const active = hover ?? last;
  const row = rows[active];
  const yOf = (value: number) => chartY(geometry, value);

  function track(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setHover(Math.round(ratio * last));
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          <span className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 translate-y-[-3px] bg-oa-primary"
            />
            <span className="text-oa-fg">Following {name}</span>
            <span
              className={`oa-mono font-medium ${row[1] >= 1 ? "text-signal-bullish" : "text-signal-bearish"}`}
            >
              {fmtFrac(row[1] - 1)}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 translate-y-[-3px] bg-oa-muted-fg/60"
            />
            <span className="text-oa-muted-fg">S&amp;P 500</span>
            <span className="oa-mono text-oa-fg">{fmtFrac(row[2] - 1)}</span>
          </span>
        </div>
        <span className="oa-mono text-[12px] text-oa-muted-fg">
          {fmtDate(rows[0][0])} to {fmtDate(row[0])}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_44px] gap-x-2">
        <div
          ref={boxRef}
          className="relative h-[220px] touch-pan-y sm:h-[280px]"
          onPointerMove={(event) => track(event.clientX)}
          onPointerDown={(event) => track(event.clientX)}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Growth of following ${name} against the S&P 500 from ${fmtDate(rows[0][0])} to ${fmtDate(rows[last][0])}: ${fmtFrac(rows[last][1] - 1)} against ${fmtFrac(rows[last][2] - 1)}.`}
        >
          {geometry.ticks.map((tick) => (
            <span
              key={tick.label}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${tick.label === "0%" ? "border-oa-fg/25" : "border-dashed border-oa-border"}`}
              style={{ top: `${tick.y * 100}%` }}
            />
          ))}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={geometry.spy}
              fill="none"
              stroke="var(--oa-muted-fg)"
              strokeOpacity="0.6"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geometry.fund}
              fill="none"
              stroke="var(--oa-primary)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {hover != null ? (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-px bg-oa-fg/30"
                style={{ left: `${(active / last) * 100}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-oa-card bg-oa-primary"
                style={{
                  left: `${(active / last) * 100}%`,
                  top: `${yOf(row[1]) * 100}%`,
                }}
              />
              <span
                aria-hidden="true"
                className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-oa-muted-fg"
                style={{
                  left: `${(active / last) * 100}%`,
                  top: `${yOf(row[2]) * 100}%`,
                }}
              />
            </>
          ) : null}
        </div>
        <div className="relative h-[220px] sm:h-[280px]" aria-hidden="true">
          {geometry.ticks.map((tick) => (
            <span
              key={tick.label}
              className="oa-mono absolute left-0 -translate-y-1/2 text-[10.5px] text-oa-muted-fg"
              style={{ top: `${tick.y * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div className="relative mt-1 h-4" aria-hidden="true">
          {geometry.years.map((year) => (
            <span
              key={year.label}
              className="oa-mono absolute -translate-x-1/2 text-[10.5px] text-oa-muted-fg"
              style={{ left: `${year.x * 100}%` }}
            >
              {year.label}
            </span>
          ))}
        </div>
      </div>
      {ended ? (
        <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">
          Ends where there was nothing left to follow.
        </p>
      ) : null}
    </div>
  );
}
