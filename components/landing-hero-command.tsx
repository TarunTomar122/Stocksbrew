"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Caveat } from "next/font/google";

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

const caveat = Caveat({ subsets: ["latin"], weight: ["600"] });

function MoverCallout() {
  return (
    <div className="landing-hero-mover-callout pointer-events-none" aria-hidden>
      <span className={`landing-hero-mover-callout-text ${caveat.className}`}>live brew example</span>
      <svg className="landing-hero-mover-callout-arrow" viewBox="0 0 96 52" fill="none" aria-hidden>
        <defs>
          <marker
            id="landing-mover-arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0.5 0.5 L7 4 L0.5 7.5 Z" fill="currentColor" stroke="none" />
          </marker>
        </defs>
        <path
          d="M8 10 C 26 8, 44 24, 68 42"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          markerEnd="url(#landing-mover-arrowhead)"
        />
      </svg>
    </div>
  );
}

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
  { tag: "Earnings today", ticker: "NVDA", reason: "A scheduled report can reset the current setup.", fact: "Calendar event · source verified" },
  { tag: "Newly oversold", ticker: "TSLA", reason: "Momentum crossed into a new weak-state threshold.", fact: "RSI below 30 · technical reading" },
  { tag: "Abnormal move", ticker: "MSFT", reason: "A material move has an attributable company update.", fact: "Company filing · verified source" },
] as const;

function LandingRadarBrew() {
  return (
    <div className="min-h-[520px] space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-on-surface-variant">
        <span>$ brew radar --sample</span>
        <span>Illustrative · not user data</span>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface">
        <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">
            // needs attention
          </p>
          <span className="font-mono text-[9px] uppercase text-on-surface-variant">3 material changes</span>
        </div>
        <div className="divide-y divide-outline-variant/50">
          {RADAR_SAMPLE_ROWS.map((row) => (
            <div
              key={row.ticker}
              className="grid gap-1.5 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)_180px] sm:items-center sm:gap-3"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold text-on-surface">{row.ticker}</span>
                <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase text-landing-brand">
                  {row.tag}
                </span>
              </div>
              <p className="text-[11.5px] font-medium leading-snug text-on-surface">{row.reason}</p>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.03em] text-on-surface-variant sm:text-right">
                {row.fact}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface">
          <div className="grid grid-cols-[1fr_80px_80px] border-b border-outline-variant/60 bg-surface-container-low px-4 py-2 font-mono text-[8.5px] uppercase text-on-surface-variant">
            <span>Tracked stock</span>
            <span className="text-right">Last</span>
            <span className="text-right">Today</span>
          </div>
          {[
            ["NVDA", "$208.76", "−1.56%"],
            ["MSFT", "$512.44", "+1.12%"],
            ["TSLA", "$319.28", "−3.08%"],
            ["AMZN", "$231.09", "+0.74%"],
          ].map(([ticker, price, move]) => (
            <div key={ticker} className="grid grid-cols-[1fr_80px_80px] border-b border-outline-variant/40 px-4 py-2.5 font-mono text-[10.5px] last:border-b-0">
              <span className="font-bold text-on-surface">{ticker}</span>
              <span className="text-right text-on-surface">{price}</span>
              <span className="text-right text-on-surface-variant">{move}</span>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-outline-variant/60 bg-surface p-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
            Book health
          </p>
          <p className="mt-2 text-[20px] font-extrabold tracking-tight text-[var(--signal-neutral)]">
            Concentration elevated
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-on-surface-variant">
            Two names account for 46% of this sample book. That is a material risk-state change.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-4">
        <p className="text-[11px] text-on-surface-variant">
          Return when a tracked stock changes state—not for another generic feed.
        </p>
        <Link
          href="/watchlist"
          className="rounded-full bg-landing-brand px-4 py-2 text-[11.5px] font-bold text-white transition-opacity hover:opacity-90"
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
  const [hovered, setHovered] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [brewMode, setBrewMode] = useState<"stock" | "radar">("stock");

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
    <div className="landing-hero-command-wrap relative w-full">
      <MoverCallout />
      <div
        className={`landing-hero-command landing-card w-full overflow-hidden transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 ${hovered ? "landing-hero-command-hover" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="landing-hero-command-chrome flex min-w-0 items-center justify-between gap-2 border-b px-4 py-2.5 font-mono text-[12px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex items-center gap-1.5" aria-hidden>
              <span className="landing-hero-traffic-light landing-hero-traffic-light--close" />
              <span className="landing-hero-traffic-light landing-hero-traffic-light--minimize" />
              <span className="landing-hero-traffic-light landing-hero-traffic-light--maximize" />
            </span>
            <span className="ml-1 truncate text-on-surface-variant sm:ml-3">sb://command-center</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5" style={{ color: "var(--signal-bullish)" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: "var(--signal-bullish)" }}
              />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--signal-bullish)" }} />
            </span>
            LIVE
          </span>
        </div>

        <div className="flex items-center gap-1 border-b border-outline-variant/60 bg-surface-container-low/50 px-4 py-2">
          {([
            ["stock", "Stock Brew"],
            ["radar", "Radar Brew"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBrewMode(id)}
              className={`rounded-md px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                brewMode === id
                  ? "bg-surface text-on-surface shadow-[inset_0_0_0_1px_var(--outline-variant)]"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {brewMode === "radar" ? <LandingRadarBrew /> : <div className="space-y-4 p-4 sm:p-5">
          <div className="landing-hero-command-prompt font-mono text-[12px] text-on-surface-variant">
            $ <span className="text-on-surface">brew verdict {featured.ticker}</span>
            <span
              className="ml-0.5 inline-block w-[7px] animate-pulse bg-on-surface"
              style={{ height: "1em", verticalAlign: "-0.12em" }}
              aria-hidden
            />
          </div>

          <div
            className="landing-hero-command-body cursor-pointer rounded-xl border border-outline-variant/60 bg-surface p-4 transition-colors sm:p-5"
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
                        our call
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
                        footer={call.driver_footer}
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
        </div>}
      </div>
    </div>
  );
}
