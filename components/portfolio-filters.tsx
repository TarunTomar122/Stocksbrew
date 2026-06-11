"use client";

import type { PortfolioPositionFilter } from "@/lib/portfolio-book";

const FILTERS: { key: PortfolioPositionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "holding", label: "Holdings" },
  { key: "watchlist", label: "Watching" },
];

export function PortfolioFilters({
  value,
  onChange,
  counts,
}: {
  value: PortfolioPositionFilter;
  onChange: (next: PortfolioPositionFilter) => void;
  counts: { all: number; holding: number; watchlist: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map(({ key, label }) => {
        const active = value === key;
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
            }`}
          >
            {label}
            <span className={`text-[10px] tabular-nums ${active ? "text-white/70" : "text-[#9ca3af]"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
