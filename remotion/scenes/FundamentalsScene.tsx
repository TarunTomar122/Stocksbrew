import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { MOCK_INTEL } from "../mock-data";
import { FONT } from "../fonts";

const BG = "#f6f7f9";
const CARD_BG = "#ffffff";
const BORDER = "#e5e7eb";
const TEXT = "#111215";
const MUTED = "#6b7280";
const LIGHT_MUTED = "#9ca3af";

const PILLAR_CONFIG = {
  growth:    { emoji: "🌱", bg: "#f0fdf4", label: "Growth",    verdict_label: "Strong" },
  momentum:  { emoji: "🚀", bg: "#eff6ff", label: "Momentum",  verdict_label: "Solid" },
  valuation: { emoji: "🏷️", bg: "#fef3c7", label: "Valuation", verdict_label: "Mixed" },
  quality:   { emoji: "🏛️", bg: "#f3f4f6", label: "Quality",   verdict_label: "Strong" },
} as const;

function scoreColor(v: number) {
  if (v >= 80) return "#10b981";
  if (v >= 60) return "#111215";
  if (v >= 40) return "#6b7280";
  return "#ef4444";
}

function scoreFill(v: number) {
  if (v >= 80) return "#10b981";
  if (v >= 60) return "#6b38d4";
  if (v >= 40) return "#f59e0b";
  return "#ef4444";
}

function verdictLabel(v: string) {
  return { strong: "Strong", solid: "Solid", mixed: "Mixed", weak: "Weak" }[v] ?? v;
}

function AnimatedScoreBar({ score, startFrame }: { score: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - startFrame, fps: 30, config: { damping: 200 } });
  const width = interpolate(progress, [0, 1], [0, score], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "relative", height: 6, borderRadius: 99, background: "#f3f4f6", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "0 auto 0 0",
          borderRadius: 99,
          background: scoreFill(score),
          width: `${width}%`,
        }}
      />
    </div>
  );
}

function PillarCard({ name, score, verdict, from }: { name: keyof typeof PILLAR_CONFIG; score: number; verdict: string; from: number }) {
  const cfg = PILLAR_CONFIG[name];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(progress, [0, 1], [50, 0]);

  const scoreProgress = spring({ frame: frame - (from + 10), fps, config: { damping: 200 } });
  const displayScore = Math.round(interpolate(scoreProgress, [0, 1], [0, score], { extrapolateRight: "clamp" }));

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${ty}px)`,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        padding: "24px 22px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        flex: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
          {cfg.emoji}
        </div>
        <span style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: scoreColor(score), letterSpacing: "-0.03em", lineHeight: 1 }}>
          {displayScore}
        </span>
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: TEXT, marginBottom: 10 }}>
          {cfg.label}
        </div>
        <AnimatedScoreBar score={score} startFrame={from + 15} />
        <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 8 }}>
          {verdictLabel(verdict)}
        </div>
      </div>
    </div>
  );
}

export function FundamentalsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pillars, overall } = MOCK_INTEL;
  const PILLAR_ORDER = ["growth", "momentum", "valuation", "quality"] as const;

  const scoreProgress = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  const displayOverall = Math.round(interpolate(scoreProgress, [0, 1], [0, overall.score], { extrapolateRight: "clamp" }));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        padding: "72px 140px",
        gap: 44,
      }}
    >
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center" as const, fontFamily: FONT, fontSize: 22, fontWeight: 500, color: MUTED, letterSpacing: "-0.01em" }}>
          Is it growing? Is it overpriced?{" "}
          <span style={{ color: TEXT, fontWeight: 700 }}>tikrr breaks down the fundamentals for you.</span>
        </div>
      </SpringIn>

      <SpringIn from={15} direction="up" distance={40} style={{ width: "100%", maxWidth: 1000 }}>
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 24,
            padding: "36px 40px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
            {/* Overall score */}
            <div style={{ flexShrink: 0, minWidth: 200 }}>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: LIGHT_MUTED, marginBottom: 8 }}>
                Fundamentals score
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: FONT, fontSize: 72, fontWeight: 800, color: scoreColor(overall.score), letterSpacing: "-0.04em", lineHeight: 1 }}>
                  {displayOverall}
                </span>
                <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 500, color: LIGHT_MUTED }}>/ 100</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: MUTED }}>
                Strong · Bullish-tilted
              </div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED, lineHeight: 1.6, marginTop: 12, maxWidth: 190 }}>
                Composite of valuation, growth, quality &amp; momentum.
              </div>
            </div>

            {/* 4 pillar cards */}
            <div style={{ display: "flex", gap: 16, flex: 1 }}>
              {PILLAR_ORDER.map((name, i) => (
                <PillarCard key={name} name={name} score={pillars[name].score} verdict={pillars[name].verdict} from={40 + i * 20} />
              ))}
            </div>
          </div>
        </div>
      </SpringIn>
    </div>
  );
}
