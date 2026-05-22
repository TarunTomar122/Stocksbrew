"use client";

import { notFound } from "next/navigation";
import { SignalTileCard } from "@/components/signal-tile";
import { StockLogo } from "@/components/stock-logo";
import type { SignalTileModel } from "@/components/signal-tile";

const TILES: SignalTileModel[] = [
  { emoji: "📈", bg: "#ecfdf5", label: "Past 1Y",       headline: "+614.1%", supporting: "1M +57.4% · 3M +31.7%",    tone: "up"   },
  { emoji: "🔥", bg: "#fef3c7", label: "RSI Stretched", headline: "76",      supporting: "Overbought, pullback risk", tone: "warn" },
  { emoji: "🚀", bg: "#ecfdf5", label: "52W High",      headline: "-2.8%",   supporting: "Riding the top of the range", tone: "up" },
  { emoji: "🌱", bg: "#ecfdf5", label: "Strong Growth", headline: "100",     supporting: "Top pillar on the scorecard", tone: "up"  },
  { emoji: "💰", bg: "#ecfdf5", label: "Revenue YoY",   headline: "+85.5%",  supporting: "High-growth top line",       tone: "up"  },
  { emoji: "🏛️", bg: "#f3f4f6", label: "Quality Score", headline: "83",      supporting: "Strong balance sheet",       tone: "up"  },
];

const RANGE_PCT = ((576.45 - 78.54) / (592.80 - 78.54)) * 100; // ~96.9%
const RSI_PCT   = 76.2;

export default function Post1() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="h-screen overflow-hidden flex flex-col gap-6 bg-[#f6f7f9] px-64 py-24">

      {/* Logo */}
      <div className="flex-shrink-0">
        <span className="text-[20px] font-semibold text-[#111215] tracking-[-0.04em]">stocksbrew</span>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 gap-10 min-h-0">

        {/* Left */}
        <div className="w-[36%] flex-shrink-0 flex flex-col justify-between">

          {/* Top chip */}
          <div className="flex items-center gap-2.5 bg-white border border-[#e5e7eb] rounded-full px-4 py-2 w-fit shadow-sm">
            <StockLogo ticker="NVDA" market="US" size={24} />
            <span className="text-[13px] font-bold text-[#111215]">NVDA</span>
            <span className="text-[13px] font-semibold text-[#10b981]">↑ +2.86%</span>
          </div>

          {/* Headline */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[72px] font-black tracking-tighter leading-[1.0] text-[#111215]">
              Any stock.<br />
              <span className="text-[#6b38d4]">in 30 seconds</span>
            </h2>
            <p className="text-[15px] font-medium leading-[1.65] text-[#6b7280] max-w-[320px]">
              5 signals that tell you exactly what is happening with any stock. No jargon, no noise.
            </p>
          </div>

          {/* Bottom stat chips */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "1Y Return",    value: "+614%",  color: "#10b981" },
              { label: "Fundamentals", value: "78/100", color: "#6b38d4" },
              { label: "RSI",          value: "76.2",   color: "#b45309" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-[#e5e7eb] rounded-xl px-3 py-3 shadow-sm">
                <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#9ca3af] mb-1">{label}</p>
                <p className="text-[18px] font-black tabular-nums leading-none" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: product UI card */}
        <div className="flex-1 bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col min-h-0">

          {/* Stock header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#f3f4f6] flex-shrink-0">
            <div className="flex items-center gap-3">
              <StockLogo ticker="NVDA" market="US" size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[18px] font-black tracking-tighter text-[#111215] leading-none">NVDA</span>
                  <span className="px-1.5 py-0.5 bg-[#f0f1f3] text-[10px] font-bold tracking-[0.1em] uppercase text-[#6b7280] rounded">NASDAQ</span>
                  <span className="px-1.5 py-0.5 bg-[#6b38d4]/10 text-[#6b38d4] text-[10px] font-bold tracking-[0.08em] uppercase rounded-md">S&amp;P 500</span>
                </div>
                <span className="text-[11px] text-[#6b7280] font-medium">NVIDIA Corporation · Technology · Semiconductors</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[24px] font-black tracking-tighter text-[#111215] tabular-nums leading-none">875.40</div>
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#10b981] bg-[#ecfdf5] px-2 py-0.5 rounded-lg">↑ +2.86% today</div>
            </div>
          </div>

          {/* Signal tiles */}
          <div className="px-5 pt-4 pb-3 flex-shrink-0">
            <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af] mb-2.5">Why care today</p>
            <div className="grid grid-cols-3 gap-2.5">
              {TILES.map((t) => <SignalTileCard key={t.label} signal={t} className="w-full h-auto" />)}
            </div>
          </div>

          {/* Range + RSI side by side */}
          <div className="mx-5 mb-5 grid grid-cols-2 gap-3" style={{ height: 160 }}>

            {/* 52-week range */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-5 py-4 flex flex-col justify-between">
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af]">52-Week Range</p>
              <div>
                <div className="flex justify-between mb-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase text-[#9ca3af]">Low</p>
                    <p className="text-[14px] font-bold text-[#111215]">$78.54</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase text-[#9ca3af]">High</p>
                    <p className="text-[14px] font-bold text-[#111215]">$592.80</p>
                  </div>
                </div>
                {/* Track: gradient bar with marker on top - no overflow-hidden on the outer */}
                <div className="relative" style={{ height: 12 }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg,#f97316 0%,#f59e0b 22%,#84cc16 55%,#10b981 100%)" }} />
                  <div
                    className="absolute w-5 h-5 rounded-full bg-white z-10"
                    style={{ left: `${RANGE_PCT}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)", boxShadow: "0 0 0 2.5px #111215" }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#6b7280] mt-2">Today <strong className="text-[#111215]">$576.45</strong> - near the 52W high</p>
            </div>

            {/* RSI */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-5 py-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af]">RSI (14)</p>
                <span className="text-[10px] font-bold uppercase text-[#dc2626] bg-[#fef2f2] px-2 py-0.5 rounded-lg">Overbought</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[34px] font-black tabular-nums text-[#111215] leading-none">76.2</span>
                <span className="text-[12px] text-[#6b7280]">Pullback risk</span>
              </div>
              {/* Track: zones inside overflow-hidden, marker as sibling outside */}
              <div>
                <div className="relative" style={{ height: 12 }}>
                  {/* Zone fill layer - clipped */}
                  <div className="absolute inset-0 rounded-full overflow-hidden bg-[#f3f4f6]">
                    <div className="absolute inset-y-0 left-0 w-[30%] bg-[#ef4444]/20" />
                    <div className="absolute inset-y-0 left-[30%] w-[40%]" style={{ background: "linear-gradient(90deg,#84cc16,#10b981)", opacity: 0.85 }} />
                    <div className="absolute inset-y-0 right-0 w-[30%] bg-[#ef4444]/20" />
                  </div>
                  {/* Marker on top - outside the overflow-hidden zone div */}
                  <div
                    className="absolute w-5 h-5 rounded-full bg-white z-10"
                    style={{ left: `${RSI_PCT}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)", boxShadow: "0 0 0 2.5px #111215" }}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-bold tracking-[0.08em] uppercase text-[#9ca3af] mt-2">
                  <span>Oversold</span><span>Healthy</span><span>Overbought</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
