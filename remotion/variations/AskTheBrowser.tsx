import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { TypewriterText } from "../components/TypewriterText";
import { Logo } from "../components/Logo";
import { BrandIcon } from "../components/BrandMark";
import { Wallpaper, BrowserFrame, Cursor, useAutoScroll } from "./browser";
import { Rings, AnomalyCard } from "./features";
import { MOCK_CALL } from "../mock-data";

// Variation 7 — "Ask": you search a stock question, stocksbrew answers. 1920x1080.
const GREEN = "#047857";
const QUERY = "is NVDA a buy right now?";

function blink(frame: number) { return Math.sin(frame * 0.5) > 0 ? 1 : 0; }

// New-tab style search home inside the browser
function SearchHome() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // cursor travels to the button after typing finishes (~frame 70), clicks ~88
  const cx = interpolate(frame, [72, 86], [1150, 1015], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cy = interpolate(frame, [72, 86], [560, 470], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const click = frame >= 86 && frame <= 96;
  const btnPress = click ? 0.96 : 1;
  return (
    <Wallpaper>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BrowserFrame tab="New Tab" url={<span style={{ color: "#9aa3af" }}>Search or type a question</span>} secure={false}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
            <BrandIcon size={92} bg={GREEN} />
            <div style={{ fontFamily: FONT, fontSize: 46, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em" }}>stocksbrew</div>
            <div style={{ width: 980, height: 78, background: T.surface, border: `1px solid ${T.outline}`, borderRadius: 999, boxShadow: "0 10px 30px rgba(17,24,39,0.07)", display: "flex", alignItems: "center", gap: 16, padding: "0 30px" }}>
              <span style={{ fontSize: 26, color: "#9aa3af" }}>🔎</span>
              <span style={{ fontFamily: FONT, fontSize: 30, color: T.ink }}>
                <TypewriterText text={QUERY} startFrame={10} durationInFrames={50} reserveSpace={false} style={{ fontFamily: FONT, fontSize: 30 }} />
                <span style={{ display: "inline-block", width: 3, height: 32, background: T.ink, marginLeft: 2, transform: "translateY(6px)", opacity: blink(frame) }} />
              </span>
            </div>
            <div style={{ transform: `scale(${btnPress})`, background: GREEN, color: "#fff", fontFamily: FONT, fontSize: 26, fontWeight: 700, padding: "18px 38px", borderRadius: 14 }}>Ask stocksbrew</div>
          </div>
          <Cursor x={cx} y={cy} click={click} />
        </BrowserFrame>
      </AbsoluteFill>
    </Wallpaper>
  );
}

function PageContent() {
  const C = MOCK_CALL;
  return (
    <div style={{ padding: "44px 60px", display: "flex", flexDirection: "column", gap: 36 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Logo ticker="NVDA" size={56} radius={14} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 800, color: T.ink }}>{C.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 18, color: T.inkVar }}>{C.meta}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FONT, fontSize: 36, fontWeight: 800, color: T.ink }}>${C.price}</div>
          <div style={{ fontFamily: MONO, fontSize: 18, color: GREEN, fontWeight: 700 }}>▲ +{C.dayPct}%</div>
        </div>
      </div>
      {/* our call */}
      <div style={{ background: T.surface, borderRadius: 22, border: `1px solid ${T.outline}`, boxShadow: "0 10px 30px rgba(17,24,39,0.05)", padding: "34px 38px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3f7d68" }}>our call</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          <span style={{ fontFamily: FONT, fontSize: 72, fontWeight: 800, color: GREEN, letterSpacing: "-0.03em", lineHeight: 0.95 }}>Accumulate</span>
          <span style={{ display: "flex", gap: 7, paddingBottom: 12 }}>{[1, 2, 3].map((i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 99, background: GREEN }} />)}</span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 26, color: "#2b3036" }}>Buy here. Add below <b style={{ color: T.ink }}>$122</b>. Take profit above <b style={{ color: T.ink }}>$168</b>.</div>
      </div>
      <Rings t="light" from={0} />
      <AnomalyCard t="light" />
    </div>
  );
}

function AnswerPage() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const load = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  // viewport = 880 - 52 (tab) - 64 (address) = 764
  const { ref, scroll } = useAutoScroll(764, frame, 40, 230);
  return (
    <Wallpaper>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BrowserFrame tab="NVDA · stocksbrew" url={<span><span style={{ color: "#6b7280" }}>stocksbrew.online</span><span style={{ color: T.inkVar }}>/stock/NVDA</span></span>}>
          <div ref={ref} style={{ opacity: load, transform: `translateY(${scroll}px)` }}>
            <PageContent />
          </div>
        </BrowserFrame>
      </AbsoluteFill>
    </Wallpaper>
  );
}

function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const u = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 170 } });
  const us = interpolate(u, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  const uo = interpolate(u, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Wallpaper>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ opacity: o, transform: `translateY(${interpolate(o, [0, 1], [24, 0])}px)`, fontFamily: FONT, fontSize: 78, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.05 }}>
          Stop googling.<br />Get the call.
        </div>
        <div style={{ opacity: uo, transform: `scale(${us})`, fontFamily: FONT, fontSize: 56, fontWeight: 800, color: "#065f46", letterSpacing: "-0.03em" }}>stocksbrew.online</div>
        <div style={{ opacity: uo, fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkVar }}>Free for your first 3 stocks</div>
      </AbsoluteFill>
    </Wallpaper>
  );
}

const SEG = { search: 110, answer: 240, cta: 100 };
export const ASK_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function AskTheBrowser() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.search}><SearchHome /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.answer}><AnswerPage /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.cta}><CTA /></Series.Sequence>
    </Series>
  );
}
