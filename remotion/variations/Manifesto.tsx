import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { AnomalyCard, EarningsCard, Rings, RadarRows } from "./features";

// Variation 1 — "Manifesto": pure kinetic typography, no UI chrome. A confident
// brand film built entirely from statements. 1920x1080.
export const MANIFESTO_FRAMES = 6 * 60 + 30; // ~6.5s? no — sum below

const GREEN = "#047857";

function Line({ text, accent, sub }: { text: string; accent?: boolean; sub?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 180px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 24px", maxWidth: 1400 }}>
        {words.map((w, i) => {
          const p = spring({ frame: frame - i * 4, fps, config: { damping: 24, stiffness: 130 } });
          const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const ty = interpolate(p, [0, 1], [40, 0]);
          return (
            <span key={i} style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 92, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, color: accent ? GREEN : T.ink }}>
              {w}
            </span>
          );
        })}
      </div>
      {sub && (
        <Sub text={sub} delay={words.length * 4 + 6} />
      )}
    </AbsoluteFill>
  );
}

function Sub({ text, delay }: { text: string; delay: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [16, 0]);
  return (
    <div style={{ opacity: o, transform: `translateY(${ty}px)`, marginTop: 34, fontFamily: FONT, fontSize: 30, fontWeight: 500, color: T.inkVar, textAlign: "center", letterSpacing: "-0.01em" }}>
      {text}
    </div>
  );
}

// "Buy. Hold. Sell." — three words snap in one at a time, each in its call color
function Verdicts() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = [{ t: "Buy.", c: "#047857" }, { t: "Hold.", c: "#b45309" }, { t: "Sell.", c: "#b91c1c" }];
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
      {items.map((it, i) => {
        const p = spring({ frame: frame - 6 - i * 14, fps, config: { damping: 12, stiffness: 200, mass: 0.8 } });
        const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
        const s = interpolate(p, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
        return (
          <span key={it.t} style={{ opacity: o, transform: `scale(${s})`, fontFamily: FONT, fontSize: 130, fontWeight: 800, letterSpacing: "-0.04em", color: it.c }}>{it.t}</span>
        );
      })}
    </AbsoluteFill>
  );
}

function End() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 16, stiffness: 150 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const s = interpolate(p, [0, 1], [0.9, 1], { extrapolateRight: "clamp" });
  const subP = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const subO = interpolate(subP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <div style={{ opacity: o, transform: `scale(${s})`, fontFamily: FONT, fontSize: 110, fontWeight: 800, letterSpacing: "-0.045em", color: GREEN }}>stocksbrew</div>
      <div style={{ opacity: subO, fontFamily: MONO, fontSize: 24, letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkVar }}>stocksbrew.online · free for 3 stocks</div>
    </AbsoluteFill>
  );
}

function Showcase({ label, children }: { label: string; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lp = spring({ frame, fps, config: { damping: 200 } });
  const lo = interpolate(lp, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cp = spring({ frame: frame - 8, fps, config: { damping: 26, stiffness: 120 } });
  const co = interpolate(cp, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cy = interpolate(cp, [0, 1], [50, 0]);
  const cs = interpolate(cp, [0, 1], [0.96, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 160px" }}>
      <div style={{ opacity: lo, fontFamily: MONO, fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase", color: GREEN }}>{label}</div>
      <div style={{ opacity: co, transform: `translateY(${cy}px) scale(${cs})`, width: "100%", maxWidth: 1180 }}>{children}</div>
    </AbsoluteFill>
  );
}

const SEG = { a: 64, b: 78, c: 80, why: 100, d: 80, rings: 95, radar: 105, e: 76, f: 110 };
export const MANIFESTO_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function Manifesto() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.a}><Line text="You own the stock." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.b}><Line text="Now what?" accent sub="The question nobody answers for you." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.c}><Line text="News. Reddit. Earnings. The numbers." sub="We read all of it, every day." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.why}><Showcase label="Why it moved"><AnomalyCard t="light" /></Showcase></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.d}><Line text="We show our work." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.rings}><Showcase label="Fundamentals, scored"><Rings t="light" from={10} /></Showcase></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.radar}><Showcase label="Your whole watchlist"><RadarRows t="light" count={4} from={10} /></Showcase></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.e}><Verdicts /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.f}><End /></Series.Sequence>
    </Series>
  );
}
