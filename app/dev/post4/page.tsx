"use client";

import { notFound } from "next/navigation";
import { WatchlistGrid } from "@/components/watchlist-grid";
import type { WatchlistRow } from "@/lib/watchlist-view";

const BASE = {
  alerts: [], catalysts: [],
  brief_tile: { micro: "Moving higher", vibe: "up" as const, source: "rules" as const },
  coverage_status: "ready" as const,
  has_intel_pro: true,
};

const ROWS: WatchlistRow[] = [
  { ...BASE, instrument_id: "nvda-us", ticker: "NVDA", position_type: "holding",   market: "US", sector_label: "Technology",             industry_label: "Semiconductors",    currency: "USD", price: 875.40, day_change_pct:  2.86, day_change_abs:  24.36, scores: { overall: 78, verdict: "strong", valuation: 51, growth: 87, quality: 83, momentum: 72 } },
  { ...BASE, instrument_id: "meta-us", ticker: "META", position_type: "holding",   market: "US", sector_label: "Communication Services", industry_label: "Internet Media",     currency: "USD", price: 504.88, day_change_pct:  2.31, day_change_abs:  11.40, scores: { overall: 76, verdict: "solid",  valuation: 62, growth: 81, quality: 84, momentum: 73 } },
  { ...BASE, instrument_id: "msft-us", ticker: "MSFT", position_type: "holding",   market: "US", sector_label: "Technology",             industry_label: "Software",           currency: "USD", price: 418.72, day_change_pct:  1.12, day_change_abs:   4.63, scores: { overall: 74, verdict: "solid",  valuation: 53, growth: 76, quality: 91, momentum: 69 } },
  { ...BASE, instrument_id: "amd-us",  ticker: "AMD",  position_type: "watchlist", market: "US", sector_label: "Technology",             industry_label: "Semiconductors",    currency: "USD", price: 153.22, day_change_pct:  3.14, day_change_abs:   4.65, scores: { overall: 65, verdict: "solid",  valuation: 44, growth: 74, quality: 69, momentum: 76 } },
  { ...BASE, instrument_id: "aapl-us", ticker: "AAPL", position_type: "watchlist", market: "US", sector_label: "Technology",             industry_label: "Consumer Electronics",currency: "USD", price: 189.30, day_change_pct:  0.74, day_change_abs:   1.39, scores: { overall: 71, verdict: "solid",  valuation: 58, growth: 64, quality: 88, momentum: 65 } },
  { ...BASE, instrument_id: "amzn-us", ticker: "AMZN", position_type: "watchlist", market: "US", sector_label: "Consumer Discretionary", industry_label: "E-Commerce",         currency: "USD", price: 188.52, day_change_pct:  0.55, day_change_abs:   1.03, scores: { overall: 72, verdict: "solid",  valuation: 60, growth: 78, quality: 78, momentum: 68 } },
  { ...BASE, instrument_id: "googl-us",ticker: "GOOGL",position_type: "watchlist", market: "US", sector_label: "Communication Services", industry_label: "Internet Services",  currency: "USD", price: 166.38, day_change_pct: -0.18, day_change_abs:  -0.30, brief_tile: { micro: "Flat session", vibe: "down" as const, source: "rules" as const }, alerts: [], catalysts: [], coverage_status: "ready" as const, has_intel_pro: true, scores: { overall: 70, verdict: "solid",  valuation: 68, growth: 69, quality: 85, momentum: 61 } },
  { ...BASE, instrument_id: "tsla-us", ticker: "TSLA", position_type: "watchlist", market: "US", sector_label: "Consumer Discretionary", industry_label: "Auto Manufacturers", currency: "USD", price: 175.14, day_change_pct: -1.42, day_change_abs:  -2.52, brief_tile: { micro: "Under pressure", vibe: "down" as const, source: "rules" as const }, alerts: [], catalysts: [], coverage_status: "ready" as const, has_intel_pro: true, scores: { overall: 49, verdict: "mixed",  valuation: 31, growth: 58, quality: 54, momentum: 43 } },
];

export default function Post4() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="h-screen overflow-hidden flex flex-col gap-6 bg-[#f6f7f9] px-64 py-24">

      {/* Logo */}
      <div className="flex-shrink-0">
        <span className="text-[20px] font-semibold text-[#111215] tracking-[-0.04em]">stocksbrew</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-10 min-h-0 items-center overflow-hidden">

        {/* Left */}
        <div className="w-[36%] flex-shrink-0 flex flex-col gap-5">
          <h2 className="text-[62px] font-black tracking-tighter leading-[1.0] text-[#111215]">
            Your radar.<br />
            <span className="text-[#6b38d4]">Ranked.</span>
          </h2>
          <p className="text-[15px] font-medium leading-[1.65] text-[#6b7280] max-w-[320px]">
            Every stock you track with growth, quality, momentum and valuation scores all in one table.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {[
              { label: "Stocks tracked", value: "8" },
              { label: "Up today",       value: "6 ↑" },
              { label: "Best score",     value: "78" },
              { label: "Biggest move",   value: "+3.1%" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white border border-[#e5e7eb] px-4 py-3">
                <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#9ca3af]">{label}</p>
                <p className="text-[20px] font-black tabular-nums text-[#111215] mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 overflow-hidden">
          <WatchlistGrid rows={ROWS} />
        </div>

      </div>
    </div>
  );
}
