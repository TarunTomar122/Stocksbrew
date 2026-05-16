import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { TypewriterText } from "../components/TypewriterText";
import { MOCK_DIRECTIVE, MOCK_STOCK } from "../mock-data";
import { FONT } from "../fonts";

const STANCE_META: Record<string, { label: string; bg: string; fg: string; chipBg: string; chipFg: string }> = {
  accumulate: { label: "Accumulate", bg: "#ecfdf5", fg: "#065f46", chipBg: "#10b981", chipFg: "#ffffff" },
  trim:       { label: "Trim",       bg: "#fef3c7", fg: "#92400e", chipBg: "#f59e0b", chipFg: "#ffffff" },
  watch:      { label: "Watch",      bg: "#eff6ff", fg: "#1e3a8a", chipBg: "#0052ff", chipFg: "#ffffff" },
  avoid:      { label: "Avoid",      bg: "#fef2f2", fg: "#991b1b", chipBg: "#ef4444", chipFg: "#ffffff" },
  hold:       { label: "Hold",       bg: "#f3f4f6", fg: "#374151", chipBg: "#374151", chipFg: "#ffffff" },
};

function AnimatedAlertButton({ triggerFrame }: { triggerFrame: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isSet = frame >= triggerFrame;

  const doneProgress = spring({ frame: frame - triggerFrame, fps, config: { damping: 200 } });
  const doneOpacity = interpolate(doneProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const doneScale  = interpolate(doneProgress, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  const pendingOpacity = interpolate(doneProgress, [0, 0.4], [1, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "relative", height: 28, width: 160, display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", opacity: pendingOpacity, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#0052ff", whiteSpace: "nowrap" as const }}>
        🔔 Set alert below $850
      </span>
      <span style={{ position: "absolute", opacity: isSet ? doneOpacity : 0, transform: `scale(${isSet ? doneScale : 1})`, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" as const }}>
        ✓ Alert set
      </span>
    </div>
  );
}

export function DirectiveScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const directive = MOCK_DIRECTIVE;
  const stance = directive.stance.toLowerCase();
  const meta = STANCE_META[stance] ?? STANCE_META.watch;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#f6f7f9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        padding: "80px 160px",
        gap: 44,
      }}
    >
      {/* Caption */}
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center" as const, fontFamily: FONT, fontSize: 22, fontWeight: 500, color: "#6b7280", letterSpacing: "-0.01em", maxWidth: 680 }}>
          And then - the part that actually helps you{" "}
          <span style={{ color: "#111215", fontWeight: 700 }}>act.</span>
        </div>
      </SpringIn>

      {/* Directive card - fixed size so typewriter never shifts layout */}
      <SpringIn from={18} direction="up" distance={50} style={{ width: "100%", maxWidth: 900 }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 20,
            border: "1px solid #e5e7eb",
            padding: "28px 32px",
            background: meta.bg,
            color: meta.fg,
            /* Fixed height so typing text never moves the card */
            minHeight: 220,
          }}
        >
          {/* Ticker watermark */}
          <span
            style={{
              position: "absolute",
              right: 24,
              top: "50%",
              transform: "translateY(-50%)",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 120,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              opacity: 0.06,
              userSelect: "none" as const,
              pointerEvents: "none" as const,
              color: meta.fg,
            }}
          >
            {MOCK_STOCK.ticker}
          </span>

          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Chips */}
            <SpringIn from={28} direction="none">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, padding: "4px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, background: meta.chipBg, color: meta.chipFg }}>
                  {meta.label}
                </span>
                <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, opacity: 0.75 }}>
                  Strategic Directive
                </span>
                {directive.confidence && (
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, opacity: 0.55 }}>
                    · {directive.confidence} confidence
                  </span>
                )}
              </div>
            </SpringIn>

            {/* Headline */}
            <SpringIn from={38} direction="up" distance={20}>
              <h2 style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>
                {directive.text}
              </h2>
            </SpringIn>

            {/* Rationale - fixed height container, typewriter overlays invisible placeholder */}
            {directive.rationale && (
              <div style={{ minHeight: 68 }}>
                <TypewriterText
                  text={directive.rationale}
                  startFrame={55}
                  durationInFrames={160}
                  reserveSpace
                  style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.65, opacity: 0.85, display: "block" }}
                />
              </div>
            )}

            {/* Alert button */}
            <SpringIn from={60} direction="none">
              <AnimatedAlertButton triggerFrame={210} />
            </SpringIn>
          </div>
        </div>
      </SpringIn>

      {/* Sub-caption */}
      <SpringIn from={70} direction="up" distance={20}>
        <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 500, color: "#6b7280", textAlign: "center" as const }}>
          It reads everything so{" "}
          <span style={{ color: "#111215", fontWeight: 700 }}>you don't have to.</span>
        </div>
      </SpringIn>
    </div>
  );
}
