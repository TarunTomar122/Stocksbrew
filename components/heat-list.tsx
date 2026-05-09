"use client";

import { useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { HeatList, HeatRow } from "@/lib/heat";

const FREE_HEAT_ROWS = 10;

type Props = {
  data: HeatList | null;
  trackedIds?: string[];
  isSubscribed?: boolean;
};

type SetupMeta = {
  label: string;
  color: string;
  bg: string;
  icon: string;
  order: number;
};

const SETUP_META: Record<string, SetupMeta> = {
  overheated:     { label: "Overheated",     color: "#c2410c", bg: "#fff7ed", icon: "local_fire_department", order: 1 },
  breakout:       { label: "Breakout",       color: "#047857", bg: "#ecfdf5", icon: "trending_up",            order: 2 },
  news_spike:     { label: "News spike",     color: "#7c3aed", bg: "#f5f3ff", icon: "newspaper",              order: 3 },
  catalyst_watch: { label: "Catalyst watch", color: "#b45309", bg: "#fffbeb", icon: "event",                  order: 4 },
  dip_setup:      { label: "Dip setup",      color: "#0052ff", bg: "#eff6ff", icon: "show_chart",             order: 5 },
  momentum_watch: { label: "Momentum watch", color: "#475569", bg: "#f8fafc", icon: "speed",                  order: 6 },
};

function getSetupMeta(key?: string): SetupMeta {
  if (key && SETUP_META[key]) return SETUP_META[key];
  return {
    label: key ? key.replaceAll("_", " ") : "Watching",
    color: "#6b7280",
    bg: "#f3f4f6",
    icon: "insights",
    order: 99,
  };
}

function fmtPct(v: number | null | undefined): { text: string; positive: boolean } | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, positive: v >= 0 };
}

// ─── Setup filter tabs ─────────────────────────────────────────────────────────

function SetupTabs({
  counts,
  total,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  total: number;
  active: string;
  onSelect: (key: string) => void;
}) {
  const setups = Object.entries(SETUP_META)
    .sort((a, b) => a[1].order - b[1].order)
    .filter(([k]) => (counts[k] ?? 0) > 0);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      <button
        onClick={() => onSelect("all")}
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
          active === "all"
            ? "bg-[#111111] text-white"
            : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
        }`}
      >
        All
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            active === "all" ? "bg-white/20 text-white" : "bg-white text-[#6b7280]"
          }`}
        >
          {total}
        </span>
      </button>

      {setups.map(([k, m]) => (
        <button
          key={k}
          onClick={() => onSelect(k)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            active === k
              ? "bg-[#111111] text-white"
              : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          }`}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 12,
              fontVariationSettings: "'wght' 600",
              color: active === k ? "white" : m.color,
            }}
          >
            {m.icon}
          </span>
          {m.label}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
              active === k ? "bg-white/20 text-white" : "bg-white text-[#6b7280]"
            }`}
          >
            {counts[k] ?? 0}
          </span>
        </button>
      ))}
    </div>
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
      <div className="hidden sm:block w-[120px] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Setup</span>
      </div>
      <div className="w-[52px] shrink-0 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Heat</span>
      </div>
      <div className="w-[72px] shrink-0 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Day chg</span>
      </div>
      <div className="hidden md:block w-[52px] shrink-0 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">RSI</span>
      </div>
      <div className="hidden lg:block flex-1 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Signal</span>
      </div>
      <div className="w-9 shrink-0" />
    </div>
  );
}

// ─── Individual stock row ─────────────────────────────────────────────────────

function HeatTableRow({
  row,
  rank,
  trackedIds,
  isSubscribed,
}: {
  row: HeatRow;
  rank: number;
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  const market = row.instrument_id.startsWith("IN_") ? "IN" : "US";
  const pct = fmtPct(row.day_change_pct);
  const meta = getSetupMeta(row.setup_type);

  const rawReason =
    row.reason_sentence ||
    (row.reasons && row.reasons[0]) ||
    row.primary_driver ||
    "";
  const reason = rawReason
    .replace(/,\s*RSI\s+[\d.]+/gi, "")
    .replace(/,\s*heat\s+[\d.]+/gi, "")
    .replace(/\s+\.\s*$/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  const rsiVal = row.rsi_14;
  const rsiState = row.rsi_14_state;
  const rsiColor =
    rsiState === "overbought" || (typeof rsiVal === "number" && rsiVal >= 70)
      ? "text-[#c2410c]"
      : rsiState === "oversold" || (typeof rsiVal === "number" && rsiVal <= 30)
        ? "text-[#0052ff]"
        : "text-[#6b7280]";

  const heatClamped = Math.min(100, Math.max(0, row.heat_score));

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-t border-[#f3f4f6] hover:bg-[#fafafa] transition-colors">
      {/* Rank */}
      <div className="w-7 shrink-0">
        <span className="text-[12px] font-semibold tabular-nums text-[#9ca3af]">{rank}</span>
      </div>

      {/* Company: logo + ticker + name */}
      <div className="flex-1 min-w-0">
        <a
          href={`/stock/${encodeURIComponent(row.ticker)}`}
          className="flex items-center gap-2.5 group"
        >
          <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
              {row.ticker}
            </span>
            {row.name && (
              <span className="text-[11px] text-[#9ca3af] truncate max-w-[160px]">
                {row.name}
              </span>
            )}
          </div>
        </a>
      </div>

      {/* Setup badge */}
      <div className="hidden sm:block w-[120px] shrink-0">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 10, fontVariationSettings: "'wght' 600" }}
          >
            {meta.icon}
          </span>
          {meta.label}
        </span>
      </div>

      {/* Heat score + bar */}
      <div className="w-[52px] shrink-0 flex flex-col items-end gap-1">
        <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
          {Math.round(row.heat_score)}
        </span>
        <div className="h-[3px] w-10 rounded-full bg-[#f3f4f6] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${heatClamped}%`,
              background:
                heatClamped >= 70 ? "#ef4444" : heatClamped >= 50 ? "#f59e0b" : "#10b981",
            }}
          />
        </div>
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

      {/* RSI */}
      <div className="hidden md:block w-[52px] shrink-0 text-right">
        {typeof rsiVal === "number" ? (
          <span className={`text-[13px] font-semibold tabular-nums ${rsiColor}`}>
            {rsiVal.toFixed(0)}
          </span>
        ) : (
          <span className="text-[12px] text-[#d1d5db]">—</span>
        )}
      </div>

      {/* Signal text */}
      <div className="hidden lg:block flex-1 min-w-0">
        <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-1">{reason}</p>
      </div>

      {/* Track button */}
      <div className="w-9 shrink-0 flex items-center justify-end">
        <TrackButton
          ticker={row.ticker}
          instrumentId={row.instrument_id}
          isTracked={trackedIds.includes(row.instrument_id)}
          isSubscribed={isSubscribed}
          variant="icon"
        />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff7ed] text-[#c2410c]">
        <span className="material-symbols-outlined text-[22px]">local_fire_department</span>
      </div>
      <p className="mt-4 text-[12px] font-semibold tracking-[0.16em] uppercase text-[#111111]">
        Heat list is warming up
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#6b7280] max-w-md mx-auto">
        We have not generated today&apos;s ranked hot-stock signal yet. Check back after the next
        market refresh.
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HeatListView({ data, trackedIds = [], isSubscribed = false }: Props) {
  const [filter, setFilter] = useState("all");

  if (!data || data.rows.length === 0) {
    return <EmptyState />;
  }

  const sorted = [...data.rows].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0));

  const filtered =
    filter === "all"
      ? sorted
      : sorted.filter((r) => (r.setup_type ?? "momentum_watch") === filter);

  const displayed = isSubscribed ? filtered : filtered.slice(0, FREE_HEAT_ROWS);
  const lockedCount = !isSubscribed ? Math.max(0, filtered.length - FREE_HEAT_ROWS) : 0;

  const counts: Record<string, number> = {};
  for (const r of sorted) {
    const k = r.setup_type ?? "momentum_watch";
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-4">
      <SetupTabs
        counts={counts}
        total={sorted.length}
        active={filter}
        onSelect={setFilter}
      />

      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
        <TableHeader />

        {displayed.map((row, i) => (
          <HeatTableRow
            key={row.instrument_id}
            row={row}
            rank={i + 1}
            trackedIds={trackedIds}
            isSubscribed={isSubscribed}
          />
        ))}

        {lockedCount > 0 && (
          <div className="border-t border-[#f3f4f6] px-5 py-4">
            <Link
              href="/subscribe"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 text-[13px] font-semibold text-[#111111] hover:border-[#111111] transition-colors"
            >
              <span aria-hidden>🔒</span>
              Unlock {lockedCount} more on Pro
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
