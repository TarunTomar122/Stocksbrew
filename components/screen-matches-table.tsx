"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { ScreenMatchRow } from "@/lib/screens";

type SortKey =
  | "ticker"
  | "sector"
  | "price"
  | "day"
  | "overall"
  | "val"
  | "gro"
  | "qual";

type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir } | null;

type Props = {
  matches: ScreenMatchRow[];
  screenId: string;
  market?: "US" | "IN";
};

const COLUMNS: { key: SortKey; label: string; align?: "right"; mobile?: boolean }[] = [
  { key: "ticker",  label: "Stock",   mobile: true },
  { key: "sector",  label: "Sector" },
  { key: "price",   label: "Price",   align: "right" },
  { key: "day",     label: "Day",     align: "right" },
  { key: "overall", label: "Overall", align: "right" },
  { key: "val",     label: "Val",     align: "right" },
  { key: "gro",     label: "Gro",     align: "right" },
  { key: "qual",    label: "Qual",    align: "right" },
];

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtScore(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  return Math.round(v).toString();
}

function scoreTone(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-[#9ca3af]";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-[#111111]";
  if (v >= 40) return "text-[#6b7280]";
  return "text-[#9ca3af]";
}

function extraMatchCell(row: ScreenMatchRow, screenId: string): string {
  if (screenId === "oversold_quality" && typeof row.rsi_14 === "number") {
    return `RSI ${row.rsi_14.toFixed(1)}`;
  }
  if (screenId === "near_52w_high" && typeof row.from_52w_high_pct === "number") {
    return `${fmtPct(row.from_52w_high_pct, 2)} from high`;
  }
  if (screenId === "smart_money" && typeof row.inst_own_pct === "number") {
    return `${row.inst_own_pct.toFixed(0)}% inst`;
  }
  if (screenId === "momentum_leaders" && row.above_200dma) {
    return "Above 200DMA";
  }
  if (typeof row.match_score === "number") {
    return `Match ${row.match_score.toFixed(1)}`;
  }
  return "";
}

function getSortValue(row: ScreenMatchRow, key: SortKey): number | string | null {
  switch (key) {
    case "ticker":
      return row.ticker?.toLowerCase() ?? "";
    case "sector":
      return (row.sector ?? "").toLowerCase();
    case "price":
      return row.price ?? null;
    case "day":
      return row.day_change_pct ?? null;
    case "overall":
      return row.overall_score ?? null;
    case "val":
      return row.pillar_scores?.valuation ?? null;
    case "gro":
      return row.pillar_scores?.growth ?? null;
    case "qual":
      return row.pillar_scores?.quality ?? null;
  }
}

function compare(
  a: ScreenMatchRow,
  b: ScreenMatchRow,
  key: SortKey,
  dir: SortDir,
): number {
  const va = getSortValue(a, key);
  const vb = getSortValue(b, key);
  // Push nulls to the end regardless of direction
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const mult = dir === "asc" ? 1 : -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
  if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * mult;
  return 0;
}

function SortIndicator({
  state,
  columnKey,
}: {
  state: SortState;
  columnKey: SortKey;
}) {
  const active = state?.key === columnKey;
  const dir = active ? state.dir : null;
  return (
    <span
      className={`ml-1 inline-flex flex-col leading-[6px] text-[8px] ${
        active ? "text-[#111111]" : "text-[#d1d5db]"
      }`}
      aria-hidden
    >
      <span style={{ opacity: dir === "asc" ? 1 : 0.45 }}>▲</span>
      <span style={{ opacity: dir === "desc" ? 1 : 0.45 }}>▼</span>
    </span>
  );
}

export function ScreenMatchesTable({
  matches,
  screenId,
  market = "US",
}: Props) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return matches;
    return [...matches].sort((a, b) => compare(a, b, sort.key, sort.dir));
  }, [matches, sort]);

  function cycleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  return (
    <section className="rounded-[24px] border border-[#e5e7eb] bg-white overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[2fr_1.2fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr] items-center gap-4 px-6 py-3.5 border-b border-[#f3f4f6] text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => cycleSort(col.key)}
            className={`inline-flex items-center select-none cursor-pointer hover:text-[#111111] transition-colors ${
              col.align === "right" ? "justify-end" : "justify-start"
            } ${sort?.key === col.key ? "text-[#111111]" : ""}`}
            aria-sort={
              sort?.key === col.key
                ? sort.dir === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
          >
            <span>{col.label}</span>
            <SortIndicator state={sort} columnKey={col.key} />
          </button>
        ))}
        <span className="text-right">Signal</span>
      </div>

      {sorted.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[14px] text-[#374151]">
            No stocks match this screen right now.
          </p>
          <p className="text-[12px] text-[#6b7280] mt-1">
            Screens refresh daily. Check back tomorrow.
          </p>
        </div>
      ) : (
        <>
          {sorted.map((row) => {
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
              key={row.instrument_id}
              href={`/stock/${encodeURIComponent(row.ticker)}`}
              className="grid grid-cols-[2fr_auto] md:grid-cols-[2fr_1.2fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr] gap-4 px-6 py-4 items-center border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#f8f9fa] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={40} />
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] font-semibold text-[#111111] truncate">
                    {row.ticker}
                  </span>
                  <span className="text-[11px] text-[#6b7280] truncate">
                    {row.name ?? ""}
                  </span>
                </div>
              </div>
              <span className="hidden md:inline text-[13px] text-[#374151] truncate">
                {row.sector ?? "-"}
              </span>
              <span className="hidden md:inline text-right text-[14px] text-[#111111] tabular-nums">
                {fmtPrice(row.price)}
              </span>
              <div className="hidden md:flex justify-end">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ${tone}`}
                >
                  {up ? "▲" : down ? "▼" : "•"} {fmtPct(change)}
                </span>
              </div>
              <span
                className={`hidden md:block text-right text-[16px] font-semibold tabular-nums ${scoreTone(row.overall_score)}`}
              >
                {fmtScore(row.overall_score)}
              </span>
              <span
                className={`hidden md:block text-right text-[13px] tabular-nums ${scoreTone(row.pillar_scores?.valuation)}`}
              >
                {fmtScore(row.pillar_scores?.valuation)}
              </span>
              <span
                className={`hidden md:block text-right text-[13px] tabular-nums ${scoreTone(row.pillar_scores?.growth)}`}
              >
                {fmtScore(row.pillar_scores?.growth)}
              </span>
              <span
                className={`hidden md:block text-right text-[13px] tabular-nums ${scoreTone(row.pillar_scores?.quality)}`}
              >
                {fmtScore(row.pillar_scores?.quality)}
              </span>
              <span className="hidden md:block text-right text-[11px] text-[#6b7280] tabular-nums">
                {extraMatchCell(row, screenId)}
              </span>

              {/* Mobile compact column */}
              <div className="md:hidden flex items-center gap-3 justify-end">
                <span className="text-[14px] font-semibold text-[#111111] tabular-nums">
                  {fmtPrice(row.price)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${tone}`}
                >
                  {up ? "▲" : down ? "▼" : "•"} {fmtPct(change)}
                </span>
              </div>
            </Link>
          );
        })}
        </>
      )}
    </section>
  );
}
