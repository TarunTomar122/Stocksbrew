import { AnimatedIcon } from "@/components/animated-icon";

import { TickerSearchField } from "@/components/ticker-search-field";
import type { Market } from "@/lib/types";

const FEATURES = [
  { label: "Detailed calls and zones", icon: "verified" },
  { label: "Stocksbrew target price", icon: "flag" },
  { label: "Radar alerts", icon: "notifications_active" },
] as const;

export function TerminalLandingHeroCopy({
  market,
  trackedIds,
  isSubscribed,
}: {
  market: Market;
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
      <h1 className="font-display text-[1.85rem] font-extrabold leading-[1.1] tracking-tight text-on-surface sm:text-4xl sm:leading-[1.08] lg:text-[3.25rem]">
        Know what to do with{" "}
        <span className="text-landing-brand">your stocks.</span>
      </h1>

      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant sm:mt-5 sm:text-[17px]">
        Search a ticker for the market read. Go Pro for the detailed call, buy and trim zones,
        Stocksbrew target price, and alerts when the setup changes.
      </p>

      <div className="mt-6 w-full sm:mt-8">
        <TickerSearchField
          variant="hero"
          market={market}
          trackedIds={trackedIds}
          isSubscribed={isSubscribed}
          analyticsSource="landing_hero"
        />
      </div>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:mt-7">
        {FEATURES.map(({ label, icon }) => (
          <li key={label}>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-on-surface-variant sm:text-[13px]">
              <AnimatedIcon name={icon} size={15} className="shrink-0 text-landing-brand" aria-hidden />
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
