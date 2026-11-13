import { SignedBar, barDomain } from "@/components/oa/kit/tone";
import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { exampleBookView } from "@/lib/landing-example-book";
import { pricesWords } from "@/lib/portfolio-prices";
import { loadExampleIdeas } from "@/lib/portfolio-ideas/server";
import { DEFAULT_RATES } from "@/lib/portfolio-ideas/tax";
import { withTimeout } from "@/lib/portfolio-home/server";
import { extraFacts, type PlainCall } from "@/lib/portfolio-home/stocks";
import { exampleBookOnce } from "@/lib/portfolio-home/stocks-server";
import { exampleReasonChecks } from "@/lib/thesis-watch/server";

import { ChangeText, EmptyRow, fmtPrice } from "./shared";
import Link from "next/link";

const CALL_CHIP: Record<PlainCall, string> = {
  "Buy more": "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  Keep: "bg-oa-accent text-oa-fg",
  "Sell some": "bg-amber-500/15 text-amber-900 dark:text-amber-300",
};

/** "+2.3%", "−1.6%": a month's move, one decimal. */
function signedMonth(pct: number): string {
  if (Math.abs(pct) < 0.05) return "0.0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Proof two: one call on each stock you own. The example portfolio from My stocks (/portfolio), with the same
 * loaders (lib/portfolio-home/stocks-server.ts and the ideas and reason checks it reads), so the holdings, their
 * value, the day's move and each stock's line here are the ones /portfolio shows. Share counts are made up; prices
 * and calls are live.
 */
export async function OnePlace() {
  const [book, ideas, reasons] = await Promise.all([
    withTimeout(exampleBookOnce(), "landing book"),
    // Only the losses and trims are shown here, so no fund look-alikes (they read every covered fund's holdings).
    withTimeout(loadExampleIdeas(DEFAULT_RATES, { lookAlikes: false }), "landing ideas"),
    withTimeout(exampleReasonChecks().then((checks) => (checks.length > 0 ? checks : null)), "landing reasons"),
  ]);
  const extra = extraFacts({
    ideas: ideas.state === "ready" ? ideas.value : null,
    reasons: reasons.state === "ready" ? reasons.value : null,
  });
  const view = book.state === "ready" ? exampleBookView(book.value, extra) : null;
  if (!view) {
    return (
      <SquircleCard title="Example list" seeAllHref="/portfolio">
        <EmptyRow>Prices are refreshing. Open your stocks to see your own list.</EmptyRow>
      </SquircleCard>
    );
  }

  const prices = pricesWords(view.pricesDay);
  // Every card's month on one scale, the S&P 500's month among the ends so its tick always lands on the track.
  const monthDomain = barDomain([...view.rows.map((row) => row.monthPct), view.marketMonthPct]);
  const market = view.marketMonthPct;
  const tone = view.day ? (view.day.pct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400") : "";
  return (
    <Reveal delay={60}>
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-oa-border px-4 py-3.5 sm:px-5">
          {/* The portfolio's value and the day's move only: the cards below already say what it holds (owner rule 8). */}
          <p className="oa-mono flex items-baseline gap-2.5 tabular-nums">
            <span className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-oa-fg">{view.value}</span>
            {view.day ? (
              <span className="text-[15px] leading-6">
                <span className={`font-medium ${tone}`}>{view.day.text}</span> <span className="font-sans text-oa-muted-fg">{view.day.when}</span>
              </span>
            ) : null}
          </p>
          {/* The snapshot's day, said once: the same prices as /portfolio, /briefing and /inbox (judges, ship 42). */}
          <p className="text-[13px] leading-5 text-oa-muted-fg">
            Example portfolio, not real money.{prices ? ` Prices from ${prices}.` : ""}
          </p>
        </div>
        {/* Small stock cards, as on My stocks (owner rule 3): logo, the call, the day's move and one fact. */}
        <ul className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
          {view.rows.map((row) => (
            <li key={row.ticker} className="min-w-0">
              <Link
                prefetch={false}
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                className="oa-surface flex h-full flex-col border border-oa-border bg-oa-bg px-3.5 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.ticker} size={22} circle />
                  <span className="oa-mono text-[14.5px] font-semibold text-oa-fg">{row.ticker}</span>
                  {row.call ? <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${CALL_CHIP[row.call]}`}>{row.call}</span> : null}
                  {/* The price beside the day's move (owner rule 4: every stock card shows its current price). */}
                  <span className="oa-mono ml-auto flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    {row.price !== null ? <span className="text-[14px] text-oa-fg">{fmtPrice(row.price)}</span> : null}
                    {row.dayPct !== null ? <ChangeText pct={row.dayPct} className="text-[15px] font-semibold" /> : null}
                  </span>
                </span>
                {/* The one thing that matters for it now; its month is the bar below, not written out. */}
                {row.line ? <span className="mt-1.5 block text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{row.line}</span> : null}
                {/* Its past month against the S&P 500's (the tick), on one scale for every card: a picture rather than
                    "4.0 points behind the S&P 500" written out on half the cards (owner rules 1 and 4). */}
                {row.monthPct !== null ? (
                  <span
                    className="mt-auto flex items-center gap-2.5 pt-2.5"
                    title={`Past month: ${row.ticker} ${signedMonth(row.monthPct)}${market !== null ? `, S&P 500 ${signedMonth(market)}` : ""}`}
                  >
                    <SignedBar value={row.monthPct} domain={monthDomain} mark={market} markColor="var(--oa-primary)" className="min-w-0 flex-1 !h-1.5 !bg-[color-mix(in_srgb,var(--oa-fg)_8%,transparent)]" />
                    <span className={`oa-mono w-14 shrink-0 text-right text-[12.5px] tabular-nums ${row.monthPct >= 0.05 ? "text-emerald-700 dark:text-emerald-400" : row.monthPct <= -0.05 ? "text-red-700 dark:text-red-400" : "text-oa-muted-fg"}`}>
                      {signedMonth(row.monthPct)}
                    </span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        {/* The bars' key, once for every card (owner rule 1): the bar is the stock's past month, the tick the S&P 500's
            (when its month is known for the same days). */}
        {view.rows.some((row) => row.monthPct !== null) ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3.5 text-[12.5px] leading-5 text-oa-muted-fg sm:px-5">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex h-1.5 w-4 overflow-hidden rounded-full">
                <span className="w-1/2 bg-[var(--signal-bearish)]" />
                <span className="w-1/2 bg-[var(--signal-bullish)]" />
              </span>
              Past month
            </span>
            {market !== null ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-oa-primary" />
                S&amp;P 500 <span className="oa-mono tabular-nums text-oa-fg">{signedMonth(market)}</span>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}
