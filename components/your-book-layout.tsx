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
  earningsReadySlot?: React.ReactNode;
  belowLedgerSlot?: React.ReactNode;
  preferRadarSignals?: boolean;
  radarSignalsByInstrumentId?: Record<string, import("@/lib/radar-row-signals").RadarRowSignal>;
};

export function YourBookLayout({
  holdings,
  watching,
  suggestions,
  earningsReadySlot,
  belowLedgerSlot,
  preferRadarSignals = false,
  radarSignalsByInstrumentId = {},
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

      {/* Table scroll stays in left column; rail never clips on mid-size desktops */}
      <div
        className={`grid w-full min-w-0 grid-cols-1 gap-5 items-start ${
          earningsReadySlot ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,280px)]" : ""
        }`}
      >
        {/* Left col: ledger + optional below-ledger slot */}
        <div className="flex min-w-0 flex-col gap-4">
          <RadarLedger
            holdings={holdings}
            watching={watching}
            suggestions={suggestions}
            activeTab={tab}
            onTabChange={setTab}
            preferRadarSignals={preferRadarSignals}
            radarSignalsByInstrumentId={radarSignalsByInstrumentId}
          />
          {belowLedgerSlot}
        </div>

        {/* Right rail — earnings banners only */}
        {earningsReadySlot ? (
          <div className="flex min-w-0 w-full flex-col gap-4">{earningsReadySlot}</div>
        ) : null}
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
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
        active
          ? "bg-on-surface text-surface"
          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-semibold tabular-nums ${
          active ? "text-white/70" : "text-on-surface-variant"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
