import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictColors(verdict: string): { bg: string; color: string; textColor: string } {
  if (verdict.includes("Strong buy") || verdict.includes("Buy"))
    return { bg: "#ecfdf5", color: "#10b981", textColor: "#065f46" };
  if (verdict.includes("Hold"))
    return { bg: "#fef3c7", color: "#f59e0b", textColor: "#92400e" };
  if (verdict.includes("Cautious"))
    return { bg: "#fff7ed", color: "#f97316", textColor: "#9a3412" };
  return { bg: "#fef2f2", color: "#ef4444", textColor: "#991b1b" };
}

function barColor(score: number): string {
  if (score >= 60) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function badgeStyle(v: string): { bg: string; color: string; label: string } {
  if (v === "strong" || v === "solid") return { bg: "#d1fae5", color: "#065f46", label: v === "strong" ? "Strong" : "Solid" };
  if (v === "mixed") return { bg: "#fef3c7", color: "#92400e", label: "Mixed" };
  return { bg: "#fef2f2", color: "#991b1b", label: "Weak" };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const sp = new URL(request.url).searchParams;
  const ticker  = decodeURIComponent(params.ticker).toUpperCase().slice(0, 10);
  const name    = sp.get("name") ?? ticker;
  const price   = sp.get("price") ?? "";
  const change  = sp.get("change") ?? "";
  const verdict = sp.get("verdict") ?? "Hold / watch";
  const score   = parseFloat(sp.get("score") ?? "50");
  const logoUrl = sp.get("logo") ?? "";

  const reasons = [sp.get("r1"), sp.get("r2"), sp.get("r3")].filter(Boolean) as string[];

  const pillars = [
    { label: "Valuation", score: parseFloat(sp.get("vs") ?? "50"), v: sp.get("vv") ?? "mixed" },
    { label: "Growth",    score: parseFloat(sp.get("gs") ?? "50"), v: sp.get("gv") ?? "mixed" },
    { label: "Quality",   score: parseFloat(sp.get("qs") ?? "50"), v: sp.get("qv") ?? "mixed" },
    { label: "Momentum",  score: parseFloat(sp.get("ms") ?? "50"), v: sp.get("mv") ?? "mixed" },
  ];

  const vc = verdictColors(verdict);
  const isPositive = change.startsWith("+");
  const displayName = name.length > 32 ? name.slice(0, 32) + "…" : name;
  const initials = ticker.slice(0, 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: 900,
          height: 1060,
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          fontFamily: '"Helvetica Neue", system-ui, -apple-system, sans-serif',
          overflow: "hidden",
          borderRadius: 0,
        }}
      >
        {/* ── COLORED TOP SECTION ── */}
        <div
          style={{
            background: vc.bg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "52px 60px 44px",
            gap: 0,
          }}
        >
          {/* Logo + name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, width: "100%" }}>
            {/* Logo circle */}
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                width={64}
                height={64}
                style={{ borderRadius: 16, objectFit: "contain", background: "#fff" }}
                alt=""
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: vc.color + "22",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 800,
                  color: vc.textColor,
                }}
              >
                {initials}
              </div>
            )}

            {/* Name + price */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: vc.textColor, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                {displayName}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: vc.textColor, opacity: 0.5 }}>{ticker}</span>
                <span style={{ width: 1, height: 14, background: vc.textColor, opacity: 0.2, display: "flex" }} />
                {price ? <span style={{ fontSize: 17, fontWeight: 700, color: vc.textColor }}>{price}</span> : null}
                {change ? (
                  <span style={{ fontSize: 15, fontWeight: 600, color: isPositive ? "#059669" : "#dc2626" }}>
                    {change}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: "100%", height: 1, background: vc.color, opacity: 0.2, margin: "32px 0 28px", display: "flex" }} />

          {/* Verdict + score pill - one row */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 48,
              fontWeight: 800,
              color: vc.textColor,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}>
              {verdict}
            </span>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: vc.color + "28",
              borderRadius: 100,
              padding: "10px 20px",
            }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: vc.textColor, letterSpacing: "-0.03em", lineHeight: 1 }}>
                {score % 1 === 0 ? score : score.toFixed(1)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 500, color: vc.textColor, opacity: 0.5 }}>/ 100</span>
            </div>
          </div>
        </div>

        {/* ── WHITE BOTTOM ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "36px 60px 44px",
            gap: 0,
            background: "#ffffff",
          }}
        >
          {/* Reasons */}
          {reasons.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: 100,
                    background: vc.color,
                    marginTop: 8,
                    flexShrink: 0,
                    display: "flex",
                  }} />
                  <span style={{ fontSize: 18, color: "#374151", lineHeight: 1.5, fontWeight: 400 }}>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Divider before pillars */}
          <div style={{ width: "100%", height: 1, background: "#f3f4f6", marginBottom: 28, display: "flex" }} />

          {/* 2×2 Pillar grid */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {pillars.map((p) => {
              const bc = barColor(p.score);
              const badge = badgeStyle(p.v);
              return (
                <div
                  key={p.label}
                  style={{
                    width: "calc(50% - 6px)",
                    background: "#f9fafb",
                    borderRadius: 14,
                    padding: "18px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {/* Label + badge row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#9ca3af" }}>{p.label}</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: badge.color,
                      background: badge.bg,
                      borderRadius: 100,
                      padding: "3px 10px",
                    }}>
                      {badge.label}
                    </span>
                  </div>
                  {/* Score */}
                  <span style={{ fontSize: 28, fontWeight: 800, color: bc, letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {p.score % 1 === 0 ? p.score : p.score.toFixed(1)}
                  </span>
                  {/* Bar */}
                  <div style={{ height: 4, background: "#e5e7eb", borderRadius: 100, display: "flex" }}>
                    <div style={{ width: `${p.score}%`, height: 4, background: bc, borderRadius: 100 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1, display: "flex" }} />

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#9ca3af", letterSpacing: "-0.01em" }}>
              www.stocksbrew.online/should-i-buy/{ticker}
            </span>
            <span style={{ fontSize: 13, color: "#d1d5db" }}>Not investment advice</span>
          </div>
        </div>
      </div>
    ),
    { width: 900, height: 1060 },
  );
}
