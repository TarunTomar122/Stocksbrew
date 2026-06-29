import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { BrandIcon } from "../components/BrandMark";

// Shared brand-establishing opener so every variation reads as stocksbrew from
// frame one. Works on light + dark, landscape + vertical.
export function BrandIntro({ tagline = "Clear calls on the stocks you own.", theme = "light" as "light" | "dark" }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const vertical = height > width;
  const dark = theme === "dark";
  const ink = dark ? "#f4f7f6" : T.ink;
  const dim = dark ? "#9aa3af" : T.inkVar;
  const green = dark ? "#34d399" : "#047857";

  const i = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150 } });
  const iO = interpolate(i, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const iS = interpolate(i, [0, 1], [0.6, 1], { extrapolateRight: "clamp" });
  const w = spring({ frame: frame - 16, fps, config: { damping: 22, stiffness: 120 } });
  const wO = interpolate(w, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const wTy = interpolate(w, [0, 1], [22, 0]);
  const t = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  const tO = interpolate(t, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const iconSize = vertical ? 150 : 132;
  const wordSize = vertical ? 100 : 104;
  const tagSize = vertical ? 36 : 32;

  const inner = (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
      <div style={{ opacity: iO, transform: `scale(${iS})` }}><BrandIcon size={iconSize} bg={green} /></div>
      <div style={{ opacity: wO, transform: `translateY(${wTy}px)`, fontFamily: FONT, fontSize: wordSize, fontWeight: 800, color: ink, letterSpacing: "-0.045em" }}>stocksbrew</div>
      <div style={{ opacity: tO, fontFamily: FONT, fontSize: tagSize, fontWeight: 500, color: dim, letterSpacing: "-0.01em", textAlign: "center" }}>{tagline}</div>
    </AbsoluteFill>
  );

  if (dark) {
    return (
      <AbsoluteFill style={{ background: "#06080a" }}>
        <AbsoluteFill style={{ background: `radial-gradient(55% 50% at 50% 45%, ${green}14, transparent 70%)` }} />
        {inner}
      </AbsoluteFill>
    );
  }
  return <Backdrop>{inner}</Backdrop>;
}

export const BRANDINTRO_FRAMES = 70;
