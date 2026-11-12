import Link from "next/link";

import { StockCard, StockCardGrid, stockGridFill } from "@/components/briefing/stock-card";
import type { ExampleHoldingRow, ExampleHoldings } from "@/lib/inbox/example-holdings";

/** "+2.1%", "−0.4%", "0.0%" (no sign on a move that rounds to nothing). */
function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

/** "AMD, CAT and LLY". */
function joined(tickers: string[]): string {
  return tickers.length > 1 ? `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}` : (tickers[0] ?? "");
}

/**
 * The example's other stocks under the read, as small cards like the briefing's (owner rule 3): the logo, the day's
 * move as the one big figure, and the confirmed reason as its sentence, or else one measured fact as its highlight,
 * picked so neighbouring cards say different kinds of thing (lib/inbox/example-holdings.ts). Weight and cost are My
 * stocks', not repeated here (judges, ship 42). What it holds first, then what it watches, said once above the cards
 * (owner rule 1). The day and the S&P 500 are said once, in the head. An odd last card fills its row (owner rule 4).
 * Each card opens its stock.
 */
export function ExampleHoldingRows({ holdings }: { holdings: ExampleHoldings }) {
  const cards: ExampleHoldingRow[] = [...holdings.rows, ...holdings.watching];
  const watched = holdings.watching.map((row) => row.ticker);
  const watchLine =
    holdings.rows.length > 0 && watched.length > 0
      ? watched.length === 1
        ? `It also watches ${watched[0]}, without holding it.`
        : `${joined(watched)} are stocks it watches rather than holds.`
      : null;
  return (
    <section aria-label={holdings.title} className="min-w-0">
      <header className="flex items-baseline justify-between gap-3 px-1 pb-2.5">
        <h2 className="min-w-0 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">{holdings.title}</h2>
        {holdings.market ? <span className="oa-mono shrink-0 whitespace-nowrap text-[13px] tabular-nums text-oa-muted-fg">{holdings.market}</span> : null}
      </header>
      {watchLine ? <p className="mb-2.5 text-pretty px-1 text-[13.5px] leading-5 text-oa-muted-fg">{watchLine}</p> : null}
      <StockCardGrid dense>
        {cards.map((row, index) => {
          const figure = signed(row.dayPct);
          return (
            <StockCard
              key={row.ticker}
              ticker={row.ticker}
              name=""
              eagerLogo
              figure={figure}
              tone={Math.abs(row.dayPct) < 0.05 ? "flat" : row.dayPct > 0 ? "up" : "down"}
              // The confirmed reason; without one, a measured fact, never a guessed reason (owner rule 7).
              sentence={row.reason}
              fact={row.reason ? null : row.fact}
              fill={stockGridFill(index, cards.length, false, true)}
              cover={
                <Link
                  prefetch={false}
                  href={`/stock/${encodeURIComponent(row.ticker)}`}
                  aria-label={[row.ticker, figure, row.reason ?? row.fact].filter(Boolean).join(", ")}
                  className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                />
              }
            />
          );
        })}
      </StockCardGrid>
    </section>
  );
}
