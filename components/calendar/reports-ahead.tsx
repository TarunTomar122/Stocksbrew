import * as React from "react";
import Link from "next/link";

import { earningsHref } from "@/components/calendar/calendar-view";
import { FOCUS, NUM, Panel, fmtDay } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { weekdayName } from "@/lib/calendar-shared";
import type { ReportAhead } from "@/lib/calendar";

/** Tiles per row on a wide screen (three on a phone); a group shows whole rows only (owner rule: no tile beside an empty slot). */
const WIDE_COLS = 6;

function wholeRows(rows: ReportAhead[]): ReportAhead[] {
  if (rows.length < WIDE_COLS) return rows;
  return rows.slice(0, rows.length - (rows.length % WIDE_COLS));
}

function Tile({ report }: { report: ReportAhead }) {
  return (
    <Link
      prefetch={false}
      href={earningsHref(report.ticker)}
      title={report.estimated ? `${report.company}: expected around ${fmtDay(report.date, true)}, not announced yet` : `${report.company}: reports on ${weekdayName(report.date, true)}, ${fmtDay(report.date, true)}`}
      className={`flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-oa-accent ${FOCUS}`}
    >
      <span className={`${NUM} inline-flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-oa-fg`}>
        <StockLogo ticker={report.ticker} size={16} atOnce />
        <span className="truncate">{report.ticker}</span>
      </span>
      <span className={`${NUM} pl-[22px] text-[12.5px] ${report.estimated ? "text-oa-muted-fg" : "text-oa-fg"}`}>
        {report.estimated ? (
          // Our estimate: "~Jan 27", muted, with no weekday, so it never reads as an announced day.
          <>
            <span aria-hidden="true">~</span>
            <span className="sr-only">around </span>
            {fmtDay(report.date)}
          </>
        ) : (
          <>
            {/* The weekday from a tablet up; three tiles to a phone row only fit the date on one line. */}
            <span className="max-sm:hidden">{weekdayName(report.date)}, </span>
            {fmtDay(report.date)}
          </>
        )}
      </span>
    </Link>
  );
}

function Group({ title, rows }: { title: string; rows: ReportAhead[] }) {
  const shown = wholeRows(rows);
  if (!shown.length) return null;
  return (
    <div>
      <h3 className="oa-caption px-3 pb-1 pt-3">{title}</h3>
      <div className="grid grid-cols-3 gap-x-1 lg:grid-cols-6">
        {shown.map((report) => (
          <Tile key={report.ticker} report={report} />
        ))}
      </div>
    </div>
  );
}

/**
 * The biggest companies' next reports after the days on screen, each linking to its earnings page: announced dates
 * first, then the ones we expect from each company's past report days. "Expected" is said once, in its heading.
 */
export function ReportsAhead({ confirmed, expected }: { confirmed: ReportAhead[]; expected: ReportAhead[] }) {
  if (!confirmed.length && !expected.length) return null;
  return (
    <Panel label="Big reports ahead" className="mt-5" flush>
      <div className="pb-2">
        <Group title="Dates set" rows={confirmed} />
        <Group title="Expected, not announced yet" rows={expected} />
      </div>
    </Panel>
  );
}
