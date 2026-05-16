"use client";

import { useState } from "react";
import { StockLogo } from "@/components/stock-logo";
import type { AnomalyItem } from "@/lib/daily-anomalies";

function fmtPct(v: number): string {
  return `${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AnomalyRow({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";

  return (
    <a
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="flex items-center gap-3 py-3 border-t border-[#f3f4f6] first:border-t-0 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors"
    >
      <StockLogo ticker={item.ticker} logoUrl={item.logo_url ?? undefined} size={36} />

      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em] hover:text-[#0052ff] transition-colors">
            {item.ticker}
          </span>
          {item.catalyst && item.catalyst.length <= 48 && (
            <span className="hidden sm:inline text-[10px] font-semibold rounded-md px-1.5 py-0.5 bg-[#f3f4f6] text-[#6b7280]">
              {item.catalyst}
            </span>
          )}
        </div>
        {item.headline && (
          <span className="text-[11px] text-[#6b7280] truncate">{item.headline}</span>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
          ${fmtPrice(item.price)}
        </span>
        <span
          className="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: isUp ? "#ecfdf5" : "#fef2f2",
            color: isUp ? "#10b981" : "#ef4444",
          }}
        >
          {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
        </span>
      </div>
    </a>
  );
}

// ─── Biggest mover card (left rail) ──────────────────────────────────────────

function BiggestMoverCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";

  return (
    <a
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3 hover:border-[#111111] transition-colors"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
        Biggest move
      </span>
      <div className="flex items-center gap-3">
        <StockLogo ticker={item.ticker} logoUrl={item.logo_url ?? undefined} size={40} />
        <div className="flex flex-col min-w-0">
          <span className="text-[16px] font-semibold text-[#111111] tracking-[-0.01em]">{item.ticker}</span>
          <span className="text-[11px] text-[#9ca3af] truncate">{item.name}</span>
        </div>
        <span
          className="ml-auto shrink-0 inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-[13px] font-semibold tabular-nums"
          style={{
            background: isUp ? "#ecfdf5" : "#fef2f2",
            color: isUp ? "#10b981" : "#ef4444",
          }}
        >
          {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
        </span>
      </div>
      {item.headline && (
        <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-2">{item.headline}</p>
      )}
      {item.catalyst && (
        <span className="text-[10px] font-semibold rounded-md px-1.5 py-0.5 bg-[#f3f4f6] text-[#6b7280] w-fit">
          {item.catalyst}
        </span>
      )}
    </a>
  );
}

// ─── Stats card (left rail) ───────────────────────────────────────────────────

function StatsCard({ total, ups, downs, updatedAt }: { total: number; ups: number; downs: number; updatedAt: string }) {
  return (
    <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">Today</h3>
        <p className="text-[11px] text-[#9ca3af]">Updated {updatedAt}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[20px] font-semibold tabular-nums text-[#111111]">{total}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Total</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[20px] font-semibold tabular-nums text-[#10b981]">{ups}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Surging</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[20px] font-semibold tabular-nums text-[#ef4444]">{downs}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Dropping</span>
        </div>
      </div>
    </div>
  );
}

// ─── Filter pills ─────────────────────────────────────────────────────────────

type FilterKey = "all" | "up" | "down";

function FilterPills({ active, onSelect, counts }: { active: FilterKey; onSelect: (k: FilterKey) => void; counts: Record<FilterKey, number> }) {
  const pills: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "up", label: "Surging" },
    { key: "down", label: "Dropping" },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {pills.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            active === key ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          }`}
        >
          {label}
          <span className={`text-[10px] font-semibold tabular-nums ${active === key ? "text-white/70" : "text-[#9ca3af]"}`}>
            {counts[key]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnomaliesView({
  sorted,
  ups,
  downs,
  biggest,
  updatedAt,
}: {
  sorted: AnomalyItem[];
  ups: AnomalyItem[];
  downs: AnomalyItem[];
  biggest: AnomalyItem;
  updatedAt: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts: Record<FilterKey, number> = {
    all: sorted.length,
    up: ups.length,
    down: downs.length,
  };

  const displayed = filter === "all" ? sorted : filter === "up" ? ups : downs;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-x-14 gap-y-8">

      {/* Left rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <StatsCard total={sorted.length} ups={ups.length} downs={downs.length} updatedAt={updatedAt} />
        <BiggestMoverCard item={biggest} />
      </aside>

      {/* Right rail */}
      <section className="flex flex-col gap-4 min-w-0">
        <FilterPills active={filter} onSelect={setFilter} counts={counts} />

        {/* Column headers */}
        <div className="flex items-center gap-3 px-1 pb-1 border-b border-[#f3f4f6]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Ticker</span>
          </div>
          <div className="shrink-0 flex justify-end">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Change</span>
          </div>
        </div>

        <div className="flex flex-col">
          {displayed.map((item) => (
            <AnomalyRow key={item.ticker} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
