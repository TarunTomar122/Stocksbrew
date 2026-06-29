import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/Logo";
import { MOCK_WHY } from "../mock-data";

// Showcases the "why it moved" features — today's move (anomaly), reddit buzz,
// earnings — mirroring stock-todays-move-rail-card / stock-reddit-buzz-rail /
// upcoming-earnings-callout.
export const WHY_FRAMES = 240;

const W = MOCK_WHY;
const GREEN = "#047857";
const CARD = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: T.surface, borderRadius: 22, border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 18px 50px rgba(17,24,39,0.07)", padding: "30px 30px", display: "flex",
  flexDirection: "column", gap: 16, height: "100%", ...extra,
});
const KICK: React.CSSProperties = { fontFamily: MONO, fontSize: 15, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkVar };

function Dots({ filled }: { filled: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ width: 9, height: 9, borderRadius: 99, background: i <= filled ? GREEN : "transparent", boxShadow: i <= filled ? undefined : `inset 0 0 0 1.5px ${T.outline}` }} />
      ))}
      <span style={{ fontFamily: MONO, fontSize: 14, color: T.inkVar, marginLeft: 4 }}>high</span>
    </span>
  );
}

function Card({ from, children }: { from: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - from, fps, config: { damping: 26, stiffness: 120 } });
  const opacity = interpolate(p, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const ty = interpolate(p, [0, 1], [44, 0]);
  const scale = interpolate(p, [0, 1], [0.96, 1], { extrapolateRight: "clamp" });
  return <div style={{ opacity, transform: `translateY(${ty}px) scale(${scale})` }}>{children}</div>;
}

export function WhyScene() {
  return (
    <Backdrop tint={GREEN}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 110px", gap: 48 }}>
        <SpringIn from={0} direction="up" distance={24}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: T.surface, borderRadius: 999, padding: "10px 22px 10px 12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.05)" }}>
              <Logo ticker={W.ticker} size={40} radius={11} />
              <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: T.ink }}>{W.ticker}</span>
              <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: GREEN, fontVariantNumeric: "tabular-nums" }}>▲ +{W.dayPct}%</span>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 42, fontWeight: 500, color: T.inkVar, letterSpacing: "-0.02em", textAlign: "center" }}>
              Why is it moving?{" "}<span style={{ color: T.ink, fontWeight: 800 }}>We read everything.</span>
            </div>
          </div>
        </SpringIn>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, width: "100%", maxWidth: 1400, alignItems: "stretch" }}>
          {/* Today's move / anomaly */}
          <Card from={16}>
            <div style={CARD()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={KICK}>today&apos;s move</span>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: GREEN }}>▲ +{W.dayPct}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: FONT, fontSize: 23, fontWeight: 700, lineHeight: 1.3, color: T.ink }}>{W.todaysMove.headline}</span>
              </div>
              <Dots filled={3} />
              <span style={{ fontFamily: FONT, fontSize: 19, lineHeight: 1.55, color: T.inkVar }}>{W.todaysMove.body}</span>
            </div>
          </Card>

          {/* Reddit buzz */}
          <Card from={28}>
            <div style={CARD()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: FONT, fontSize: 21, fontWeight: 800, color: T.ink }}>Reddit Buzz</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, border: `1px solid ${T.outline}`, padding: "5px 12px", fontFamily: FONT, fontSize: 14, fontWeight: 700, color: T.inkVar }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: "#ff4500" }} /> r/stocks &amp; more
                </span>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 16, color: "#9aa3af" }}>{W.reddit.scanned} posts scanned · {W.reddit.ago}</span>
              <div style={{ borderTop: `1px solid ${T.surfaceCt}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, lineHeight: 1.35, color: T.ink }}>{W.reddit.post.title}</span>
                <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "#0052ff" }}>r/{W.reddit.post.subreddit}</span>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 18, lineHeight: 1.5, color: T.inkVar }}>{W.reddit.rollup}</span>
            </div>
          </Card>

          {/* Earnings */}
          <Card from={40}>
            <div style={CARD({ background: "linear-gradient(160deg, #fffbeb, #fff7ed 55%, #ffffff)", border: "1px solid #fde68a" })}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: "#fff", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📅</span>
                <span style={{ fontFamily: FONT, fontSize: 21, fontWeight: 800, color: "#111215" }}>Upcoming earnings</span>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#b45309" }}>{W.earnings.when}</span>
              <span style={{ fontFamily: FONT, fontSize: 19, lineHeight: 1.55, color: "#92400e" }}>{W.earnings.prediction}</span>
              <div style={{ marginTop: "auto", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "#b45309" }}>
                Pre-earnings prediction →
              </div>
            </div>
          </Card>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}
