import Link from "next/link";

import { FigureCard, Tick, pct } from "@/components/portfolio/analysis/parts";
import type { HealthProps } from "@/lib/radar-next-data";
import type { Portfolio } from "@/lib/portfolio-shared";

/**
 * Under the holdings on My stocks: how the money sits in three figures, and the way into the full analysis on
 * What you own (/portfolio/xray), which works the rest out on the server. Nothing here repeats that page.
 * `health` is still passed by the view; the old score read it fed is gone.
 */
export function AnalyticsTab({
  portfolio,
  example,
}: {
  portfolio: Portfolio;
  health?: HealthProps | null;
  example: boolean;
}) {
  const { analytics, totals } = portfolio;
  if (totals.holdings === 0 || analytics.basis === null) return null;
  const link = (
    <Link
      href="/portfolio/xray"
      prefetch={false}
      className="inline-flex min-h-9 items-center self-start rounded border border-oa-border bg-oa-card px-3 text-[13px] font-medium text-oa-fg hover:border-oa-fg/30"
    >
      See what you own
    </Link>
  );
  // Equal weights are made up, so they get no figures: only the way to the page that can still say something.
  if (analytics.basis === "count") return <div className="px-2 sm:px-0">{link}</div>;
  const lines = analytics.byPosition;
  const largest = lines[0];
  const top5 = lines.slice(0, 5).reduce((sum, line) => sum + line.weight, 0);
  const spread = analytics.effectivePositions;
  return (
    <section aria-label={example ? "How the money sits" : "How your money sits"} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fill,304px)] md:gap-4">
        {largest ? (
          <FigureCard
            label={
              <span className="inline-flex items-center gap-1.5">
                Largest <Tick ticker={largest.label} size={16} />
              </span>
            }
            figure={pct(largest.weight)}
          />
        ) : null}
        {lines.length > 1 ? <FigureCard label={`Top ${Math.min(5, lines.length)} together`} figure={pct(top5)} /> : null}
        {spread !== null && lines.length > 1 ? (
          <FigureCard label="Spread like" figure={`${spread >= 9.95 ? Math.round(spread) : spread.toFixed(1)} equal bets`} />
        ) : null}
      </div>
      <div className="px-2 sm:px-0">{link}</div>
    </section>
  );
}
