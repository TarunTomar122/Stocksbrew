"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { StockLogo } from "@/components/stock-logo";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { scrubLegacyBrand } from "@/lib/brand";
import type { ThematicScreen, ScreenMatchRow } from "@/lib/screens";

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top:          { title: "Top stocksbrew Score",   subtitle: "Stocks with the best overall score across growth, momentum, quality and valuation." },
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
  return { title: scrubLegacyBrand(screen.title), subtitle: scrubLegacyBrand(screen.tagline) };
}

const isScore = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v !== 0;

/** Overall score chip — green for strong, neutral gray otherwise. No amber. */
function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (!isScore(value)) return <span className="text-[12px] text-on-surface-variant/50">–</span>;
  const rounded = Math.round(value);
  return <Badge variant={rounded >= 70 ? "bull" : "neutral"}>{rounded}</Badge>;
}

/** Pillar score — green when strong, muted otherwise. */
function PillarScore({ value }: { value: number | null | undefined }) {
  if (!isScore(value)) return <span className="text-[12px] text-on-surface-variant/50">–</span>;
  const rounded = Math.round(value);
  return (
    <span
      className={cn(
        "font-mono text-[13px] font-semibold tabular-nums",
        rounded >= 70 ? "text-[var(--signal-bullish)]" : "text-on-surface-variant",
      )}
    >
      {rounded}
    </span>
  );
}

const pillar = (row: ScreenMatchRow, key: "valuation" | "growth" | "quality" | "momentum") =>
  row.pillar_scores?.[key] ?? undefined;

function useScreenColumns(market: "US" | "IN"): ColumnDef<ScreenMatchRow>[] {
  return useMemo(
    () => [
      {
        id: "rank",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="hidden font-mono text-[12px] font-semibold tabular-nums text-on-surface-variant/70 md:inline">
            {row.index + 1}
          </span>
        ),
        meta: { align: "left" },
      },
      {
        id: "company",
        header: "Company",
        accessorFn: (row) => (row.name?.trim() || row.ticker || "").toLowerCase(),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="group flex items-center gap-2.5">
              <StockLogo ticker={r.ticker} logoUrl={r.logo_url} market={market} size={34} />
              <div className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                  {r.ticker}
                </span>
                {r.name ? (
                  <span className="max-w-[170px] truncate text-[11px] text-on-surface-variant">{r.name}</span>
                ) : null}
              </div>
            </Link>
          );
        },
      },
      {
        id: "score",
        header: "Score",
        accessorFn: (row) => row.overall_score ?? undefined,
        sortDescFirst: true,
        cell: ({ row }) => <ScoreBadge value={row.original.overall_score} />,
        meta: { align: "right" },
      },
      ...(["valuation", "growth", "quality", "momentum"] as const).map(
        (key): ColumnDef<ScreenMatchRow> => ({
          id: key,
          header: { valuation: "Val", growth: "Gro", quality: "Qual", momentum: "Mom" }[key],
          accessorFn: (row) => pillar(row, key),
          sortDescFirst: true,
          cell: ({ row }) => <PillarScore value={pillar(row.original, key)} />,
          meta: { align: "right", hideOnMobile: true },
        }),
      ),
    ],
    [market],
  );
}

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
  const columns = useScreenColumns(market);

  if (!activeScreen) return null;
  const copy = getCopy(activeScreen);
  const matches = activeScreen.matches ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Screen filter tabs */}
      <div className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto">
        {screens.map((s) => {
          const c = getCopy(s);
          const isActive = s.id === activeId;
          const isHouse = s.id === "tikrr_top";
          return (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                isActive
                  ? "bg-on-surface text-surface"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
              )}
            >
              {isHouse ? <span className={cn("text-[11px]", isActive ? "text-surface" : "text-primary")}>✦</span> : null}
              {c.title}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  isActive ? "bg-surface/20 text-surface" : "bg-surface text-on-surface-variant",
                )}
              >
                {s.match_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Screen description */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-on-surface-variant">{copy.subtitle}</p>
        <Link
          href={`/screens/${encodeURIComponent(activeId)}?market=${market}`}
          className="shrink-0 text-[12px] font-semibold text-primary hover:underline"
        >
          View full screen →
        </Link>
      </div>

      {/* Table — TanStack sorting, click a header to sort */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface">
        <DataTable
          key={activeId}
          columns={columns}
          data={matches}
          initialSorting={[{ id: "score", desc: true }]}
          className="[&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5"
        />
      </div>
    </div>
  );
}
