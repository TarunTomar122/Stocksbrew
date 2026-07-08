"use client";

import { useEffect, useState } from "react";

import { stockLogoSources } from "@/lib/stock-logo-sources";

type Props = {
  ticker: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
  /** "IN" tickers need an `.NS` suffix on FMP and a domain-keyed Clearbit
   * fallback to land a real logo. Defaults to "US" behaviour. */
  market?: "US" | "IN";
  /** Background used for the monogram fallback. */
  fallbackBg?: string;
  /** Text color used for the monogram fallback. */
  fallbackFg?: string;
  /** Load immediately for above-the-fold logos (hero, etc.). */
  eager?: boolean;
};

function fallbackColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i += 1) {
    hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 62% 28%)`;
}

export function StockLogo({
  ticker,
  logoUrl,
  size = 32,
  className = "",
  market = "US",
  fallbackBg = "#1c1c1e",
  fallbackFg = "#ffffff",
  eager = false,
}: Props) {
  const upper = ticker.toUpperCase();

  // Source chain: ticker CDN/domain providers → FMP → monogram. FMP sometimes
  // returns a 200 response with a mostly empty placeholder, so keep it last.
  const sources = stockLogoSources(ticker, market, logoUrl);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSourceIndex(0);
    setLoaded(false);
  }, [upper, market]);

  const initials = upper.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
  const dim = `${size}px`;
  const bg = fallbackBg === "#1c1c1e" ? fallbackColor(upper) : fallbackBg;

  const fallback = (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-md font-semibold"
      style={{
        background: bg,
        color: fallbackFg,
        fontSize: Math.round(size * (initials.length > 1 ? 0.34 : 0.45)),
      }}
      aria-hidden
    >
      {initials}
    </div>
  );

  if (sourceIndex >= sources.length) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-md ${className}`}
        style={{ width: dim, height: dim }}
        aria-hidden
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md ring-1 ring-[#e5e7eb] ${className}`}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      {fallback}
      <img
        key={sourceIndex}
        src={sources[sourceIndex]}
        alt=""
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onError={() => {
          setLoaded(false);
          setSourceIndex((i) => i + 1);
        }}
        onLoad={(event) => {
          const img = event.currentTarget;
          // Reject tiny icon-sized assets (favicons/placeholders) for card logos.
          if (img.naturalWidth < 24 || img.naturalHeight < 24) {
            setLoaded(false);
            setSourceIndex((i) => i + 1);
            return;
          }
          setLoaded(true);
        }}
        className="relative h-full w-full rounded-md bg-white object-contain transition-opacity"
        style={{ padding: 2, opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}
