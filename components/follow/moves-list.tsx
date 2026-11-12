"use client";

import Link from "next/link";

import { ExternalLink, PartyDot, Ticker } from "@/components/follow/bits";

/** One line of a filing, already in words: "Added", the ticker (or a short name), and how big. */
export type MoveLine = { label: string; up: boolean; ticker: string | null; name: string | null; size: string };

/**
 * One filing as the stream prints it. MovesStream (moves-stream.tsx) works the
 * words out on the server and hands these over as data, so a page of moves
 * costs its text once instead of a second copy of its markup in the RSC payload.
 */
export type MoveRow = {
  id: string;
  /** "Aug 14" and, for the hover, "Aug 14, 2026". */
  day: string;
  dayLong: string;
  href: string;
  name: string;
  person: string;
  party?: string;
  /** Up to six lines; empty means the note below stands in for them. */
  items: MoveLine[];
  note: string;
  /** When it was filed against when it happened; links to the filing when there is one. */
  timing: string;
  url: string | null;
  fund: boolean;
};

export function MovesList({ rows, showName }: { rows: MoveRow[]; showName: boolean }) {
  return (
    <ul className="divide-y divide-oa-border">
      {rows.map((row) => (
        <li key={row.id} className="mv-row">
          <div className="oa-mono mv-day" title={`Filed ${row.dayLong}`}>
            {row.day}
          </div>
          <div className="min-w-0">
            {showName ? (
              <p className="mv-who">
                <PartyDot party={row.party} />
                <Link prefetch={false} href={row.href} className="mv-name">
                  {row.name}
                </Link>
                <span className="mv-person">{row.person}</span>
              </p>
            ) : null}
            {row.items.length > 0 ? (
              <p className="mv-items">
                {row.items.map((item, index) => (
                  <span key={`${item.label}-${item.ticker ?? item.name}-${index}`} className="mv-item">
                    <span className={`oa-mono mv-act ${item.up ? "text-signal-bullish" : "text-signal-bearish"}`}>{item.label}</span>
                    {item.ticker ? <Ticker ticker={item.ticker} /> : <span className="text-oa-fg">{item.name}</span>}
                    {item.size ? <span className="oa-mono mv-size">{item.size}</span> : null}
                  </span>
                ))}
              </p>
            ) : (
              <p className="mv-note">{row.note}</p>
            )}
            {/* The filing itself opens from its dates, so no "Report (PDF)" is repeated on every row (owner, Nov 11). */}
            <p className="mv-when">
              {row.url ? (
                <ExternalLink href={row.url} className="-my-1 inline-block py-1">
                  {row.timing || "The filing"}
                  <span className="sr-only">{row.fund ? " (the report at the SEC)" : " (the report, a PDF)"}</span>
                </ExternalLink>
              ) : (
                row.timing
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
