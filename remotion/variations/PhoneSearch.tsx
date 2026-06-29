import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { TypewriterText } from "../components/TypewriterText";
import { Logo } from "../components/Logo";
import { BrandMark } from "../components/BrandMark";
import { MobileBrowser, useAutoScroll } from "./browser";
import { AnomalyCard, Rings, RedditCard } from "./features";
import { MOCK_CALL } from "../mock-data";

// Variation 9 — "Phone Search": mobile browser search → stocksbrew. 1080x1920.
const GREEN = "#047857";
const QUERY = "why is nvda up today";
const SUGGEST = ["why is nvda up today", "is nvda a buy now", "nvda price target 2025", "nvda earnings date"];

function blink(frame: number) { return Math.sin(frame * 0.5) > 0 ? 1 : 0; }

function Wall({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg,#dfe7ee,#eef1f5)", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</AbsoluteFill>
  );
}

function SearchScene() {
  const frame = useCurrentFrame();
  const tapAt = 96;
  const tap = frame >= tapAt && frame <= tapAt + 10;
  return (
    <Wall>
      <MobileBrowser url={<span style={{ color: "#9aa3af" }}>google.com</span>}>
        <div style={{ padding: "60px 44px", display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ height: 92, background: T.surface, border: `1px solid ${T.outline}`, borderRadius: 999, boxShadow: "0 6px 20px rgba(17,24,39,0.06)", display: "flex", alignItems: "center", gap: 16, padding: "0 30px" }}>
            <span style={{ fontSize: 30, color: "#9aa3af" }}>🔎</span>
            <span style={{ fontFamily: FONT, fontSize: 34, color: T.ink }}>
              <TypewriterText text={QUERY} startFrame={8} durationInFrames={46} reserveSpace={false} style={{ fontFamily: FONT, fontSize: 34 }} />
              <span style={{ display: "inline-block", width: 3, height: 36, background: T.ink, marginLeft: 2, transform: "translateY(6px)", opacity: blink(frame) }} />
            </span>
          </div>
          {/* autocomplete */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {SUGGEST.map((s, i) => {
              const o = interpolate(frame, [54 + i * 7, 64 + i * 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const hl = i === 0 && tap;
              return (
                <div key={s} style={{ opacity: o, display: "flex", alignItems: "center", gap: 18, padding: "26px 22px", borderBottom: `1px solid ${T.outline}`, background: hl ? "#eef4f1" : "transparent", borderRadius: hl ? 16 : 0 }}>
                  <span style={{ fontSize: 26, color: "#9aa3af" }}>🔎</span>
                  <span style={{ fontFamily: FONT, fontSize: 32, color: T.ink }}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
        {tap && <div style={{ position: "absolute", left: 150, top: 360, width: 90, height: 90, borderRadius: 99, background: "rgba(4,120,87,0.25)", border: "3px solid rgba(4,120,87,0.5)" }} />}
      </MobileBrowser>
    </Wall>
  );
}

function ResultScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const load = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  // viewport = 1740 - 70 (status) - 118 (bottom bar) = 1552
  const { ref, scroll } = useAutoScroll(1552, frame, 40, 170);
  const C = MOCK_CALL;
  return (
    <Wall>
      <MobileBrowser url={<span><span style={{ color: "#6b7280" }}>stocksbrew.online</span></span>}>
        <div ref={ref} style={{ opacity: load, transform: `translateY(${scroll}px)`, padding: "44px 40px", display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Logo ticker="NVDA" size={70} radius={16} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, color: T.ink }}>NVDA</div>
              <div style={{ fontFamily: FONT, fontSize: 24, color: T.inkVar }}>NVIDIA</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, color: T.ink }}>${C.price}</div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: GREEN }}>▲ +{C.dayPct}%</div>
            </div>
          </div>
          {/* our call */}
          <div style={{ background: T.surface, borderRadius: 26, border: `1px solid ${T.outline}`, boxShadow: "0 10px 30px rgba(17,24,39,0.06)", padding: "34px 34px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3f7d68" }}>our call</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
              <span style={{ fontFamily: FONT, fontSize: 76, fontWeight: 800, color: GREEN, letterSpacing: "-0.03em", lineHeight: 0.95 }}>Accumulate</span>
              <span style={{ display: "flex", gap: 7, paddingBottom: 12 }}>{[1, 2, 3].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: GREEN }} />)}</span>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 30, color: "#2b3036", lineHeight: 1.4 }}>Buy here. Add below <b style={{ color: T.ink }}>$122</b>. Take profit above <b style={{ color: T.ink }}>$168</b>.</div>
          </div>
          <Rings t="light" from={0} />
          <AnomalyCard t="light" />
          <RedditCard t="light" />
        </div>
      </MobileBrowser>
    </Wall>
  );
}

function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const u = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 170 } });
  const us = interpolate(u, [0, 1], [0.8, 1], { extrapolateRight: "clamp" });
  const uo = interpolate(u, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 38, padding: "0 80px" }}>
      <div style={{ width: 130, height: 130, borderRadius: 34, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandMark size={66} shape={GREEN} cutout="#fff" /></div>
      <div style={{ opacity: o, fontFamily: FONT, fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>Search less.<br />Know more.</div>
      <div style={{ opacity: uo, transform: `scale(${us})`, fontFamily: FONT, fontSize: 46, fontWeight: 800, color: GREEN, background: "#fff", borderRadius: 22, padding: "26px 52px" }}>stocksbrew.online →</div>
    </AbsoluteFill>
  );
}

const SEG = { search: 130, result: 180, cta: 90 };
export const PHONE_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function PhoneSearch() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.search}><SearchScene /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.result}><ResultScene /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.cta}><CTA /></Series.Sequence>
    </Series>
  );
}
