import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { TypewriterText } from "../components/TypewriterText";
import { MOCK_DIRECTIVE, MOCK_STOCK } from "../mock-data";
import { FONT } from "../fonts";
import { T } from "../theme";
import { STANCE } from "../theme";
import { Backdrop } from "../components/Backdrop";

// mirrors PrimaryDirectiveCard (components/demo-radar.tsx)
export const DIRECTIVE_FRAMES = 270;

function AlertButton({ triggerFrame }: { triggerFrame: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isSet = frame >= triggerFrame;
  const doneP = spring({ frame: frame - triggerFrame, fps, config: { damping: 200 } });
  const doneOpacity = interpolate(doneP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const doneScale = interpolate(doneP, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  const pendingOpacity = interpolate(doneP, [0, 0.4], [1, 0], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", height: 40, width: 320 }}>
      <span style={{ position: "absolute", opacity: pendingOpacity, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: "#0052ff", whiteSpace: "nowrap" }}>
        🔔 Set alert below $850
      </span>
      <span style={{ position: "absolute", opacity: isSet ? doneOpacity : 0, transform: `scale(${isSet ? doneScale : 1})`, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.bull, whiteSpace: "nowrap" }}>
        ✓ We'll email you in the buy zone
      </span>
    </div>
  );
}

export function DirectiveScene() {
  const directive = MOCK_DIRECTIVE;
  const meta = STANCE[directive.stance.toLowerCase()] ?? STANCE.watch;

  return (
    <Backdrop tint={meta.dot}>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 150px", gap: 44 }}>
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 40, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em", maxWidth: 900 }}>
          And then the part that actually helps you{" "}
          <span style={{ color: T.ink, fontWeight: 800 }}>act.</span>
        </div>
      </SpringIn>

      <SpringIn from={16} direction="up" distance={50} scaleFrom={0.97} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1100 }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: "1px solid rgba(0,0,0,0.04)", padding: "44px 48px", background: meta.bg, minHeight: 320, boxShadow: "0 30px 70px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)" }}>
          {/* watermark ticker */}
          <span style={{ position: "absolute", right: 24, top: 0, fontFamily: FONT, fontWeight: 800, fontSize: 200, letterSpacing: "-0.04em", lineHeight: 1, opacity: 0.06, color: meta.fg, userSelect: "none" }}>
            {MOCK_STOCK.ticker}
          </span>

          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: 22 }}>
            <SpringIn from={26} direction="none">
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "8px 20px", fontFamily: FONT, fontSize: 18, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: meta.dot, color: "#fff" }}>
                  {meta.label}
                </span>
                <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: meta.fg, opacity: 0.72 }}>
                  Strategic directive · High confidence
                </span>
              </div>
            </SpringIn>

            <SpringIn from={36} direction="up" distance={20}>
              <h2 style={{ fontFamily: FONT, fontSize: 50, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.ink }}>
                {directive.text}
              </h2>
            </SpringIn>

            <div style={{ minHeight: 110 }}>
              <TypewriterText
                text={directive.rationale ?? ""}
                startFrame={54}
                durationInFrames={150}
                reserveSpace
                style={{ fontFamily: FONT, fontSize: 26, fontWeight: 500, lineHeight: 1.6, color: T.inkVar, display: "block" }}
              />
            </div>

            <SpringIn from={60} direction="none">
              <AlertButton triggerFrame={210} />
            </SpringIn>
          </div>
        </div>
      </SpringIn>
     </AbsoluteFill>
    </Backdrop>
  );
}
