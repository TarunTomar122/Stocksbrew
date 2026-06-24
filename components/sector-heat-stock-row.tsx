"use client";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";

function pctMove(changePct: number) {
  const up = changePct >= 0;
  return {
    up,
    color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
  };
}

export function SectorHeatStockRow({
  ticker,
  instrumentId,
  changePct,
  isTracked,
  isSubscribed,
}: {
  ticker: string;
  instrumentId: string;
  changePct: number;
  isTracked: boolean;
  isSubscribed?: boolean;
}) {
  const move = pctMove(changePct);

  return (
    <div className="group relative flex w-full items-center gap-2 border-t border-outline-variant py-2 first:border-t-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md bg-surface-container-low opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      />
      <Link href={`/stock/${ticker}`} className="relative z-[1] flex min-w-0 flex-1 items-center gap-2">
        <StockLogo ticker={ticker} market="US" size={22} />
        <span className="text-[13px] font-semibold text-on-surface">{ticker}</span>
      </Link>
      <span className="relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <TrackButton
          ticker={ticker}
          instrumentId={instrumentId}
          isTracked={isTracked}
          isSubscribed={isSubscribed}
          variant="icon"
        />
      </span>
      <span
        className="relative z-[1] flex shrink-0 items-center gap-1 text-[12px] font-semibold tabular-nums"
        style={{ color: move.color }}
      >
        <span className="text-[9px] leading-none">{move.up ? "▲" : "▼"}</span>
        {Math.abs(changePct).toFixed(2)}%
      </span>
    </div>
  );
}
