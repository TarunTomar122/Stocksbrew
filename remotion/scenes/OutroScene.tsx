import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT } from "../fonts";

const CREAM = "#f9f7f4";
const PURPLE = "#6b38d4";
const MUTED = "#6b7280";

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const urlProgress = spring({ frame: frame - 8, fps, config: { damping: 15, stiffness: 180 } });
  const urlOpacity = interpolate(urlProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const urlScale   = interpolate(urlProgress, [0, 1], [0.8, 1], { extrapolateRight: "clamp" });

  const subProgress = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  const subOpacity = interpolate(subProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const subTy = interpolate(subProgress, [0, 1], [16, 0]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: CREAM,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      {/* tikrr.online — big, bouncy */}
      <div
        style={{
          opacity: urlOpacity,
          transform: `scale(${urlScale})`,
          fontFamily: FONT,
          fontSize: 96,
          fontWeight: 800,
          color: PURPLE,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        tikrr.online
      </div>

      {/* Subtitle */}
      <div
        style={{
          opacity: subOpacity,
          transform: `translateY(${subTy}px)`,
          fontFamily: FONT,
          fontSize: 18,
          fontWeight: 500,
          color: MUTED,
          letterSpacing: "0.01em",
        }}
      >
        Market intelligence for everyone.
      </div>
    </div>
  );
}
