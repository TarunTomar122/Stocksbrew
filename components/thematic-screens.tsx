"use client";

import Link from "next/link";
import { useState } from "react";
import type { ThematicScreensDoc, ScreenMatchRow } from "@/lib/screens";

type Props = {
  doc?: ThematicScreensDoc | null;
  market: "US" | "IN";
};

// Friendlier, more human copy per screen — overrides the backend taglines
// since those are more "rule statements" than "why you'd care" descriptions.
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
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function MatchRow({ row }: { row: ScreenMatchRow }) {
  const change = row.day_change_pct;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  const changeClass = up
    ? "text-signal-bullish"
    : down
      ? "text-signal-bearish"
      : "text-on-surface-variant";
  const arrow = up ? "▲" : down ? "▼" : "•";

  return (
    <Link
      href={`/stock/${row.ticker}`}
      className="flex items-center justify-between gap-3 py-3 border-b border-outline-variant/30 last:border-b-0 hover:bg-surface-container-low transition-colors -mx-2 px-2 rounded"
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] font-bold text-on-surface truncate">
          {row.ticker}
        </span>
        <span className="text-[11px] text-on-surface-variant truncate">
          {row.name ?? row.sector ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-5 shrink-0">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[10px] font-semibold tracking-wide uppercase text-outline">
            Score
          </span>
          <span className="text-[13px] font-bold text-on-surface tabular-nums">
            {typeof row.overall_score === "number"
              ? Math.round(row.overall_score)
              : "—"}
          </span>
        </div>
        <div className="flex flex-col items-end min-w-[72px]">
          <span className="text-[13px] font-semibold text-on-surface tabular-nums">
            {fmtPrice(row.price)}
          </span>
          <span className={`text-[11px] font-bold tabular-nums flex items-center gap-1 ${changeClass}`}>
            <span>{arrow}</span>
            {fmtPct(change)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ThematicScreens({ doc, market }: Props) {
  const nonEmpty = (doc?.screens ?? []).filter((s) => s.match_count > 0);
  const [activeId, setActiveId] = useState<string | null>(
    nonEmpty[0]?.id ?? null,
  );

  if (!doc || nonEmpty.length === 0) return null;

  const active =
    nonEmpty.find((s) => s.id === activeId) ?? nonEmpty[0];
  const copy = FRIENDLY_COPY[active.id] ?? {
    title: active.title,
    subtitle: active.tagline,
  };

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[20px] font-bold text-on-surface leading-tight">
            Screens worth watching
          </h2>
          <p className="text-[13px] text-on-surface-variant mt-1">
            Opinionated filters over the full four-pillar score — hand-picked so you can skip the screener.
          </p>
        </div>
        <span className="text-[11px] text-on-surface-variant">
          {doc.coverage.intel_pro_docs} stocks scored
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 flex-wrap mb-4">
        {nonEmpty.map((screen) => {
          const isActive = screen.id === active.id;
          const label = FRIENDLY_COPY[screen.id]?.title ?? screen.title;
          // The `tikrr_top` tab is our house pick — we dress it in the brand
          // gradient (both active and idle) so it reads as "by Tikrr" at a
          // glance, distinct from the generic theme tabs.
          const isHouse = screen.id === "tikrr_top";
          const baseClass =
            "px-3.5 py-2 text-[12px] font-semibold rounded-full transition-all flex items-center gap-2";
          const toneClass = isHouse
            ? isActive
              ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.35)]"
              : "bg-gradient-to-r from-indigo-500/15 via-violet-500/15 to-fuchsia-500/15 text-on-surface ring-1 ring-violet-500/40 hover:from-indigo-500/25 hover:via-violet-500/25 hover:to-fuchsia-500/25"
            : isActive
              ? "bg-on-surface text-surface"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container";
          return (
            <button
              key={screen.id}
              type="button"
              onClick={() => setActiveId(screen.id)}
              className={`${baseClass} ${toneClass}`}
            >
              {isHouse && (
                <span
                  aria-hidden="true"
                  className={`text-[11px] leading-none ${isActive ? "text-white" : "text-violet-500"}`}
                  title="Tikrr house pick"
                >
                  ✦
                </span>
              )}
              <span>{label}</span>
              <span
                className={`text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 ${
                  isHouse
                    ? isActive
                      ? "bg-white/20 text-white"
                      : "bg-violet-500/20 text-on-surface"
                    : isActive
                      ? "bg-surface/20 text-surface"
                      : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {screen.match_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active screen panel */}
      <div className="bg-surface-container-lowest brutalist-border rounded-xl p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h3 className="text-[16px] font-bold text-on-surface">{copy.title}</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-outline">
            {active.match_count} {active.match_count === 1 ? "match" : "matches"}
          </span>
        </div>
        <p className="text-[13px] text-on-surface-variant mb-3">{copy.subtitle}</p>

        <div className="flex flex-col">
          {active.matches.slice(0, 8).map((row) => (
            <MatchRow key={row.instrument_id} row={row} />
          ))}
        </div>

        {active.match_count > 8 && (
          <Link
            href={`/screens/${active.id}?market=${market}`}
            className="mt-4 text-[12px] font-semibold text-on-surface hover:underline inline-flex items-center gap-1"
          >
            See all {active.match_count} matches →
          </Link>
        )}
      </div>
    </section>
  );
}
