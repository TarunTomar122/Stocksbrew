import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Series } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { MOCK_STOCK, MOCK_SIGNAL_TILES, MOCK_RANGE } from "../mock-data";
import { FONT } from "../fonts";
import type { SignalTileModel } from "@/components/signal-tile";

const BG = "#f6f7f9";
const CARD_BG = "#ffffff";
const BORDER = "#e5e7eb";
const TEXT = "#111215";
const MUTED = "#6b7280";
const LIGHT_MUTED = "#9ca3af";
const GREEN = "#10b981";
const PURPLE = "#6b38d4";

// ─── Shared leading text ─────────────────────────────────────────────────────

function LeadingText({ line1, bold, from = 0 }: { line1: string; bold: string; from?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(progress, [0, 1], [20, 0]);

  return (
    <div style={{ opacity, transform: `translateY(${ty}px)`, textAlign: "center" as const, fontFamily: FONT, fontSize: 22, fontWeight: 500, color: MUTED, letterSpacing: "-0.01em", maxWidth: 760 }}>
      {line1}{" "}
      <span style={{ color: TEXT, fontWeight: 700 }}>{bold}</span>
    </div>
  );
}

// ─── Signal tile (inline styled) ────────────────────────────────────────────

function headlineColor(tone?: SignalTileModel["tone"]) {
  if (tone === "up")   return GREEN;
  if (tone === "down") return "#ef4444";
  if (tone === "warn") return "#b45309";
  return TEXT;
}

function SignalTile({ signal, from }: { signal: SignalTileModel; from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - from, fps, config: { damping: 200 } });
  const opacity = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(progress, [0, 1], [48, 0]);
  const scale = interpolate(progress, [0, 1], [0.92, 1], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        opacity, transform: `translateY(${ty}px) scale(${scale})`,
        display: "flex", flexDirection: "column", gap: 12,
        borderRadius: 16, border: `1px solid ${BORDER}`,
        background: CARD_BG, padding: "18px 18px",
        width: 190, minHeight: 156, flexShrink: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <span style={{ display: "inline-flex", width: 38, height: 38, borderRadius: 10, background: signal.bg, alignItems: "center", justifyContent: "center", fontSize: 19 }}>
        {signal.emoji}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>
          {signal.label}
        </span>
        <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: headlineColor(signal.tone) }}>
          {signal.headline}
        </span>
        {signal.supporting && (
          <span style={{ fontFamily: FONT, fontSize: 12, color: MUTED, lineHeight: 1.45 }}>
            {signal.supporting}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Phase A: Signal tiles spotlight ────────────────────────────────────────
// Duration: 150 frames (5s)

function SignalTilesPhase() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 100px", gap: 48 }}>
      <LeadingText line1="Understand any stock —" bold="in plain, simple language." from={0} />

      {/* Stock context chip */}
      <SpringIn from={12} direction="up" distance={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 40, padding: "8px 18px 8px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#76b900", fontSize: 13, fontWeight: 900, fontFamily: FONT }}>N</span>
          </div>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>NVDA</span>
          <span style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>NVIDIA Corporation</span>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: GREEN }}>↑ +2.86%</span>
        </div>
      </SpringIn>

      {/* Signal tiles — stagger in */}
      <div style={{ display: "flex", gap: 14 }}>
        {MOCK_SIGNAL_TILES.map((signal, i) => (
          <SignalTile key={signal.label} signal={signal} from={24 + i * 16} />
        ))}
      </div>
    </div>
  );
}

// ─── Animated Range Bar ──────────────────────────────────────────────────────

function AnimatedRangeBar({ low, high, current, startFrame }: { low: number; high: number; current: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const span = high - low;
  const targetPct = ((current - low) / span) * 100;
  const progress = spring({ frame: frame - startFrame, fps: 30, config: { damping: 200 } });
  const markerPct = interpolate(progress, [0, 1], [0, targetPct], { extrapolateRight: "clamp" });
  const fmt = (v: number) => `$${v.toFixed(2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>
        52-Week Price Range
      </span>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>Low</span>
          <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: TEXT }}>{fmt(low)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>High</span>
          <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: TEXT }}>{fmt(high)}</span>
        </div>
      </div>
      <div style={{ position: "relative", height: 10 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "linear-gradient(90deg, #f97316 0%, #f59e0b 22%, #84cc16 55%, #10b981 100%)" }} />
        <div style={{ position: "absolute", inset: "0 7px" }}>
          <span style={{ position: "absolute", top: "50%", left: `${markerPct}%`, transform: "translate(-50%, -50%)", width: 16, height: 16, borderRadius: "50%", background: CARD_BG, boxShadow: "0 0 0 2.5px #111111", display: "block" }} />
        </div>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 12, color: MUTED }}>
        Today <strong style={{ color: TEXT }}>{fmt(current)}</strong>
      </span>
    </div>
  );
}

// ─── Animated RSI Bar ────────────────────────────────────────────────────────

function AnimatedRsiBar({ value, startFrame }: { value: number; startFrame: number }) {
  const frame = useCurrentFrame();
  const clamped = Math.max(0, Math.min(100, value));
  const verdict = value >= 70 ? { label: "Overbought", color: "#dc2626" }
    : value <= 30 ? { label: "Oversold", color: "#0052ff" }
    : { label: "Neutral", color: GREEN };
  const progress = spring({ frame: frame - startFrame, fps: 30, config: { damping: 200 } });
  const markerPct = interpolate(progress, [0, 1], [0, clamped], { extrapolateRight: "clamp" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>RSI (14)</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: TEXT }}>{value.toFixed(1)}</span>
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: verdict.color }}>{verdict.label}</span>
      </div>
      <div style={{ position: "relative", height: 10 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 99, overflow: "hidden", background: "#f3f4f6" }}>
          <div style={{ position: "absolute", inset: "0 auto 0 0", width: "30%", background: "rgba(239,68,68,0.18)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "30%", width: "40%", background: "linear-gradient(90deg, #84cc16 0%, #10b981 100%)", opacity: 0.85 }} />
          <div style={{ position: "absolute", inset: "0 0 0 auto", width: "30%", background: "rgba(239,68,68,0.18)" }} />
        </div>
        <div style={{ position: "absolute", inset: "0 7px" }}>
          <span style={{ position: "absolute", top: "50%", left: `${markerPct}%`, transform: "translate(-50%, -50%)", width: 16, height: 16, borderRadius: "50%", background: CARD_BG, boxShadow: "0 0 0 2.5px #111111", display: "block" }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: LIGHT_MUTED }}>
        <span>Oversold</span><span>Healthy</span><span>Overbought</span>
      </div>
    </div>
  );
}

// ─── Phase B: Position context spotlight ────────────────────────────────────
// Duration: 120 frames (4s)

function PositionPhase() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 140px", gap: 48 }}>
      <LeadingText line1="Then see exactly where it" bold="sits in its range today." from={0} />

      <SpringIn from={14} direction="up" distance={40} style={{ width: "100%", maxWidth: 920 }}>
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "32px 40px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em", marginBottom: 32 }}>
            Where it sits today
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
            <AnimatedRangeBar low={MOCK_RANGE.week52Low} high={MOCK_RANGE.week52High} current={MOCK_RANGE.currentPrice} startFrame={22} />
            <AnimatedRsiBar value={MOCK_RANGE.rsi} startFrame={32} />
          </div>
        </div>
      </SpringIn>
    </div>
  );
}

// ─── Scene — sequences Phase A then Phase B ──────────────────────────────────

export function DailyOverviewScene() {
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: BG }}>
      <Series>
        <Series.Sequence durationInFrames={150}>
          <AbsoluteFill>
            <SignalTilesPhase />
          </AbsoluteFill>
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <AbsoluteFill>
            <PositionPhase />
          </AbsoluteFill>
        </Series.Sequence>
      </Series>
    </div>
  );
}
