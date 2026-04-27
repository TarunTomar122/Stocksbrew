"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      className={`text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant hover:text-on-surface transition-colors ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-on-surface" : ""}`}
    >
      {label} {arrow && <span className="text-[9px] ml-0.5">{arrow}</span>}
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
      copy.sort((a, b) => (sortDir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker)));
    } else if (sortKey === "change") {
      // Default sort is biggest absolute move first.
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
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-4 px-6 py-3 border-b border-outline-variant/30">
        <HeaderCell label="Ticker" sortKey="ticker" active={sortKey === "ticker"} dir={sortDir} onPick={pickSort} />
        <HeaderCell label="Price" sortKey="price" active={sortKey === "price"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Day" sortKey="change" active={sortKey === "change"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Overall" sortKey="overall" active={sortKey === "overall"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Val" sortKey="valuation" active={sortKey === "valuation"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Growth" sortKey="growth" active={sortKey === "growth"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Quality" sortKey="quality" active={sortKey === "quality"} dir={sortDir} onPick={pickSort} align="right" />
        <HeaderCell label="Momentum" sortKey="momentum" active={sortKey === "momentum"} dir={sortDir} onPick={pickSort} align="right" />
        <span className="w-6" />
      </div>

      <ul className="divide-y divide-outline-variant/20">
        {sorted.map((row) => {
          const changePositive = (row.day_change_pct ?? 0) >= 0;
          const isPending = pendingId === row.instrument_id;
          return (
            <li
              key={row.instrument_id}
              className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-4 px-6 py-3 items-center hover:bg-surface-container-low/40 transition-colors cursor-pointer"
              onClick={() => router.push(`/stock/${encodeURIComponent(row.ticker)}`)}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-on-surface">{row.ticker}</span>
                <span className="text-[10px] font-semibold tracking-wide uppercase text-on-surface-variant truncate">
                  {row.sector_label || row.market}
                </span>
              </div>
              <div className="text-sm font-semibold text-on-surface tabular-nums text-right">
                {formatPrice(row.price, row.currency)}
              </div>
              <div
                className={`text-sm font-bold tabular-nums text-right ${
                  changePositive ? "text-signal-bullish" : "text-signal-bearish"
                }`}
              >
                {formatPct(row.day_change_pct)}
              </div>
              <div className="text-sm font-bold text-on-surface tabular-nums text-right">
                {formatScore(row.scores.overall)}
              </div>
              <div className="text-sm text-on-surface tabular-nums text-right">
                {formatScore(row.scores.valuation)}
              </div>
              <div className="text-sm text-on-surface tabular-nums text-right">
                {formatScore(row.scores.growth)}
              </div>
              <div className="text-sm text-on-surface tabular-nums text-right">
                {formatScore(row.scores.quality)}
              </div>
              <div className="text-sm text-on-surface tabular-nums text-right">
                {formatScore(row.scores.momentum)}
              </div>
              <button
                type="button"
                onClick={(ev) => onUntrack(row.instrument_id, ev)}
                disabled={isPending}
                aria-label={`Untrack ${row.ticker}`}
                className="text-outline hover:text-signal-bearish disabled:opacity-40 transition-colors text-sm w-6 h-6 flex items-center justify-center rounded-full hover:bg-signal-bearish/10"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
