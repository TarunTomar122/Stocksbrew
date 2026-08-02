import { AnimatedIcon } from "@/components/animated-icon";

import { StartRadarButton } from "@/components/start-radar-button";
import { TickerSearchField } from "@/components/ticker-search-field";
import type { Market } from "@/lib/types";

const FEATURES = [
  { label: "Current view, risks, and price levels", icon: "verified" },
  { label: "Track 3 stocks free", icon: "flag" },
  { label: "Alerts when something changes", icon: "notifications_active" },
] as const;

export function TerminalLandingHeroCopy({
  market,
  trackedIds,
  isSubscribed,
  align = "center",
}: {
  market: Market;
  trackedIds: string[];
  isSubscribed: boolean;
  align?: "center" | "left";
}) {
  const isLeftAligned = align === "left";

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col ${isLeftAligned ? "items-start text-left lg:mx-0" : "items-center text-center"}`}>
      <p className="landing-section-kicker text-landing-brand">StocksBrew</p>
      <h1 className="font-display text-[1.85rem] font-extrabold leading-[1.1] tracking-tight text-on-surface sm:text-4xl sm:leading-[1.08] lg:text-[3.25rem]">
        Know when to buy, hold, or walk away.
      </h1>

      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant sm:mt-5 sm:text-[17px]">
        See the current call, levels, and risks. We will alert you when there is a reason to look again.
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

      <div className="mt-4">
        <StartRadarButton
          surface="hero"
          signedOutLabel="Start your 3-day free trial"
          signedInLabel="Open your Radar"
          className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-5 py-2.5 text-[13px] font-bold text-on-surface transition-colors hover:border-on-surface disabled:opacity-60"
        />
      </div>

      <ul className={`mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 sm:mt-6 ${isLeftAligned ? "justify-start" : "justify-center"}`}>
        {FEATURES.map(({ label, icon }) => (
          <li key={label}>
            <div className="inline-flex items-center gap-1.5 text-[12px] text-on-surface-variant sm:text-[13px]">
              <AnimatedIcon name={icon} size={15} className="shrink-0 text-landing-brand" aria-hidden />
              {label}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[11px] leading-relaxed text-on-surface-variant">
        Research and opinions for your own decisions. Not financial advice.
      </p>
    </div>
  );
}
