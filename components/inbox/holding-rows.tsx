import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { ExampleHoldings } from "@/lib/inbox/example-holdings";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
/** Stock, weight, since added, day: the column words said once in the head row, not on every row (owner rule 1). */
const GRID = "grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_4.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_6rem]";

/** "+2.1%", "−0.4%", "0.0%" (no sign on a move that rounds to nothing). */
function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function toneOf(value: number): string {
  if (Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

function weightWord(weight: number): string {
  return `${weight >= 10 ? Math.round(weight) : weight.toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * The example's other holdings under the read: a compact table (logo and ticker, weight, gain since added, the day's
 * move), each row opening its stock. The day and the S&P 500 are said once, above the table. About eight rows show;
 * a longer list scrolls inside with no visible bar (owner rule 5).
 */
export function ExampleHoldingRows({ holdings }: { holdings: ExampleHoldings }) {
  return (
    <section aria-label={holdings.title} className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3 sm:px-5">
        <h2 className="min-w-0 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">{holdings.title}</h2>
        {holdings.market ? <span className="oa-mono shrink-0 whitespace-nowrap text-[13px] tabular-nums text-oa-muted-fg">{holdings.market}</span> : null}
      </header>
      <div role="table" aria-label={holdings.title}>
        <div role="row" className={`${GRID} border-y border-oa-border bg-oa-bg px-4 py-1.5 text-[12.5px] leading-4 text-oa-muted-fg sm:px-5`}>
          <span role="columnheader">Stock</span>
          <span role="columnheader" className="text-right">Weight</span>
          <span role="columnheader" className="text-right">Since added</span>
          <span role="columnheader" className="text-right">Day</span>
        </div>
        <div role="rowgroup" className="scrollbar-hide max-h-[22rem] divide-y divide-oa-border overflow-y-auto overscroll-contain">
          {holdings.rows.map((row) => (
            <div role="row" key={row.ticker} className={`${GRID} relative min-h-11 px-4 py-1.5 text-[14px] leading-5 transition-colors hover:bg-oa-accent sm:px-5`}>
              <span role="cell" className="flex min-w-0 items-center gap-2">
                <StockLogo ticker={row.ticker} size={22} />
                <Link
                  href={`/stock/${encodeURIComponent(row.ticker)}`}
                  prefetch={false}
                  className={`oa-mono rounded font-semibold text-oa-fg after:absolute after:inset-0 after:content-[''] ${FOCUS}`}
                >
                  {row.ticker}
                </Link>
              </span>
              <span role="cell" className="oa-mono text-right tabular-nums text-oa-fg">
                {row.weight !== null ? weightWord(row.weight) : "–"}
              </span>
              <span role="cell" className={`oa-mono text-right tabular-nums ${row.gainPct !== null ? toneOf(row.gainPct) : "text-oa-muted-fg"}`}>
                {row.gainPct !== null ? signed(row.gainPct) : "–"}
              </span>
              <span role="cell" className={`oa-mono text-right font-semibold tabular-nums ${toneOf(row.dayPct)}`}>
                {signed(row.dayPct)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
