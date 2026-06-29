import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { Logo } from "../components/Logo";
import { MOCK_WHY, MOCK_INTEL, MOCK_RADAR } from "../mock-data";

// Theme-aware feature blocks reused across the variations. Each fills its
// container width; parents handle scale + entrance animation.
export type Theme = "light" | "dark";
export const PAL = {
  light: { surface: "#ffffff", ink: "#111215", inkVar: "#3b4048", dim: "#9aa3af", outline: "rgba(0,0,0,0.07)", track: "#eaebed", green: "#047857", shadow: "0 18px 50px rgba(17,24,39,0.08)" },
  dark: { surface: "#0f1512", ink: "#f4f7f6", inkVar: "#9aa3af", dim: "#6b7672", outline: "rgba(255,255,255,0.08)", track: "#202a25", green: "#34d399", shadow: "0 24px 60px rgba(0,0,0,0.5)" },
} as const;

const card = (t: Theme, extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: PAL[t].surface, borderRadius: 24, border: `1px solid ${PAL[t].outline}`,
  boxShadow: PAL[t].shadow, padding: "30px 32px", display: "flex", flexDirection: "column", gap: 16, ...extra,
});
const kick = (t: Theme): React.CSSProperties => ({ fontFamily: MONO, fontSize: 17, letterSpacing: "0.12em", textTransform: "uppercase", color: PAL[t].inkVar });

function Dots({ t }: { t: Theme }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {[1, 2, 3].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 99, background: PAL[t].green }} />)}
      <span style={{ fontFamily: MONO, fontSize: 15, color: PAL[t].inkVar, marginLeft: 4 }}>high</span>
    </span>
  );
}

export function AnomalyCard({ t }: { t: Theme }) {
  const W = MOCK_WHY;
  return (
    <div style={card(t)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={kick(t)}>today&apos;s move</span>
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: PAL[t].green }}>▲ +{W.dayPct}%</span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: PAL[t].ink }}>{W.todaysMove.headline}</span>
      <Dots t={t} />
      <span style={{ fontFamily: FONT, fontSize: 20, lineHeight: 1.55, color: PAL[t].inkVar }}>{W.todaysMove.body}</span>
    </div>
  );
}

export function RedditCard({ t }: { t: Theme }) {
  const W = MOCK_WHY;
  return (
    <div style={card(t)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: PAL[t].ink }}>Reddit Buzz</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, border: `1px solid ${PAL[t].outline}`, padding: "6px 14px", fontFamily: FONT, fontSize: 15, fontWeight: 700, color: PAL[t].inkVar }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "#ff4500" }} /> r/stocks &amp; more
        </span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 17, color: PAL[t].dim }}>{W.reddit.scanned} posts scanned · {W.reddit.ago}</span>
      <div style={{ borderTop: `1px solid ${PAL[t].outline}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, lineHeight: 1.35, color: PAL[t].ink }}>{W.reddit.post.title}</span>
        <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "#3b82f6" }}>r/{W.reddit.post.subreddit}</span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 19, lineHeight: 1.5, color: PAL[t].inkVar }}>{W.reddit.rollup}</span>
    </div>
  );
}

export function EarningsCard({ t }: { t: Theme }) {
  const W = MOCK_WHY;
  const bg = t === "dark" ? "linear-gradient(160deg,#1c1707,#15120a 60%,#0f1512)" : "linear-gradient(160deg,#fffbeb,#fff7ed 55%,#ffffff)";
  const amber = t === "dark" ? "#fbbf24" : "#b45309";
  return (
    <div style={card(t, { background: bg, border: `1px solid ${t === "dark" ? "#4d3a12" : "#fde68a"}` })}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: t === "dark" ? "#241d08" : "#fff", border: `1px solid ${t === "dark" ? "#4d3a12" : "#fde68a"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>📅</span>
        <span style={{ fontFamily: FONT, fontSize: 23, fontWeight: 800, color: PAL[t].ink }}>Upcoming earnings</span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 28, fontWeight: 800, color: amber }}>{W.earnings.when}</span>
      <span style={{ fontFamily: FONT, fontSize: 20, lineHeight: 1.55, color: PAL[t].inkVar }}>{W.earnings.prediction}</span>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: amber }}>Pre-earnings prediction →</span>
    </div>
  );
}

function ringColor(v: number) { return v >= 85 ? "#047857" : v >= 60 ? "#b45309" : "#b91c1c"; }

export function Rings({ t, from = 0 }: { t: Theme; from?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ORDER = ["growth", "momentum", "valuation", "quality"] as const;
  const LABEL = { growth: "Growth", momentum: "Momentum", valuation: "Valuation", quality: "Quality" } as const;
  const size = 150, stroke = 12, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  return (
    <div style={card(t, { padding: "34px 38px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <span style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.12em", textTransform: "uppercase", color: PAL[t].green }}>Fundamentals</span>
        <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: PAL[t].ink }}>{MOCK_INTEL.overall.score}.0 <span style={{ fontSize: 18, color: PAL[t].inkVar, fontWeight: 500 }}>/ 100 vs peers</span></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {ORDER.map((name, i) => {
          const score = MOCK_INTEL.pillars[name].score;
          const p = spring({ frame: frame - (from + i * 8), fps, config: { damping: 60, stiffness: 90 } });
          const shown = interpolate(p, [0, 1], [0, score], { extrapolateRight: "clamp" });
          return (
            <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative", width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PAL[t].track} strokeWidth={stroke} />
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor(score)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - shown / 100)} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 42, fontWeight: 800, color: PAL[t].ink, fontVariantNumeric: "tabular-nums" }}>{Math.round(shown)}</div>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, color: PAL[t].inkVar }}>{LABEL[name]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STANCE_MINI: Record<string, { label: string; bg: string; fg: string }> = {
  accumulate: { label: "Accumulate", bg: "#e7f8f1", fg: "#047857" },
  hold: { label: "Hold", bg: "#f0f1f3", fg: "#3b4048" },
  watch: { label: "Watch", bg: "#e8eefc", fg: "#1e3a8a" },
  avoid: { label: "Avoid", bg: "#fdeaea", fg: "#b91c1c" },
  trim: { label: "Trim", bg: "#fef3da", fg: "#b45309" },
};

export function RadarRows({ t, count = 4, from = 0 }: { t: Theme; count?: number; from?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={card(t, { padding: "12px 28px" })}>
      {MOCK_RADAR.slice(0, count).map((row, i) => {
        const p = spring({ frame: frame - (from + i * 8), fps, config: { damping: 200 } });
        const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
        const x = interpolate(p, [0, 1], [40, 0]);
        const up = row.changePct >= 0;
        const m = STANCE_MINI[row.stance];
        return (
          <div key={row.ticker} style={{ opacity: o, transform: `translateX(${x}px)`, display: "flex", alignItems: "center", gap: 18, padding: "18px 0", borderTop: i === 0 ? "none" : `1px solid ${PAL[t].outline}` }}>
            <Logo ticker={row.ticker} size={44} radius={11} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: PAL[t].ink }}>{row.ticker}</div>
              <div style={{ fontFamily: FONT, fontSize: 16, color: PAL[t].inkVar }}>{row.name}</div>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: up ? "#10b981" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>{up ? "▲" : "▼"} {Math.abs(row.changePct).toFixed(2)}%</div>
            <span style={{ minWidth: 150, textAlign: "center", padding: "8px 18px", borderRadius: 999, background: t === "dark" ? "transparent" : m.bg, border: t === "dark" ? `1px solid ${PAL.dark.outline}` : "none", color: t === "dark" ? PAL.dark.ink : m.fg, fontFamily: FONT, fontSize: 17, fontWeight: 800 }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}
