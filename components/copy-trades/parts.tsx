import * as React from "react";
import Link from "next/link";

import { NUM, Ticker } from "@/components/oa/kit";
import {
  copyCompanyName,
  copyHref,
  fmtDollars,
  heldSpan,
  holdShortLabel,
  type CopyHubRow,
  type CopyPosition,
  type CopyRecordFull,
} from "@/lib/copy-trades-shared";
import { fmtFrac, fmtMonthYear } from "@/lib/follow-shared";

const TH = "oa-mono whitespace-nowrap px-3 py-2 text-[11px] font-normal uppercase tracking-[0.08em] text-oa-muted-fg";
const TD = "whitespace-nowrap px-3 py-2 align-middle";

function heldText(position: CopyPosition, stoppedAt: string | null): string {
  const said = heldSpan(position, stoppedAt);
  const span = said.charAt(0).toUpperCase() + said.slice(1);
  const move = position.return;
  // The stock's own move only when it agrees with what the copy made on it: buying more after a rise can lose money on a stock that is up.
  if (move == null || !Number.isFinite(move) || (move > 0) !== (position.pnl > 0)) return span;
  return `${span}, the stock ${move > 0 ? "up" : "down"} ${fmtFrac(Math.abs(move), 0, false)}`;
}

/**
 * The positions that made or lost the most for a $10,000 copy, as bars on one
 * shared scale (the largest gain or loss on the page is the full width), so a
 * short red bar next to a long green one means what it looks like.
 */
export function PositionBars({
  positions,
  scale,
  tone,
  stoppedAt = null,
}: {
  positions: CopyPosition[];
  scale: number;
  tone: "up" | "down";
  /** The end date of a record that stopped, so a stock still in it reads "until the record ended", not "since". */
  stoppedAt?: string | null;
}) {
  if (positions.length === 0) {
    return <p className="px-4 py-5 text-[14px] leading-6 text-oa-muted-fg">{tone === "up" ? "No position made money for the copy." : "No position lost money for the copy."}</p>;
  }
  return (
    <ul className="divide-y divide-oa-border">
      {positions.map((position) => {
        const width = scale > 0 ? Math.max(2, (Math.abs(position.pnl) / scale) * 100) : 0;
        return (
          <li key={position.ticker} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <Ticker symbol={position.ticker} name={copyCompanyName(position.name, position.ticker)} size={18} wrap />
              <span className={`${NUM} shrink-0 text-[14px] font-medium ${tone === "up" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                {tone === "up" ? "+" : "−"}
                {fmtDollars(Math.abs(position.pnl))}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-oa-bg" aria-hidden="true">
              <div className={`h-full rounded-full ${tone === "up" ? "bg-signal-bullish opacity-70" : "bg-signal-bearish opacity-70"}`} style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{heldText(position, stoppedAt)}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** Calendar years side by side: the copy, the S&P 500, the gap, and the comparison line (no trading, or every buy kept). */
export function YearTable({ record }: { record: CopyRecordFull }) {
  const hasHold = record.curve_columns.includes("hold");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[13.5px]">
        <thead className="bg-oa-bg">
          <tr>
            <th className={`${TH} text-left`}>Year</th>
            <th className={`${TH} text-right`}>Copy</th>
            <th className={`${TH} text-right`}>S&amp;P 500</th>
            <th className={`${TH} text-right`}>Gap, pts</th>
            {hasHold ? <th className={`${TH} hidden text-right sm:table-cell`}>{holdShortLabel(record)}</th> : null}
          </tr>
        </thead>
        <tbody>
          {record.yearly.map((year) => {
            const [copy, spy, hold] = year.values;
            const gap = copy != null && spy != null ? copy - spy : null;
            const note = year.from ? `from ${fmtMonthYear(year.from)}` : year.to ? `to ${fmtMonthYear(year.to)}` : "";
            return (
              <tr key={year.year} className="border-t border-oa-border">
                <td className={`${TD} ${NUM} whitespace-normal text-oa-fg`}>
                  {year.year}
                  {note ? <span className="block text-[12px] leading-4 text-oa-muted-fg sm:ml-1.5 sm:inline">{note}</span> : null}
                </td>
                <td className={`${TD} ${NUM} text-right font-medium ${copy == null ? "" : copy >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{fmtFrac(copy)}</td>
                <td className={`${TD} ${NUM} text-right text-oa-fg`}>{fmtFrac(spy)}</td>
                <td className={`${TD} ${NUM} text-right ${gap == null ? "" : gap >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                  {gap == null ? "" : fmtFrac(gap).replace("%", "")}
                </td>
                {hasHold ? <td className={`${TD} ${NUM} hidden text-right text-oa-muted-fg sm:table-cell`}>{fmtFrac(hold)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The ones too little of which could be copied to say anything, each with its plain reason. */
export function UnrankedList({ rows }: { rows: CopyHubRow[] }) {
  return (
    <ul className="divide-y divide-oa-border">
      {rows.map((row) => (
        <li key={row.slug} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2 text-[13.5px]">
          <Link href={copyHref(row.slug)} prefetch={false} className="text-oa-fg hover:underline">
            {row.name}
          </Link>
          <span className="text-[12.5px] text-oa-muted-fg">Not tested: {row.not_ranked_because ?? "not enough record"}</span>
        </li>
      ))}
    </ul>
  );
}
