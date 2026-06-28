import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { TypewriterText } from "../components/TypewriterText";
import { FONT } from "../fonts";
import { T } from "../theme";
import { MOCK_READ } from "../mock-data";
import { Logo } from "../components/Logo";
import { Backdrop } from "../components/Backdrop";

// 210f / 7s
export const PROOF_FRAMES = 210;

function Chip({ chip, from }: { chip: typeof MOCK_READ.chips[number]; from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 200, mass: 0.7 } });
  const opacity = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(p, [0, 1], [0.7, 1], { extrapolateRight: "clamp" });
  return (
    <span style={{
      opacity, transform: `scale(${scale})`,
      display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 999,
      padding: "12px 22px", background: chip.bg, color: chip.fg,
      fontFamily: FONT, fontSize: 26, fontWeight: 700,
    }}>
      <span>{chip.icon}</span>{chip.label}
    </span>
  );
}

export function ProofScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arrowP = spring({ frame: frame - 90, fps, config: { damping: 14, stiffness: 200 } });
  const arrowOpacity = interpolate(arrowP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const arrowTx = interpolate(arrowP, [0, 1], [-12, 0]);

  return (
    <Backdrop>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 160px", gap: 52 }}>
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 40, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em" }}>
          The buzz, the moves, the earnings —{" "}
          <span style={{ color: T.ink, fontWeight: 800 }}>we connect the dots.</span>
        </div>
      </SpringIn>

      <SpringIn from={14} direction="up" distance={44} scaleFrom={0.97} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1040 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 30, borderRadius: 30, border: "1px solid rgba(0,0,0,0.04)", background: T.surface, padding: "44px 48px", boxShadow: "0 30px 70px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Logo ticker={MOCK_READ.ticker} size={56} radius={14} />
            <div>
              <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: "-0.01em" }}>{MOCK_READ.ticker}</div>
              <div style={{ fontFamily: FONT, fontSize: 20, color: T.inkVar }}>{MOCK_READ.name}</div>
            </div>
          </div>

          {/* signal chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {MOCK_READ.chips.map((c, i) => <Chip key={c.label} chip={c} from={28 + i * 16} />)}
          </div>

          {/* conclusion */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, borderTop: `1px solid ${T.outline}`, paddingTop: 28 }}>
            <span style={{ opacity: arrowOpacity, transform: `translateX(${arrowTx}px)`, color: T.terminal, fontSize: 34, fontWeight: 800, lineHeight: 1 }}>→</span>
            <div style={{ flex: 1, minHeight: 112 }}>
              <TypewriterText
                text={MOCK_READ.conclusion}
                startFrame={100}
                durationInFrames={90}
                reserveSpace
                style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, lineHeight: 1.45, color: T.ink, display: "block" }}
              />
            </div>
          </div>
        </div>
      </SpringIn>
     </AbsoluteFill>
    </Backdrop>
  );
}
