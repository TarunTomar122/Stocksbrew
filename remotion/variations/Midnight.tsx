import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { FONT, MONO } from "../fonts";
import { Logo } from "../components/Logo";
import { AnomalyCard, RedditCard, Rings, RadarRows } from "./features";

// Variation 2 — "Midnight": dark cinematic keynote. Deep black, neon-green glow,
// one dramatic verdict reveal. 1920x1080.
const BG = "#06080a";
const NEON = "#34d399";
const WHITE = "#f4f7f6";
const DIM = "#7c8a86";

function Dark({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 60% at 50% 45%, ${NEON}14 0%, transparent 70%)` }} />
      {children}
    </AbsoluteFill>
  );
}

function ThesisScene() {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  // faint ticker drifting in the dark
  const items = "NVDA  AAPL  TSLA  MSFT  META  AMD  AMZN  INTC  ".repeat(8);
  const tx = -((frame * 1.4) % 900);
  const lineP = spring({ frame: frame - 18, fps, config: { damping: 26, stiffness: 110 } });
  const o = interpolate(lineP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(lineP, [0, 1], [26, 0]);
  const fade = interpolate(frame, [70, 88], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Dark>
      <div style={{ position: "absolute", top: "32%", left: 0, right: 0, whiteSpace: "nowrap", opacity: 0.05, fontFamily: MONO, fontSize: 40, color: WHITE, transform: `translateX(${tx}px)` }}>{items}</div>
      <div style={{ position: "absolute", top: "60%", left: 0, right: 0, whiteSpace: "nowrap", opacity: 0.05, fontFamily: MONO, fontSize: 40, color: WHITE, transform: `translateX(${-tx - 300}px)` }}>{items}</div>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: fade }}>
        <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 96, fontWeight: 800, color: WHITE, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.04 }}>
          Every move<br />has a <span style={{ color: NEON }}>reason.</span>
        </div>
      </AbsoluteFill>
    </Dark>
  );
}

function VerdictScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kP = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const headO = interpolate(kP, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const vP = spring({ frame: frame - 22, fps, config: { damping: 18, stiffness: 120 } });
  const vO = interpolate(vP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const vS = interpolate(vP, [0, 1], [0.8, 1], { extrapolateRight: "clamp" });
  const glow = interpolate(frame, [22, 60], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dotsP = spring({ frame: frame - 44, fps, config: { damping: 200 } });
  const dotsO = interpolate(dotsP, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const lineP = spring({ frame: frame - 56, fps, config: { damping: 200 } });
  const lineO = interpolate(lineP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const lineTy = interpolate(lineP, [0, 1], [16, 0]);

  return (
    <Dark>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ opacity: headO, display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
          <Logo ticker="NVDA" size={48} radius={12} />
          <span style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: WHITE }}>NVDA</span>
          <span style={{ fontFamily: MONO, fontSize: 22, color: NEON }}>▲ +2.86%</span>
        </div>
        <div style={{ opacity: headO, fontFamily: MONO, fontSize: 20, letterSpacing: "0.26em", textTransform: "uppercase", color: DIM, marginBottom: 14 }}>Our call</div>
        <div style={{ opacity: vO, transform: `scale(${vS})`, fontFamily: FONT, fontSize: 168, fontWeight: 800, color: NEON, letterSpacing: "-0.05em", lineHeight: 0.92, textShadow: `0 0 ${60 * glow}px ${NEON}80` }}>
          Accumulate
        </div>
        <div style={{ opacity: dotsO, display: "flex", alignItems: "center", gap: 9, marginTop: 18 }}>
          {[1, 2, 3].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: NEON, boxShadow: `0 0 12px ${NEON}` }} />)}
          <span style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase", color: DIM, marginLeft: 8 }}>High conviction</span>
        </div>
        <div style={{ opacity: lineO, transform: `translateY(${lineTy}px)`, marginTop: 30, fontFamily: FONT, fontSize: 32, fontWeight: 500, color: WHITE }}>
          Buy here. Add below <strong style={{ fontWeight: 800 }}>$122</strong>. Take profit above <strong style={{ fontWeight: 800 }}>$168</strong>.
        </div>
      </AbsoluteFill>
    </Dark>
  );
}

function EndScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [26, 0]);
  const uP = spring({ frame: frame - 18, fps, config: { damping: 14, stiffness: 170 } });
  const uO = interpolate(uP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const uS = interpolate(uP, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  return (
    <Dark>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 80, fontWeight: 800, color: WHITE, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>
          Know what to do<br />with your stocks.
        </div>
        <div style={{ opacity: uO, transform: `scale(${uS})`, fontFamily: FONT, fontSize: 56, fontWeight: 800, color: NEON, letterSpacing: "-0.03em", textShadow: `0 0 40px ${NEON}55` }}>stocksbrew.online</div>
        <div style={{ opacity: uO, fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: DIM }}>Free for your first 3 stocks</div>
      </AbsoluteFill>
    </Dark>
  );
}

function DarkReveal({ from = 0, children }: { from?: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 26, stiffness: 120 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [50, 0]);
  const s = interpolate(p, [0, 1], [0.96, 1], { extrapolateRight: "clamp" });
  return <div style={{ opacity: o, transform: `translateY(${ty}px) scale(${s})` }}>{children}</div>;
}

function DarkHead({ pre, bold }: { pre: string; bold: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return <div style={{ opacity: o, fontFamily: FONT, fontSize: 52, fontWeight: 800, color: WHITE, letterSpacing: "-0.03em", textAlign: "center" }}>{pre} <span style={{ color: NEON }}>{bold}</span></div>;
}

function WhyDark() {
  return (
    <Dark>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 110px" }}>
        <DarkHead pre="Why it moved." bold="We read everything." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, width: "100%", maxWidth: 1500 }}>
          <DarkReveal from={10}><AnomalyCard t="dark" /></DarkReveal>
          <DarkReveal from={22}><RedditCard t="dark" /></DarkReveal>
        </div>
      </AbsoluteFill>
    </Dark>
  );
}

function RingsDark() {
  return (
    <Dark>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 130px" }}>
        <DarkHead pre="The fundamentals," bold="scored." />
        <DarkReveal from={10}><div style={{ width: 1200 }}><Rings t="dark" from={16} /></div></DarkReveal>
      </AbsoluteFill>
    </Dark>
  );
}

function RadarDark() {
  return (
    <Dark>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 130px" }}>
        <DarkHead pre="Your whole watchlist." bold="One call each." />
        <DarkReveal from={10}><div style={{ width: 1200 }}><RadarRows t="dark" count={5} from={16} /></div></DarkReveal>
      </AbsoluteFill>
    </Dark>
  );
}

const SEG = { thesis: 95, why: 120, verdict: 130, rings: 110, radar: 130, end: 110 };
export const MIDNIGHT_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function Midnight() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.thesis}><ThesisScene /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.why}><WhyDark /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.verdict}><VerdictScene /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.rings}><RingsDark /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.radar}><RadarDark /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.end}><EndScene /></Series.Sequence>
    </Series>
  );
}
