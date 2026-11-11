import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { exampleBookView } from "@/lib/landing-example-book";
import { loadExampleIdeas } from "@/lib/portfolio-ideas/server";
import { DEFAULT_RATES } from "@/lib/portfolio-ideas/tax";
import { withTimeout } from "@/lib/portfolio-home/server";
import { extraFacts, type PlainCall } from "@/lib/portfolio-home/stocks";
import { loadExampleBook } from "@/lib/portfolio-home/stocks-server";
import { exampleReasonChecks } from "@/lib/thesis-watch/server";

import { ChangeText, EmptyRow, fmtPrice } from "./shared";
import Link from "next/link";

const CALL_CHIP: Record<PlainCall, string> = {
  "Buy more": "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  Keep: "bg-oa-accent text-oa-fg",
  "Sell some": "bg-amber-500/15 text-amber-900 dark:text-amber-300",
};

/**
 * Proof two: one call on each stock you own. The example portfolio from My stocks (/portfolio), with the same
 * loaders (lib/portfolio-home/stocks-server.ts and the ideas and reason checks it reads), so the holdings, their
 * value, the day's move and each stock's line here are the ones /portfolio shows. Share counts are made up; prices
 * and calls are live.
 */
export async function OnePlace() {
  const [book, ideas, reasons] = await Promise.all([
    withTimeout(loadExampleBook(), "landing book"),
    withTimeout(loadExampleIdeas(DEFAULT_RATES), "landing ideas"),
    withTimeout(exampleReasonChecks().then((checks) => (checks.length > 0 ? checks : null)), "landing reasons"),
  ]);
  const extra = extraFacts({
    ideas: ideas.state === "ready" ? ideas.value : null,
    reasons: reasons.state === "ready" ? reasons.value : null,
  });
  const view = book.state === "ready" ? exampleBookView(book.value, extra) : null;
  if (!view) {
    return (
      <SquircleCard title="Example list" seeAllHref="/portfolio?tab=holdings">
        <EmptyRow>Prices are refreshing. Open your stocks to see your own list.</EmptyRow>
      </SquircleCard>
    );
  }

  const tone = view.day ? (view.day.pct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400") : "";
  return (
    <Reveal delay={60}>
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-oa-border px-4 py-3.5 sm:px-5">
          <p className="text-[15px] leading-6 text-oa-fg">
            {view.value} across {view.count}
            {view.day ? (
              <>
                , <span className={`font-medium tabular-nums ${tone}`}>{view.day.text}</span> {view.day.when}.
              </>
            ) : (
              "."
            )}
            {view.calls ? ` ${view.calls}` : ""}
            {view.pending ? ` ${view.pending}` : ""}
          </p>
          <p className="text-[13px] leading-5 text-oa-muted-fg">Example list: made-up share counts, live prices.</p>
        </div>
        <ul className="divide-y divide-oa-border">
          {view.rows.map((row) => (
            <li key={row.ticker}>
              <Link
                prefetch={false}
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5"
              >
                <StockLogo ticker={row.ticker} size={28} circle />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="oa-mono text-[15px] text-oa-fg">{row.ticker}</span>
                    {row.shares !== null ? <span className="text-[13px] text-oa-muted-fg">{row.shares} shares</span> : null}
                    {row.call ? <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${CALL_CHIP[row.call]}`}>{row.call}</span> : null}
                  </span>
                  {/* The chip says the call; the line is the one thing that matters for it now, as on its /portfolio card. */}
                  {row.line ? <span className="mt-0.5 block text-pretty text-[15px] leading-6 text-oa-muted-fg">{row.line}</span> : null}
                </span>
                <span className="flex flex-col items-end text-[15px] tabular-nums">
                  {row.price !== null ? <span className="text-oa-fg">{fmtPrice(row.price)}</span> : null}
                  {row.dayPct !== null ? <ChangeText pct={row.dayPct} /> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
