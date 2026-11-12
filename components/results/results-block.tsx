import Link from "next/link";

import { Panel } from "@/components/stock-report/primitives";
import type { ResultRead } from "@/lib/results/types";
import { callLine, figureCells, reportedWords } from "@/lib/results/words";

/**
 * The stock page's one results surface: the figures as one compact row (EPS against the estimate, revenue against the
 * estimate and a year ago, the outlook with its range, the stock's move against its usual report move), whether our
 * call moved, and a link to the earnings day job's full report when there is one. Each figure's source is its hover
 * title. No sentence restating the figures (owner rule 8). Server-rendered, no state.
 *
 * `call` is the call word the page itself shows (null when the viewer's plan hides it): the call line is only said
 * when it matches the read's call, so the block never shows a call the page does not, or a different one.
 */

const TONE = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" } as const;

/**
 * One column per figure from the small breakpoint up, so three figures never leave an empty fourth slot. On a phone,
 * two columns, and an odd last figure spans the row.
 */
const COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

export function figureColumns(count: number): string {
  return COLUMNS[Math.min(Math.max(count, 1), 4)]!;
}

/** On a phone, three figures sit two and one: the third spans the row instead of leaving an empty slot beside it. */
export function figureSpan(count: number, index: number): string {
  return count === 3 && index === 2 ? "max-sm:col-span-2" : "";
}

export function ResultsBlock({ read, call, today }: { read: ResultRead; call: string | null; today: string }) {
  const cells = figureCells(read, today);
  if (cells.length === 0) return null;
  const showCall = read.call && call && read.call.call === call ? read.call : null;
  const reason = showCall?.status === "changed" ? showCall.reason : null;
  return (
    <Panel
      label="Latest results"
      meta={`${reportedWords(read, today)}${read.period ? `, ${read.period}` : ""}`}
      bodyClassName="flex flex-col"
    >
      <dl className={`grid ${figureColumns(cells.length)}${showCall || read.reportHref ? " border-b border-oa-border" : ""}`}>
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            title={cell.title || undefined}
            className={`-mb-px border-b border-r border-oa-border px-3.5 py-2.5 last:border-r-0 max-sm:even:border-r-0 sm:px-4 ${figureSpan(cells.length, index)}`}
          >
            <dt className="oa-caption">{cell.label}</dt>
            <dd className={`oa-mono mt-0.5 text-[20px] font-semibold leading-7 tabular-nums ${TONE[cell.tone]}`}>{cell.value}</dd>
            {cell.sub ? <dd className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
      {showCall || read.reportHref ? (
        // Where each figure came from is its hover title, never a line under the facts (owner rule 4).
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-3 sm:px-4">
          {showCall ? (
            <p className="min-w-0 text-pretty text-[14px] font-medium leading-5 text-oa-fg">
              {callLine(showCall, today)}
              {reason ? <span className="font-normal text-oa-muted-fg"> {reason}</span> : null}
            </p>
          ) : null}
          {read.reportHref ? (
            <Link href={read.reportHref} prefetch={false} className="shrink-0 text-[13px] font-medium text-oa-primary hover:underline">
              The full report
            </Link>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
