"use client";

import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { RadarStarterPick } from "@/lib/radar-starter-picks";

type StarterPicksProps = {
  picks: RadarStarterPick[];
  isSubscribed: boolean;
  trackedCount: number;
  trackedIds: string[];
};

export function StarterPicks({
  picks,
  isSubscribed,
  trackedCount,
  trackedIds,
}: StarterPicksProps) {
  const trackedSet = new Set(trackedIds.map((id) => id.toUpperCase()));

  if (picks.length === 0) {
    return (
      <div className="mt-6 text-center">
        <Link
          href="/heat"
          className="inline-flex items-center rounded-full px-5 py-2.5 text-[13.5px] font-medium no-underline"
          style={{ color: "var(--landing-on-brand, #fff)", background: "var(--rn-accent)" }}
        >
          Find stocks to track →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ul className="divide-y divide-[var(--rn-line)] rounded-2xl shadow-[inset_0_0_0_1px_var(--rn-line)]">
        {picks.map((pick) => {
          const tracked = trackedSet.has(pick.instrument_id.toUpperCase());
          return (
            <li
              key={pick.instrument_id}
              className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
            >
              <StockLogo ticker={pick.ticker} market={pick.market} size={32} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14.5px] font-semibold tracking-tight text-[var(--rn-ink)]">
                    {pick.ticker}
                  </span>
                  <span className="truncate text-[13px] text-[var(--rn-muted)]">{pick.name}</span>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-[var(--rn-muted)]">{pick.hint}</p>
              </div>
              <TrackButton
                instrumentId={pick.instrument_id}
                ticker={pick.ticker}
                isTracked={tracked}
                isSubscribed={isSubscribed}
                trackedCount={trackedCount}
                variant="compact"
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-center text-[13px] leading-relaxed text-[var(--rn-muted)]">
        Choose Watching or Holding when you add a stock
      </p>

      <div className="mt-4 flex justify-center">
        <Link
          href="/heat"
          className="inline-flex items-center rounded-full px-4 py-2 text-[13.5px] font-medium text-[var(--rn-ink)] no-underline shadow-[inset_0_0_0_1px_var(--rn-line)] transition-colors hover:bg-[var(--rn-card-2)]"
        >
          Browse more stocks →
        </Link>
      </div>
    </div>
  );
}
