import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/Logo";
import { MOCK_CALL } from "../mock-data";

// mirrors the "OUR CALL" hero in components/stock-detail.tsx (VerdictCallChart +
// ConvictionDotsInline + CallInsightCard).
export const OURCALL_FRAMES = 300;

const ACCENT = "#047857"; // accumulate → --signal-bullish
const C = MOCK_CALL;

function boldMoney(text: string) {
  return text.split(/(\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d)?%)/g).map((p, i) =>
    /^(\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d)?%)$/.test(p)
      ? <strong key={i} style={{ fontWeight: 700, color: T.ink }}>{p}</strong>
      : <span key={i}>{p}</span>
  );
}

function Chart({ from }: { from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w = 560, h = 300, padT = 16, padB = 28, padL = 6, padR = 70;
  const data = C.history;
  const min = Math.min(...data) * 0.97;
  const max = Math.max(...data) * 1.03;
  const x = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);

  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${h - padB} L${x(0).toFixed(1)} ${h - padB} Z`;

  const p = spring({ frame: frame - from, fps, config: { damping: 40, stiffness: 60 } });
  const revealW = interpolate(p, [0, 1], [0, w]);
  const zoneOpacity = interpolate(frame, [from + 10, from + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const markerP = spring({ frame: frame - (from + 38), fps, config: { damping: 14, stiffness: 200 } });
  const markerScale = interpolate(markerP, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const zoneTop = y(C.buyBelow);
  const lastX = x(data.length - 1), lastY = y(data[data.length - 1]);

  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="oc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity="0.18" />
          <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
        <clipPath id="oc-rv"><rect x="0" y="0" width={revealW} height={h} /></clipPath>
      </defs>

      {/* accumulate zone band */}
      <g style={{ opacity: zoneOpacity }}>
        <rect x={padL} y={zoneTop} width={w - padL - padR} height={h - padB - zoneTop} fill={ACCENT} opacity={0.07} rx={6} />
        <text x={padL + 10} y={zoneTop + 26} fontFamily={MONO} fontSize="14" letterSpacing="2" fill={ACCENT} opacity={0.7}>ACCUMULATE</text>
      </g>

      <g clipPath="url(#oc-rv)">
        <path d={area} fill="url(#oc-area)" />
        <path d={line} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      </g>

      {/* now marker */}
      <g transform={`translate(${lastX},${lastY})`} style={{ opacity: markerScale }}>
        <circle r={7 * markerScale} fill={ACCENT} stroke="#fff" strokeWidth="3" />
        <g transform="translate(14,-14)">
          <rect x="0" y="-16" width="120" height="32" rx="8" fill="#fff" stroke={T.outline} />
          <text x="12" y="5" fontFamily={FONT} fontSize="16" fontWeight="700" fill={T.ink}>Now ${C.price}</text>
        </g>
      </g>
    </svg>
  );
}

function ConvictionDots() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3].map((i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 99, background: ACCENT }} />)}
      </div>
      <span style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkVar }}>High conviction</span>
    </div>
  );
}

function Returns({ from }: { from: number }) {
  const items = [{ l: "3M", v: C.returns.m3 }, { l: "6M", v: C.returns.m6 }, { l: "1Y", v: C.returns.y1 }];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: `1px solid ${T.outline}`, paddingTop: 22, marginTop: 26 }}>
      {items.map((it, i) => (
        <SpringIn key={it.l} from={from + i * 6} direction="up" distance={14}>
          <div style={{ textAlign: "center", borderLeft: i === 0 ? "none" : `1px solid ${T.outline}` }}>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkVar }}>{it.l}</div>
            <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 800, color: it.v >= 0 ? ACCENT : "#b91c1c", fontVariantNumeric: "tabular-nums", marginTop: 6 }}>
              {it.v >= 0 ? "+" : ""}{it.v.toFixed(1)}%
            </div>
          </div>
        </SpringIn>
      ))}
    </div>
  );
}

function InsightCol({ title, tone, bullets, from }: { title: string; tone: "bull" | "bear"; bullets: string[]; from: number }) {
  const c = tone === "bull" ? ACCENT : "#b91c1c";
  return (
    <SpringIn from={from} direction="up" distance={20}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: c, marginBottom: 16 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontFamily: FONT, fontSize: 19, lineHeight: 1.45, color: "#2b3036" }}>
              <span style={{ marginTop: 11, width: 6, height: 6, borderRadius: 99, background: c, flexShrink: 0 }} />
              <span>{boldMoney(b)}</span>
            </div>
          ))}
        </div>
      </div>
    </SpringIn>
  );
}

export function OurCallScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const verdictP = spring({ frame: frame - 30, fps, config: { damping: 16, stiffness: 130 } });
  const verdictOpacity = interpolate(verdictP, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const verdictTy = interpolate(verdictP, [0, 1], [24, 0]);

  return (
    <Backdrop tint={ACCENT}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 120px" }}>
        <SpringIn from={4} direction="up" distance={44} scaleFrom={0.975} config={{ damping: 26, stiffness: 120 }} style={{ width: "100%", maxWidth: 1320 }}>
          <div style={{ background: T.surface, borderRadius: 26, border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 40px 90px rgba(17,24,39,0.12), 0 6px 16px rgba(17,24,39,0.05)", padding: "44px 48px" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <Logo ticker={C.ticker} size={52} radius={13} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: "-0.01em" }}>{C.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, color: T.inkVar }}>{C.meta}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums" }}>${C.price}</div>
                <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, color: ACCENT }}>▲ +{C.dayPct}% · +${C.dayAbs} today</div>
              </div>
            </div>

            {/* two columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
              {/* left: the call */}
              <div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, letterSpacing: "0.13em", textTransform: "uppercase", color: "#3f7d68" }}>our call</div>
                <div style={{ opacity: verdictOpacity, transform: `translateY(${verdictTy}px)`, display: "flex", alignItems: "flex-end", gap: 18, marginTop: 8 }}>
                  <h2 style={{ fontFamily: FONT, fontSize: 72, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.03em", color: ACCENT, margin: 0 }}>{C.stanceLabel}</h2>
                  <ConvictionDots />
                </div>
                <SpringIn from={48} direction="up" distance={16}>
                  <p style={{ fontFamily: FONT, fontSize: 24, lineHeight: 1.5, color: "#2b3036", marginTop: 24 }}>{boldMoney(C.body)}</p>
                  <p style={{ fontFamily: FONT, fontSize: 20, lineHeight: 1.5, color: T.inkVar, marginTop: 12 }}>{boldMoney(C.levels)}</p>
                </SpringIn>
                <Returns from={60} />
              </div>

              {/* right: chart */}
              <div>
                <SpringIn from={36} direction="none">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 99, background: ACCENT }} />
                    <span style={{ fontFamily: FONT, fontSize: 19, fontWeight: 600, color: T.ink }}>Buy below ${C.buyBelow.toFixed(2)}</span>
                  </div>
                </SpringIn>
                <Chart from={40} />
              </div>
            </div>

            {/* drivers / risks */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: `1px solid ${T.outline}`, marginTop: 34, paddingTop: 30 }}>
              <div style={{ paddingRight: 40, borderRight: `1px solid ${T.outline}` }}>
                <InsightCol title="drivers" tone="bull" bullets={C.drivers} from={96} />
              </div>
              <div style={{ paddingLeft: 40 }}>
                <InsightCol title="risks" tone="bear" bullets={C.risks} from={108} />
              </div>
            </div>
          </div>
        </SpringIn>
      </AbsoluteFill>
    </Backdrop>
  );
}
