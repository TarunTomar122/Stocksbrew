import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { TypewriterText } from "../components/TypewriterText";
import { FONT } from "../fonts";

const CREAM = "#f9f7f4";
const DARK  = "#0d0d0f";
const WHITE = "#ffffff";
const OFFWHITE = "rgba(255,255,255,0.88)";
const DIM   = "rgba(255,255,255,0.38)";
const PURPLE = "#6b38d4";
const INK   = "#111215";

// ─── Timing ─────────────────────────────────────────────────────────────────
// Phase 1 (cream):  0 → 95
//   0-22:  "Do you understand" springs in
//   22-82: "stock market?" types out with slight upward drift
//   82-95: pause
// Crossfade to dark: 95-115
// Phase 2 (dark):  115 → 205
//   120-148: "Probably?" bounces in (bouncy spring)
//   162-185: "?" fades, "not." bounces in from right → "Probably not."
// Crossfade back to cream: 205-225
// Phase 3 (cream): 225 → 280
//   228-258: "Let me help you." springs in
//   258-280: hold

export const HOOK_FRAMES = 280;

export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Dark overlay opacity (phases in then out) ──
  const darkOpacity = interpolate(
    frame,
    [95, 115, 200, 220],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Phase 1: "Do you understand" ──
  const understandProgress = spring({ frame, fps, config: { damping: 200 } });
  const understandOpacity = interpolate(understandProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const understandTy = interpolate(understandProgress, [0, 1], [32, 0]);

  // Phase 1 content fades out before dark arrives
  const phase1Opacity = interpolate(frame, [90, 108], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // "stock market?" drifts upward slightly as it types
  const stockMarketProgress = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const stockMarketTy = interpolate(stockMarketProgress, [0, 1], [14, 0]);

  // ── Phase 2: "Probably?" bounces in ──
  const probablyProgress = spring({
    frame: frame - 120,
    fps,
    config: { damping: 8, stiffness: 240, mass: 0.8 },
  });
  const probablyOpacity = interpolate(probablyProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const probablyScale  = interpolate(probablyProgress, [0, 1], [0.55, 1], { extrapolateRight: "clamp" });

  // "?" fades out as "not." comes in
  const questionOpacity = interpolate(frame, [162, 176], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // "not." bounces in from right
  const notProgress = spring({
    frame: frame - 162,
    fps,
    config: { damping: 8, stiffness: 240, mass: 0.8 },
  });
  const notOpacity = interpolate(notProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const notTx      = interpolate(notProgress, [0, 1], [80, 0], { extrapolateRight: "clamp" });
  const notScale   = interpolate(notProgress, [0, 1], [0.6, 1], { extrapolateRight: "clamp" });

  // ── Phase 3: "Let me help you." ──
  const phase3Opacity = interpolate(frame, [218, 232], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const helpProgress = spring({ frame: frame - 228, fps, config: { damping: 200 } });
  const helpTy = interpolate(helpProgress, [0, 1], [28, 0]);
  const helpOpacity = interpolate(helpProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: CREAM }}>

      {/* ── Phase 1 + Phase 3 content on cream ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 140px",
          pointerEvents: "none",
        }}
      >
        {/* Phase 1 */}
        <div style={{ opacity: phase1Opacity, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              opacity: understandOpacity,
              transform: `translateY(${understandTy}px)`,
              fontFamily: FONT,
              fontSize: 80,
              fontWeight: 800,
              color: INK,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              textAlign: "center" as const,
            }}
          >
            Do you understand
          </div>
          <div style={{ transform: `translateY(${stockMarketTy}px)`, textAlign: "center" as const }}>
            <TypewriterText
              text="the stock market?"
              startFrame={22}
              durationInFrames={55}
              showCursor
              style={{
                fontFamily: FONT,
                fontSize: 80,
                fontWeight: 800,
                color: INK,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
              }}
            />
          </div>
        </div>

        {/* Phase 3 - "Let me help you." */}
        <div
          style={{
            position: "absolute",
            opacity: phase3Opacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              opacity: helpOpacity,
              transform: `translateY(${helpTy}px)`,
              fontFamily: FONT,
              fontSize: 72,
              fontWeight: 800,
              color: INK,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              textAlign: "center" as const,
              marginBottom: 20,
            }}
          >
            Let us help you.
          </div>
          <div
            style={{
              opacity: helpOpacity,
              transform: `translateY(${helpTy}px)`,
              fontFamily: FONT,
              fontSize: 20,
              fontWeight: 500,
              color: PURPLE,
              letterSpacing: "0.01em",
              textAlign: "center" as const,
            }}
          >
            tikrr.online
          </div>
        </div>
      </AbsoluteFill>

      {/* ── Dark overlay (Phase 2) ── */}
      <AbsoluteFill
        style={{
          background: DARK,
          opacity: darkOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 140px",
        }}
      >
        {/* "Probably" + animated "?" / "not." */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 20,
            opacity: probablyOpacity,
            transform: `scale(${probablyScale})`,
            transformOrigin: "center center",
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 96,
              fontWeight: 800,
              color: WHITE,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Probably
          </span>

          {/* "?" fades out */}
          <span
            style={{
              fontFamily: FONT,
              fontSize: 96,
              fontWeight: 800,
              color: DIM,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              opacity: questionOpacity,
              display: "inline-block",
            }}
          >
            ?
          </span>

          {/* "not." bounces in */}
          <span
            style={{
              fontFamily: FONT,
              fontSize: 96,
              fontWeight: 800,
              color: OFFWHITE,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              opacity: notOpacity,
              transform: `translateX(${notTx}px) scale(${notScale})`,
              display: "inline-block",
              transformOrigin: "left center",
            }}
          >
            not.
          </span>
        </div>
      </AbsoluteFill>

    </div>
  );
}
