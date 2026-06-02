"use client";

import { notFound } from "next/navigation";
import type { StockIntelPro } from "@/lib/types";
import { PillarBreakdown } from "@/components/pillar-breakdown";

const PILLARS: StockIntelPro["pillars"] = {
  growth:    { score: 87, verdict: "strong", weight: 0.3,  metrics: [
    { label: "Revenue YoY",  value: 85.5,  benchmark: 12.4, benchmark_label: "sector avg", signal: "green",  summary: "Exceptional", score: 92 },
    { label: "EPS Growth",   value: 120.4, benchmark: 18.2, benchmark_label: "sector avg", signal: "green",  summary: "Exceptional", score: 95 },
    { label: "FCF Margin",   value: 28.1,  benchmark: 11.6, benchmark_label: "sector avg", signal: "green",  summary: "Ahead",       score: 83 },
  ]},
  momentum:  { score: 72, verdict: "solid",  weight: 0.25, metrics: [
    { label: "1Y Return",    value: 97.4,  benchmark: 22.1, benchmark_label: "S&P 500",    signal: "green",  summary: "Exceptional", score: 88 },
    { label: "RSI (14)",     value: 76.2,  benchmark: 55.0, benchmark_label: "sector avg", signal: "yellow", summary: "Elevated",    score: 68 },
    { label: "Short Float %",value: 1.8,   benchmark: 3.4,  benchmark_label: "sector avg", signal: "green",  summary: "Low shorts",  score: 74 },
  ]},
  valuation: { score: 51, verdict: "mixed",  weight: 0.25, metrics: [
    { label: "P/E TTM",      value: 65.2,  benchmark: 27.8, benchmark_label: "sector avg", signal: "red",    summary: "Expensive",   score: 32 },
    { label: "PEG Ratio",    value: 0.54,  benchmark: 1.2,  benchmark_label: "sector avg", signal: "green",  summary: "Ahead",       score: 78 },
    { label: "EV / Revenue", value: 24.1,  benchmark: 6.8,  benchmark_label: "sector avg", signal: "red",    summary: "Premium",     score: 28 },
  ]},
  quality:   { score: 83, verdict: "strong", weight: 0.2,  metrics: [
    { label: "ROE",          value: 89.3,  benchmark: 18.4, benchmark_label: "sector avg", signal: "green",  summary: "Exceptional", score: 94 },
    { label: "Gross Margin", value: 73.4,  benchmark: 51.2, benchmark_label: "sector avg", signal: "green",  summary: "Ahead",       score: 82 },
    { label: "Debt / Equity",value: 0.39,  benchmark: 0.62, benchmark_label: "sector avg", signal: "green",  summary: "Healthy",     score: 71 },
  ]},
};

export default function Post2() {
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
            Is it<br />
            <span className="text-[#6b38d4]">overpriced?</span>
          </h2>
          <p className="text-[15px] font-medium leading-[1.65] text-[#6b7280] max-w-[320px]">
            Growth, momentum, valuation, quality. Scored against sector peers so you know where it really stands.
          </p>
          {/* Score callout */}
          <div className="mt-2 rounded-2xl bg-white border border-[#e5e7eb] px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af] mb-1">NVDA Overall</p>
              <p className="text-[12px] font-bold text-[#6b7280]">Strong · Bullish-tilted</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[44px] font-black tabular-nums text-[#10b981] leading-none">78</span>
              <span className="text-[16px] text-[#9ca3af]">/ 100</span>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col min-h-0">
          <div className="px-6 pt-5 pb-2 border-b border-[#f3f4f6] flex-shrink-0">
            <p className="text-[15px] font-bold text-[#111215]">Pillar breakdown <span className="text-[#9ca3af] font-normal">NVDA</span></p>
          </div>
          <div className="px-6 overflow-hidden flex-1 min-h-0">
            <PillarBreakdown pillars={PILLARS} isSubscribed={true} />
          </div>
        </div>

      </div>
    </div>
  );
}
