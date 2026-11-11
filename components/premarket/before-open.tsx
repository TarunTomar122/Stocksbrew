import Link from "next/link";
import * as React from "react";

import { fmtStampET } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { futuresLine, gapPct, showBeforeOpen } from "@/lib/premarket-read";

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";

type Row = { ticker: string; gap_pct: number };

function GapRows({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid gap-y-1">
      {rows.map((row) => (
        <li key={row.ticker} className="flex items-center justify-between gap-2 text-[13px] leading-5">
          <span className="oa-mono inline-flex min-w-0 items-center gap-1.5 font-semibold text-oa-fg">
            <StockLogo ticker={row.ticker} size={16} />
            {row.ticker}
          </span>
          <span className={`oa-mono tabular-nums ${row.gap_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{gapPct(row.gap_pct, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Before the open" for the briefing's side rail: the futures and the three biggest gaps each way, from the one
 * cached premarket read. Only before 9:30 ET on a market day and only with today's numbers; nothing otherwise.
 * The whole card opens /premarket.
 */
export async function BeforeOpenCard({ now = new Date() }: { now?: Date }) {
  const report = await getPremarketOpeningReport().catch(() => null);
  if (!report || !showBeforeOpen(report.generated_at, now)) return null;
  const futures = futuresLine(report.global_cues);
  const up = report.premarket.top_gainers.filter((row) => row.ticker && row.gap_pct > 0).slice(0, 3);
  const down = report.premarket.top_losers.filter((row) => row.ticker && row.gap_pct < 0).slice(0, 3);
  if (futures.length === 0 && up.length === 0 && down.length === 0) return null;
  return <BeforeOpenView futures={futures} up={up} down={down} asOf={report.generated_at} />;
}

/** The card itself, from numbers already read (also what the harness and tests render). */
export function BeforeOpenView({ futures, up, down, asOf }: { futures: string[]; up: Row[]; down: Row[]; asOf: string | null }) {
  // "7:31 AM ET": the card only shows on the day it is from, so the time alone is enough.
  const time = fmtStampET(asOf).replace(/^[A-Z][a-z]{2} \d{1,2}, /, "");
  return (
    <section aria-labelledby="before-open-label" className={`${CARD} relative transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent`}>
      <header className="flex min-h-10 items-center justify-between gap-3 px-4 pb-0.5 pt-2.5">
        <h2 id="before-open-label" className="oa-label">
          Before the open
        </h2>
        {time ? <span className="text-[12px] text-oa-muted-fg">as of {time}</span> : null}
      </header>
      {futures.length > 0 ? (
        <p className="px-4 text-pretty text-[13.5px] leading-5 text-oa-fg">
          {/* Each figure stays on one line; the line breaks between them. */}
          {futures.map((part, index) => (
            <React.Fragment key={part}>
              {index > 0 ? ", " : null}
              <span className="whitespace-nowrap">{part}</span>
            </React.Fragment>
          ))}
        </p>
      ) : null}
      {up.length > 0 || down.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 px-4 pb-3 pt-2.5">
          <div className="min-w-0">
            <p className="oa-caption mb-1">Gapping up</p>
            {up.length > 0 ? <GapRows rows={up} /> : <p className="text-[13px] text-oa-muted-fg">None</p>}
          </div>
          <div className="min-w-0">
            <p className="oa-caption mb-1">Gapping down</p>
            {down.length > 0 ? <GapRows rows={down} /> : <p className="text-[13px] text-oa-muted-fg">None</p>}
          </div>
        </div>
      ) : (
        <div className="pb-3" />
      )}
      <Link
        href="/premarket"
        prefetch={false}
        aria-label="Open the premarket"
        className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
    </section>
  );
}
