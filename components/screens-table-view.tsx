"use client";

import { useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { ThematicScreen, ScreenMatchRow } from "@/lib/screens";

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top:          { title: "Top Tikrr Score",        subtitle: "Stocks with the best overall score across growth, momentum, quality and valuation." },
  quality_compounders:{ title: "Quality Compounders",    subtitle: "Strong businesses built to grow year after year." },
  cheap_growth:       { title: "Growth at a Fair Price", subtitle: "Still growing fast, not priced for perfection yet." },
  momentum_leaders:   { title: "On a Tear",              subtitle: "Leading the tape with the long-term trend intact." },
  oversold_quality:   { title: "Quality on Sale",        subtitle: "Great businesses that just got marked down." },
  near_52w_high:      { title: "Near New Highs",         subtitle: "Stocks within 3% of their 52-week peak." },
  smart_money:        { title: "Where the Pros Are",     subtitle: "Heavy institutional ownership, solid overall scores." },
};

function getCopy(screen: ThematicScreen) {
  return FRIENDLY_COPY[screen.id] ?? { title: screen.title, subtitle: screen.tagline };
}

function fmtPct(v: number | null | undefined): { text: string; positive: boolean } | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, positive: v >= 0 };
}

function scoreColor(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return "text-[#d1d5db]";
  if (v >= 70) return "text-[#047857]";
  if (v >= 50) return "text-[#b45309]";
  return "text-[#9ca3af]";
}

function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return <span className="text-[12px] text-[#d1d5db]">—</span>;
  }
  const rounded = Math.round(value);
  const bg = rounded >= 70 ? "#ecfdf5" : rounded >= 50 ? "#fffbeb" : "#f3f4f6";
  const color = rounded >= 70 ? "#047857" : rounded >= 50 ? "#b45309" : "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 text-[13px] font-semibold tabular-nums"
      style={{ background: bg, color }}
    >
      {rounded}
    </span>
  );
}

function PillarScore({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return <span className="text-[12px] text-[#d1d5db]">—</span>;
  }
  return (
    <span className={`text-[13px] font-semibold tabular-nums ${scoreColor(value)}`}>
      {Math.round(value)}
    </span>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#e5e7eb] bg-[#f9fafb]">
      <div className="w-7 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">#</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Company</span>
      </div>
      <div className="w-[64px] shrink-0 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Score</span>
      </div>
      <div className="hidden md:block w-[40px] shrink-0 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Val</span>
      </div>
      <div className="hidden md:block w-[40px] shrink-0 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Gro</span>
      </div>
      <div className="hidden md:block w-[40px] shrink-0 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Qual</span>
      </div>
      <div className="hidden md:block w-[40px] shrink-0 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Mom</span>
      </div>
      <div className="w-[72px] shrink-0 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Day chg</span>
      </div>
    </div>
  );
}

// ─── Individual stock row ─────────────────────────────────────────────────────

function ScreenTableRow({
  row,
  rank,
  market,
  screenId,
}: {
  row: ScreenMatchRow;
  rank: number;
  market: "US" | "IN";
  screenId: string;
}) {
  const pct = fmtPct(row.day_change_pct);
  const pillars = row.pillar_scores ?? {};

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="flex items-center gap-3 px-5 py-3.5 border-t border-[#f3f4f6] hover:bg-[#fafafa] transition-colors"
    >
      {/* Rank */}
      <div className="w-7 shrink-0">
        <span className="text-[12px] font-semibold tabular-nums text-[#9ca3af]">{rank}</span>
      </div>

      {/* Company */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {row.ticker}
          </span>
          {row.name && (
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[160px]">{row.name}</span>
          )}
        </div>
      </div>

      {/* Overall score */}
      <div className="w-[64px] shrink-0 flex justify-center">
        <ScoreBadge value={row.overall_score} />
      </div>

      {/* Pillar scores — hidden on mobile */}
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        <PillarScore value={pillars.valuation} />
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        <PillarScore value={pillars.growth} />
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        <PillarScore value={pillars.quality} />
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        <PillarScore value={pillars.momentum} />
      </div>

      {/* Day change */}
      <div className="w-[72px] shrink-0 text-right">
        {pct ? (
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              pct.positive ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {pct.positive ? "▲" : "▼"} {pct.text.replace(/[+-]/, "")}
          </span>
        ) : (
          <span className="text-[12px] text-[#d1d5db]">—</span>
        )}
      </div>
    </Link>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ScreensTableView({
  screens,
  market,
}: {
  screens: ThematicScreen[];
  market: "US" | "IN";
}) {
  const defaultId = screens.find((s) => s.id === "tikrr_top")?.id ?? screens[0]?.id ?? "";
  const [activeId, setActiveId] = useState(defaultId);

  const activeScreen = screens.find((s) => s.id === activeId) ?? screens[0];
  if (!activeScreen) return null;

  const copy = getCopy(activeScreen);
  const sorted = [...activeScreen.matches].sort(
    (a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Screen filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {screens.map((s) => {
          const c = getCopy(s);
          const isActive = s.id === activeId;
          const isHouse = s.id === "tikrr_top";
          return (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                isActive
                  ? "bg-[#111111] text-white"
                  : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
              }`}
            >
              {isHouse && (
                <span style={{ fontSize: 11, color: isActive ? "white" : "#7c3aed" }}>✦</span>
              )}
              {c.title}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  isActive ? "bg-white/20 text-white" : "bg-white text-[#6b7280]"
                }`}
              >
                {s.match_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Screen description */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-[#6b7280]">{copy.subtitle}</p>
        <Link
          href={`/screens/${encodeURIComponent(activeId)}?market=${market}`}
          className="text-[12px] font-semibold text-[#0052ff] hover:underline shrink-0"
        >
          View full screen →
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
        <TableHeader />
        {sorted.map((row, i) => (
          <ScreenTableRow
            key={row.instrument_id}
            row={row}
            rank={i + 1}
            market={market}
            screenId={activeId}
          />
        ))}
      </div>
    </div>
  );
}
