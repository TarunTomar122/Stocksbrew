"use client";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { EDGAR_DATA, FILING_GROUP_HINTS, type FilingGroup } from "@/lib/filings-shared";

/**
 * One filing as the stream prints it: only the fields a row shows. The page
 * hands these over as data, so a day of 150 filings costs its text once in
 * the HTML instead of its whole element tree a second time in the RSC payload.
 */
export type FilingLine = {
  ticker: string;
  company: string;
  group: FilingGroup;
  /** Present only on an amended filing. */
  amendment?: true;
  /** The lead line, already falling back to the form name. */
  headline: string;
  /** The other 8-K items, [code, label], without the lead one and 9.01. Left out when there are none. */
  extra?: Array<[string, string]>;
  filedAt: string;
  /** "20:01", New York time, worked out on the server. */
  time: string;
  /** The filing at the SEC, with the shared EDGAR prefix left off (see filingUrl). */
  path: string;
};

function filingUrl(path: string): string {
  return /^https?:/.test(path) ? path : `${EDGAR_DATA}${path}`;
}

export type FilingDay = { day: string; label: string; filings: FilingLine[] };

/** Time, who, which form, what it says. The whole stream opens sec.gov, so no row carries an arrow. */
function FilingRow({ filing }: { filing: FilingLine }) {
  return (
    <li className="fl-row">
      <time dateTime={filing.filedAt} className="oa-mono fl-time">
        {filing.time}
      </time>
      <div className="fl-who">
        <Link href={`/stock/${filing.ticker}`} className="fl-tick oa-focus" title={filing.company}>
          <StockLogo ticker={filing.ticker} market="US" size={18} circle />
          <span className="oa-mono fl-sym">{filing.ticker}</span>
        </Link>
        {/* The form type as plain text: it is on every row, so it is a column, not a badge. The outer
            span keeps the row's line box, so rows stay the height they were. */}
        <span className="self-center">
          <span title={FILING_GROUP_HINTS[filing.group]} className="oa-mono fl-form">
            {filing.amendment ? `${filing.group}/A` : filing.group}
          </span>
        </span>
        <span className="fl-co-sm">{filing.company}</span>
      </div>
      <a href={filingUrl(filing.path)} target="_blank" rel="noopener noreferrer" className="fl-what oa-focus">
        <b>{filing.headline}</b>
        {filing.extra ? (
          <span className="fl-extra">
            {filing.extra.map(([code, label]) => (
              <span key={code}>
                <span className="oa-mono">{code}</span> {label}
              </span>
            ))}
          </span>
        ) : null}
      </a>
      <span className="fl-co">{filing.company}</span>
    </li>
  );
}

export function FilingDays({ days }: { days: FilingDay[] }) {
  return (
    <>
      {days.map((day) => (
        <section key={day.day} aria-label={day.label} className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
          <h2 className="oa-label sticky top-0 z-[1] flex items-center justify-between border-b border-oa-border bg-oa-bg px-4 py-2">
            <span>{day.label}</span>
            <span className="oa-mono text-[12.5px] font-normal tabular-nums text-oa-muted-fg">{day.filings.length}</span>
          </h2>
          <ul className="divide-y divide-oa-border">
            {day.filings.map((filing) => (
              // A ticker and its EDGAR path name one filing (the same accession can list two tickers).
              <FilingRow key={`${filing.ticker} ${filing.path}`} filing={filing} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
