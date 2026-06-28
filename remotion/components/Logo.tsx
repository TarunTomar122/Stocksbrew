import React from "react";
import { FONT } from "../fonts";

// Inline vector brand marks — render offline, no asset download, no network.
// Marks where a clean square mark exists (Apple, Microsoft, Meta); brand
// wordmarks for the rest (NVIDIA, Intel), which IS how those brands present.

function Mark({ ticker, px }: { ticker: string; px: number }) {
  const t = ticker.toUpperCase();
  if (t === "AAPL") {
    return (
      <svg width={px * 0.62} height={px * 0.62} viewBox="0 0 24 24" fill="#111215">
        <path d="M17.05 12.54c-.03-2.4 1.96-3.55 2.05-3.6-1.12-1.64-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.76 2.46 3.01 2.41 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.14.75 1.3-.02 2.12-1.18 2.91-2.34.92-1.34 1.3-2.64 1.32-2.71-.03-.01-2.53-.97-2.56-3.85zM14.69 5.4c.66-.8 1.1-1.92.98-3.03-.95.04-2.1.63-2.78 1.43-.61.71-1.14 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34z" />
      </svg>
    );
  }
  if (t === "MSFT") {
    const s = px * 0.6;
    return (
      <svg width={s} height={s} viewBox="0 0 23 23">
        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
        <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
        <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
      </svg>
    );
  }
  if (t === "META") {
    return (
      <svg width={px * 0.72} height={px * 0.52} viewBox="0 0 40 26" fill="none">
        <defs>
          <linearGradient id="mt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0093FF" />
            <stop offset="1" stopColor="#0064E0" />
          </linearGradient>
        </defs>
        <path
          d="M5 13c0-5 2.6-8 6-8 3.7 0 6 4 9 8 3 4 5.3 8 9 8 3.4 0 6-3 6-8s-2.6-8-6-8c-3.7 0-6 4-9 8-3 4-5.3 8-9 8-3.4 0-6-3-6-8z"
          stroke="url(#mt)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (t === "NVDA") {
    return <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: px * 0.2, letterSpacing: "-0.02em", color: "#76B900" }}>NVIDIA</span>;
  }
  if (t === "INTC") {
    return <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: px * 0.3, letterSpacing: "-0.03em", color: "#0068B5" }}>intel</span>;
  }
  return <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: px * 0.4, color: "#111215" }}>{t[0]}</span>;
}

export function Logo({ ticker, size = 56, radius = 14 }: { ticker: string; size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "#ffffff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <Mark ticker={ticker} px={size} />
    </div>
  );
}
