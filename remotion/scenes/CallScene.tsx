import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { TypewriterText } from "../components/TypewriterText";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { MOCK_STOCK } from "../mock-data";
import { Logo } from "../components/Logo";
import { Backdrop } from "../components/Backdrop";

// Timing (180f / 6s)
//  0-12    open from white flash, card springs in
//  14-40   prompt types `$ brew verdict NVDA`
//  40-104  four source scan lines type + ✓
//  108-130 verdict inset reveals, score counts up
//  130-180 caption holds
export const CALL_FRAMES = 180;

const SCANS = [
  { label: "reading 1,412 news headlines", from: 42, done: 64 },
  { label: "parsing 38 reddit threads", from: 54, done: 76 },
  { label: "listening to 4 earnings calls", from: 66, done: 88 },
  { label: "checking fundamentals + price action", from: 78, done: 102 },
];

function ScanLine({ label, from, done }: { label: string; from: number; done: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const checkP = spring({ frame: frame - done, fps, config: { damping: 180 } });
  const checkOpacity = interpolate(checkP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const lineOpacity = interpolate(frame, [from - 2, from + 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const isDone = frame >= done;
  return (
    <div style={{ opacity: lineOpacity, display: "flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 24, color: isDone ? T.ink : T.inkVar, minHeight: 34 }}>
      <span style={{ color: T.terminal }}>{"›"}</span>
      <TypewriterText text={label} startFrame={from} durationInFrames={done - from} style={{ fontFamily: MONO, fontSize: 24 }} />
      <span style={{ marginLeft: "auto", opacity: checkOpacity, color: T.bull, fontWeight: 700 }}>✓</span>
    </div>
  );
}

export function CallScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const flash = interpolate(frame, [0, 12], [1, 0], { extrapolateRight: "clamp" });
  const blink = Math.sin(frame * 0.5) > 0 ? 1 : 0;
  const liveBlink = Math.sin(frame * 0.35) > 0 ? 1 : 0.35;

  // verdict inset reveal
  const revP = spring({ frame: frame - 108, fps, config: { damping: 22, stiffness: 150 } });
  const revOpacity = interpolate(revP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const revTy = interpolate(revP, [0, 1], [16, 0]);

  const scoreP = spring({ frame: frame - 114, fps, config: { damping: 200 } });
  const score = Math.round(interpolate(scoreP, [0, 1], [0, 78], { extrapolateRight: "clamp" }));

  const capP = spring({ frame: frame - 132, fps, config: { damping: 200 } });
  const capOpacity = interpolate(capP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const capTy = interpolate(capP, [0, 1], [18, 0]);

  const green = T.bull;

  return (
    <Backdrop>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
      <SpringIn from={2} direction="up" distance={40} scaleFrom={0.97} config={{ damping: 22, stiffness: 130 }}>
        <div style={{ width: 1120, borderRadius: 20, background: T.surface, boxShadow: "0 40px 90px rgba(17,24,39,0.13), 0 6px 16px rgba(17,24,39,0.05)", border: "1px solid rgba(0,0,0,0.04)", overflow: "hidden" }}>
          {/* window chrome */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", borderBottom: `1px solid ${T.outline}`, background: T.surfaceCt }}>
            <span style={{ width: 13, height: 13, borderRadius: 99, background: "rgba(185,28,28,0.7)" }} />
            <span style={{ width: 13, height: 13, borderRadius: 99, background: "rgba(14,116,144,0.4)" }} />
            <span style={{ width: 13, height: 13, borderRadius: 99, background: "rgba(4,120,87,0.6)" }} />
            <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 20, color: T.inkVar }}>sb://command-center</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 9, fontFamily: MONO, fontSize: 18, fontWeight: 700, letterSpacing: "0.06em", color: green }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: green, opacity: liveBlink }} /> LIVE
            </span>
          </div>

          <div style={{ padding: "26px 30px 30px" }}>
            {/* prompt */}
            <div style={{ fontFamily: MONO, fontSize: 26, color: T.inkVar, marginBottom: 20 }}>
              ${" "}
              <span style={{ color: T.ink }}>
                <TypewriterText text={`brew verdict ${MOCK_STOCK.ticker}`} startFrame={14} durationInFrames={24} style={{ fontFamily: MONO, fontSize: 26 }} />
              </span>
              <span style={{ display: "inline-block", width: 11, height: 26, background: T.ink, marginLeft: 4, transform: "translateY(4px)", opacity: blink }} />
            </div>

            {/* scan lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
              {SCANS.map((s) => <ScanLine key={s.label} {...s} />)}
            </div>

            {/* verdict inset */}
            <div style={{ opacity: revOpacity, transform: `translateY(${revTy}px)`, background: T.surfaceLow, borderRadius: 14, padding: "22px 24px", display: "flex", alignItems: "center", gap: 20 }}>
              <Logo ticker={MOCK_STOCK.ticker} size={56} radius={14} />
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em" }}>{MOCK_STOCK.ticker}</span>
                  <span style={{ fontFamily: FONT, fontSize: 19, color: T.inkVar }}>{MOCK_STOCK.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
                  <span style={{ fontFamily: FONT, fontSize: 44, fontWeight: 800, color: green, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>${MOCK_STOCK.price.toFixed(2)}</span>
                  <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: green, fontVariantNumeric: "tabular-nums" }}>▲ {MOCK_STOCK.day_change_pct}%</span>
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "12px 26px",
                color: green, border: `2px solid ${green}66`, background: `${green}22`,
                fontFamily: FONT, fontSize: 34, fontWeight: 800, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>
                BUY · {score}
              </div>
            </div>
          </div>
        </div>
      </SpringIn>

      <div style={{ opacity: capOpacity, transform: `translateY(${capTy}px)`, fontFamily: FONT, fontSize: 46, fontWeight: 800, color: T.ink, letterSpacing: "-0.03em", textAlign: "center" }}>
        We read it all. Then we make the call.
      </div>

      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />
     </AbsoluteFill>
    </Backdrop>
  );
}
