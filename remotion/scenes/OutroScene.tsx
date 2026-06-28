import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";

export const OUTRO_FRAMES = 150;

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({ frame, fps, config: { damping: 200 } });
  const headOpacity = interpolate(headP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const headTy = interpolate(headP, [0, 1], [30, 0]);

  const urlP = spring({ frame: frame - 24, fps, config: { damping: 14, stiffness: 180 } });
  const urlOpacity = interpolate(urlP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const urlScale = interpolate(urlP, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });

  const ctaP = spring({ frame: frame - 44, fps, config: { damping: 200 } });
  const ctaOpacity = interpolate(ctaP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ctaTy = interpolate(ctaP, [0, 1], [18, 0]);

  return (
    <Backdrop>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 }}>
      <div style={{ opacity: headOpacity, transform: `translateY(${headTy}px)`, fontFamily: FONT, fontSize: 92, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", lineHeight: 1.04, textAlign: "center" }}>
        Know what to do<br />with your stocks.
      </div>

      <div style={{ opacity: urlOpacity, transform: `scale(${urlScale})`, fontFamily: FONT, fontSize: 64, fontWeight: 800, color: T.brandDeep, letterSpacing: "-0.03em" }}>
        stocksbrew.online
      </div>

      <div style={{ opacity: ctaOpacity, transform: `translateY(${ctaTy}px)`, display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "16px 34px", borderRadius: 14, background: T.brand, color: "#fff", fontFamily: FONT, fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Track your first stock →
        </span>
        <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, color: T.inkVar }}>
          Free for your first 3. No card required.
        </span>
      </div>
     </AbsoluteFill>
    </Backdrop>
  );
}
