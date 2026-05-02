"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import type { WatchlistRow } from "@/lib/watchlist-view";

type SortKey =
  | "change"
  | "ticker"
  | "price"
  | "overall"
  | "valuation"
  | "growth"
  | "quality"
  | "momentum";

type SortDir = "asc" | "desc";

function formatPrice(value: number | null, currency: string): string {
  if (value === null) return "—";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(0);
}

function scoreTone(value: number | null): string {
  if (value === null) return "text-[#9ca3af]";
  if (value >= 80) return "text-[#10b981]";
  if (value >= 60) return "text-[#111111]";
  if (value >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function scoreToValue(row: WatchlistRow, key: SortKey): number {
  if (key === "change") return row.day_change_pct ?? -Infinity;
  if (key === "price") return row.price ?? -Infinity;
  if (key === "overall") return row.scores.overall ?? -Infinity;
  if (key === "valuation") return row.scores.valuation ?? -Infinity;
  if (key === "growth") return row.scores.growth ?? -Infinity;
  if (key === "quality") return row.scores.quality ?? -Infinity;
  if (key === "momentum") return row.scores.momentum ?? -Infinity;
  return 0;
}

const GRID_COLS =
  "grid-cols-[minmax(180px,1.6fr)_minmax(80px,0.9fr)_minmax(80px,0.8fr)_minmax(70px,0.7fr)_minmax(70px,0.7fr)_minmax(70px,0.7fr)_minmax(70px,0.7fr)_minmax(70px,0.7fr)_28px]";

function HeaderCell({
  label,
  sortKey,
  active,
  dir,
  onPick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onPick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const arrow = active ? (dir === "desc" ? "▼" : "▲") : "";
  return (
    <button
      type="button"
      onClick={() => onPick(sortKey)}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.1em] uppercase transition-colors ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-[#111111]" : "text-[#9ca3af] hover:text-[#111111]"}`}
    >
      {label} {arrow && <span className="text-[8px]">{arrow}</span>}
    </button>
  );
}

export function WatchlistGrid({ rows }: { rows: WatchlistRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortKey === "ticker") {
      copy.sort((a, b) =>
        sortDir === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker),
      );
    } else if (sortKey === "change") {
      copy.sort((a, b) => {
        const av = Math.abs(a.day_change_pct ?? 0);
        const bv = Math.abs(b.day_change_pct ?? 0);
        return sortDir === "desc" ? bv - av : av - bv;
      });
    } else {
      copy.sort((a, b) => {
        const av = scoreToValue(a, sortKey);
        const bv = scoreToValue(b, sortKey);
        return sortDir === "desc" ? bv - av : av - bv;
      });
    }
    return copy;
  }, [rows, sortKey, sortDir]);

  function pickSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function onUntrack(instrumentId: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (pendingId) return;
    setPendingId(instrumentId);
    try {
      const res = await fetch("/api/track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId }),
      });
      if (!res.ok) {
        console.error("Untrack failed", await res.text());
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
      <div
        className={`hidden md:grid ${GRID_COLS} gap-4 px-5 py-3 border-b border-[#e5e7eb] bg-[#f8f9fa]`}
      >
        <HeaderCell
          label="Ticker"
          sortKey="ticker"
          active={sortKey === "ticker"}
          dir={sortDir}
          onPick={pickSort}
        />
        <HeaderCell
          label="Price"
          sortKey="price"
          active={sortKey === "price"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Day"
          sortKey="change"
          active={sortKey === "change"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Overall"
          sortKey="overall"
          active={sortKey === "overall"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Val"
          sortKey="valuation"
          active={sortKey === "valuation"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Growth"
          sortKey="growth"
          active={sortKey === "growth"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Quality"
          sortKey="quality"
          active={sortKey === "quality"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <HeaderCell
          label="Momentum"
          sortKey="momentum"
          active={sortKey === "momentum"}
          dir={sortDir}
          onPick={pickSort}
          align="right"
        />
        <span className="w-7" />
      </div>

      <ul>
        {sorted.map((row) => {
          const positive = (row.day_change_pct ?? 0) >= 0;
          const isPending = pendingId === row.instrument_id;
          return (
            <li
              key={row.instrument_id}
              role="button"
              tabIndex={0}
              onClick={() =>
                router.push(`/stock/${encodeURIComponent(row.ticker)}`)
              }
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  router.push(`/stock/${encodeURIComponent(row.ticker)}`);
                }
              }}
              className={`hidden md:grid ${GRID_COLS} gap-4 px-5 py-3.5 items-center border-t border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors cursor-pointer outline-none focus-visible:bg-[#f8f9fa]`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <StockLogo
                  ticker={row.ticker}
                  market={row.market === "IN" ? "IN" : "US"}
                  size={32}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[14px] font-semibold text-[#111111]">
                    {row.ticker}
                  </span>
                  <span className="text-[11px] text-[#6b7280] truncate">
                    {row.sector_label || row.market}
                  </span>
                </div>
              </div>
              <span className="text-[14px] font-semibold text-[#111111] tabular-nums text-right">
                {formatPrice(row.price, row.currency)}
              </span>
              <span
                className={`text-[14px] font-semibold tabular-nums text-right ${
                  positive ? "text-[#10b981]" : "text-[#ef4444]"
                }`}
              >
                {formatPct(row.day_change_pct)}
              </span>
              <span
                className={`text-[14px] font-semibold tabular-nums text-right ${scoreTone(row.scores.overall)}`}
              >
                {formatScore(row.scores.overall)}
              </span>
              <span
                className={`text-[13px] tabular-nums text-right ${scoreTone(row.scores.valuation)}`}
              >
                {formatScore(row.scores.valuation)}
              </span>
              <span
                className={`text-[13px] tabular-nums text-right ${scoreTone(row.scores.growth)}`}
              >
                {formatScore(row.scores.growth)}
              </span>
              <span
                className={`text-[13px] tabular-nums text-right ${scoreTone(row.scores.quality)}`}
              >
                {formatScore(row.scores.quality)}
              </span>
              <span
                className={`text-[13px] tabular-nums text-right ${scoreTone(row.scores.momentum)}`}
              >
                {formatScore(row.scores.momentum)}
              </span>
              <button
                type="button"
                onClick={(ev) => onUntrack(row.instrument_id, ev)}
                disabled={isPending}
                aria-label={`Untrack ${row.ticker}`}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#fef2f2] disabled:opacity-40 transition-colors"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {/* Mobile: stacked cards */}
      <ul className="md:hidden">
        {sorted.map((row) => {
          const positive = (row.day_change_pct ?? 0) >= 0;
          const isPending = pendingId === row.instrument_id;
          return (
            <li
              key={`${row.instrument_id}-mobile`}
              role="button"
              tabIndex={0}
              onClick={() =>
                router.push(`/stock/${encodeURIComponent(row.ticker)}`)
              }
              className="flex flex-col gap-3 px-5 py-4 border-t border-[#f3f4f6] first:border-t-0"
            >
              <div className="flex items-start gap-3">
                <StockLogo
                  ticker={row.ticker}
                  market={row.market === "IN" ? "IN" : "US"}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[#111111]">
                      {row.ticker}
                    </span>
                    <span
                      className={`text-[14px] font-semibold tabular-nums ${
                        positive ? "text-[#10b981]" : "text-[#ef4444]"
                      }`}
                    >
                      {formatPct(row.day_change_pct)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-[#6b7280] truncate">
                      {row.sector_label || row.market}
                    </span>
                    <span className="text-[12px] font-medium text-[#6b7280] tabular-nums">
                      {formatPrice(row.price, row.currency)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                {[
                  { label: "Val", v: row.scores.valuation },
                  { label: "Growth", v: row.scores.growth },
                  { label: "Qual", v: row.scores.quality },
                  { label: "Mom", v: row.scores.momentum },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-0.5">
                    <span className="font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">
                      {s.label}
                    </span>
                    <span
                      className={`text-[14px] font-semibold tabular-nums ${scoreTone(s.v)}`}
                    >
                      {formatScore(s.v)}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={(ev) => onUntrack(row.instrument_id, ev)}
                  disabled={isPending}
                  aria-label={`Untrack ${row.ticker}`}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#fef2f2] disabled:opacity-40 transition-colors"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
