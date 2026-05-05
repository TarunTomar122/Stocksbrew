import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";

type Props = {
  text: string;
  startFrame: number;
  durationInFrames: number;
  style?: React.CSSProperties;
  /** Reserve space using invisible full text so layout never shifts */
  reserveSpace?: boolean;
  showCursor?: boolean;
};

export function TypewriterText({
  text,
  startFrame,
  durationInFrames,
  style,
  reserveSpace = true,
}: Props) {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - startFrame);

  const charsToShow = Math.floor(
    interpolate(localFrame, [0, durationInFrames], [0, text.length], {
      easing: Easing.out(Easing.quad),
      extrapolateRight: "clamp",
    })
  );

  const visible = text.slice(0, charsToShow);

  if (reserveSpace) {
    return (
      <span style={{ position: "relative", display: "inline", ...style }}>
        {/* Invisible full text reserves space — layout never shifts */}
        <span style={{ opacity: 0, userSelect: "none", pointerEvents: "none" }}>{text}</span>
        {/* Typed text sits on top */}
        <span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visible}
        </span>
      </span>
    );
  }

  return <span style={style}>{visible}</span>;
}
