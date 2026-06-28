import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { NOISE_CHIPS, type NoiseChip } from "../mock-data";

// Timing (120f / 4s @30fps)
//  0-45    words drift in with depth, the field fills
//  44-92   the field defocuses + dims; the line resolves crisp in the clear
//  92-120  gentle convergence + light sweep into the Call
export const NOISE_FRAMES = 120;

// Restrained palette: most opinions are muted grey; only a few carry color.
function chipColor(kind: NoiseChip["kind"]) {
  if (kind === "buy") return "#10b981";
  if (kind === "sell") return "#ef4444";
  if (kind === "reddit") return "#2563eb";
  return "#9aa3af";
}

function Tape({ y, dir, speed }: { y: number; dir: 1 | -1; speed: number }) {
  const frame = useCurrentFrame();
  const items = ["NVDA $131.38 ▲2.64%", "AAPL $214.29 ▲0.42%", "TSLA $248.50 ▼3.10%", "MSFT $421.92 ▲3.05%", "INTC $108.77 ▼6.18%", "META $498.10 ▼0.88%"];
  const strip = items.join("   •   ") + "   •   ";
  const unit = 1180;
  const offset = ((frame * speed) % unit) * dir;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: `${y}%`, whiteSpace: "nowrap", overflow: "hidden", opacity: 0.16, fontFamily: MONO, fontSize: 26, color: "#9aa3af", letterSpacing: "0.02em" }}>
      <div style={{ display: "inline-block", transform: `translateX(${dir === 1 ? offset - unit : offset}px)` }}>{strip}{strip}{strip}</div>
    </div>
  );
}

function Chip({ chip, index, fieldOpacity, fieldBlur }: { chip: NoiseChip; index: number; fieldOpacity: number; fieldBlur: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // depth: larger words sit "nearer" — sharper, more opaque
  const near = interpolate(chip.size, [22, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const baseOpacity = 0.32 + near * 0.5;
  const ownBlur = (1 - near) * 3.5;

  // smooth entrance (ease-out, not springy)
  const enter = interpolate(frame, [chip.delay, chip.delay + 22], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // slow parallax drift — floats, never jitters; nearer = moves a touch more
  const dirX = index % 2 === 0 ? 1 : -1;
  const driftX = Math.sin((frame + index * 40) * 0.018) * (4 + near * 8) * dirX;
  const driftY = -(frame * (0.12 + near * 0.18)) + Math.cos((frame + index * 30) * 0.02) * 3;

  // gentle convergence at the end
  const conv = interpolate(frame, [92, 116], [0, 1], { easing: Easing.in(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const px = (chip.x / 100) * width;
  const py = (chip.y / 100) * height;
  const x = interpolate(conv, [0, 1], [px, width / 2]);
  const y = interpolate(conv, [0, 1], [py + driftY, height / 2]);
  const convScale = interpolate(conv, [0, 1], [1, 0.4]);
  const convFade = interpolate(frame, [96, 116], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute", left: x, top: y,
      transform: `translate(-50%,-50%) translateX(${driftX}px) rotate(${chip.rot * 0.5}deg) scale(${convScale})`,
      opacity: enter * baseOpacity * fieldOpacity * convFade,
      filter: `blur(${ownBlur + fieldBlur}px)`,
      fontFamily: FONT, fontSize: chip.size * 1.45, fontWeight: 700,
      color: chipColor(chip.kind), letterSpacing: "-0.02em", whiteSpace: "nowrap",
    }}>
      {chip.text}
    </div>
  );
}

export function NoiseScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // the field defocuses + dims so the statement can stand alone
  const fieldOpacity = interpolate(frame, [40, 70], [1, 0.22], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fieldBlur = interpolate(frame, [40, 70], [0, 3.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // caption resolves crisp, slight scale settle
  const capP = spring({ frame: frame - 46, fps, config: { damping: 26, stiffness: 110 } });
  const capOpacity = interpolate(capP, [0, 1], [0, 1], { extrapolateRight: "clamp" }) *
    interpolate(frame, [96, 110], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capScale = interpolate(capP, [0, 1], [0.965, 1], { extrapolateRight: "clamp" });
  const capTy = interpolate(capP, [0, 1], [22, 0]);

  const flash = interpolate(frame, [108, 116, 120], [0, 0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Backdrop>
      <Tape y={16} dir={1} speed={3} />
      <Tape y={84} dir={-1} speed={3.6} />

      {NOISE_CHIPS.map((c, i) => <Chip key={c.text} chip={c} index={i} fieldOpacity={fieldOpacity} fieldBlur={fieldBlur} />)}

      {/* cinematic edge vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(70% 70% at 50% 50%, transparent 55%, rgba(15,23,42,0.10) 100%)", pointerEvents: "none" }} />

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
        <div style={{ opacity: capOpacity, transform: `translateY(${capTy}px) scale(${capScale})`, textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: T.inkVar, opacity: 0.6, marginBottom: 22 }}>
            The market, every day
          </div>
          <div style={{ fontFamily: FONT, fontSize: 82, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            Everyone has an opinion<br />on your stocks.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: flash, pointerEvents: "none" }} />
    </Backdrop>
  );
}
