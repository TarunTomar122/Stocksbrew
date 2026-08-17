import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icon";

export type ProfileRadarHighlightProps = {
  /** Number of tracked stocks (Radar / watchlist identifiers). Must be ≥ 0. */
  trackedCount: number;
};

export function ProfileRadarHighlight({ trackedCount }: ProfileRadarHighlightProps) {
  const hasStocks = trackedCount > 0;
  const stockWord = trackedCount === 1 ? "stock" : "stocks";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative overflow-hidden rounded-2xl border p-4 sm:p-5"
        style={{
          borderColor: "color-mix(in srgb, var(--accent-terminal) 28%, var(--outline-variant))",
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--accent-terminal) 10%, var(--surface)) 0%, color-mix(in srgb, var(--signal-bullish) 7%, var(--surface)) 55%, var(--surface) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full opacity-35 blur-2xl"
          style={{ background: "color-mix(in srgb, var(--accent-terminal) 50%, transparent)" }}
        />

        <div className="relative flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface">
            <AnimatedIcon name="radar" size={22} className="text-[22px] text-landing-brand" aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            {hasStocks ? (
              <p className="text-on-surface">
                <span className="text-[2rem] font-extrabold leading-none tracking-tight tabular-nums sm:text-[2.25rem]">
                  {trackedCount}
                </span>
                <span className="ml-2 text-[15px] font-semibold leading-snug text-on-surface sm:text-base">
                  {stockWord} in your Watchlist
                </span>
              </p>
            ) : (
              <p className="text-[18px] font-extrabold leading-snug tracking-tight text-on-surface sm:text-[20px]">
                Your Watchlist is empty
              </p>
            )}
            <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
              {hasStocks
                ? "Alerts, market briefs, and call refreshes follow this roster."
                : "Add a few symbols to turn on AI calls, alerts, and market briefs."}
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/watchlist"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-on-surface px-5 py-3 text-[14px] font-semibold text-surface transition-opacity hover:opacity-90"
      >
        {hasStocks ? "Open Watchlist" : "Add your first stock"}
        <AnimatedIcon name="arrow_forward" size={18} className="text-[18px]" aria-hidden />
      </Link>
    </div>
  );
}
