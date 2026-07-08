import { readFileSync } from "fs";
import path from "path";

import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import { getContrarianCalls, type ContrarianCard } from "@/lib/contrarian";
import { MEDIUM_DESCRIPTION, SITE_TITLE_DEFAULT, TAGLINE } from "@/lib/brand-copy";

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
    const data = await getContrarianCalls("US");
    const live = data?.cards?.length ? contrarianToShareCards(data.cards) : [];
    if (live.length >= 3) return live.slice(0, 4);
  } catch {
    // Fall back to static showcase cards when Firestore is unavailable.
  }
  return FALLBACK_CARDS;
}

function ShareCard({ card }: { card: OgShareCard }) {
  const vs = verdictStyle(card.verdict);
  const up = card.dayChangePct >= 0;
  const changeColor = up ? "#059669" : "#dc2626";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";

  return (
    <div
      style={{
        width: 252,
        height: 300,
        background: "#ffffff",
        borderRadius: 20,
        border: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        padding: "22px 20px",
        gap: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>
            {card.ticker}
          </span>
          <span style={{ fontSize: 14, color: "#9ca3af", fontWeight: 400 }}>
            {truncate(card.name, 18)}
          </span>
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: changeColor,
            background: changeBg,
            borderRadius: 999,
            padding: "6px 10px",
            display: "flex",
          }}
        >
          {up ? "+" : ""}
          {card.dayChangePct.toFixed(1)}%
        </span>
      </div>

      <span
        style={{
          alignSelf: "flex-start",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: vs.color,
          background: vs.bg,
          border: `1px solid ${vs.border}`,
          borderRadius: 10,
          padding: "8px 12px",
          display: "flex",
        }}
      >
        {card.verdict}
      </span>

      <span
        style={{
          fontSize: 17,
          lineHeight: 1.45,
          color: "#4b5563",
          fontWeight: 400,
          display: "flex",
          flex: 1,
        }}
      >
        {card.insight}
      </span>
    </div>
  );
}

export async function renderSiteShareImage() {
  const cards = await getOgShareCards();
  const fonts = loadOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(145deg, #0b1220 0%, #111827 55%, #0f172a 100%)",
          fontFamily: "Inter",
          padding: "44px 48px 40px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "#0052ff",
                display: "flex",
              }}
            />
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.04em",
              }}
            >
              stocksbrew
            </span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#e5e7eb", letterSpacing: "-0.02em" }}>
            {TAGLINE}
          </span>
          <span style={{ fontSize: 17, color: "#9ca3af", maxWidth: 760, lineHeight: 1.4, fontWeight: 400 }}>
            {MEDIUM_DESCRIPTION}
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "stretch", flex: 1 }}>
          {cards.map((card) => (
            <ShareCard key={card.ticker} card={card} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingTop: 18,
            borderTop: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#d1d5db" }}>
            www.stocksbrew.online
          </span>
          <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 400 }}>{SITE_TITLE_DEFAULT}</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
    },
  );
}
