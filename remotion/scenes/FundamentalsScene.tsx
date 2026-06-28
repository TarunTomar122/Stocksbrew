import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { MOCK_INTEL } from "../mock-data";
import { FONT } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";

// mirrors StockScorecard (components/stock-scorecard.tsx)
export const FUND_FRAMES = 260;

const ICON_PATHS = {
  growth: "M3 17l6-6 4 4 8-8 M17 7h4v4",
  momentum: "M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z",
  valuation: "M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z M7 7h.01",
  quality: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z M9 12l2 2 4-4",
} as const;

const PILLAR_CONFIG = {
  growth:    { icon: "growth",    accent: "#10b981", label: "Growth" },
  momentum:  { icon: "momentum",  accent: "#2563eb", label: "Momentum" },
  valuation: { icon: "valuation", accent: "#f59e0b", label: "Valuation" },
  quality:   { icon: "quality",   accent: "#3b4048", label: "Quality" },
} as const;

function PillarIcon({ name, accent }: { name: keyof typeof ICON_PATHS; accent: string }) {
  return (
    <span style={{ width: 52, height: 52, borderRadius: 14, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[name]} />
      </svg>
    </span>
  );
}

const VERDICT_COPY: Record<string, string> = { strong: "Strong", solid: "Solid", mixed: "Mixed", weak: "Weak" };

function scoreTone(v: number) {
  if (v >= 80) return "#10b981";
  if (v >= 60) return T.ink;
  if (v >= 40) return T.inkVar;
  return "#ef4444";
}
function scoreFill(v: number) {
  if (v >= 80) return "#10b981";
  if (v >= 60) return "#0052ff";
  if (v >= 40) return "#f59e0b";
  return "#ef4444";
}

function ScoreBar({ score, startFrame }: { score: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const p = spring({ frame: frame - startFrame, fps: 30, config: { damping: 200 } });
  const width = interpolate(p, [0, 1], [0, score], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", height: 9, borderRadius: 99, background: T.surfaceCt, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", borderRadius: 99, background: scoreFill(score), width: `${width}%` }} />
    </div>
  );
}

function PillarCard({ name, score, verdict, from }: { name: keyof typeof PILLAR_CONFIG; score: number; verdict: string; from: number }) {
  const cfg = PILLAR_CONFIG[name];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [40, 0]);
  const sP = spring({ frame: frame - (from + 8), fps, config: { damping: 200 } });
  const display = Math.round(interpolate(sP, [0, 1], [0, score], { extrapolateRight: "clamp" }));

  return (
    <div style={{ opacity, transform: `translateY(${ty}px)`, display: "flex", flexDirection: "column", gap: 16, borderRadius: 20, background: T.surface, padding: "26px 24px", flex: 1, boxShadow: "0 6px 20px rgba(17,24,39,0.05), inset 0 0 0 1px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <PillarIcon name={cfg.icon} accent={cfg.accent} />
        <span style={{ fontFamily: FONT, fontSize: 42, fontWeight: 700, color: scoreTone(score), letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{display}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.ink }}>{cfg.label}</span>
        <ScoreBar score={score} startFrame={from + 12} />
        <span style={{ fontFamily: FONT, fontSize: 17, color: T.inkVar }}>{VERDICT_COPY[verdict] ?? verdict}</span>
      </div>
    </div>
  );
}

export function FundamentalsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pillars, overall } = MOCK_INTEL;
  const ORDER = ["growth", "momentum", "valuation", "quality"] as const;

  const sP = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  const displayOverall = Math.round(interpolate(sP, [0, 1], [0, overall.score], { extrapolateRight: "clamp" }));

  return (
    <Backdrop>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 130px", gap: 48 }}>
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 40, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em" }}>
          Is it growing? Overpriced?{" "}
          <span style={{ color: T.ink, fontWeight: 800 }}>The fundamentals, broken down.</span>
        </div>
      </SpringIn>

      <SpringIn from={14} direction="up" distance={44} scaleFrom={0.97} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1240 }}>
        <div style={{ background: T.surface, borderRadius: 28, padding: "44px 48px", boxShadow: "0 30px 70px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)", border: "1px solid rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", gap: 56, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, width: 280 }}>
              <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar, marginBottom: 10 }}>Fundamentals score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: FONT, fontSize: 110, fontWeight: 800, color: scoreTone(overall.score), letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{displayOverall}</span>
                <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 500, color: T.inkVar }}>/ 100</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.inkVar }}>Strong · Bullish-tilted</div>
              <div style={{ fontFamily: FONT, fontSize: 19, color: T.inkVar, lineHeight: 1.6, marginTop: 16 }}>Composite of valuation, growth, quality &amp; momentum vs sector peers.</div>
            </div>

            <div style={{ display: "flex", gap: 18, flex: 1 }}>
              {ORDER.map((name, i) => (
                <PillarCard key={name} name={name} score={pillars[name].score} verdict={pillars[name].verdict} from={38 + i * 18} />
              ))}
            </div>
          </div>
        </div>
      </SpringIn>
     </AbsoluteFill>
    </Backdrop>
  );
}
