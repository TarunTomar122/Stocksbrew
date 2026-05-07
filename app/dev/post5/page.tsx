import { notFound } from "next/navigation";
import { SignalTileCard } from "@/components/signal-tile";
import { StrategicDirectiveDemo } from "@/components/strategic-directive";
import { StockLogo } from "@/components/stock-logo";
import type { SignalTileModel } from "@/components/signal-tile";
import type { Directive } from "@/lib/stock";

const TILES: SignalTileModel[] = [
  { emoji: "📈", bg: "#ecfdf5", label: "Past 1Y",       headline: "+614.1%", supporting: "1M +57.4% · 3M +31.7%",    tone: "up"   },
  { emoji: "🔥", bg: "#fef3c7", label: "RSI Stretched", headline: "76",      supporting: "Overbought, pullback risk",  tone: "warn" },
  { emoji: "🚀", bg: "#ecfdf5", label: "52W High",      headline: "-2.8%",   supporting: "Riding the top of the range",tone: "up"  },
  { emoji: "🌱", bg: "#ecfdf5", label: "Strong Growth", headline: "100",     supporting: "Top pillar on the scorecard", tone: "up"  },
  { emoji: "💰", bg: "#ecfdf5", label: "Revenue YoY",   headline: "+85.5%",  supporting: "High-growth top line",        tone: "up"  },
  { emoji: "🏛️", bg: "#f3f4f6", label: "Quality Score", headline: "83",      supporting: "Strong balance sheet",        tone: "up"  },
];

const DIRECTIVE: Directive = {
  stance: "accumulate",
  text: "Accumulate on any dip below $850",
  rationale: "Blackwell GPU ramp ahead of schedule. Q2 earnings in 3 weeks is a significant catalyst. Institutional volume 40% above average — the smart money is buying.",
  confidence: "high",
  trigger_type: "price_below",
  trigger_value: "850",
};

export default function Post5() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="h-screen overflow-hidden flex flex-col gap-6 bg-[#f6f7f9] px-64 py-24">

      {/* Logo */}
      <div className="flex-shrink-0">
        <span className="text-[20px] font-semibold text-[#111215] tracking-[-0.04em]">tikrr</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-10 min-h-0 items-center overflow-hidden">

        {/* Left */}
        <div className="w-[36%] flex-shrink-0 flex flex-col gap-5">
          <h2 className="text-[62px] font-black tracking-tighter leading-[1.0] text-[#111215]">
            Understand<br />any stock.<br />
            <span className="text-[#6b38d4]">In 60 seconds.</span>
          </h2>
          <p className="text-[15px] font-medium leading-[1.65] text-[#6b7280] max-w-[320px]">
            Signals, fundamentals, and an AI directive. Everything you need to decide without wading through noise.
          </p>
        </div>

        {/* Right */}
        <div className="flex-1 bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col min-h-0">

          {/* Mini header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6] flex-shrink-0">
            <div className="flex items-center gap-3">
              <StockLogo ticker="NVDA" market="US" size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[18px] font-black tracking-tighter text-[#111215] leading-none">NVDA</span>
                  <span className="px-1.5 py-0.5 bg-[#f0f1f3] text-[10px] font-bold tracking-[0.1em] uppercase text-[#6b7280] rounded">NASDAQ</span>
                </div>
                <span className="text-[11px] text-[#6b7280] font-medium">NVIDIA Corporation · Semiconductors</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-black tracking-tighter text-[#111215] tabular-nums leading-none">875.40</div>
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#10b981] bg-[#ecfdf5] px-2 py-0.5 rounded-md">↑ +2.86%</div>
            </div>
          </div>

          {/* Signals */}
          <div className="px-6 py-4 border-b border-[#f3f4f6]">
            <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af] mb-3">Why care today</p>
            <div className="grid grid-cols-3 gap-2.5">
              {TILES.map((t) => <SignalTileCard key={t.label} signal={t} className="w-full h-auto" />)}
            </div>
          </div>

          {/* Fundamentals mini row */}
          <div className="px-6 py-4 border-b border-[#f3f4f6]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#9ca3af]">Fundamentals score</p>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-black text-[#10b981] tabular-nums leading-none">78</span>
                <span className="text-[12px] text-[#9ca3af]">/ 100</span>
                <span className="ml-1.5 text-[10px] font-bold tracking-wide uppercase text-[#6b7280]">Strong</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Growth",    score: 87, emoji: "🌱", bg: "#ecfdf5", color: "#10b981" },
                { label: "Momentum",  score: 72, emoji: "🚀", bg: "#eff6ff", color: "#111215" },
                { label: "Valuation", score: 51, emoji: "🏷️", bg: "#fef3c7", color: "#f59e0b" },
                { label: "Quality",   score: 83, emoji: "🏛️", bg: "#f3f4f6", color: "#10b981" },
              ].map(({ label, score, emoji, bg, color }) => (
                <div key={label} className="rounded-xl border border-[#e5e7eb] px-3 py-2.5 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: bg }}>{emoji}</div>
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#9ca3af]">{label}</p>
                    <p className="text-[16px] font-black tabular-nums leading-none" style={{ color }}>{score}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Directive */}
          <div className="px-6 py-4">
            <StrategicDirectiveDemo ticker="NVDA" directive={DIRECTIVE} />
          </div>

        </div>
      </div>
    </div>
  );
}
