import { readFileSync } from "fs";
import path from "path";

import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import type { ContrarianCard } from "@/lib/contrarian";
import { TAGLINE } from "@/lib/brand-copy";

export const OG_SIZE = { width: 1200, height: 630 } as const;

// Hardcoded oa-design tokens - Satori doesn't support CSS custom properties.
const INK = "#292929";
const MUTED = "#6d6d6d";
const BORDER = "#e3e3e3";
const BG = "#f6f6f6";
const CARD = "#ffffff";
const PRIMARY = "#305dde";
const PRIMARY_TINT = "#eaf0fd";
const BULLISH = "#047857";
const BULLISH_TINT = "#e7f5ef";
const BEARISH = "#b91c1c";
const BEARISH_TINT = "#fdecec";

let fontCache: Array<{ name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: "normal" }> | null =
  null;

function readFont(filePath: string): ArrayBuffer {
  const data = readFileSync(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function loadOgFonts() {
  if (fontCache) return fontCache;
  const regularPath = path.join(process.cwd(), "assets/og/inter-400.woff");
  const boldPath = path.join(process.cwd(), "assets/og/inter-700.woff");
  fontCache = [
    { name: "Inter", data: readFont(regularPath), weight: 400, style: "normal" },
    { name: "Inter", data: readFont(boldPath), weight: 700, style: "normal" },
  ];
  return fontCache;
}

export type OgShareCard = {
  ticker: string;
  name: string;
  verdict: string;
  insight: string;
  dayChangePct: number;
  upsidePct: number | null;
};

const FALLBACK_CARDS: OgShareCard[] = [
  { ticker: "NVDA", name: "NVIDIA Corp.", verdict: "Buy", insight: "AI demand still driving the setup", dayChangePct: 2.1, upsidePct: 18 },
  { ticker: "AAPL", name: "Apple Inc.", verdict: "Hold", insight: "Wait for a pullback before adding", dayChangePct: 0.6, upsidePct: 6 },
  { ticker: "TSLA", name: "Tesla, Inc.", verdict: "Sell", insight: "Momentum fading after the run", dayChangePct: -1.8, upsidePct: -4 },
  { ticker: "META", name: "Meta Platforms", verdict: "Buy", insight: "Strong fundamentals, buy dips below support", dayChangePct: -1.2, upsidePct: 22 },
];

function normalizeVerdict(raw: string, side?: "bull" | "bear"): string {
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower.includes("accumulate") || lower.includes("buy")) return "Buy";
  if (lower.includes("trim")) return "Trim";
  if (lower.includes("sell") || lower.includes("avoid")) return "Sell";
  if (lower.includes("hold") || lower.includes("watch")) return "Hold";
  if (side === "bull") return "Buy";
  if (side === "bear") return "Sell";
  return v.length <= 10 ? v : "Hold";
}

function verdictStyle(verdict: string): { bg: string; color: string } {
  const v = verdict.toLowerCase();
  if (v.includes("buy") || v.includes("accumulate")) return { bg: BULLISH_TINT, color: BULLISH };
  if (v.includes("sell") || v.includes("avoid")) return { bg: BEARISH_TINT, color: BEARISH };
  return { bg: PRIMARY_TINT, color: PRIMARY };
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function contrarianToShareCards(cards: ContrarianCard[]): OgShareCard[] {
  return cards.slice(0, 4).map((card) => ({
    ticker: card.ticker,
    name: card.name,
    verdict: normalizeVerdict(card.our_stance, card.our_side),
    insight: truncate(card.reason, 90),
    dayChangePct: card.day_change_pct ?? 0,
    upsidePct: card.upside_pct,
  }));
}

export async function getOgShareCards(): Promise<OgShareCard[]> {
  try {
    // Keep the public share image available when Firebase credentials are not
    // configured (for local previews and crawler fallbacks).
    const { getContrarianCalls } = await import("@/lib/contrarian");
    const data = await getContrarianCalls("US");
    const live = data?.cards?.length ? contrarianToShareCards(data.cards) : [];
    if (live.length >= 1) return live;
  } catch {
    // Fall back to static showcase cards when Firestore is unavailable.
  }
  return FALLBACK_CARDS;
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>{label}</span>
      <span style={{ fontSize: 20, color: INK, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</span>
      {sub ? <span style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>{sub}</span> : null}
    </div>
  );
}

export async function renderSiteShareImage() {
  const cards = await getOgShareCards();
  const fonts = loadOgFonts();
  const featured = cards[0];
  const vs = verdictStyle(featured.verdict);
  const up = featured.dayChangePct >= 0;
  const changeColor = up ? BULLISH : BEARISH;

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          display: "flex",
          flexDirection: "column",
          background: BG,
          fontFamily: "Inter",
          padding: "56px",
        }}
      >
        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: PRIMARY, letterSpacing: "-0.02em" }}>
            stocksbrew
          </span>
        </div>

        <div style={{ display: "flex", flex: 1, gap: 56, alignItems: "center" }}>
          {/* left: headline */}
          <div style={{ width: 460, display: "flex", flexDirection: "column", gap: 20 }}>
            <span style={{ fontSize: 54, fontWeight: 700, color: INK, letterSpacing: "-0.03em", lineHeight: 1.08 }}>
              {TAGLINE}
            </span>
            <span style={{ fontSize: 20, color: MUTED, lineHeight: 1.5, fontWeight: 400 }}>
              A real read from today&apos;s market. Every stock gets one.
            </span>
          </div>

          {/* right: the live brief card */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 28,
              padding: "32px",
              boxShadow: "0 24px 60px rgba(41,41,41,0.12)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: BULLISH, display: "flex" }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>Live brief</span>
              <div style={{ flex: 1, display: "flex" }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: MUTED,
                  background: BG,
                  borderRadius: 999,
                  padding: "6px 14px",
                  display: "flex",
                }}
              >
                {featured.ticker}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: PRIMARY_TINT,
                  color: PRIMARY,
                  fontSize: 17,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {featured.ticker.slice(0, 2)}
              </div>
              <span style={{ fontSize: 19, color: MUTED, fontWeight: 400 }}>{featured.name}</span>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 14, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: vs.color,
                  background: vs.bg,
                  borderRadius: 999,
                  padding: "9px 18px",
                  display: "flex",
                }}
              >
                {featured.verdict}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: changeColor }}>
                {up ? "+" : ""}
                {featured.dayChangePct.toFixed(1)}% today
              </span>
            </div>

            <span style={{ fontSize: 17, lineHeight: 1.5, color: INK, fontWeight: 400, marginBottom: 22 }}>
              {featured.insight}
            </span>

            <div style={{ display: "flex", gap: 40, borderTop: `1px solid ${BORDER}`, paddingTop: 22 }}>
              <StatBlock
                label="Analyst room"
                value={featured.upsidePct !== null ? `${featured.upsidePct >= 0 ? "+" : ""}${featured.upsidePct.toFixed(0)}%` : "—"}
              />
              <StatBlock label="Coverage" value="US stocks" sub="Free for 3 stocks" />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 40 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: PRIMARY, display: "flex" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>
            Guidance that stays with your stocks.
          </span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
    },
  );
}
