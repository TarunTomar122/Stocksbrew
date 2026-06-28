import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FONT } from "../fonts";
import { T, STANCE } from "../theme";
import { MOCK_RADAR, type RadarRow } from "../mock-data";
import { Logo } from "../components/Logo";
import { Backdrop } from "../components/Backdrop";

// 150f / 5s — mirrors demo-radar rows
export const RADAR_FRAMES = 150;

function Row({ row, from }: { row: RadarRow; from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const tx = interpolate(p, [0, 1], [44, 0]);
  const up = row.changePct >= 0;
  const m = STANCE[row.stance];
  const holding = row.position === "holding";

  return (
    <div style={{ opacity, transform: `translateX(${tx}px)`, display: "flex", alignItems: "center", gap: 24, padding: "24px 30px", borderTop: `1px solid ${T.outline}` }}>
      <Logo ticker={row.ticker} size={48} radius={12} />
      <div style={{ width: 230 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: "-0.01em" }}>{row.ticker}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            background: holding ? "#e7f8f1" : T.surfaceCt, color: holding ? "#047857" : T.inkVar }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: holding ? "#10b981" : T.inkVar }} />
            {holding ? "Holding" : "Watching"}
          </span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 17, color: T.inkVar }}>{row.name} · {row.signal}</div>
      </div>
      <div style={{ width: 150, fontFamily: FONT, fontSize: 24, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
        ${row.price.toFixed(2)}
      </div>
      <div style={{ width: 130, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: up ? "#10b981" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>
        {up ? "▲" : "▼"} {Math.abs(row.changePct).toFixed(2)}%
      </div>
      <div style={{ width: 80, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.inkVar, fontVariantNumeric: "tabular-nums" }}>
        {row.score}
      </div>
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 22px", borderRadius: 999, background: m.bg, color: m.fg, fontFamily: FONT, fontSize: 18, fontWeight: 800, letterSpacing: "0.04em" }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: m.dot }} />
        {m.label}
      </span>
    </div>
  );
}

export function RadarScene() {
  return (
    <Backdrop>
     <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 150px", gap: 44 }}>
      <SpringIn from={0} direction="up" distance={24}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 800, color: T.ink, letterSpacing: "-0.035em", lineHeight: 1 }}>Your Radar</div>
          <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em", marginTop: 14 }}>
            Every name you own and watch — <span style={{ color: T.ink, fontWeight: 800 }}>one clear call each.</span>
          </div>
        </div>
      </SpringIn>

      <SpringIn from={12} direction="up" distance={44} scaleFrom={0.97} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1240 }}>
        <div style={{ background: T.surface, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 70px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.04)", border: "1px solid rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "18px 30px" }}>
            <div style={{ width: 48, flexShrink: 0 }} />
            <div style={{ width: 230, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar }}>Stock</div>
            <div style={{ width: 150, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar }}>Price</div>
            <div style={{ width: 130, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar }}>Today</div>
            <div style={{ width: 80, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar }}>Score</div>
            <div style={{ marginLeft: "auto", fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkVar }}>Call</div>
          </div>
          {MOCK_RADAR.map((r, i) => <Row key={r.ticker} row={r} from={20 + i * 10} />)}
        </div>
      </SpringIn>
     </AbsoluteFill>
    </Backdrop>
  );
}
