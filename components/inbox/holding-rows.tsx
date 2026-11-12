import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { ExampleHoldingRow, ExampleHoldings } from "@/lib/inbox/example-holdings";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** "+2.1%", "−0.4%", "0.0%" (no sign on a move that rounds to nothing). */
function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function toneOf(value: number): string {
  if (Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

/** One stock on one line: logo, ticker, the confirmed reason when there is one, and the day's move. The line opens it. */
function Line({ row, className = "" }: { row: ExampleHoldingRow; className?: string }) {
  return (
    <li className={`border-b border-oa-border ${className}`}>
      <Link
        href={`/stock/${encodeURIComponent(row.ticker)}`}
        prefetch={false}
        className={`grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 transition-colors hover:bg-oa-accent sm:px-5 ${FOCUS}`}
      >
        <span className="flex items-center gap-2">
          <StockLogo ticker={row.ticker} size={22} />
          <span className="oa-mono text-[14px] font-semibold text-oa-fg">{row.ticker}</span>
        </span>
        {/* Nothing at all when no reason is confirmed (owner rule 7). */}
        <span className="min-w-0 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{row.reason ?? ""}</span>
        <span className={`oa-mono text-right text-[14px] font-semibold tabular-nums ${toneOf(row.dayPct)}`}>{signed(row.dayPct)}</span>
      </Link>
    </li>
  );
}

/**
 * The example's other stocks under the read: one plain line each (logo, ticker, the day's move, and the confirmed
 * reason when there is one). Weight and cost are My stocks', not repeated here (judges, ship 42). What it holds, then
 * what it watches as one line of chips. The day and the S&P 500 are said once, above. About eight lines show; a longer
 * list scrolls inside with no visible bar (owner rule 5).
 */
export function ExampleHoldingRows({ holdings }: { holdings: ExampleHoldings }) {
  return (
    <section aria-label={holdings.title} className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-oa-border px-4 pb-2 pt-3 sm:px-5">
        <h2 className="min-w-0 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">{holdings.title}</h2>
        {holdings.market ? <span className="oa-mono shrink-0 whitespace-nowrap text-[13px] tabular-nums text-oa-muted-fg">{holdings.market}</span> : null}
      </header>
      {/* Two lines side by side from `sm`, so a short line does not leave a wide empty middle; an odd last line
          takes the whole row (owner rule 4). About eight show; a longer list scrolls inside, no visible bar (rule 5). */}
      {holdings.rows.length > 0 ? (
        <ul aria-label="It holds" className="scrollbar-hide -mb-px grid max-h-[24rem] grid-cols-1 overflow-y-auto overscroll-contain sm:grid-cols-2">
          {holdings.rows.map((row, index) => (
            <Line
              key={row.ticker}
              row={row}
              className={`sm:[&:nth-child(odd)]:border-r ${index === holdings.rows.length - 1 && holdings.rows.length % 2 === 1 ? "sm:col-span-2 sm:!border-r-0" : ""}`}
            />
          ))}
        </ul>
      ) : null}
      {/* What it watches: one quiet line of logo chips with their move, not more rows (owner rules 5, 6). */}
      {holdings.watching.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-oa-border px-4 py-2.5 sm:px-5">
          <span className="mr-1 text-[13px] leading-5 text-oa-muted-fg">It also watches</span>
          {holdings.watching.map((row) => (
            <Link
              key={row.ticker}
              href={`/stock/${encodeURIComponent(row.ticker)}`}
              prefetch={false}
              title={row.reason ?? undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-oa-border bg-oa-bg pl-1.5 pr-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
            >
              <StockLogo ticker={row.ticker} size={18} />
              <span className="oa-mono text-[13px] font-semibold text-oa-fg">{row.ticker}</span>
              <span className={`oa-mono text-[13px] tabular-nums ${toneOf(row.dayPct)}`}>{signed(row.dayPct)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
