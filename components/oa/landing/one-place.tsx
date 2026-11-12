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

import { ChangeText, EmptyRow } from "./shared";
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
    withTimeout(exampleBookOnce(), "landing book"),
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
      <SquircleCard title="Example list" seeAllHref="/portfolio">
        <EmptyRow>Prices are refreshing. Open your stocks to see your own list.</EmptyRow>
      </SquircleCard>
    );
  }

  const prices = pricesWords(view.pricesDay);
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
                  {row.call ? <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${CALL_CHIP[row.call]}`}>{row.call}</span> : null}
                  {row.dayPct !== null ? <ChangeText pct={row.dayPct} className="oa-mono ml-auto text-[16px] font-semibold" /> : null}
                </span>
                {/* The chip says the call; the line is the one thing that matters for it now, as on its /portfolio card. */}
                {row.line ? <span className="mt-1.5 block text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{row.line}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
