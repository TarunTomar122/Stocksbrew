"use client";

import { useState } from "react";
import { RadarLedger } from "@/components/radar-ledger";

type Tab = "holdings" | "watching";

type Suggestion = {
  ticker: string;
  name?: string;
  sector?: string;
  reason?: string;
  why?: string;
  score?: number | null;
  market?: string;
};

type Props = {
  holdings: import("@/lib/watchlist-view").WatchlistRow[];
  watching: import("@/lib/watchlist-view").WatchlistRow[];
  suggestions: Suggestion[];
  upNextSlot: React.ReactNode;
  earningsReadySlot?: React.ReactNode;
  alertsSlot: React.ReactNode;
  belowLedgerSlot?: React.ReactNode;
};

export function YourBookLayout({
  holdings,
  watching,
  suggestions,
  upNextSlot,
  earningsReadySlot,
  alertsSlot,
  belowLedgerSlot,
}: Props) {
  const [tab, setTab] = useState<Tab>(
    holdings.length === 0 && watching.length > 0 ? "watching" : "holdings",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Tab pills — full width, above the grid */}
      <div className="flex items-center gap-1.5">
        <TabButton
          active={tab === "holdings"}
          onClick={() => setTab("holdings")}
          label="Holdings"
          count={holdings.length}
        />
        <TabButton
          active={tab === "watching"}
          onClick={() => setTab("watching")}
          label="Watching"
          count={watching.length}
        />
      </div>

      {/* 2-col grid: table (fluid) + right rail (fixed) — tops aligned */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Left col: ledger + optional below-ledger slot */}
        <div className="flex flex-col gap-4">
          <RadarLedger
            holdings={holdings}
            watching={watching}
            suggestions={suggestions}
            activeTab={tab}
            onTabChange={setTab}
          />
          {belowLedgerSlot}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {upNextSlot}
          {earningsReadySlot}
          {alertsSlot}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-[#111111] text-white"
          : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-semibold tabular-nums ${
          active ? "text-white/70" : "text-[#9ca3af]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
