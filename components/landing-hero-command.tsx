"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TrackButton } from "@/components/track-button";
import type { StockTier } from "@/lib/ai-launch-tier";

const ACCENT = "var(--accent-terminal)";

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function verdictFor(score: number | null | undefined, label?: string | null): { text: string; color: string } {
  const l = (label || "").toLowerCase();
  if (l.includes("buy") || l.includes("accumulate") || l.includes("bull")) return { text: "BUY", color: "var(--signal-bullish)" };
  if (l.includes("avoid") || l.includes("sell") || l.includes("bear")) return { text: "AVOID", color: "var(--signal-bearish)" };
  if (l.includes("hold") || l.includes("watch") || l.includes("trim")) return { text: "HOLD", color: ACCENT };
  if (n(score)) {
    if (score! >= 70) return { text: "BUY", color: "var(--signal-bullish)" };
    if (score! >= 45) return { text: "HOLD", color: ACCENT };
    return { text: "AVOID", color: "var(--signal-bearish)" };
  }
  return { text: "WATCH", color: ACCENT };
}

const CHART_UP = "0,44 26,40 52,42 78,34 104,36 130,28 156,30 182,22 208,24 234,16 260,18 286,9 320,6";
const CHART_DOWN = "0,8 26,12 52,10 78,18 104,16 130,24 156,22 182,30 208,28 234,36 260,34 286,44 320,48";

export type LandingHeroFeatured = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number;
  day_change_pct: number;
  overall_score: number | null;
  overall_label: string | null;
  key_points: string[];
};

export function LandingHeroCommand({
  featured,
  isSubscribed,
  isTracked,
  tier,
}: {
  featured: LandingHeroFeatured;
  isSubscribed: boolean;
  isTracked: boolean;
  tier: StockTier;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(t);
  }, [featured.ticker, featured.day_change_pct]);

  const fMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fVerdict = verdictFor(featured.overall_score, featured.overall_label);
  const fUp = featured.day_change_pct >= 0;
  const moveColor = fUp ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const evidence = featured.key_points.slice(0, 3);
  const stockHref = `/stock/${featured.ticker}`;
  const panelBorder = "var(--shadow-card), inset 0 0 0 1px var(--outline-variant)";
  const panelHover = "0 0 0 1px color-mix(in srgb, var(--landing-mint, var(--signal-bullish)) 28%, transparent), 0 18px 48px color-mix(in srgb, var(--landing-brand, var(--signal-bullish)) 8%, transparent)";

  return (
    <div
      className="landing-card overflow-hidden transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5"
      style={{
        boxShadow: hovered ? panelHover : panelBorder,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-[12px]"
        style={{ borderColor: "var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 80%, var(--surface))" }}
      >
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--signal-bearish) 70%, transparent)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--accent-terminal) 40%, transparent)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--signal-bullish) 60%, transparent)" }} />
          <span className="ml-3 text-on-surface-variant">sb://command-center</span>
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--signal-bullish)" }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--signal-bullish)" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--signal-bullish)" }} />
          </span>
          LIVE
        </span>
      </div>

      <div className="space-y-3 p-4 font-mono text-[13px]">
        <div className="text-on-surface-variant">
          $ <span className="text-on-surface">brew verdict {featured.ticker}</span>
          <span className="ml-0.5 inline-block w-[7px] animate-pulse bg-on-surface" style={{ height: "1em", verticalAlign: "-0.12em" }} aria-hidden />
        </div>

        <div
          className="inset cursor-pointer p-4 transition-colors hover:bg-surface-container"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("a,button,[role='button']")) return;
            router.push(stockHref);
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Link href={stockHref} className="text-base font-bold text-on-surface transition-opacity hover:opacity-80">
                  {featured.ticker}
                </Link>
                <span className="text-xs font-normal text-on-surface-variant">{featured.name}</span>
                {!isTracked && (
                  <TrackButton
                    ticker={featured.ticker}
                    instrumentId={featured.instrument_id}
                    tier={tier}
                    isSubscribed={isSubscribed}
                    isTracked={isTracked}
                    variant="icon"
                  />
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold leading-none tabular-nums" style={{ color: moveColor }}>
                  ${fMoney(featured.price)}
                </span>
                <span
                  className="inline-flex items-center gap-0.5 text-sm font-semibold leading-none tabular-nums"
                  style={{ color: moveColor }}
                >
                  <span aria-hidden className="inline-flex translate-y-px text-[10px] leading-none">
                    {fUp ? "▲" : "▼"}
                  </span>
                  <span>{Math.abs(featured.day_change_pct).toFixed(2)}%</span>
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="inline-block rounded border px-3 py-1.5 text-sm font-bold"
                style={{
                  color: fVerdict.color,
                  borderColor: `color-mix(in srgb, ${fVerdict.color} 40%, transparent)`,
                  background: `color-mix(in srgb, ${fVerdict.color} 14%, transparent)`,
                }}
              >
                {fVerdict.text}
                {n(featured.overall_score) ? ` · ${Math.round(featured.overall_score!)}` : ""}
              </div>
              {featured.overall_label && (
                <div className="mt-1.5 text-[11px] text-on-surface-variant">{featured.overall_label}</div>
              )}
            </div>
          </div>

          <Link href={stockHref} className="mt-3 block transition-opacity hover:opacity-80">
            <svg viewBox="0 0 320 56" className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
              <polyline
                fill="none"
                stroke={fUp ? "var(--signal-bullish)" : "var(--signal-bearish)"}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={fUp ? CHART_UP : CHART_DOWN}
                pathLength={100}
                style={{
                  strokeDasharray: 100,
                  strokeDashoffset: chartReady ? 0 : 100,
                  transition: "stroke-dashoffset 1.1s ease-out",
                }}
              />
            </svg>
          </Link>
        </div>

        {evidence.length > 0 && (
          <div className="space-y-1.5 text-[12px]">
            {evidence.map((e, i) => (
              <div
                key={i}
                className="flex gap-2 transition-[opacity,transform] duration-300"
                style={{
                  opacity: chartReady ? 1 : 0,
                  transform: chartReady ? "translateY(0)" : "translateY(4px)",
                  transitionDelay: `${180 + i * 90}ms`,
                }}
              >
                <span style={{ color: i === 2 ? "var(--accent-terminal)" : "var(--signal-bullish)" }}>▸</span>
                <span className="text-on-surface-variant">{e}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
