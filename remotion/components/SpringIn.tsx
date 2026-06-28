import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

type Props = {
  from?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  config?: { damping?: number; stiffness?: number; mass?: number };
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
};

export function SpringIn({
  from = 0,
  children,
  style,
  config = { damping: 200 },
  direction = "up",
  distance = 40,
  scaleFrom = 1,
}: Props & { scaleFrom?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame: frame - from, fps, config });
  const opacity = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [scaleFrom, 1], { extrapolateRight: "clamp" });

  const tx =
    direction === "left" ? interpolate(progress, [0, 1], [distance, 0]) :
    direction === "right" ? interpolate(progress, [0, 1], [-distance, 0]) : 0;
  const ty =
    direction === "up" ? interpolate(progress, [0, 1], [distance, 0]) :
    direction === "down" ? interpolate(progress, [0, 1], [-distance, 0]) : 0;

  return (
    <div
      style={{
        opacity,
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
