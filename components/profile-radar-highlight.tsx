import Link from "next/link";

export type ProfileRadarHighlightProps = {
  /** Number of tracked stocks (Radar / watchlist identifiers). Must be ≥ 0. */
  trackedCount: number;
};

const PROFILE_RADAR_HEADING_ID = "profile-radar-heading";
const PROFILE_RADAR_SUMMARY_ID = "profile-radar-summary";

/**
 * Featured Radar entry point on the profile page — stronger hierarchy than sibling cards,
 * with purposeful empty vs. tracked summaries (no speculative metrics).
 */
export function ProfileRadarHighlight({ trackedCount }: ProfileRadarHighlightProps) {
  const hasStocks = trackedCount > 0;
  const stockWord = trackedCount === 1 ? "stock" : "stocks";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border-[3px] border-primary/40 bg-gradient-to-br from-primary-fixed/60 via-primary-fixed/28 to-surface-container-low shadow-[var(--shadow-card)] ring-1 ring-primary/20 transition-[box-shadow,border-color] duration-200 hover:border-primary/55 hover:shadow-[var(--shadow-card-hover)]"
      aria-labelledby={PROFILE_RADAR_HEADING_ID}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        aria-hidden
      />
      <Link
        href="/watchlist"
        className="group block rounded-[calc(1rem-3px)] p-7 sm:p-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-labelledby={PROFILE_RADAR_HEADING_ID}
        aria-describedby={PROFILE_RADAR_SUMMARY_ID}
      >
        <div className="flex flex-col gap-7 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
          <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-primary ring-1 ring-primary/20"
              aria-hidden
            >
              <span
                className="material-symbols-outlined text-[30px]"
                style={{ fontVariationSettings: "'wght' 500" }}
              >
                radar
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Radar workspace
                </span>
                {hasStocks ? (
                  <span className="inline-flex items-center rounded-md border border-primary/35 bg-primary/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                    Watching
                  </span>
                ) : null}
              </div>

              {hasStocks ? (
                <>
                  <h2
                    id={PROFILE_RADAR_HEADING_ID}
                    className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1"
                  >
                    <span className="font-display text-5xl font-bold leading-none tracking-tighter text-on-surface tabular-nums sm:text-6xl">
                      {trackedCount}
                    </span>
                    <span className="text-lg font-bold leading-snug tracking-tight text-on-surface sm:text-xl sm:leading-none">
                      {stockWord}
                      {" "}
                      on your Radar
                    </span>
                  </h2>
                  <p
                    id={PROFILE_RADAR_SUMMARY_ID}
                    className="max-w-xl text-[13px] leading-relaxed text-on-surface-variant sm:text-sm"
                  >
                    Alerts, digest summaries, and call refreshes follow this roster—jump into Radar or the
                    watchlist to tune what you track.
                  </p>
                </>
              ) : (
                <>
                  <h2
                    id={PROFILE_RADAR_HEADING_ID}
                    className="text-2xl font-bold leading-tight tracking-tight text-on-surface sm:text-[1.85rem]"
                  >
                    Your Radar watchlist is empty
                  </h2>
                  <p
                    id={PROFILE_RADAR_SUMMARY_ID}
                    className="max-w-xl text-[13px] leading-relaxed text-on-surface-variant sm:text-sm"
                  >
                    Add a few symbols to turn on AI calls, red-flag alerts, and the Radar inbox summary—everything
                    keys off what you choose to watch.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col justify-center lg:items-end lg:justify-center">
            <span className="inline-flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-[15px] font-bold text-on-primary shadow-md ring-2 ring-primary/15 transition-[transform,background-color,color,box-shadow] group-hover:bg-primary-container group-hover:text-on-primary-container group-hover:shadow-lg group-hover:ring-primary/25 group-active:scale-[0.99] sm:min-h-[48px] sm:px-8 sm:py-3.5 lg:w-auto">
              {hasStocks ? "Open Radar & watchlist" : "Add & manage stocks"}
              <span
                className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-0.5"
                aria-hidden
                style={{ fontVariationSettings: "'wght' 600" }}
              >
                arrow_forward
              </span>
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
