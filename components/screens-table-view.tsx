"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { scrubLegacyBrand } from "@/lib/brand";
import type { ThematicScreen, ScreenMatchRow } from "@/lib/screens";

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top:          { title: "Top stocksbrew Score",        subtitle: "Stocks with the best overall score across growth, momentum, quality and valuation." },
  quality_compounders:{ title: "Quality Compounders",    subtitle: "Strong businesses built to grow year after year." },
  cheap_growth:       { title: "Growth at a Fair Price", subtitle: "Still growing fast, not priced for perfection yet." },
  momentum_leaders:   { title: "On a Tear",              subtitle: "Leading the tape with the long-term trend intact." },
  oversold_quality:   { title: "Quality on Sale",        subtitle: "Great businesses that just got marked down." },
  near_52w_high:      { title: "Near New Highs",         subtitle: "Stocks within 3% of their 52-week peak." },
  smart_money:        { title: "Where the Pros Are",     subtitle: "Heavy institutional ownership, solid overall scores." },
};

function getCopy(screen: ThematicScreen) {
  const friendly = FRIENDLY_COPY[screen.id];
  if (friendly) return friendly;
  return {
    title: scrubLegacyBrand(screen.title),
    subtitle: scrubLegacyBrand(screen.tagline),
  };
}

function scoreColor(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return "text-[#d1d5db]";
  if (v >= 70) return "text-[#047857]";
  if (v >= 50) return "text-[#b45309]";
  return "text-[#9ca3af]";
}

function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return <span className="text-[12px] text-[#d1d5db]">-</span>;
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
    return <span className="text-[12px] text-[#d1d5db]">-</span>;
  }
  return (
    <span className={`text-[13px] font-semibold tabular-nums ${scoreColor(value)}`}>
      {Math.round(value)}
    </span>
  );
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

type SortKey = "company" | "score" | "valuation" | "growth" | "quality" | "momentum";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir } | null;

function sortValue(row: ScreenMatchRow, key: SortKey): number | string | null {
  const p = row.pillar_scores ?? {};
  switch (key) {
    case "company":
      return (row.name?.trim() || row.ticker || "").toLowerCase();
    case "score":
      return row.overall_score ?? null;
    case "valuation":
      return p.valuation ?? null;
    case "growth":
      return p.growth ?? null;
    case "quality":
      return p.quality ?? null;
    case "momentum":
      return p.momentum ?? null;
  }
}

function compareRows(a: ScreenMatchRow, b: ScreenMatchRow, key: SortKey, dir: SortDir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const mult = dir === "asc" ? 1 : -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
  if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * mult;
  return 0;
}

/** First click: desc for numeric columns (strongest first), asc for company (A–Z). */
function initialDir(key: SortKey): SortDir {
  return key === "company" ? "asc" : "desc";
}

function cycleSort(prev: SortState, key: SortKey): SortState {
  if (!prev || prev.key !== key) return { key, dir: initialDir(key) };
  const first = initialDir(key);
  if (prev.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir | null }) {
  return (
    <span
      className={`ml-0.5 inline-flex flex-col leading-[6px] text-[8px] ${active ? "text-[#111111]" : "text-[#d1d5db]"}`}
      aria-hidden
    >
      <span style={{ opacity: dir === "asc" ? 1 : 0.35 }}>▲</span>
      <span style={{ opacity: dir === "desc" ? 1 : 0.35 }}>▼</span>
    </span>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader({
  sort,
  onSort,
}: {
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const col = (key: SortKey, label: string, className: string) => {
    const active = sort?.key === key;
    const dir = active ? sort.dir : null;
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className={`inline-flex items-center justify-center select-none cursor-pointer rounded-md py-0.5 -my-0.5 px-0.5 -mx-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-[#111111] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0052ff]/30 ${
          active ? "text-[#111111]" : "text-[#9ca3af]"
        } ${className}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <SortIndicator active={active} dir={dir} />
      </button>
    );
  };

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#e5e7eb] bg-[#f9fafb]">
      <div className="hidden md:block w-7 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0 flex justify-start">
        {col("company", "Company", "justify-start")}
      </div>
      <div className="w-[64px] shrink-0 flex justify-center">{col("score", "Score", "justify-center")}</div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        {col("valuation", "Val", "justify-center")}
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        {col("growth", "Gro", "justify-center")}
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        {col("quality", "Qual", "justify-center")}
      </div>
      <div className="hidden md:flex w-[40px] shrink-0 justify-center">
        {col("momentum", "Mom", "justify-center")}
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
  const pillars = row.pillar_scores ?? {};

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="flex items-center gap-3 px-5 py-3.5 border-t border-[#f3f4f6] hover:bg-[#fafafa] transition-colors"
    >
      {/* Rank — desktop only */}
      <div className="hidden md:block w-7 shrink-0">
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

      {/* Pillar scores - hidden on mobile */}
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
  const [sort, setSort] = useState<SortState>(null);

  const activeScreen = screens.find((s) => s.id === activeId) ?? screens[0];

  useEffect(() => {
    setSort(null);
  }, [activeId]);

  const matches = activeScreen?.matches ?? [];

  const sorted = useMemo(() => {
    const rows = [...matches];
    if (!sort) {
      rows.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
      return rows;
    }
    rows.sort((a, b) => compareRows(a, b, sort.key, sort.dir));
    return rows;
  }, [matches, sort]);

  if (!activeScreen) return null;

  const copy = getCopy(activeScreen);

  function handleSort(key: SortKey) {
    setSort((prev) => cycleSort(prev, key));
  }

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
        <TableHeader sort={sort} onSort={handleSort} />
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
