"use client";

import { useEffect, useRef, useState } from "react";

import { isLogoKey, LOGO_FALLBACK_INK, logoFallbackColor, logoInitials, logoKey, logoSrc } from "@/lib/stock-logo-sources";

type Props = {
  ticker: string;
  /** Ignored: logos come from our own store (`/api/logo/<ticker>`). Kept so
   * older callers that still pass a stored URL keep compiling. */
  logoUrl?: string | null;
  size?: number;
  className?: string;
  /** "IN" tickers are looked up as NSE names. Defaults to "US". */
  market?: "US" | "IN";
  /** Background of the lettered tile shown if the logo cannot load at all. */
  fallbackBg?: string;
  /** Text colour of that lettered tile. */
  fallbackFg?: string;
  /** Above the fold: load at once and at high priority. */
  eager?: boolean;
  /** Load at once (not lazily) but at normal priority: the logos down a long table. */
  atOnce?: boolean;
  /** Circular crop instead of the default rounded square. */
  circle?: boolean;
  /** Give the logo its own accessible name. Only for a logo shown without its
   * ticker beside it (a stack of logos); next to the ticker it stays silent. */
  labelled?: boolean;
};

/**
 * A company logo as one plain <img> pointing at our own domain.
 *
 * The server always answers with an image (the stored tile, or a lettered tile
 * when a company has no logo), cached for a year, so there is no fallback chain
 * and nothing waits for JavaScript: the logo paints as soon as its bytes
 * arrive, before hydration. The old version hid the image until React's onLoad
 * fired, and React 18 misses load events that happen before hydration, which
 * left cached logos invisible behind their initials.
 */
export function StockLogo({
  ticker,
  size = 32,
  className = "",
  market = "US",
  fallbackBg,
  fallbackFg = LOGO_FALLBACK_INK,
  eager = false,
  atOnce = false,
  circle = false,
  labelled = false,
}: Props) {
  const upper = ticker.toUpperCase();
  // A ticker that cannot be a store key (empty, "^GSPC", "A..B") gets its letters straight away.
  const src = isLogoKey(logoKey(upper)) ? logoSrc(upper, market) : null;
  const shape = circle ? "rounded-full" : "rounded-md";
  const dim = `${size}px`;

  // Only a failed request (store down, offline) falls back to letters here.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An error before hydration fires no onError in React 18; check once on mount.
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(img.getAttribute("src"));
  }, [src]);

  if (src === null || failedSrc === src) {
    const initials = logoInitials(upper);
    return (
      <span
        // The kit's monogram, the same tile the server draws (lib/stock-logo-sources.ts): never an empty square.
        className={`oa-mono flex shrink-0 items-center justify-center ${shape} font-semibold tracking-[-0.02em] ${className}`}
        style={{
          width: dim,
          height: dim,
          background: fallbackBg ?? logoFallbackColor(upper),
          color: fallbackFg,
          fontSize: Math.round(size * (initials.length > 1 ? 0.36 : 0.48)),
          lineHeight: 1,
        }}
        {...(labelled ? { role: "img", "aria-label": `${upper} logo` } : { "aria-hidden": true })}
        data-stock-logo="letters"
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin tiles, already sized; next/image would add a hop
    <img
      ref={ref}
      src={src}
      // Next to its ticker the logo is decoration; reading the ticker twice helps no one.
      alt={labelled ? `${upper} logo` : ""}
      aria-hidden={labelled ? undefined : true}
      data-stock-logo="img"
      width={size}
      height={size}
      loading={eager || atOnce ? "eager" : "lazy"}
      decoding="async"
      // React 18 does not know fetchPriority; pass the lowercase attribute.
      {...(eager ? { fetchpriority: "high" } : {})}
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={`block shrink-0 ${shape} object-contain ring-1 ring-[color-mix(in_srgb,var(--oa-fg,#17181a)_12%,transparent)] ${className}`}
      style={{ width: dim, height: dim, background: "color-mix(in srgb, var(--oa-fg, #17181a) 8%, transparent)" }}
    />
  );
}
