"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { VerdictCallChart } from "@/components/verdict-call-chart";
import {
  CALL_KICK,
  CallInsightCard,
  CallMetricsStrip,
  ConvictionDotsInline,
  highlightCallText,
} from "@/components/verdict-call-ui";
import type { StockTier } from "@/lib/ai-launch-tier";
import type { LandingHeroCallData } from "@/lib/landing-hero-call";
import { resolveLandingHeroChartSeries } from "@/lib/landing-hero-chart";

export type LandingHeroFeatured = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number;
  day_change_pct: number;
  sector: string | null;
  catalyst: string | null;
  driver: string | null;
  risk: string | null;
  price_history: { date: string; close: number }[];
};

const RADAR_SAMPLE_ROWS = [
  { ticker: "NVDA", price: "$208.76", move: "−1.56%", state: "Earnings today", tone: "neutral" },
  { ticker: "MSFT", price: "$512.44", move: "+1.12%", state: "Above target zone", tone: "up" },
  { ticker: "TSLA", price: "$319.28", move: "−3.08%", state: "RSI crossed 30", tone: "down" },
  { ticker: "AMZN", price: "$231.09", move: "+0.74%", state: "No material change", tone: "quiet" },
] as const;

function LandingRadarBrew() {
  return (
    <div className="min-h-[520px] bg-[radial-gradient(circle_at_85%_10%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_42%)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
            Your Radar
          </p>
          <h3 className="mt-1 text-xl font-extrabold tracking-tight text-on-surface">Know what changed.</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" />
          sample view
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
        <section className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface shadow-card">
          <div className="border-b border-outline-variant/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--signal-neutral)_14%,var(--surface))] text-[var(--signal-neutral)]">
                <AnimatedIcon name="calendar_today" size={18} aria-hidden />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-variant">Today · 1 event</span>
            </div>
            <p className="mt-5 font-mono text-[11px] font-bold text-on-surface">NVDA</p>
            <h4 className="mt-1 text-[18px] font-extrabold leading-tight text-on-surface">Earnings after the bell</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">
              The report can reset the current call, target room, and risk case.
            </p>
            <div className="mt-5 flex items-center justify-between border-t border-outline-variant/60 pt-3 font-mono text-[9.5px] text-on-surface-variant">
              <span>Calendar verified</span>
              <span className="font-semibold text-landing-brand">Open NVDA →</span>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-outline-variant/60 bg-surface-container-low/60">
            <div className="p-3.5">
              <p className="font-mono text-[8.5px] uppercase text-on-surface-variant">Current call</p>
              <p className="mt-1 text-[13px] font-bold text-on-surface">Hold</p>
            </div>
            <div className="p-3.5">
              <p className="font-mono text-[8.5px] uppercase text-on-surface-variant">Next check</p>
              <p className="mt-1 text-[13px] font-bold text-on-surface">Guidance</p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3">
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Tracked stocks</p>
            <span className="font-mono text-[9px] text-on-surface-variant">4 names</span>
          </div>
          <div>
            {RADAR_SAMPLE_ROWS.map((row) => (
              <div key={row.ticker} className="grid grid-cols-[48px_minmax(0,1fr)_70px] items-center gap-2 border-b border-outline-variant/45 px-4 py-3 last:border-b-0">
                <span className="font-mono text-[11px] font-bold text-on-surface">{row.ticker}</span>
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] font-medium text-on-surface">{row.state}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-on-surface-variant">{row.price}</p>
                </div>
                <span
                  className="text-right font-mono text-[10px] font-semibold"
                  style={{
                    color:
                      row.tone === "up"
                        ? "var(--signal-bullish)"
                        : row.tone === "down"
                          ? "var(--signal-bearish)"
                          : "var(--on-surface-variant)",
                  }}
                >
                  {row.move}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-low/70 px-4 py-3">
        <p className="text-[11.5px] font-medium text-on-surface">
          One place for price zones, earnings, and material changes.
        </p>
        <Link
          href="/watchlist"
          className="text-[11.5px] font-bold text-landing-brand hover:underline"
        >
          Build your Radar →
        </Link>
      </div>
    </div>
  );
}

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
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(t);
  }, [featured.ticker]);

  const fMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fUp = featured.day_change_pct >= 0;
  const moveColor = fUp ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const stockHref = `/stock/${featured.ticker}`;

  const chartData = useMemo(
    () => resolveLandingHeroChartSeries(featured.price_history, featured.price, featured.day_change_pct),
    [featured.price_history, featured.price, featured.day_change_pct],
  );

  const catalystChip =
    featured.catalyst &&
    featured.catalyst.trim().toLowerCase() !== (call.call_body || "").trim().toLowerCase()
      ? featured.catalyst
      : null;

  const showInsights = Boolean(featured.driver || featured.risk);
  const showMetrics = call.call_metrics.length > 0;

  return (
    <div className="landing-hero-command-wrap w-full">
      <div className="landing-hero-command landing-card w-full overflow-hidden">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-outline-variant px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="inline-flex min-w-0 items-center gap-2 text-on-surface-variant">
            <span className="h-2 w-2 shrink-0 rounded-full bg-landing-brand" aria-hidden />
            <span className="truncate">Live market read</span>
          </span>
          <Link href={stockHref} className="shrink-0 normal-case tracking-normal text-landing-brand hover:underline">
            Open {featured.ticker} →
          </Link>
        </div>
        <div className="p-4 sm:p-5">
          <div
            className="landing-hero-command-body cursor-pointer transition-colors"
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("a,button,[role='button']")) return;
              router.push(stockHref);
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-outline-variant/45 pb-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <StockLogo ticker={featured.ticker} market="US" size={34} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={stockHref}
                      className="font-display text-base font-bold text-on-surface transition-opacity hover:opacity-80 sm:text-lg"
                    >
                      {featured.ticker}
                    </Link>
                    {!isTracked && (
                      <TrackButton
                        ticker={featured.ticker}
                        instrumentId={featured.instrument_id}
                        tier={tier}
                        isSubscribed={isSubscribed}
                        isTracked={isTracked}
                        variant="compact"
                      />
                    )}
                    <span className="font-display text-[1rem] font-bold tabular-nums tracking-tight text-on-surface sm:text-[1.05rem]">
                      ${fMoney(featured.price)}
                    </span>
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{
                        color: moveColor,
                        background: `color-mix(in srgb, ${moveColor} 12%, transparent)`,
                      }}
                    >
                      <span aria-hidden className="text-[9px] leading-none">
                        {fUp ? "▲" : "▼"}
                      </span>
                      <span>{Math.abs(featured.day_change_pct).toFixed(2)}%</span>
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">{featured.name}</p>
                  {(catalystChip || featured.sector) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {catalystChip ? (
                        <span className="max-w-full truncate rounded-full border border-outline-variant bg-surface/80 px-2.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                          {catalystChip}
                        </span>
                      ) : null}
                      {featured.sector ? (
                        <span className="max-w-[9rem] truncate rounded-full border border-outline-variant bg-surface/80 px-2.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                          {featured.sector}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="transition-[opacity,transform] duration-300"
              style={{
                opacity: revealed ? 1 : 0,
                transform: revealed ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <VerdictCallChart
                columnsAt="md"
                hist={chartData}
                returns={call.returns}
                currency="$"
                zones={call.chart_zones}
                lineColor={call.chart_line_color}
                currentPrice={featured.price}
                zoneHint={call.zone_hint}
                callSlot={
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={CALL_KICK}
                        style={{ color: `color-mix(in srgb, ${call.accent} 55%, var(--on-surface-variant))` }}
                      >
                        Current view
                      </p>
                      {call.setup_chip ? (
                        <span
                          className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
                          style={{
                            color: call.accent,
                            borderColor: `color-mix(in srgb, ${call.accent} 22%, var(--outline-variant))`,
                            background: `color-mix(in srgb, ${call.accent} 5%, var(--surface))`,
                          }}
                        >
                          {call.setup_chip}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-2">
                      <h2
                        className="text-[1.55rem] font-extrabold leading-[1.05] tracking-tight sm:text-[1.85rem]"
                        style={{ color: call.accent }}
                      >
                        {call.call_headline}
                      </h2>
                      {call.confidence ? <ConvictionDotsInline confidence={call.confidence} /> : null}
                    </div>
                    {call.call_body ? (
                      <div className="mt-4">
                        <p className="text-[14px] leading-[1.55] text-on-surface/85 sm:text-[15px]">
                          {highlightCallText(call.call_body)}
                        </p>
                        {call.call_levels ? (
                          <p className="mt-2.5 text-[13px] leading-relaxed text-on-surface-variant">
                            {highlightCallText(call.call_levels)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                }
              />

              {showMetrics ? (
                <div className="mt-6">
                  <CallMetricsStrip metrics={call.call_metrics} />
                </div>
              ) : null}

              {showInsights ? (
                <div className="mt-6 grid gap-6 border-t border-outline-variant/50 pt-6 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-outline-variant/40">
                  {featured.driver ? (
                    <div className="sm:pr-6">
                      <CallInsightCard
                        tone="bullish"
                        title="drivers"
                        bullets={[featured.driver]}
                      />
                    </div>
                  ) : null}
                  {featured.risk ? (
                    <div className="sm:pl-6">
                      <CallInsightCard tone="bearish" title="risks" bullets={[featured.risk]} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
