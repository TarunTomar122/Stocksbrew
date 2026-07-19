import { readFileSync } from "fs";
import path from "path";

import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import type { ContrarianCard } from "@/lib/contrarian";
import { TAGLINE } from "@/lib/brand-copy";

export const OG_SIZE = { width: 1200, height: 630 } as const;

let fontCache: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }> | null =
  null;

function loadOgFonts() {
  if (fontCache) return fontCache;
  const regularPath = path.join(process.cwd(), "assets/og/inter-400.woff");
  const boldPath = path.join(process.cwd(), "assets/og/inter-700.woff");
  fontCache = [
    {
      name: "Inter",
      data: readFileSync(regularPath).buffer,
      weight: 400,
      style: "normal",
    },
    {
      name: "Inter",
      data: readFileSync(boldPath).buffer,
      weight: 700,
      style: "normal",
    },
  ];
  return fontCache;
}

export type OgShareCard = {
  ticker: string;
  name: string;
  verdict: string;
  insight: string;
  dayChangePct: number;
};

const FALLBACK_CARDS: OgShareCard[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    verdict: "Buy",
    insight: "AI demand still driving the setup",
    dayChangePct: 2.1,
  },
  {
    ticker: "AAPL",
    name: "Apple",
    verdict: "Hold",
    insight: "Wait for a pullback before adding",
    dayChangePct: 0.6,
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    verdict: "Sell",
    insight: "Momentum fading after the run",
    dayChangePct: -1.8,
  },
  {
    ticker: "META",
    name: "Meta",
    verdict: "Buy",
    insight: "Strong fundamentals, buy dips below support",
    dayChangePct: -1.2,
  },
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

function verdictStyle(verdict: string): { bg: string; color: string; border: string } {
  const v = verdict.toLowerCase();
  if (v.includes("buy") || v.includes("accumulate")) {
    return { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" };
  }
  if (v.includes("sell") || v.includes("avoid")) {
    return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" };
  }
  if (v.includes("trim")) {
    return { bg: "#fffbeb", color: "#b45309", border: "#fde68a" };
  }
  return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
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
    insight: truncate(card.reason, 72),
    dayChangePct: card.day_change_pct ?? 0,
  }));
}

export async function getOgShareCards(): Promise<OgShareCard[]> {
  try {
    // Keep the public share image available when Firebase credentials are not
    // configured (for local previews and crawler fallbacks).
    const { getContrarianCalls } = await import("@/lib/contrarian");
    const data = await getContrarianCalls("US");
    const live = data?.cards?.length ? contrarianToShareCards(data.cards) : [];
    if (live.length >= 3) return live.slice(0, 4);
  } catch {
    // Fall back to static showcase cards when Firestore is unavailable.
  }
  return FALLBACK_CARDS;
}

function WatchlistRow({ card }: { card: OgShareCard }) {
  const vs = verdictStyle(card.verdict);
  const up = card.dayChangePct >= 0;
  const changeColor = up ? "#059669" : "#dc2626";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";

  return (
    <div
      style={{
        width: "100%",
        minHeight: 112,
        background: "#ffffff",
        borderRadius: 14,
        border: "1px solid #e6ece9",
        display: "flex",
        alignItems: "center",
        padding: "18px 20px",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 88, gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#172a24", letterSpacing: "-0.03em" }}>
          {card.ticker}
        </span>
        <span style={{ fontSize: 12, color: "#789087", fontWeight: 400 }}>
          {truncate(card.name, 14)}
        </span>
      </div>

      <span
        style={{
          width: 68,
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: vs.color,
          background: vs.bg,
          border: `1px solid ${vs.border}`,
          borderRadius: 999,
          padding: "7px 10px",
          display: "flex",
          flexShrink: 0,
        }}
      >
        {card.verdict}
      </span>

      <span
        style={{
          flex: 1,
          fontSize: 15,
          lineHeight: 1.35,
          color: "#52665e",
          fontWeight: 400,
          display: "flex",
        }}
      >
        {truncate(card.insight, 52)}
      </span>

      <span
        style={{
          minWidth: 56,
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          color: changeColor,
          background: changeBg,
          borderRadius: 999,
          padding: "7px 9px",
          display: "flex",
          flexShrink: 0,
        }}
      >
        {up ? "+" : ""}
        {card.dayChangePct.toFixed(1)}%
      </span>
    </div>
  );
}

export async function renderSiteShareImage() {
  const cards = await getOgShareCards();
  const fonts = loadOgFonts();
  const visibleCards = cards.slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          display: "flex",
          background: "linear-gradient(135deg, #f8fbf9 0%, #f1f7f4 100%)",
          fontFamily: "Inter",
          padding: "40px",
          gap: "34px",
        }}
      >
        <div
          style={{
            width: 420,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "12px 0 14px 8px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 44 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: "#10b981",
                  display: "flex",
                }}
              />
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#174c3a",
                  letterSpacing: "-0.04em",
                }}
              >
                stocksbrew
              </span>
            </div>
            <span style={{ fontSize: 50, fontWeight: 700, color: "#172a24", letterSpacing: "-0.055em", lineHeight: 1.04 }}>
              {TAGLINE}
            </span>
            <span style={{ fontSize: 20, color: "#587067", maxWidth: 392, lineHeight: 1.45, fontWeight: 400, marginTop: 18 }}>
              Clear buy, hold, and sell guidance, with alerts when something changes.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#2f735c", letterSpacing: "0.04em" }}>
              BUY · HOLD · SELL
            </span>
            <span style={{ fontSize: 15, color: "#789087", fontWeight: 400 }}>
              US stocks · Free for 3 stocks
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: "#ffffff",
            border: "1px solid #dce8e2",
            borderRadius: 24,
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 22px 55px rgba(26, 65, 49, 0.12)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 22, color: "#172a24", fontWeight: 700, letterSpacing: "-0.03em" }}>
                Your watchlist
              </span>
              <span style={{ fontSize: 13, color: "#789087", fontWeight: 400 }}>
                What to do next
              </span>
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#047857",
                background: "#ecfdf5",
                borderRadius: 999,
                padding: "8px 12px",
                display: "flex",
              }}
            >
              Updated today
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleCards.map((card) => (
              <WatchlistRow key={card.ticker} card={card} />
            ))}
          </div>

          <div style={{ flex: 1, display: "flex" }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderTop: "1px solid #edf2ef",
              paddingTop: 18,
              marginTop: 18,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 999, background: "#10b981", display: "flex" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#315b4b" }}>
              Guidance that stays with your stocks.
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
    },
  );
}
