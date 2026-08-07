"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { AnalystConsensus } from "@/components/analyst-consensus";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { VerdictCallChart } from "@/components/verdict-call-chart";
import { ConvictionDotsInline, highlightCallText } from "@/components/verdict-call-ui";
import type { StockTier } from "@/lib/ai-launch-tier";
import type { LandingHeroCallData } from "@/lib/landing-hero-call";
import { resolveLandingHeroChartSeries } from "@/lib/landing-hero-chart";
import type { AnalystConsensus as AnalystConsensusData } from "@/lib/stock";

export type LandingHeroFeatured = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number;
  day_change_pct: number;
  sector: string | null;
  catalyst: string | null;
  analyst: AnalystConsensusData | null;
  price_history: { date: string; close: number }[];
};

export function LandingHeroCommand({
  featured,
  call,
  isSubscribed,
  isTracked,
  tier,
}: {
  featured: LandingHeroFeatured;
  call: LandingHeroCallData;
  isSubscribed: boolean;
  isTracked: boolean;
  tier: StockTier;
}) {
  const router = useRouter();
  const stockHref = `/stock/${featured.ticker}`;
  const fMoney = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isUp = featured.day_change_pct >= 0;
  const moveColor = isUp ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const chartData = useMemo(
    () => resolveLandingHeroChartSeries(featured.price_history, featured.price, featured.day_change_pct),
    [featured.price_history, featured.price, featured.day_change_pct],
  );
  const catalystChip =
    featured.catalyst && featured.catalyst.trim().toLowerCase() !== (call.call_body || "").trim().toLowerCase()
      ? featured.catalyst
      : null;
  return (
    <section aria-label={`Live ${featured.ticker} stock read`} className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
      <div
        className="cursor-pointer p-4 sm:p-5"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest("a,button,[role='button']")) router.push(stockHref);
        }}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/60 pb-4 sm:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <StockLogo ticker={featured.ticker} market="US" size={34} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={stockHref} className="font-display text-base font-bold text-on-surface hover:opacity-80 sm:text-lg">
                  {featured.ticker}
                </Link>
                <span className="font-display text-[1rem] font-bold tabular-nums tracking-tight text-on-surface sm:text-[1.05rem]">
                  ${fMoney(featured.price)}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ color: moveColor, background: `color-mix(in srgb, ${moveColor} 12%, transparent)` }}>
                  <span aria-hidden className="text-[9px] leading-none">{isUp ? "▲" : "▼"}</span>
                  <span>{Math.abs(featured.day_change_pct).toFixed(2)}%</span>
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">{featured.name}</p>
              {catalystChip ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {catalystChip ? <span className="max-w-full truncate rounded-full border border-outline-variant px-2.5 py-0.5 text-[10px] text-on-surface-variant">{catalystChip}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="ml-auto shrink-0 sm:pt-0.5">
            {!isTracked ? (
              <TrackButton
                ticker={featured.ticker}
                instrumentId={featured.instrument_id}
                tier={tier}
                isSubscribed={isSubscribed}
                isTracked={isTracked}
                variant="compact"
              />
            ) : null}
          </div>
        </div>

        <VerdictCallChart
          columnsAt="md"
          chartHeight={190}
          hist={chartData}
          currency="$"
          zones={call.chart_zones}
          lineColor={call.chart_line_color}
          currentPrice={featured.price}
          zoneHint={call.zone_hint}
          callSlot={
            <>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <h2 className="text-[1.55rem] font-extrabold leading-[1.05] tracking-tight sm:text-[1.85rem]" style={{ color: call.accent }}>{call.call_headline}</h2>
                {call.confidence ? <ConvictionDotsInline confidence={call.confidence} /> : null}
              </div>
              {call.call_body ? <div className="mt-4"><p className="text-[14px] leading-[1.55] text-on-surface/85 sm:text-[15px]">{highlightCallText(call.call_body)}</p>{call.call_levels ? <p className="mt-2.5 text-[13px] leading-relaxed text-on-surface-variant">{highlightCallText(call.call_levels)}</p> : null}</div> : null}
            </>
          }
        />

        {featured.analyst ? <AnalystConsensus consensus={featured.analyst} currentPrice={featured.price} /> : null}
      </div>
    </section>
  );
}
