import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { MOCK_INTEL } from "../mock-data";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";

// mirrors FundamentalsBreakdown rings (components/fundamentals-breakdown.tsx)
export const FUND_FRAMES = 250;

const LABEL = { growth: "Growth", momentum: "Momentum", valuation: "Valuation", quality: "Quality" } as const;

// scoreColor() from fundamentals-breakdown.tsx
function scoreColor(v: number) {
  return v >= 85 ? "#047857" : v >= 60 ? "#b45309" : "#b91c1c";
}

function Ring({ score, label, from, active }: { score: number; label: string; from: number; active: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = 168, stroke = 13, r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const inP = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(inP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(inP, [0, 1], [30, 0]);

  const fillP = spring({ frame: frame - (from + 6), fps, config: { damping: 60, stiffness: 90 } });
  const shown = interpolate(fillP, [0, 1], [0, score], { extrapolateRight: "clamp" });
  const offset = circ * (1 - shown / 100);
  const color = scoreColor(score);

  return (
    <div style={{ opacity, transform: `translateY(${ty}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      borderRadius: 22, padding: "26px 14px",
      background: active ? "#f1faf6" : "transparent",
      boxShadow: active ? "inset 0 0 0 1px #b4e3d1" : "none" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.surfaceHigh} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT, fontSize: 48, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{Math.round(shown)}</span>
        </div>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: active ? 700 : 500, color: active ? T.ink : T.inkVar }}>{label}</span>
    </div>
  );
}

export function FundamentalsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pillars, overall } = MOCK_INTEL;
  const ORDER = ["growth", "momentum", "valuation", "quality"] as const;

  const sP = spring({ frame: frame - 26, fps, config: { damping: 200 } });
  const displayOverall = (interpolate(sP, [0, 1], [0, overall.score], { extrapolateRight: "clamp" })).toFixed(1);

  return (
    <Backdrop>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 130px", gap: 46 }}>
        <SpringIn from={0} direction="up" distance={24}>
          <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 40, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em" }}>
            Is it growing? Overpriced?{" "}
            <span style={{ color: T.ink, fontWeight: 800 }}>The fundamentals, scored.</span>
          </div>
        </SpringIn>

        <SpringIn from={14} direction="up" distance={44} scaleFrom={0.97} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1180 }}>
          <div style={{ background: T.surface, borderRadius: 28, padding: "44px 52px", boxShadow: "0 30px 70px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)", border: "1px solid rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 36 }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#047857" }}>Fundamentals</span>
              <span style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                {displayOverall} <span style={{ fontSize: 20, fontWeight: 500, color: T.inkVar }}>/ 100 vs peers</span>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {ORDER.map((name, i) => (
                <Ring key={name} score={pillars[name].score} label={LABEL[name]} from={36 + i * 16} active={name === "growth"} />
              ))}
            </div>
          </div>
        </SpringIn>
      </AbsoluteFill>
    </Backdrop>
  );
}
