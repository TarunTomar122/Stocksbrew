import Link from "next/link";
import type * as React from "react";

import { FOCUS } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";

/**
 * The day's biggest moves as two tables side by side (owner, Nov 12: "do table here left side gainers right side
 * losers"): gainers on the left, losers on the right, stacked gainers first on a phone. Each row is the logo, the
 * ticker, its confirmed reason (moves without one are not listed) cut to two lines at most, and the price over
 * the move. Each table scrolls inside a box about seven and a half rows tall, so the half row at the foot says there
 * is more; the header row stays put while it scrolls, and the scroll hands back to the page at either end (no
 * overscroll containment). Both boxes are the same height. Server-rendered, no hooks.
 */

export type MoveRow = { ticker: string; name: string; changePct: number; price: number | null; line: string | null };

/** "$173.85", "$1,204": a share price, with cents under $1,000. */
function sharePrice(value: number): string {
  const cents = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
}

/** One row's height, in rem (each item's `h-[3.25rem]`, its 1px border inside it): two lines of the reason plus padding, so the cut is exact. */
const ROW_REM = 3.25;
/** The sticky header row's height, in rem. */
const HEAD_REM = 2.5;
/** Rows in view before the box scrolls: seven whole rows and half of the eighth. */
const ROWS_IN_VIEW = 7.5;

const MINUS = "−";

function signedPct(value: number): string {
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(1)}%`;
}

/** The box's height for a table of `count` rows: the rows themselves, up to seven and a half. */
function boxRem(count: number): number {
  return HEAD_REM + Math.min(count, ROWS_IN_VIEW) * ROW_REM;
}

function MoveTable({ title, rows, side, heightRem, when }: { title: string; rows: MoveRow[]; side: "up" | "down"; heightRem: number; when: string }) {
  const id = `moves-${side}`;
  return (
    <section aria-labelledby={id} className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      {/* The box is the same height on both sides on a wide screen; on a phone each is only as tall as its rows. */}
      <div
        style={{ "--box": `${heightRem}rem` } as React.CSSProperties}
        className="max-h-[var(--box)] overflow-y-auto scrollbar-hide md:h-[var(--box)]"
      >
        <h3
          id={id}
          className="sticky top-0 z-10 flex h-10 items-center border-b border-oa-border bg-oa-card px-3.5 text-[13.5px] font-semibold text-oa-fg"
        >
          {title}
          <span className="oa-mono ml-1.5 font-normal tabular-nums text-oa-muted-fg">· {rows.length}</span>
        </h3>
        <ul>
          {rows.map((row) => (
            <li key={row.ticker} className="h-[3.25rem] border-b border-oa-border last:border-b-0">
              <Link
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                prefetch={false}
                aria-label={`${row.ticker}, ${signedPct(row.changePct)} ${when}`}
                title={row.line ? `${row.name || row.ticker}: ${row.line}` : row.name || row.ticker}
                className={`grid h-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.ticker} size={20} eager />
                  <span className="oa-mono truncate text-[13.5px] font-semibold text-oa-fg">{row.ticker}</span>
                </span>
                <span className="line-clamp-2 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{row.line ?? ""}</span>
                {/* The price, then the move under it (owner, Nov 12: the current price on every stock). */}
                <span className="flex flex-col items-end">
                  {row.price !== null ? <span className="oa-mono text-[13px] tabular-nums text-oa-fg">{sharePrice(row.price)}</span> : null}
                  <span className={`oa-mono text-right text-[14px] font-semibold tabular-nums ${side === "up" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                    {signedPct(row.changePct)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Gainers and losers side by side; one table alone takes the whole width. */
export function MoveTables({ up, down, when }: { up: MoveRow[]; down: MoveRow[]; when: string }) {
  if (up.length === 0 && down.length === 0) return null;
  const heightRem = boxRem(Math.max(up.length, down.length));
  const both = up.length > 0 && down.length > 0;
  return (
    <div className={`grid grid-cols-1 gap-3 ${both ? "md:grid-cols-2" : ""}`}>
      {up.length > 0 ? <MoveTable title="Gainers" rows={up} side="up" heightRem={heightRem} when={when} /> : null}
      {down.length > 0 ? <MoveTable title="Losers" rows={down} side="down" heightRem={heightRem} when={when} /> : null}
    </div>
  );
}
