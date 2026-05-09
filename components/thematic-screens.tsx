"use client";

import Link from "next/link";
import { useState } from "react";
import type { ThematicScreensDoc, ScreenMatchRow } from "@/lib/screens";
import { StockLogo } from "@/components/stock-logo";

type Props = {
  doc?: ThematicScreensDoc | null;
  market: "US" | "IN";
  isSubscribed: boolean;
};

/** Home widget row limits — free users see a short preview + lock. */
const HOME_SCREEN_ROWS_FREE = 3;
const HOME_SCREEN_ROWS_PRO = 8;

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top: {
    title: "Top Tikrr Score",
    subtitle: "Our house pick — 10 names with the best four-pillar composite right now.",
  },
  quality_compounders: {
    title: "Quality Compounders",
    subtitle: "Strong businesses built to grow year after year.",
  },
  cheap_growth: {
    title: "Growth at a Fair Price",
    subtitle: "Still growing fast, not priced for perfection yet.",
  },
  momentum_leaders: {
    title: "On a Tear",
    subtitle: "Leading the tape with the long-term trend intact.",
  },
  oversold_quality: {
    title: "Quality on Sale",
    subtitle: "Great businesses that just got marked down.",
  },
  near_52w_high: {
    title: "Near New Highs",
    subtitle: "Stocks within 3% of their 52-week peak.",
  },
  smart_money: {
    title: "Where the Pros Are",
    subtitle: "Heavy institutional ownership, solid overall scores.",
  },
};

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function MatchRow({ row, market }: { row: ScreenMatchRow; market: "US" | "IN" }) {
  const change = row.day_change_pct;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  const tone = up
    ? "bg-[#ecfdf5] text-[#10b981]"
    : down
      ? "bg-[#fef2f2] text-[#ef4444]"
      : "bg-[#f3f4f6] text-[#6b7280]";

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="grid grid-cols-[1.6fr_0.6fr_0.8fr_0.9fr] items-center gap-4 px-5 py-3.5 border-t border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-[#111111] truncate">
            {row.ticker}
          </span>
          <span className="text-[11px] text-[#6b7280] truncate">
            {row.name ?? row.sector ?? ""}
          </span>
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end">
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
          Score
        </span>
        <span className="text-[14px] font-semibold text-[#111111] tabular-nums">
          {typeof row.overall_score === "number"
            ? Math.round(row.overall_score)
            : "—"}
        </span>
      </div>
      <span className="text-[14px] font-medium text-[#111111] tabular-nums text-right">
        {fmtPrice(row.price)}
      </span>
      <div className="flex justify-end">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ${tone}`}
        >
          {up ? "▲" : down ? "▼" : "•"} {fmtPct(change)}
        </span>
      </div>
    </Link>
  );
}

export function ThematicScreens({ doc, market, isSubscribed }: Props) {
  const nonEmpty = (doc?.screens ?? []).filter((s) => s.match_count > 0);
  const [activeId, setActiveId] = useState<string | null>(
    nonEmpty[0]?.id ?? null,
  );

  if (!doc || nonEmpty.length === 0) return null;

  const active = nonEmpty.find((s) => s.id === activeId) ?? nonEmpty[0];
  const copy = FRIENDLY_COPY[active.id] ?? {
    title: active.title,
    subtitle: active.tagline,
  };

  const rowLimit = isSubscribed ? HOME_SCREEN_ROWS_PRO : HOME_SCREEN_ROWS_FREE;
  const visibleMatches = active.matches.slice(0, rowLimit);
  const showLock = !isSubscribed && active.matches.length > HOME_SCREEN_ROWS_FREE;
  const lockedCount = showLock ? Math.max(0, active.matches.length - HOME_SCREEN_ROWS_FREE) : 0;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-[18px] md:text-[20px] font-semibold text-[#111111] tracking-[-0.01em]">
            Screens worth watching
          </h2>
          <p className="text-[13px] text-[#6b7280] mt-1.5 leading-relaxed">
            Opinionated filters over the full four-pillar score — hand-picked so you can skip the screener.
          </p>
        </div>
        <span className="text-[12px] text-[#6b7280]">Live four-pillar scores</span>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {nonEmpty.map((screen) => {
          const isActive = screen.id === active.id;
          const isHouse = screen.id === "tikrr_top";
          const label = FRIENDLY_COPY[screen.id]?.title ?? screen.title;
          return (
            <button
              key={screen.id}
              type="button"
              onClick={() => setActiveId(screen.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "bg-[#111111] text-white"
                  : "bg-white text-[#111111] border border-[#e5e7eb] hover:border-[#111111]"
              }`}
            >
              {isHouse && (
                <span
                  className={`text-[12px] leading-none ${
                    isActive ? "text-[#c7d2fe]" : "text-[#7c3aed]"
                  }`}
                  aria-hidden
                >
                  ✦
                </span>
              )}
              <span>{label}</span>
              <span
                className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[#f3f4f6] text-[#6b7280]"
                }`}
              >
                {screen.match_count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 flex-wrap px-5 pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[16px] font-semibold text-[#111111] tracking-[-0.01em]">
              {copy.title}
            </h3>
            <p className="text-[13px] text-[#6b7280] leading-relaxed">
              {copy.subtitle}
            </p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
            {active.match_count} {active.match_count === 1 ? "match" : "matches"}
          </span>
        </div>

        <div className="grid grid-cols-[1.6fr_0.6fr_0.8fr_0.9fr] gap-4 px-5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
          <span>Stock</span>
          <span className="hidden sm:block text-right">Score</span>
          <span className="text-right">Price</span>
          <span className="text-right">Change</span>
        </div>

        <div className="flex flex-col">
          {visibleMatches.map((row) => (
            <MatchRow key={row.instrument_id} row={row} market={market} />
          ))}
        </div>

        {showLock && (
          <div className="border-t border-[#e5e7eb] bg-gradient-to-b from-white to-[#f9fafb] px-5 py-7 text-center">
            <p className="text-[14px] font-semibold text-[#111111]">
              {lockedCount} more {lockedCount === 1 ? "match" : "matches"} on this screen
            </p>
            <p className="mt-1 text-[13px] text-[#6b7280] max-w-[420px] mx-auto leading-relaxed">
              Subscribe to unlock the full list, updated daily.
            </p>
            <Link
              href="/subscribe"
              className="mt-4 inline-flex items-center justify-center h-[40px] px-6 rounded-full bg-[#111111] text-white text-[13px] font-semibold hover:-translate-y-[1px] active:translate-y-0 transition-transform"
            >
              Subscribe
            </Link>
          </div>
        )}

        {isSubscribed && active.match_count > HOME_SCREEN_ROWS_PRO && (
          <Link
            href={`/screens/${active.id}?market=${market}`}
            className="flex items-center justify-center gap-1 border-t border-[#f3f4f6] px-5 py-3 text-[13px] font-semibold text-[#0052ff] hover:bg-[#f8f9fa] transition-colors"
          >
            See all {active.match_count} matches →
          </Link>
        )}
        {!isSubscribed && active.match_count <= HOME_SCREEN_ROWS_FREE && active.match_count > 0 && (
          <Link
            href={`/screens/${active.id}?market=${market}`}
            className="flex items-center justify-center gap-1 border-t border-[#f3f4f6] px-5 py-3 text-[13px] font-semibold text-[#0052ff] hover:bg-[#f8f9fa] transition-colors"
          >
            Open screen →
          </Link>
        )}
      </div>
    </section>
  );
}
