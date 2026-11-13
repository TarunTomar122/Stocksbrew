"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { OvernightStrip as Strip } from "@/lib/briefing-overnight";
import { extendedPct } from "@/lib/extended-quotes";
import { shortCompanyName } from "@/lib/plain-copy";

/**
 * "Overnight" (or "After hours" in the evening): the person's stocks that moved big outside the regular session, one
 * card each with the logo, the move, its price and one line (lib/briefing-overnight.ts). The session and time are said
 * once in the heading when every card shares them. It hides itself at the next open, so a briefing left open (or
 * served from a cache) never keeps a thin after-hours print into the session.
 */

const CARD = "oa-surface border border-oa-border bg-oa-card";
const HOVER = "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--oa-accent)_45%,var(--oa-card))]";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const LG_COLS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

/** The column count that leaves the fewest empty slots in the last row (ties go to more columns). */
function columnsFor(count: number): number {
  let best = 2;
  let bestEmpty = Infinity;
  for (const columns of [2, 3, 4]) {
    const empty = (columns - (count % columns)) % columns;
    if (empty < bestEmpty || (empty === bestEmpty && columns > best)) {
      best = columns;
      bestEmpty = empty;
    }
  }
  return best;
}

const tone = (pct: number) => (Math.round(pct * 10) === 0 ? "text-oa-fg" : pct > 0 ? "text-signal-bullish" : "text-signal-bearish");
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OvernightStrip({ strip }: { strip: Strip }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const wait = strip.dropAt - Date.now();
    if (wait <= 0) {
      setGone(true);
      return;
    }
    const timer = window.setTimeout(() => setGone(true), Math.min(wait + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [strip.dropAt]);
  if (gone || strip.cards.length === 0) return null;

  const single = strip.cards.length === 1;
  const grid = single ? "grid grid-cols-1" : `grid grid-cols-1 gap-3 sm:grid-cols-2 ${LG_COLS[columnsFor(strip.cards.length)]}`;
  return (
    <section aria-labelledby="overnight-title" className="min-w-0">
      <h2 id="overnight-title" className="flex flex-wrap items-center gap-x-2 px-2 pb-2 text-[14px] font-semibold leading-6 text-oa-fg sm:px-0">
        {strip.title}
        <span className="oa-mono inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-oa-accent px-1.5 text-[11.5px] font-medium tabular-nums text-oa-fg">{strip.cards.length}</span>
        {strip.when ? (
          <span className="oa-mono text-[12px] font-normal text-oa-muted-fg" suppressHydrationWarning>
            {strip.when}
          </span>
        ) : null}
      </h2>
      <ul aria-label="Moves outside the regular session" className={grid}>
        {strip.cards.map((card) => {
          const short = shortCompanyName(card.name);
          const named = short && short.toUpperCase() !== card.ticker ? short : null;
          return (
            <li key={card.ticker} className="min-w-0">
              <Link
                href={`/stock/${encodeURIComponent(card.ticker)}`}
                prefetch={false}
                className={`${CARD} ${HOVER} ${FOCUS} flex h-full min-w-0 ${single ? "flex-col gap-2 sm:flex-row sm:items-center sm:gap-4" : "flex-col gap-2"} px-3.5 py-3`}
              >
                <span className="flex min-w-0 items-start justify-between gap-3 sm:min-w-[14rem]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <StockLogo ticker={card.ticker} size={28} eager />
                    <span className="min-w-0 leading-5">
                      <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{card.ticker}</span>
                      {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
                    </span>
                  </span>
                  <span className={`flex shrink-0 flex-col items-end leading-5 ${single ? "sm:hidden" : ""}`}>
                    <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${tone(card.pct)}`}>{extendedPct(card.pct)}</span>
                    <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{money(card.price)}</span>
                  </span>
                </span>
                {card.line ? <span className="min-w-0 flex-1 text-pretty text-[13.5px] font-medium leading-5 text-oa-fg">{card.line}</span> : single ? <span className="hidden flex-1 sm:block" /> : null}
                {single ? (
                  <span className="hidden shrink-0 flex-col items-end leading-5 sm:flex">
                    <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${tone(card.pct)}`}>{extendedPct(card.pct)}</span>
                    <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{money(card.price)}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
