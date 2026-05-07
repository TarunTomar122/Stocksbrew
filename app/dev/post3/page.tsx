import { notFound } from "next/navigation";
import { StrategicDirectiveDemo } from "@/components/strategic-directive";
import type { Directive } from "@/lib/stock";

const DIRECTIVE: Directive = {
  stance: "accumulate",
  text: "Accumulate on any dip below $850",
  rationale: "Blackwell GPU ramp is ahead of schedule and Q2 earnings in 3 weeks could be a significant catalyst. Institutional flow remains bullish with volume 40% above average. Data center demand stays structurally strong through 2025.",
  confidence: "high",
  trigger_type: "price_below",
  trigger_value: "850",
};

export default function Post3() {
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
            Your AI<br />
            <span className="text-[#6b38d4]">picks a side.</span>
          </h2>
          <p className="text-[15px] font-medium leading-[1.65] text-[#6b7280] max-w-[320px]">
            A clear stance, a reason, and a price trigger. Not noise. An actual call you can act on.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {[
              { label: "Stance",     value: "Accumulate", color: "#065f46", bg: "#ecfdf5" },
              { label: "Confidence", value: "High",       color: "#6b38d4", bg: "#f3f0ff" },
              { label: "Trigger",    value: "< $850",     color: "#111215", bg: "#f0f1f3" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="flex items-center justify-between rounded-xl bg-white border border-[#e5e7eb] px-4 py-2.5">
                <span className="text-[12px] font-semibold text-[#9ca3af] tracking-wide uppercase">{label}</span>
                <span className="text-[13px] font-bold px-2.5 py-1 rounded-lg" style={{ color, background: bg }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 flex flex-col gap-4">

          {/* Directive card — the real component */}
          <StrategicDirectiveDemo ticker="NVDA" directive={DIRECTIVE} />

          {/* Supporting row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9ca3af] mb-1">Overall Score</p>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-black text-[#10b981] tabular-nums leading-none">78</span>
                <span className="text-[13px] text-[#9ca3af]">/ 100</span>
              </div>
              <p className="text-[11px] font-semibold text-[#6b7280] mt-0.5">Strong · Bullish</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9ca3af] mb-1">Next Catalyst</p>
              <p className="text-[14px] font-bold text-[#111215] leading-tight">Q2 Earnings</p>
              <p className="text-[11px] text-[#6b7280] mt-0.5">May 28 · 3 weeks away</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9ca3af] mb-1">Volume</p>
              <p className="text-[28px] font-black text-[#111215] tabular-nums leading-none">+40%</p>
              <p className="text-[11px] text-[#6b7280] mt-0.5">Above 30-day avg</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
