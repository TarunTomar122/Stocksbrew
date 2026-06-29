import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Logo } from "../components/Logo";
import { AnomalyCard, RedditCard, Rings, RadarRows } from "./features";

// Variation 3 — "Reel": vertical 1080x1920, fast + punchy for social. Bold green
// color-block cuts, snappy text, mini product hits.

function Reveal({ from = 0, children }: { from?: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 24, stiffness: 120 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [60, 0]);
  const s = interpolate(p, [0, 1], [0.95, 1], { extrapolateRight: "clamp" });
  return <div style={{ opacity: o, transform: `translateY(${ty}px) scale(${s})`, width: "100%" }}>{children}</div>;
}

function SectionHead({ pre, bold }: { pre: string; bold: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ opacity: o, fontFamily: FONT, fontSize: 60, fontWeight: 800, color: T.ink, letterSpacing: "-0.03em", textAlign: "center", lineHeight: 1.08 }}>
      {pre}<br /><span style={{ color: GREEN }}>{bold}</span>
    </div>
  );
}

function WhyReel() {
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 70px" }}>
      <SectionHead pre="Why did it move?" bold="We read everything." />
      <div style={{ display: "flex", flexDirection: "column", gap: 26, width: "100%" }}>
        <Reveal from={10}><AnomalyCard t="light" /></Reveal>
        <Reveal from={24}><RedditCard t="light" /></Reveal>
      </div>
    </AbsoluteFill>
  );
}

function RingsReel() {
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 70px" }}>
      <SectionHead pre="Is it strong?" bold="Scored vs peers." />
      <Reveal from={10}><Rings t="light" from={16} /></Reveal>
    </AbsoluteFill>
  );
}

function RadarReel() {
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 70px" }}>
      <SectionHead pre="Every stock you own." bold="One clear call." />
      <Reveal from={10}><RadarRows t="light" count={4} from={16} /></Reveal>
    </AbsoluteFill>
  );
}
const GREEN = "#047857";
const MINT = "#10b981";

function pop(frame: number, fps: number, from = 0, mass = 0.8) {
  return spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 220, mass } });
}

// full-bleed green hello
function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, 2);
  const s = interpolate(p, [0, 1], [0.6, 1], { extrapolateRight: "clamp" });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const sub = interpolate(spring({ frame: frame - 16, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ opacity: o, transform: `scale(${s})`, fontFamily: FONT, fontSize: 130, fontWeight: 800, color: "#fff", letterSpacing: "-0.045em" }}>stocksbrew</div>
      <div style={{ opacity: sub, fontFamily: MONO, fontSize: 34, letterSpacing: "0.1em", textTransform: "uppercase", color: "#bff3df" }}>your stocks, decoded</div>
    </AbsoluteFill>
  );
}

function Question() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = ["Buy?", "Sell?", "Hold?"];
  const colors = [GREEN, "#b91c1c", "#b45309"];
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
      {words.map((w, i) => {
        const p = pop(frame, fps, 4 + i * 12);
        const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
        const x = interpolate(p, [0, 1], [i % 2 ? 120 : -120, 0], { extrapolateRight: "clamp" });
        return <div key={w} style={{ opacity: o, transform: `translateX(${x}px)`, fontFamily: FONT, fontSize: 150, fontWeight: 800, color: colors[i], letterSpacing: "-0.05em", lineHeight: 0.95 }}>{w}</div>;
      })}
    </AbsoluteFill>
  );
}

function ReadIt() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chips = ["News", "Reddit", "Earnings", "Fundamentals", "Price action"];
  const head = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 90px" }}>
      <div style={{ opacity: head, fontFamily: FONT, fontSize: 76, fontWeight: 800, color: T.ink, letterSpacing: "-0.035em", textAlign: "center", lineHeight: 1.05 }}>We read it all.</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20 }}>
        {chips.map((c, i) => {
          const p = pop(frame, fps, 14 + i * 8);
          const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const s = interpolate(p, [0, 1], [0.6, 1], { extrapolateRight: "clamp" });
          return <span key={c} style={{ opacity: o, transform: `scale(${s})`, fontFamily: FONT, fontSize: 44, fontWeight: 700, color: GREEN, background: "#e7f8f1", borderRadius: 999, padding: "16px 36px" }}>{c}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
}

function Verdict() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardP = spring({ frame: frame - 2, fps, config: { damping: 20, stiffness: 130 } });
  const cardO = interpolate(cardP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cardY = interpolate(cardP, [0, 1], [80, 0]);
  const score = Math.round(interpolate(spring({ frame: frame - 16, fps, config: { damping: 200 } }), [0, 1], [0, 78], { extrapolateRight: "clamp" }));
  const badge = pop(frame, fps, 24);
  const bS = interpolate(badge, [0, 1], [0.4, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ opacity: cardO, transform: `translateY(${cardY}px)`, width: "100%", background: T.surface, borderRadius: 40, boxShadow: "0 40px 90px rgba(17,24,39,0.14)", border: "1px solid rgba(0,0,0,0.05)", padding: "60px 56px", display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Logo ticker="NVDA" size={96} radius={22} />
          <div>
            <div style={{ fontFamily: FONT, fontSize: 56, fontWeight: 800, color: T.ink }}>NVDA</div>
            <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, color: MINT }}>▲ +2.86%</div>
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, letterSpacing: "0.16em", textTransform: "uppercase", color: T.inkVar }}>Our call</div>
        <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <span style={{ transform: `scale(${bS})`, fontFamily: FONT, fontSize: 96, fontWeight: 800, color: GREEN, letterSpacing: "-0.04em" }}>Accumulate</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontFamily: FONT, fontSize: 120, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>{score}</span>
          <span style={{ fontFamily: FONT, fontSize: 44, color: T.inkVar }}>/100</span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 500, color: T.inkVar, lineHeight: 1.4 }}>Buy here. Add below <b style={{ color: T.ink }}>$122</b>. Take profit above <b style={{ color: T.ink }}>$168</b>.</div>
      </div>
    </AbsoluteFill>
  );
}

function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [30, 0]);
  const btn = pop(frame, fps, 16);
  const bS = interpolate(btn, [0, 1], [0.7, 1], { extrapolateRight: "clamp" });
  const bO = interpolate(btn, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 80px" }}>
      <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 92, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>Track 3 stocks<br />free.</div>
      <div style={{ opacity: bO, transform: `scale(${bS})`, fontFamily: FONT, fontSize: 48, fontWeight: 800, color: GREEN, background: "#fff", borderRadius: 22, padding: "28px 56px" }}>stocksbrew.online →</div>
      <div style={{ opacity: bO, fontFamily: MONO, fontSize: 28, letterSpacing: "0.1em", textTransform: "uppercase", color: "#bff3df" }}>no card required</div>
    </AbsoluteFill>
  );
}

const SEG = { intro: 50, q: 60, read: 64, why: 120, verdict: 95, rings: 95, radar: 100, cta: 80 };
export const REEL_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function Reel() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.intro}><Intro /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.q}><Question /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.read}><ReadIt /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.why}><WhyReel /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.verdict}><Verdict /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.rings}><RingsReel /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.radar}><RadarReel /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.cta}><CTA /></Series.Sequence>
    </Series>
  );
}
