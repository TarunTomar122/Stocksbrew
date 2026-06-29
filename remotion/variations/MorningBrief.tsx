import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Logo } from "../components/Logo";
import { MOCK_BRIEF } from "../mock-data";
import { BrandIcon } from "../components/BrandMark";
import { BrandIntro, BRANDINTRO_FRAMES } from "./brand";

// Variation 6 — "Morning Brief": narrative day-in-life. Vertical 1080x1920.
const GREEN = "#047857";
const STANCE: Record<string, { label: string; bg: string; fg: string }> = {
  accumulate: { label: "Accumulate", bg: "#e7f8f1", fg: "#047857" },
  trim: { label: "Trim", bg: "#fef3da", fg: "#b45309" },
  avoid: { label: "Avoid", bg: "#fdeaea", fg: "#b91c1c" },
};

const AppIcon = ({ size = 64 }: { size?: number }) => <BrandIcon size={size} bg={GREEN} />;

// Phone lock-screen with a notification sliding in
function Notification() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clockO = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const n = spring({ frame: frame - 24, fps, config: { damping: 18, stiffness: 140 } });
  const nO = interpolate(n, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const nY = interpolate(n, [0, 1], [-120, 0]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#0b1f17,#06100c)" }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 40% at 50% 30%, ${GREEN}33, transparent 70%)` }} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 260 }}>
        <div style={{ opacity: clockO, fontFamily: FONT, fontSize: 60, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em" }}>7:02</div>
        <div style={{ opacity: clockO, fontFamily: FONT, fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>{MOCK_BRIEF.date}</div>
        <div style={{ opacity: nO, transform: `translateY(${nY}px)`, marginTop: 80, width: 900, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", borderRadius: 34, padding: "30px 34px", display: "flex", gap: 22, alignItems: "flex-start", boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
          <AppIcon size={70} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#111215" }}>stocksbrew</span>
              <span style={{ fontFamily: FONT, fontSize: 22, color: "#6b7280" }}>now</span>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: "#111215", marginTop: 8, lineHeight: 1.3 }}>Your morning brief is ready</div>
            <div style={{ fontFamily: FONT, fontSize: 26, color: "#374151", marginTop: 6 }}>{MOCK_BRIEF.summary}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function BriefOpen() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = interpolate(spring({ frame, fps, config: { damping: 24, stiffness: 120 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 70px", gap: 40 }}>
      <div style={{ opacity: head, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <AppIcon size={84} />
        <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 800, color: T.ink, letterSpacing: "-0.035em" }}>Morning brief</div>
        <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 500, color: T.inkVar, textAlign: "center" }}>{MOCK_BRIEF.summary}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%" }}>
        {MOCK_BRIEF.items.map((it, i) => {
          const p = spring({ frame: frame - (14 + i * 12), fps, config: { damping: 22, stiffness: 130 } });
          const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const x = interpolate(p, [0, 1], [60, 0]);
          const m = STANCE[it.stance];
          return (
            <div key={it.ticker} style={{ opacity: o, transform: `translateX(${x}px)`, display: "flex", alignItems: "center", gap: 22, background: T.surface, borderRadius: 26, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 14px 40px rgba(17,24,39,0.07)", padding: "28px 30px" }}>
              <Logo ticker={it.ticker} size={64} radius={15} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 800, color: T.ink }}>{it.ticker}</div>
                <div style={{ fontFamily: FONT, fontSize: 24, color: T.inkVar }}>{it.note}</div>
              </div>
              <span style={{ padding: "12px 24px", borderRadius: 999, background: m.bg, color: m.fg, fontFamily: FONT, fontSize: 24, fontWeight: 800 }}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Punchline() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 110 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [30, 0]);
  return (
    <AbsoluteFill style={{ background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 90px" }}>
      <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 88, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>
        While you slept,<br /><span style={{ color: GREEN }}>we read it all.</span>
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
  const b = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 170 } });
  const bo = interpolate(b, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const bs = interpolate(b, [0, 1], [0.7, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 80px" }}>
      <AppIcon size={120} />
      <div style={{ opacity: o, transform: `translateY(${ty}px)`, fontFamily: FONT, fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>Wake up to<br />the call.</div>
      <div style={{ opacity: bo, transform: `scale(${bs})`, fontFamily: FONT, fontSize: 46, fontWeight: 800, color: GREEN, background: "#fff", borderRadius: 22, padding: "26px 52px" }}>stocksbrew.online →</div>
      <div style={{ opacity: bo, fontFamily: MONO, fontSize: 26, letterSpacing: "0.1em", textTransform: "uppercase", color: "#bff3df" }}>free for 3 stocks</div>
    </AbsoluteFill>
  );
}

const SEG = { brand: BRANDINTRO_FRAMES, notif: 110, brief: 150, punch: 80, cta: 90 };
export const MORNINGBRIEF_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function MorningBrief() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.brand}><BrandIntro tagline="Wake up to a clear call." theme="dark" /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.notif}><Notification /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.brief}><BriefOpen /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.punch}><Punchline /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.cta}><CTA /></Series.Sequence>
    </Series>
  );
}
