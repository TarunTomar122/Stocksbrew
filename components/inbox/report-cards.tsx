import Link from "next/link";

import { CARD_HOVER, StockCardGrid } from "@/components/briefing/stock-card";
import { SignedBar, barDomain } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { capitalize, dayWords, onDayWords } from "@/lib/day-words";
import type { ExampleReports } from "@/lib/inbox/example-reports";
import { listNames, shortDay } from "@/lib/read-format";

/** "+2.1%", "−0.4%", "0.0%" (no sign on a move that rounds to nothing). */
function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function toneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

/** A stock's price now and its move today, percent: what every stock card shows beside its own figure (owner rule 4). */
export type CardQuote = { price: number; dayPct: number | null };

/**
 * The example's other stocks under the read, by their last report, as small cards (owner rule 3): the logo, the
 * stock's price and move today under the ticker (owner rule 4), how the stock moved on its report as the one big
 * figure with a bar under it (every card on one scale, one zero line: owner VISUALS CHECK), the report's day in words,
 * and a highlight only for what is its own (lib/inbox/example-reports.ts). The briefing has the day's moves; the inbox
 * is the dated record (judges, ship 50). What most of them did and which ones it watches are said once above the
 * cards (owner rule 1). Each card opens its stock.
 */
export function ExampleReportCards({ reports, quotes = {}, today }: { reports: ExampleReports; quotes?: Record<string, CardQuote>; today: string }) {
  const watched = reports.cards.filter((card) => card.watching).map((card) => card.ticker);
  const held = reports.cards.length - watched.length;
  const watchLine =
    held > 0 && watched.length > 0
      ? watched.length === 1
        ? `The example watches ${watched[0]} without holding it.`
        : `The example watches ${listNames(watched, watched.length)} rather than holding them.`
      : null;
  const intro = [reports.line, watchLine].filter(Boolean).join(" ");
  const domain = barDomain(reports.cards.map((card) => card.move));
  return (
    <section aria-labelledby="example-reports-head" className="min-w-0">
      <h2 id="example-reports-head" className="min-w-0 px-1 pb-1 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">
        {reports.title}
      </h2>
      {intro ? <p className="mb-2.5 text-pretty px-1 text-[13.5px] leading-5 text-oa-muted-fg">{intro}</p> : null}
      <StockCardGrid dense>
        {reports.cards.map((card) => {
          const figure = card.move !== null ? signed(card.move) : null;
          // "on Monday", "yesterday", "on Nov 3" (lib/day-words.ts), for screen readers.
          const day = onDayWords(card.day, today) || `on ${shortDay(card.day)}`;
          const quote = quotes[card.ticker.toUpperCase()];
          // What the big figure is, said under it: "Monday's report", "Nov 3 report" (council, Nov 12: two percentages
          // on a card must each say what they are).
          const words = dayWords(card.day, today) || shortDay(card.day);
          const reportCaption = /^(today|yesterday|[A-Z][a-z]+day)$/.test(words) ? `${capitalize(words)}'s report` : `${words} report`;
          const price = quote ? `$${quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
          const todayMove = quote && quote.dayPct !== null ? `${signed(quote.dayPct)} today` : null;
          return (
            // A container, so a narrow card (two to a row on a phone, or one at 320) stacks its parts: the ticker, the
            // price and today's move, then the report's figure with its caption. From 18rem they sit side by side.
            <li key={card.ticker} className={`oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 pb-3 pt-3 [container-type:inline-size] ${CARD_HOVER}`}>
              <div className="flex min-w-0 flex-col gap-1.5 [@container(min-width:18rem)]:flex-row [@container(min-width:18rem)]:items-start [@container(min-width:18rem)]:justify-between [@container(min-width:18rem)]:gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StockLogo ticker={card.ticker} size={28} eager />
                  <div className="min-w-0 leading-5">
                    <p className="oa-mono text-[14px] font-semibold text-oa-fg">{card.ticker}</p>
                    {price ? (
                      // The price and today's move, the move named as today's so it never reads as the report's.
                      <p className="oa-mono flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-4 tabular-nums">
                        <span className="text-oa-muted-fg">{price}</span>
                        {todayMove ? <span className={toneClass(quote!.dayPct)}>{todayMove}</span> : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                {figure ? (
                  <div className="shrink-0 [@container(min-width:18rem)]:text-right">
                    <p className={`oa-mono text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${toneClass(card.move)}`}>{figure}</p>
                    <p className="text-[12px] leading-4 text-oa-muted-fg">{reportCaption}</p>
                  </div>
                ) : null}
              </div>
              {card.move !== null ? <SignedBar value={card.move} domain={domain} className="mt-2.5 h-1.5" /> : null}
              {figure ? null : <p className="mt-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">{reportCaption}</p>}
              {card.fact ? <p className="mt-1 min-w-0 text-pretty text-[12.5px] font-medium leading-[18px] text-oa-primary">{card.fact}</p> : null}
              <Link
                prefetch={false}
                href={`/stock/${encodeURIComponent(card.ticker)}`}
                aria-label={[card.ticker, price, todayMove, figure ? `moved ${figure} on its report ${day}` : `reported ${day}`, card.fact].filter(Boolean).join(", ")}
                className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
              />
            </li>
          );
        })}
      </StockCardGrid>
    </section>
  );
}
