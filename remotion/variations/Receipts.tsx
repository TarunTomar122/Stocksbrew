import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/Logo";
import { Rings } from "./features";
import { MOCK_RECEIPTS } from "../mock-data";
import { BrandIntro, BRANDINTRO_FRAMES } from "./brand";

// Variation 5 — "Receipts": proof-driven, builds trust with the track record. 1920x1080.
const GREEN = "#047857";

function Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - 6, fps, config: { damping: 24, stiffness: 120 } });
  const ao = interpolate(a, [0, 1], [0, 1], { extrapolateRight: "clamp" }) * interpolate(frame, [44, 56], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const aTy = interpolate(a, [0, 1], [20, 0]);
  const b = spring({ frame: frame - 58, fps, config: { damping: 22, stiffness: 120 } });
  const bo = interpolate(b, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const bs = interpolate(b, [0, 1], [0.95, 1], { extrapolateRight: "clamp" });
  return (
    <Backdrop>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", opacity: ao, transform: `translateY(${aTy}px)`, fontFamily: FONT, fontSize: 72, fontWeight: 800, color: T.inkVar, letterSpacing: "-0.035em" }}>Anyone can have an opinion.</div>
        <div style={{ position: "absolute", opacity: bo, transform: `scale(${bs})`, fontFamily: FONT, fontSize: 104, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center" }}>We keep the <span style={{ color: GREEN }}>receipts.</span></div>
      </AbsoluteFill>
    </Backdrop>
  );
}

function CallCard({ r, from }: { r: typeof MOCK_RECEIPTS[number]; from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 22, stiffness: 130 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [50, 0]);
  const up = r.movePct >= 0;
  const cc = up ? "#10b981" : "#ef4444";
  return (
    <div style={{ opacity: o, transform: `translateY(${ty}px)`, width: 360, background: T.surface, borderRadius: 22, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 18px 50px rgba(17,24,39,0.08)", padding: "26px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo ticker={r.ticker} size={40} radius={11} />
          <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: T.ink }}>{r.ticker}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 8, background: up ? "#ecfdf5" : "#fef2f2", color: cc, fontFamily: FONT, fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{up ? "▲" : "▼"} {Math.abs(r.movePct).toFixed(1)}%</span>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9aa3af", marginTop: 4 }}>on earnings day</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <span style={{ color: "#10b981", fontSize: 22, lineHeight: 1.2 }}>✓</span>
        <span style={{ fontFamily: FONT, fontSize: 19, lineHeight: 1.45, color: "#374151" }}>{r.call}</span>
      </div>
    </div>
  );
}

function ReceiptsGrid() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Backdrop tint={GREEN}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 50 }}>
        <div style={{ opacity: h, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.18em", textTransform: "uppercase", color: GREEN, marginBottom: 14 }}>The receipts</div>
          <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 800, color: T.ink, letterSpacing: "-0.03em" }}>Calls made before the move.</div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {MOCK_RECEIPTS.map((r, i) => <CallCard key={r.ticker} r={r} from={12 + i * 12} />)}
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}

function Method() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cp = spring({ frame: frame - 10, fps, config: { damping: 26, stiffness: 120 } });
  const co = interpolate(cp, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const cy = interpolate(cp, [0, 1], [50, 0]);
  return (
    <Backdrop>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "0 130px" }}>
        <div style={{ opacity: h, fontFamily: FONT, fontSize: 50, fontWeight: 800, color: T.ink, letterSpacing: "-0.03em", textAlign: "center" }}>Not vibes. <span style={{ color: GREEN }}>The numbers.</span></div>
        <div style={{ opacity: co, transform: `translateY(${cy}px)`, width: 1180 }}><Rings t="light" from={14} /></div>
      </AbsoluteFill>
    </Backdrop>
  );
}

function End() {
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
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 84, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.04 }}>Calls, on the record.</div>
        <div style={{ opacity: uo, transform: `scale(${us})`, fontFamily: FONT, fontSize: 58, fontWeight: 800, color: "#065f46", letterSpacing: "-0.03em" }}>stocksbrew.online</div>
        <div style={{ opacity: uo, fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkVar }}>Free for your first 3 stocks</div>
      </AbsoluteFill>
    </Backdrop>
  );
}

const SEG = { brand: BRANDINTRO_FRAMES, intro: 110, receipts: 140, method: 120, end: 110 };
export const RECEIPTS_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function Receipts() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.brand}><BrandIntro tagline="The stock app that keeps receipts." /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.intro}><Intro /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.receipts}><ReceiptsGrid /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.method}><Method /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.end}><End /></Series.Sequence>
    </Series>
  );
}
