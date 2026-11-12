import Link from "next/link";

import { StockCard, StockCardGrid } from "@/components/briefing/stock-card";
import type { ExampleReports } from "@/lib/inbox/example-reports";
import { listNames, shortDay } from "@/lib/read-format";

/** "+2.1%", "−0.4%", "0.0%" (no sign on a move that rounds to nothing). */
function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

/**
 * The example's other stocks under the read, by their last report, as small cards (owner rule 3): the logo, the
 * report's day under the ticker, how the stock moved on it as the one big figure, and a highlight only for what is its
 * own (lib/inbox/example-reports.ts). The briefing has the day's moves; the inbox is the dated record (judges, ship
 * 50). What most of them did and which ones it watches are said once above the cards (owner rule 1). An odd last card
 * fills its row (owner rule 4). Each card opens its stock.
 */
export function ExampleReportCards({ reports }: { reports: ExampleReports }) {
  const watched = reports.cards.filter((card) => card.watching).map((card) => card.ticker);
  const held = reports.cards.length - watched.length;
  const watchLine =
    held > 0 && watched.length > 0
      ? watched.length === 1
        ? `The example watches ${watched[0]} without holding it.`
        : `The example watches ${listNames(watched, watched.length)} rather than holding them.`
      : null;
  const intro = [reports.line, watchLine].filter(Boolean).join(" ");
  return (
    <section aria-labelledby="example-reports-head" className="min-w-0">
      <h2 id="example-reports-head" className="min-w-0 px-1 pb-1 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">
        {reports.title}
      </h2>
      {intro ? <p className="mb-2.5 text-pretty px-1 text-[13.5px] leading-5 text-oa-muted-fg">{intro}</p> : null}
      <StockCardGrid dense>
        {reports.cards.map((card) => {
          const figure = card.move !== null ? signed(card.move) : null;
          const day = shortDay(card.day);
          return (
            <StockCard
              key={card.ticker}
              ticker={card.ticker}
              name=""
              eagerLogo
              figure={figure}
              tone={card.move === null || Math.abs(card.move) < 0.05 ? "flat" : card.move > 0 ? "up" : "down"}
              tag={day}
              note={card.fact}
              cover={
                <Link
                  prefetch={false}
                  href={`/stock/${encodeURIComponent(card.ticker)}`}
                  aria-label={[card.ticker, `reported ${day}`, figure ? `moved ${figure} on it` : null, card.fact].filter(Boolean).join(", ")}
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
