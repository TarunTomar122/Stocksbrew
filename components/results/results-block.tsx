import Link from "next/link";

import { Panel } from "@/components/stock-report/primitives";
import type { ResultRead } from "@/lib/results/types";
import { callLine, figureCells, reportedWords, stampWords } from "@/lib/results/words";

/**
 * The latest results on one stock: the figures as one compact row (EPS against the estimate, revenue and the
 * outlook when the release states them, the stock's move against its usual report move), whether our call moved,
 * and where each number came from. No sentence restating the figures (owner rule 8). Server-rendered, no state.
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
      <dl className={`grid ${figureColumns(cells.length)} border-b border-oa-border`}>
        {cells.map((cell) => (
          <div key={cell.label} className="-mb-px border-b border-r border-oa-border px-3.5 py-2.5 last:border-r-0 max-sm:even:border-r-0 sm:px-4">
            <dt className="oa-caption">{cell.label}</dt>
            <dd className={`oa-mono mt-0.5 text-[20px] font-semibold leading-7 tabular-nums ${TONE[cell.tone]}`}>{cell.value}</dd>
            {cell.sub ? <dd className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1.5 px-3.5 py-3 sm:px-4">
        {showCall ? (
          <p className="text-pretty text-[14px] font-medium leading-5 text-oa-fg">
            {callLine(showCall, today)}
            {reason ? <span className="font-normal text-oa-muted-fg"> {reason}</span> : null}
          </p>
        ) : null}
        <p className="text-pretty text-[12px] leading-[18px] text-oa-muted-fg">
          {read.sources
            .filter((source) => source.label !== "Call reviewed" || showCall)
            .map((source, index) => {
              const when = stampWords(source.at);
              const text = source.source ? `${source.label}: ${source.source}${when ? `, ${when}` : ""}` : `${source.label} ${when}`;
              return (
                <span key={source.label}>
                  {index > 0 ? " · " : ""}
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                      {text}
                    </a>
                  ) : (
                    text
                  )}
                </span>
              );
            })}
          {read.reportHref ? (
            <>
              {" · "}
              <Link href={read.reportHref} prefetch={false} className="font-medium text-oa-primary hover:underline">
                The full report
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </Panel>
  );
}
