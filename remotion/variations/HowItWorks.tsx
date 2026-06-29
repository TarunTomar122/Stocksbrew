import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { AnomalyCard, RedditCard, Rings, RadarRows } from "./features";
import { MOCK_ALERTS, MOCK_CALL } from "../mock-data";
import { BrandIntro, BRANDINTRO_FRAMES } from "./brand";

// Variation 4 — "How It Works": a clean numbered explainer. 1920x1080.
const GREEN = "#047857";

function Title() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 22, stiffness: 120 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [30, 0]);
  const sub = interpolate(spring({ frame: frame - 14, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Backdrop>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <div style={{ opacity: sub, fontFamily: MONO, fontSize: 22, letterSpacing: "0.22em", textTransform: "uppercase", color: GREEN }}>stocksbrew</div>
        <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 100, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.02 }}>How it works</div>
        <div style={{ opacity: sub, fontFamily: FONT, fontSize: 30, fontWeight: 500, color: T.inkVar }}>Four steps from chaos to a clear call.</div>
      </AbsoluteFill>
    </Backdrop>
  );
}

function Step({ n, label, headline, children }: { n: string; label: string; headline: string; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lp = spring({ frame, fps, config: { damping: 24, stiffness: 120 } });
  const lo = interpolate(lp, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const lx = interpolate(lp, [0, 1], [-40, 0]);
  const cp = spring({ frame: frame - 10, fps, config: { damping: 26, stiffness: 120 } });
  const co = interpolate(cp, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cy = interpolate(cp, [0, 1], [50, 0]);
  const cs = interpolate(cp, [0, 1], [0.96, 1], { extrapolateRight: "clamp" });
  return (
    <Backdrop tint={GREEN}>
      <AbsoluteFill style={{ display: "grid", gridTemplateColumns: "minmax(0,460px) minmax(0,1fr)", alignItems: "center", gap: 70, padding: "0 130px" }}>
        <div style={{ opacity: lo, transform: `translateX(${lx}px)` }}>
          <div style={{ fontFamily: FONT, fontSize: 160, fontWeight: 800, color: GREEN, opacity: 0.16, letterSpacing: "-0.05em", lineHeight: 0.8 }}>{n}</div>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.16em", textTransform: "uppercase", color: GREEN, marginTop: 10 }}>{label}</div>
          <div style={{ fontFamily: FONT, fontSize: 56, fontWeight: 800, color: T.ink, letterSpacing: "-0.035em", lineHeight: 1.05, marginTop: 14 }}>{headline}</div>
        </div>
        <div style={{ opacity: co, transform: `translateY(${cy}px) scale(${cs})` }}>{children}</div>
      </AbsoluteFill>
    </Backdrop>
  );
}

function MiniCall() {
  const C = MOCK_CALL;
  return (
    <div style={{ background: T.surface, borderRadius: 24, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(17,24,39,0.1)", padding: "36px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3f7d68" }}>our call · NVDA</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <span style={{ fontFamily: FONT, fontSize: 78, fontWeight: 800, color: GREEN, letterSpacing: "-0.03em", lineHeight: 0.95 }}>Accumulate</span>
        <span style={{ display: "flex", gap: 7, paddingBottom: 14 }}>{[1, 2, 3].map((i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 99, background: GREEN }} />)}</span>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 500, color: "#2b3036" }}>Buy here. Add below <b style={{ color: T.ink }}>$122</b>. Take profit above <b style={{ color: T.ink }}>$168</b>.</div>
    </div>
  );
}

function AlertsCard() {
  const tone = (t: string) => (t === "bull" ? "#047857" : "#b45309");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {MOCK_ALERTS.map((a) => (
        <div key={a.title} style={{ display: "flex", alignItems: "center", gap: 18, background: T.surface, borderRadius: 18, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 10px 30px rgba(17,24,39,0.06)", padding: "22px 26px" }}>
          <span style={{ fontSize: 34 }}>{a.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: tone(a.tone) }}>{a.title}</div>
            <div style={{ fontFamily: FONT, fontSize: 20, color: T.inkVar }}>{a.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [26, 0]);
  const u = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 170 } });
  const uo = interpolate(u, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const us = interpolate(u, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  return (
    <Backdrop>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 80, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>Start with 3 stocks.<br />Free.</div>
        <div style={{ opacity: uo, transform: `scale(${us})`, fontFamily: FONT, fontSize: 58, fontWeight: 800, color: "#065f46", letterSpacing: "-0.03em" }}>stocksbrew.online</div>
      </AbsoluteFill>
    </Backdrop>
  );
}

const SEG = { brand: BRANDINTRO_FRAMES, title: 80, s1: 120, s2: 130, s3: 120, s4: 130, end: 110 };
export const HOWITWORKS_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function HowItWorks() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.brand}><BrandIntro tagline="Clear calls on the stocks you own." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.title}><Title /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.s1}><Step n="01" label="Track" headline="Add the stocks you own."><RadarRows t="light" count={4} from={14} /></Step></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.s2}><Step n="02" label="We read" headline="We read everything, daily."><div style={{ display: "flex", flexDirection: "column", gap: 22 }}><AnomalyCard t="light" /><RedditCard t="light" /></div></Step></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.s3}><Step n="03" label="The call" headline="Get a clear call."><MiniCall /></Step></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.s4}><Step n="04" label="Alerts" headline="Get pinged when it matters."><AlertsCard /></Step></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.end}><EndCard /></Series.Sequence>
    </Series>
  );
}
