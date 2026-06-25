"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PriceChart } from "@/components/price-chart";
import { StockLogo } from "@/components/stock-logo";
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

export type LandingHeroFeatured = {
  instrument_id: string;
  ticker: string;
  name: string;
  price: number;
  day_change_pct: number;
  overall_score: number | null;
  overall_label: string | null;
  sector: string | null;
  catalyst: string | null;
  headline: string | null;
  add_level: string | null;
  trim_level: string | null;
  analyst_target: number | null;
  analyst_upside_pct: number | null;
  price_history: { date: string; close: number }[];
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
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(t);
  }, [featured.ticker]);

  const fMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fVerdict = verdictFor(featured.overall_score, featured.overall_label);
  const fUp = featured.day_change_pct >= 0;
  const moveColor = fUp ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const stockHref = `/stock/${featured.ticker}`;
  const panelBorder = "var(--shadow-card), inset 0 0 0 1px var(--outline-variant)";
  const panelHover = "0 0 0 1px color-mix(in srgb, var(--landing-mint, var(--signal-bullish)) 28%, transparent), 0 18px 48px color-mix(in srgb, var(--landing-brand, var(--signal-bullish)) 8%, transparent)";
  const chartData = featured.price_history.length >= 5 ? featured.price_history : [];
  const catalystChip =
    featured.catalyst &&
    featured.catalyst.trim().toLowerCase() !== (featured.headline || "").trim().toLowerCase()
      ? featured.catalyst
      : null;
  const showFoot =
    Boolean(featured.headline) ||
    Boolean(featured.add_level) ||
    Boolean(featured.trim_level) ||
    n(featured.analyst_target);
  const aboveTarget = n(featured.analyst_target) && featured.price > featured.analyst_target!;

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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <StockLogo ticker={featured.ticker} market="US" size={32} className="shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <Link href={stockHref} className="text-base font-bold text-on-surface transition-opacity hover:opacity-80">
                      {featured.ticker}
                    </Link>
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
                  <p className="truncate text-[11px] font-normal text-on-surface-variant">{featured.name}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-1">
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
              {(catalystChip || featured.sector) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {catalystChip ? (
                    <span className="max-w-full truncate rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                      {catalystChip}
                    </span>
                  ) : null}
                  {featured.sector ? (
                    <span className="max-w-[9rem] truncate rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                      {featured.sector}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div
                className="inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-[12px] font-bold leading-none"
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
                <div className="mt-1.5 max-w-[7.5rem] truncate text-[11px] text-on-surface-variant">{featured.overall_label}</div>
              )}
            </div>
          </div>

          <div className="mt-3">
            {chartData.length >= 5 ? (
              <PriceChart
                data={chartData}
                currency="$"
                lineColor={moveColor}
                embedded
                height={136}
                currentPrice={featured.price}
              />
            ) : (
              <div className="flex h-[136px] items-center justify-center rounded-lg border border-dashed border-outline-variant text-[11px] text-on-surface-variant">
                Chart loading…
              </div>
            )}
          </div>
        </div>

        {showFoot && (
          <div
            className="space-y-2 border-t border-outline-variant/60 pt-3 transition-[opacity,transform] duration-300"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? "translateY(0)" : "translateY(4px)",
            }}
          >
            {featured.headline ? (
              <p className="font-sans text-[13px] font-medium leading-snug text-on-surface">{featured.headline}</p>
            ) : null}
            {(featured.add_level || featured.trim_level) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                {featured.add_level ? (
                  <span className="font-semibold" style={{ color: "var(--signal-bullish)" }}>
                    {featured.add_level}
                  </span>
                ) : null}
                {featured.trim_level ? (
                  <span className="font-semibold" style={{ color: "var(--signal-neutral)" }}>
                    {featured.trim_level}
                  </span>
                ) : null}
              </div>
            )}
            {n(featured.analyst_target) ? (
              <p className="text-[11px] text-on-surface-variant">
                Analyst target{" "}
                <span className="font-semibold tabular-nums text-on-surface">${fMoney(featured.analyst_target!)}</span>
                {n(featured.analyst_upside_pct) ? (
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: aboveTarget ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                  >
                    {" "}
                    · {aboveTarget ? `${Math.abs(featured.analyst_upside_pct!).toFixed(1)}% above target` : `${featured.analyst_upside_pct! >= 0 ? "+" : ""}${featured.analyst_upside_pct!.toFixed(1)}% upside`}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
