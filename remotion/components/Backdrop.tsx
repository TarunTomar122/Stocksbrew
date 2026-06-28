import React from "react";
import { AbsoluteFill } from "remotion";
import { T } from "../theme";

// Premium light backdrop: soft radial lift in the center, gentle cool vignette
// at the edges, and a barely-there grid. Gives cards something to float on.
export function Backdrop({ children, tint = T.brand }: { children?: React.ReactNode; tint?: string }) {
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at 50% 30%, #ffffff 0%, ${T.bg} 55%, #eef1f5 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(50% 40% at 50% 42%, ${tint}0f 0%, transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}
