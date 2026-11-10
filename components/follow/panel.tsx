import * as React from "react";

import { ReturnCell } from "@/components/follow/bits";
import {
  PERF_WINDOWS,
  excess,
  fmtMonthYear,
  type PerfCard,
} from "@/lib/follow-shared";

/** A flat paper card with the uppercase label strip every Follow section uses. */
export function Panel({
  title,
  right,
  children,
  className = "",
  id,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card ${className}`}
    >
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-oa-border px-4 py-1.5">
        <h2 className="oa-label">{title}</h2>
        {right ? (
          <div className="text-[12px] text-oa-muted-fg">{right}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** One number with its label, for the strip under a page title. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <p className="oa-mono text-[10.5px] uppercase tracking-[0.08em] text-oa-muted-fg">
        {label}
      </p>
      <p className="oa-mono tabular-nums mt-0.5 truncate text-[17px] font-medium leading-6 text-oa-fg">
        {value}
      </p>
      {hint ? (
        <p className="truncate text-[11.5px] leading-4 text-oa-muted-fg">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The six windows of a record, each with the gap to the S&P 500. */
export function PerfTiles({ card }: { card: PerfCard }) {
  return (
    <div className="grid grid-cols-3 border-b border-oa-border sm:grid-cols-6">
      {PERF_WINDOWS.map((window, index) => (
        <div
          key={window.key}
          className={`px-4 py-2.5 ${index % 3 !== 0 ? "border-l border-oa-border" : ""} ${index >= 3 ? "border-t border-oa-border sm:border-t-0" : ""} ${index === 3 ? "sm:border-l" : ""}`}
        >
          <p
            className="oa-mono text-[10.5px] uppercase tracking-[0.08em] text-oa-muted-fg"
            title={window.long}
          >
            {window.key === "r_since"
              ? `Since ${fmtMonthYear(card.start_date)}`
              : window.long}
          </p>
          <div className="mt-1">
            <ReturnCell
              value={card.fund[window.key]}
              versus={excess(card, window.key)}
              drawdown={window.key === "max_drawdown"}
              align="left"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
