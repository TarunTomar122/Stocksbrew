import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Logo } from "../components/Logo";
import { Wallpaper, Cursor } from "./browser";
import { MOCK_CALL } from "../mock-data";

// Variation 8 — "Too Many Tabs": close the research chaos down to one tab. 1920x1080.
const GREEN = "#047857";

const TABS = [
  { title: "Yahoo Finance — NVDA", fav: "#6001d2", close: 26 },
  { title: "CNBC: Is the AI trade over?", fav: "#0a64c2", close: 44 },
  { title: "r/wallstreetbets", fav: "#ff4500", close: 62 },
  { title: "StockTwits $NVDA", fav: "#1a9bf0", close: 80 },
  { title: "Seeking Alpha — overvalued?", fav: "#f7931a", close: 98 },
  { title: "NVDA Q2 earnings transcript", fav: "#8a8f98", close: 116 },
];
const KEEP = { title: "NVDA · stocksbrew", fav: GREEN };

function Tabs() {
  const frame = useCurrentFrame();
  // cursor hops to each closing tab's X
  const positions = TABS.map((t, i) => ({ at: t.close, x: 90 + i * 300 + 270, y: 38 }));
  let cx = 1700, cy = 600, click = false;
  for (const p of positions) {
    if (frame >= p.at - 8 && frame <= p.at + 6) { cx = p.x; cy = p.y; click = frame >= p.at - 2 && frame <= p.at + 3; }
  }
  return (
    <div style={{ height: 60, background: "#cdd3da", display: "flex", alignItems: "flex-end", paddingLeft: 20, gap: 6, position: "relative" }}>
      {/* keep tab (active) */}
      <Tab title={KEEP.title} fav={KEEP.fav} active w={300} />
      {TABS.map((t) => {
        const w = interpolate(frame, [t.close - 8, t.close], [300, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const o = interpolate(frame, [t.close - 8, t.close], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (w < 2) return null;
        return <div key={t.title} style={{ width: w, opacity: o, overflow: "hidden" }}><Tab title={t.title} fav={t.fav} w={300} /></div>;
      })}
      <Cursor x={cx} y={cy} click={click} />
    </div>
  );
}

function Tab({ title, fav, active, w }: { title: string; fav: string; active?: boolean; w: number }) {
  return (
    <div style={{ width: w, height: 44, background: active ? T.surface : "#dde2e8", borderRadius: "10px 10px 0 0", padding: "0 16px", display: "flex", alignItems: "center", gap: 10, fontFamily: FONT, fontSize: 17, fontWeight: 600, color: active ? T.ink : "#5b636d" }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: fav, flexShrink: 0 }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      <span style={{ color: "#9aa3af", fontSize: 20 }}>×</span>
    </div>
  );
}

function ChaosViewport() {
  const frame = useCurrentFrame();
  const lines = [
    "“NVDA is a screaming buy” — analyst", "“Bubble about to pop” — r/investing", "RSI overbought at 76",
    "“I sold everything” — top comment", "P/E 65, insane?", "“Load the boat” — 412 upvotes",
    "Downgrade to Hold", "“To the moon” 🚀", "Wait for the dip?", "Earnings could tank it",
    "“Best stock of the decade”", "Insider selling spotted",
  ];
  const o = interpolate(frame, [70, 120], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ opacity: o, position: "absolute", inset: 0, padding: 50, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 22, alignContent: "start" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ background: T.surface, border: `1px solid ${T.outline}`, borderRadius: 14, padding: "22px 24px", fontFamily: FONT, fontSize: 24, color: i % 3 === 0 ? "#b91c1c" : i % 3 === 1 ? "#047857" : T.inkVar, fontWeight: 600, transform: `rotate(${(i % 3 - 1) * 0.6}deg)` }}>{l}</div>
      ))}
    </div>
  );
}

function CallViewport() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 112, fps, config: { damping: 24, stiffness: 110 } });
  const o = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const s = interpolate(p, [0, 1], [0.96, 1], { extrapolateRight: "clamp" });
  const C = MOCK_CALL;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o, transform: `scale(${s})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "0 90px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo ticker="NVDA" size={56} radius={14} />
        <span style={{ fontFamily: FONT, fontSize: 34, fontWeight: 800, color: T.ink }}>NVDA</span>
        <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: GREEN }}>▲ +{C.dayPct}%</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color: "#3f7d68" }}>our call</div>
      <div style={{ fontFamily: FONT, fontSize: 110, fontWeight: 800, color: GREEN, letterSpacing: "-0.04em", lineHeight: 0.95 }}>Accumulate</div>
      <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, color: "#2b3036", textAlign: "center" }}>Buy here. Add below <b style={{ color: T.ink }}>$122</b>. Take profit above <b style={{ color: T.ink }}>$168</b>.</div>
    </div>
  );
}

function Scene() {
  const frame = useCurrentFrame();
  const cap = interpolate(frame, [150, 168], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Wallpaper>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1700, height: 900, borderRadius: 18, overflow: "hidden", background: T.surface, boxShadow: "0 50px 110px rgba(17,24,39,0.28)", border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column" }}>
          <Tabs />
          <div style={{ height: 60, background: T.surface, borderBottom: `1px solid ${T.outline}`, display: "flex", alignItems: "center", padding: "0 26px", gap: 16 }}>
            <span style={{ color: "#9aa3af", fontSize: 22 }}>‹ ›</span>
            <div style={{ flex: 1, height: 40, background: "#f0f2f5", borderRadius: 999, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", fontFamily: FONT, fontSize: 20, color: T.ink }}>
              <span style={{ fontSize: 16 }}>🔒</span>stocksbrew.online/stock/NVDA
            </div>
          </div>
          <div style={{ flex: 1, background: T.bg, position: "relative", overflow: "hidden" }}>
            <ChaosViewport />
            <CallViewport />
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 60, pointerEvents: "none" }}>
        <div style={{ opacity: cap, fontFamily: FONT, fontSize: 40, fontWeight: 800, color: T.ink, letterSpacing: "-0.03em", background: "rgba(248,250,252,0.85)", padding: "14px 30px", borderRadius: 16 }}>
          12 tabs to guess. <span style={{ color: GREEN }}>One tab to know.</span>
        </div>
      </AbsoluteFill>
    </Wallpaper>
  );
}

function CTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const u = spring({ frame: frame - 16, fps, config: { damping: 14, stiffness: 170 } });
  const us = interpolate(u, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
  const uo = interpolate(u, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Wallpaper>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ opacity: o, fontFamily: FONT, fontSize: 84, fontWeight: 800, color: T.ink, letterSpacing: "-0.04em", textAlign: "center", lineHeight: 1.04 }}>One tab. One call.</div>
        <div style={{ opacity: uo, transform: `scale(${us})`, fontFamily: FONT, fontSize: 56, fontWeight: 800, color: "#065f46", letterSpacing: "-0.03em" }}>stocksbrew.online</div>
        <div style={{ opacity: uo, fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkVar }}>Free for your first 3 stocks</div>
      </AbsoluteFill>
    </Wallpaper>
  );
}

const SEG = { scene: 200, cta: 100 };
export const TABS_TOTAL = Object.values(SEG).reduce((x, y) => x + y, 0);

export function TooManyTabs() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SEG.scene}><Scene /></Series.Sequence>
      <Series.Sequence durationInFrames={SEG.cta}><CTA /></Series.Sequence>
    </Series>
  );
}
