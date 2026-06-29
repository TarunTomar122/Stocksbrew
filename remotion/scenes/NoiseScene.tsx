import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { NOISE_CHIPS, type NoiseChip } from "../mock-data";

// Timing (150f / 5s @30fps) — a calm two-beat thesis
//  0-40    data haze drifts in;  28-66 line A "It looks like noise." over the haze
//  62-92   haze defocuses + dims
//  78-128  line B resolves crisp: "Every move has a reason."
//  128-150 settle + light sweep into the next scene
export const NOISE_FRAMES = 150;

const HAZE = "#aeb4bd"; // single muted grey — no color, no slang, no emoji

function Tape({ y, dir, speed }: { y: number; dir: 1 | -1; speed: number }) {
  const frame = useCurrentFrame();
  const items = ["NVDA 131.38", "AAPL 214.29", "TSLA 248.50", "MSFT 421.92", "INTC 108.77", "META 498.10", "AMD 162.04", "AMZN 185.20"];
  const strip = items.join("      ") + "      ";
  const unit = 1180;
  const offset = ((frame * speed) % unit) * dir;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: `${y}%`, whiteSpace: "nowrap", overflow: "hidden", opacity: 0.1, fontFamily: MONO, fontSize: 24, color: HAZE, letterSpacing: "0.06em", filter: "blur(0.4px)" }}>
      <div style={{ display: "inline-block", transform: `translateX(${dir === 1 ? offset - unit : offset}px)` }}>{strip}{strip}{strip}</div>
    </div>
  );
}

function Fragment({ chip, index, fieldOpacity, fieldBlur }: { chip: NoiseChip; index: number; fieldOpacity: number; fieldBlur: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const near = interpolate(chip.size, [22, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const baseOpacity = 0.16 + near * 0.2;
  const ownBlur = 1.2 + (1 - near) * 3.5;

  const enter = interpolate(frame, [chip.delay, chip.delay + 26], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const driftX = Math.sin((frame + index * 40) * 0.014) * (3 + near * 5) * (index % 2 ? 1 : -1);
  const driftY = -(frame * (0.08 + near * 0.12));

  const px = (chip.x / 100) * width;
  const py = (chip.y / 100) * height;
  const fade = interpolate(frame, [92, 112], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute", left: px, top: py + driftY,
      transform: `translate(-50%,-50%) translateX(${driftX}px)`,
      opacity: enter * baseOpacity * fieldOpacity * fade,
      filter: `blur(${ownBlur + fieldBlur}px)`,
      fontFamily: MONO, fontSize: chip.size * 1.35, fontWeight: 500,
      color: HAZE, letterSpacing: "0.01em", whiteSpace: "nowrap",
    }}>
      {chip.text}
    </div>
  );
}

export function NoiseScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fieldOpacity = interpolate(frame, [62, 92], [1, 0.28], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fieldBlur = interpolate(frame, [62, 92], [0, 3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // beat A — "It looks like noise." (lives over the haze, then steps aside)
  const aP = spring({ frame: frame - 28, fps, config: { damping: 26, stiffness: 120 } });
  const aOpacity = interpolate(aP, [0, 1], [0, 1], { extrapolateRight: "clamp" }) *
    interpolate(frame, [62, 74], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const aTy = interpolate(aP, [0, 1], [18, 0]);

  // beat B — "Every move has a reason." (resolves crisp in the clear)
  const bP = spring({ frame: frame - 80, fps, config: { damping: 26, stiffness: 110 } });
  const bOpacity = interpolate(bP, [0, 1], [0, 1], { extrapolateRight: "clamp" }) *
    interpolate(frame, [132, 144], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bScale = interpolate(bP, [0, 1], [0.965, 1], { extrapolateRight: "clamp" });
  const bTy = interpolate(bP, [0, 1], [22, 0]);

  const flash = interpolate(frame, [138, 146, 150], [0, 0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Backdrop>
      <Tape y={18} dir={1} speed={2.4} />
      <Tape y={82} dir={-1} speed={3} />

      {NOISE_CHIPS.map((c, i) => <Fragment key={c.text} chip={c} index={i} fieldOpacity={fieldOpacity} fieldBlur={fieldBlur} />)}

      <AbsoluteFill style={{ background: "radial-gradient(70% 70% at 50% 50%, transparent 55%, rgba(15,23,42,0.08) 100%)", pointerEvents: "none" }} />

      {/* beat A */}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
        <div style={{ opacity: aOpacity, transform: `translateY(${aTy}px)`, fontFamily: FONT, fontSize: 76, fontWeight: 800, color: T.ink, letterSpacing: "-0.035em", lineHeight: 1.05, textAlign: "center" }}>
          The market looks like noise.
        </div>
      </AbsoluteFill>

      {/* beat B */}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
        <div style={{ opacity: bOpacity, transform: `translateY(${bTy}px) scale(${bScale})`, textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 96, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", lineHeight: 1.02 }}>
            Every move<br />has a reason.
          </div>
          <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.01em", marginTop: 28 }}>
            Know the why, and you stop getting caught out.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: flash, pointerEvents: "none" }} />
    </Backdrop>
  );
}
