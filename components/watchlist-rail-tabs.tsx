"use client";

import Link from "next/link";
import { useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { WatchlistRow } from "@/lib/watchlist-view";

type Tab = "holdings" | "watching";

type Props = {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
};

export function WatchlistRailTabs({ holdings, watching }: Props) {
  const initial: Tab = holdings.length > 0 ? "holdings" : "watching";
  const [active, setActive] = useState<Tab>(initial);
  const rows = active === "holdings" ? holdings : watching;
  const empty =
    active === "holdings"
      ? "No holdings yet. Mark a Watchlist stock as a holding."
      : "Nothing in Watching yet. Add names from any stock page.";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 rounded-full bg-[#f3f4f6] p-1">
        <Tab
          label={`Holdings · ${holdings.length}`}
          active={active === "holdings"}
          onClick={() => setActive("holdings")}
        />
        <Tab
          label={`Watching · ${watching.length}`}
          active={active === "watching"}
          onClick={() => setActive("watching")}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[#6b7280] py-2">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <RailRow key={row.instrument_id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
        active
          ? "bg-white text-[#111111] shadow-[0_1px_3px_rgba(17,24,39,0.08)]"
          : "text-[#6b7280] hover:text-[#111111]"
      }`}
    >
      {label}
    </button>
  );
}

function RailRow({ row }: { row: WatchlistRow }) {
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  return (
    <li className="border-t border-[#f3f4f6] first:border-t-0">
      <Link
        href={`/stock/${encodeURIComponent(row.ticker)}`}
        className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors"
      >
        <StockLogo
          ticker={row.ticker}
          logoUrl={row.logo_url}
          market={row.market === "IN" ? "IN" : "US"}
          size={28}
        />
        <div className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-[#111111]">
            {row.ticker}
          </span>
          <span className="block text-[11px] text-[#6b7280] truncate">
            {row.sector_label || row.market}
          </span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
            {formatCurrency(row.price, row.currency)}
          </span>
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              positive ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {positive ? "+" : ""}
            {dayChange.toFixed(2)}%
          </span>
        </div>
      </Link>
    </li>
  );
}

function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}
