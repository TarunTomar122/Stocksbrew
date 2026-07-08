// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ImageResponse } = require("next/dist/compiled/@vercel/og/index.node") as typeof import("@vercel/og");
import type { NextRequest } from "next/server";

import {
  getStockSummary,
  getStockFacts,
  getStockPriceHistory,
  getStockIntelligenceDoc,
  normalizeStockSymbolParam,
  type PriceHistoryPoint,
  type Directive,
} from "@/lib/stock";
import { normalizeDirectiveForUi, directiveZonePrice } from "@/lib/directive-ui";
import { stockLogoSources } from "@/lib/stock-logo-sources";
import { currencySymbolFor } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1080;
const HEIGHT = 1080;

const INK = "#0f172a";
const MUTED = "#94a3b8";
const FAINT = "#cbd5e1";
const GREEN = "#10b981";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const BRAND = "#047857"; // stocksbrew wordmark green (light-theme --landing-brand)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMoney(value: number, sym: string): string {
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 0 : 2;
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = decPart ? `${withCommas}.${decPart}` : withCommas;
  return `${value < 0 ? "-" : ""}${sym}${body}`;
}

function fmtPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtRatio(value: number): string {
  return value >= 10 ? `${Math.round(value)} : 1` : `${value.toFixed(1)} : 1`;
}

/** Human range label from the actual span of the price series. */
function rangeLabel(points: PriceHistoryPoint[]): string {
  if (points.length < 2) return "recent";
  const first = new Date(points[0].date).getTime();
  const last = new Date(points[points.length - 1].date).getTime();
  const days = Math.round((last - first) / 86_400_000);
  if (days >= 330) return "past year";
  if (days >= 150) return "past 6 months";
  if (days >= 75) return "past 3 months";
  if (days >= 25) return "past month";
  return "recent";
}

/** Fetch a logo and inline it as a data URL so satori always decodes it.
 * Walks the same source chain as the client component and rejects blank
 * placeholders. Returns null if nothing usable resolves. */
async function loadLogoDataUrl(
  ticker: string,
  market: "US" | "IN",
  logoUrl?: string | null,
): Promise<string | null> {
  const sources = stockLogoSources(ticker, market, logoUrl);
  for (const url of sources) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Reject empty/placeholder responses (FMP occasionally returns a blank png).
      if (buf.length < 700) continue;
      return `data:${contentType};base64,${buf.toString("base64")}`;
    } catch {
      continue;
    }
  }
  return null;
}

const CHART_W = 980;
const CHART_H = 300;
const CHART_PAD = 8;

type ChartGeo = {
  line: string;
  area: string;
  endX: number;
  endY: number;
  min: number;
  max: number;
};

/** Build SVG area+line paths plus the last-point coordinate for a marker dot. */
function buildChartGeo(points: PriceHistoryPoint[]): ChartGeo | null {
  const closes = points.map((p) => p.close).filter((c) => Number.isFinite(c));
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const innerW = CHART_W - CHART_PAD * 2;
  const innerH = CHART_H - CHART_PAD * 2;
  const n = closes.length;

  const coords = closes.map((c, i) => {
    const x = CHART_PAD + (i / (n - 1)) * innerW;
    const y = CHART_PAD + innerH - ((c - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [endX, endY] = coords[coords.length - 1];
  const area = `${line} L${endX.toFixed(1)},${(CHART_H - CHART_PAD).toFixed(1)} L${coords[0][0].toFixed(
    1,
  )},${(CHART_H - CHART_PAD).toFixed(1)} Z`;
  return { line, area, endX, endY, min, max };
}

/** Map a price to a chart y-coordinate, clamped to the plot area. */
function priceToY(price: number, min: number, max: number): number {
  const span = max - min || 1;
  const innerH = CHART_H - CHART_PAD * 2;
  const y = CHART_PAD + innerH - ((price - min) / span) * innerH;
  return Math.max(CHART_PAD, Math.min(CHART_H - CHART_PAD, y));
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = normalizeStockSymbolParam(params.symbol);
  if (!symbol) return new Response("Bad symbol", { status: 400 });

  const forcedMarket = new URL(request.url).searchParams.get("m");
  const marketPref: "US" | "IN" = forcedMarket === "IN" ? "IN" : "US";
  const otherMarket: "US" | "IN" = marketPref === "IN" ? "US" : "IN";

  let market: "US" | "IN" = marketPref;
  let stock = await getStockSummary(symbol, marketPref).catch(() => null);
  if (!stock) {
    stock = await getStockSummary(symbol, otherMarket).catch(() => null);
    if (stock) market = otherMarket;
  }
  if (!stock) return new Response("Stock not found", { status: 404 });

  const [facts, history, intel, logoDataUrl] = await Promise.all([
    getStockFacts(stock.instrument_id).catch(() => null),
    getStockPriceHistory(stock.instrument_id).catch(() => [] as PriceHistoryPoint[]),
    getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null),
    loadLogoDataUrl(stock.ticker, market, stock.logo_url).catch(() => null),
  ]);

  const sym = currencySymbolFor(market);
  const price = stock.price;
  const dayPct = stock.day_change_pct ?? 0;
  const up = dayPct >= 0;
  const dayColor = up ? GREEN : RED;

  const target = facts?.analyst?.target_price ?? null;
  const hasTarget = typeof target === "number" && Number.isFinite(target) && target > 0;
  const upsidePct = hasTarget ? ((target - price) / price) * 100 : null;
  const upsidePositive = (upsidePct ?? 0) >= 0;
  const accent = upsidePositive ? GREEN : RED;

  const displayName = stock.name.length > 34 ? stock.name.slice(0, 34) + "…" : stock.name;
  const initials = stock.ticker.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";

  const chart = buildChartGeo(history);
  const closes = history.map((p) => p.close).filter((c) => Number.isFinite(c));
  const chartMin = closes.length ? Math.min(...closes) : null;
  const chartMax = closes.length ? Math.max(...closes) : null;

  // Directive-derived zones (add/trim) + risk-reward ratio.
  const directive: Directive | null =
    normalizeDirectiveForUi(intel?.directive_v2 ?? null) ?? intel?.directive ?? null;
  const stance = directive?.stance;
  const accPrice = directiveZonePrice(directive?.add_on);
  const trimPrice = directiveZonePrice(directive?.trim_on);
  const isTrimStance = stance === "trim" || stance === "avoid";

  // Show whichever zone matches the stance (accumulate band below, trim band above).
  const accZone = !isTrimStance && accPrice !== null && accPrice > 0 ? accPrice : null;
  const trimZone = isTrimStance && trimPrice !== null && trimPrice > 0 ? trimPrice : null;

  // Risk / reward: reward = runway to target, risk = drop to support. Use the
  // deepest available anchor (add zone vs. analyst low) so the ratio stays
  // grounded rather than inflated by an add zone sitting right under price.
  const supportCandidates = [accPrice, facts?.analyst?.target_low].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < price,
  );
  const support =
    supportCandidates.length > 0
      ? Math.min(...supportCandidates)
      : chartMin !== null && chartMin < price
      ? chartMin
      : null;
  let riskReward: number | null = null;
  if (hasTarget && support !== null && price > support) {
    const reward = (target as number) - price;
    const risk = price - support;
    if (reward > 0 && risk > 0) riskReward = reward / risk;
  }
  // Cap the headline number so it reads credible, not spammy.
  const riskRewardLabel = riskReward === null ? null : riskReward > 10 ? "10+ : 1" : fmtRatio(riskReward);

  // Room to the 52-week high (how much runway is left to reclaim the high).
  const week52High = stock.fundamentals?.week_52_high;
  let belowHighPct: number | null = null;
  let atHigh = false;
  if (typeof week52High === "number" && Number.isFinite(week52High) && week52High > 0) {
    if (price >= week52High) atHigh = true;
    else belowHighPct = ((week52High - price) / week52High) * 100;
  }
  const hasHighStat = atHigh || belowHighPct !== null;

  const hasStatStrip = riskReward !== null || hasHighStat;

  // Chart zone band (accumulate below / trim above the dashed level).
  const zonePrice = accZone ?? trimZone;
  const zoneColor = accZone !== null ? GREEN : AMBER;
  const zoneY =
    zonePrice !== null && chartMin !== null && chartMax !== null
      ? priceToY(zonePrice, chartMin, chartMax)
      : null;
  const showBand =
    zoneY !== null &&
    zonePrice !== null &&
    chartMin !== null &&
    chartMax !== null &&
    zonePrice >= chartMin &&
    zonePrice <= chartMax;

  // Up/down triangle as inline SVG (satori's font lacks ▲/▼ glyphs).
  const triangle = (color: string, isUp: boolean, size = 20) => (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "flex" }}>
      <path d={isUp ? "M6 2.5 L10.5 9.5 L1.5 9.5 Z" : "M6 9.5 L10.5 2.5 L1.5 2.5 Z"} fill={color} />
    </svg>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(160deg, #ffffff 0%, #f6f8fb 100%)",
          fontFamily: '"Helvetica Neue", system-ui, -apple-system, sans-serif',
          padding: "72px 68px 60px",
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              width={104}
              height={104}
              alt=""
              style={{
                width: 104,
                height: 104,
                borderRadius: 26,
                objectFit: "contain",
                background: "#ffffff",
                border: "1px solid #eef1f5",
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 104,
                height: 104,
                borderRadius: 26,
                background: accent + "14",
                color: accent,
                fontSize: 40,
                fontWeight: 800,
                boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: INK, letterSpacing: "-0.025em", lineHeight: 1 }}>
              {displayName}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: "0.01em" }}>{stock.ticker}</span>
              {stock.exchange ? (
                <>
                  <span style={{ width: 5, height: 5, borderRadius: 5, background: FAINT, display: "flex" }} />
                  <span style={{ fontSize: 22, fontWeight: 500, color: MUTED }}>{stock.exchange}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Price + day change ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 60 }}>
          <span style={{ fontSize: 116, fontWeight: 800, color: INK, letterSpacing: "-0.045em", lineHeight: 0.9 }}>
            {fmtMoney(price, sym)}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: dayColor + "16",
              borderRadius: 100,
              padding: "12px 20px",
              marginTop: 14,
            }}
          >
            {triangle(dayColor, up, 22)}
            <span style={{ fontSize: 32, fontWeight: 800, color: dayColor, letterSpacing: "-0.01em" }}>
              {fmtPct(dayPct)}
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, color: dayColor, opacity: 0.7 }}>today</span>
          </div>
        </div>

        {/* ── Price target ── */}
        {hasTarget ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginTop: 40,
              padding: "26px 30px",
              borderRadius: 24,
              background: "#ffffff",
              border: `1px solid ${accent}2e`,
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: MUTED, letterSpacing: "0.09em" }}>
                ANALYST PRICE TARGET
              </span>
              <span style={{ fontSize: 50, fontWeight: 800, color: INK, letterSpacing: "-0.025em" }}>
                {fmtMoney(target as number, sym)}
              </span>
            </div>
            <div style={{ display: "flex", flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: accent,
                borderRadius: 100,
                padding: "16px 30px",
                boxShadow: `0 12px 26px ${accent}45`,
              }}
            >
              {triangle("#ffffff", upsidePositive, 24)}
              <span style={{ fontSize: 44, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {fmtPct(upsidePct as number)}
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: "#ffffff", opacity: 0.9 }}>
                {upsidePositive ? "upside" : "downside"}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              marginTop: 40,
              padding: "26px 30px",
              borderRadius: 24,
              background: "#ffffff",
              border: "1px solid #eef1f5",
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 600, color: MUTED }}>No analyst price target available</span>
          </div>
        )}

        {/* ── Risk/reward + zone stat strip ── */}
        {hasStatStrip ? (
          <div style={{ display: "flex", gap: 18, marginTop: 28 }}>
            {riskReward !== null ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                  padding: "22px 26px",
                  borderRadius: 20,
                  background: "#ffffff",
                  border: "1px solid #eef1f5",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 700, color: MUTED, letterSpacing: "0.09em" }}>
                  REWARD / RISK
                </span>
                <span style={{ fontSize: 40, fontWeight: 800, color: riskReward >= 1 ? GREEN : INK, letterSpacing: "-0.02em" }}>
                  {riskRewardLabel}
                </span>
              </div>
            ) : null}
            {hasHighStat ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                  padding: "22px 26px",
                  borderRadius: 20,
                  background: "#ffffff",
                  border: "1px solid #eef1f5",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 700, color: MUTED, letterSpacing: "0.09em" }}>
                  52-WEEK HIGH
                </span>
                <span style={{ fontSize: 40, fontWeight: 800, color: GREEN, letterSpacing: "-0.02em" }}>
                  {atHigh ? "At high" : `${Math.round(belowHighPct as number)}% below`}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Chart ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: hasStatStrip ? 24 : 40,
            padding: "30px 32px 24px",
            borderRadius: 28,
            background: "#ffffff",
            border: "1px solid #eef1f5",
            boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 21, fontWeight: 700, color: "#64748b" }}>Price · {rangeLabel(history)}</span>
            {chartMin !== null && chartMax !== null ? (
              <span style={{ fontSize: 19, fontWeight: 600, color: MUTED }}>
                {fmtMoney(chartMin, sym)} – {fmtMoney(chartMax, sym)}
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", flex: 1, marginTop: 16 }}>
            {chart ? (
              <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: "100%", height: "100%" }}>
                {showBand && zoneY !== null ? (
                  <rect
                    x="0"
                    y={accZone !== null ? zoneY : CHART_PAD}
                    width={CHART_W}
                    height={accZone !== null ? CHART_H - CHART_PAD - zoneY : zoneY - CHART_PAD}
                    fill={zoneColor}
                    fillOpacity="0.09"
                  />
                ) : null}
                <path d={chart.area} fill={accent} fillOpacity="0.12" />
                <path d={chart.line} fill="none" stroke={accent} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />
                {showBand && zoneY !== null ? (
                  <line x1="0" y1={zoneY} x2={CHART_W} y2={zoneY} stroke={zoneColor} strokeWidth="2.5" strokeDasharray="8 8" strokeOpacity="0.7" />
                ) : null}
                <circle cx={chart.endX} cy={chart.endY} r="9" fill={accent} fillOpacity="0.25" />
                <circle cx={chart.endX} cy={chart.endY} r="5" fill={accent} />
              </svg>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", color: FAINT, fontSize: 20 }}>
                Chart data unavailable
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 34 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: BRAND, letterSpacing: "-0.03em" }}>stocksbrew.online</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>/stock/{stock.ticker}</span>
          </div>
          <span style={{ fontSize: 17, fontWeight: 500, color: FAINT }}>Not investment advice</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "cache-control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
