import { AnimatedIcon } from "@/components/animated-icon";

import { TickerSearchField } from "@/components/ticker-search-field";
import {
  HERO_HEADLINE_LEAD,
  HERO_HEADLINE_EMPHASIS,
  HERO_SUBHEAD,
} from "@/lib/brand-copy";
import type { Market } from "@/lib/types";

const FEATURES = [
  { label: "Plain-English briefs on any stock", icon: "verified" },
  { label: "Alerts when something changes", icon: "notifications_active" },
  { label: "Track 3 stocks free", icon: "flag" },
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
      <h1 className="text-balance font-display text-[2rem] font-medium leading-[1.08] tracking-tight text-on-surface sm:text-[2.6rem] sm:leading-[1.06] lg:text-[3.4rem]">
        {HERO_HEADLINE_LEAD}{" "}
        <span className="text-on-surface-variant">{HERO_HEADLINE_EMPHASIS}</span>
      </h1>

      <p className="text-pretty mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant sm:mt-5 sm:text-[17px]">
        {HERO_SUBHEAD}
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
        Research for your own decisions. Not financial advice.
      </p>
    </div>
  );
}
