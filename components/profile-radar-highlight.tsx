import Link from "next/link";

export type ProfileRadarHighlightProps = {
  /** Number of tracked stocks (Radar / watchlist identifiers). Must be ≥ 0. */
  trackedCount: number;
};

const SECONDARY_PILL =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg outline-none transition-all hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]";

export function ProfileRadarHighlight({ trackedCount }: ProfileRadarHighlightProps) {
  const hasStocks = trackedCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-medium tabular-nums tracking-tight text-oa-fg sm:text-4xl">
          {trackedCount}
        </span>
        <span className="text-[15px] text-oa-muted-fg">in your Watchlist</span>
      </div>
      <p className="text-sm leading-6 text-oa-muted-fg">
        {hasStocks
          ? "Alerts, market briefs, and call refreshes follow this roster."
          : "Add a few symbols to turn on AI calls, alerts, and market briefs."}
      </p>
      <div>
        <Link href="/watchlist" className={SECONDARY_PILL}>
          {hasStocks ? "Open Watchlist" : "Add your first stock"}
        </Link>
      </div>
    </div>
  );
}
