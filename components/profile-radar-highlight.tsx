import Link from "next/link";

export type ProfileRadarHighlightProps = {
  /** Number of tracked stocks (Radar / watchlist identifiers). Must be ≥ 0. */
  trackedCount: number;
};

/**
 * Radar entry on the profile page — sits inside the Account card as a divider section
 * (same pattern as Plan), not a nested promo box.
 */
export function ProfileRadarHighlight({ trackedCount }: ProfileRadarHighlightProps) {
  const hasStocks = trackedCount > 0;
  const stockWord = trackedCount === 1 ? "stock" : "stocks";

  return (
    <div className="border-t border-outline-variant/25 pt-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: "'wght' 500" }}
            >
              radar
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
                Radar workspace
              </span>
              {hasStocks ? (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                  Watching
                </span>
              ) : null}
            </div>

            {hasStocks ? (
              <p className="mt-2 text-on-surface">
                <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums sm:text-[32px]">
                  {trackedCount}
                </span>
                <span className="ml-2 text-base font-semibold leading-snug text-on-surface sm:text-lg">
                  {stockWord} on your Radar
                </span>
              </p>
            ) : (
              <p className="mt-2 text-lg font-semibold leading-snug text-on-surface">
                Your Radar watchlist is empty
              </p>
            )}
          </div>
        </div>

        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          {hasStocks
            ? "Alerts, digest summaries, and call refreshes follow this roster. Open Radar or your watchlist to tune what you track."
            : "Add a few symbols to turn on AI calls, alerts, and your Radar inbox summary."}
        </p>

        <Link
          href="/watchlist"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[14px] font-semibold text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {hasStocks ? "Open Radar & watchlist" : "Add & manage stocks"}
          <span
            className="material-symbols-outlined text-[18px]"
            aria-hidden
            style={{ fontVariationSettings: "'wght' 600" }}
          >
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}
