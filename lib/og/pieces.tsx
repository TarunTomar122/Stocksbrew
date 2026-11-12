/**
 * Small drawn pieces shared by the page cards (lib/og/cards.tsx) and the
 * portfolio share cards (lib/share/og.tsx): a company logo tile, a stock chip
 * with its move, and a two-line chart. Satori rules apply: every element with
 * more than one child is `display: flex`, no CSS variables, and images are
 * data URIs (lib/og/logos.ts).
 */

import { LOGO_FALLBACK_INK, logoFallbackColor, logoInitials } from "@/lib/stock-logo-sources";

/** The brew palette, light: cream paper, espresso ink, one copper accent. Green and red only mean a gain or a loss. */
export const C = {
  page: "#f0eadd",
  card: "#fffdf9",
  well: "#f4efe4",
  ink: "#1c1915",
  muted: "#564f44",
  faint: "#8a8173",
  border: "#dcd4c4",
  copper: "#9a4816",
  copperSoft: "#d9b79c",
  copperTint: "#f3e4d6",
  up: "#1f6b45",
  upTint: "#e2eee5",
  down: "#b3261e",
  downTint: "#f6e1dd",
} as const;

export const SANS = "Instrument Sans";
export const MONO = "Geist Mono";

export type Tone = "up" | "down" | "flat";

export function toneColor(tone: Tone | undefined | null): string {
  return tone === "up" ? C.up : tone === "down" ? C.down : C.ink;
}

export function toneOfPct(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) < 0.05) return "flat";
  return value > 0 ? "up" : "down";
}

/** "+3.5%", "−2.1%", "0.0%": a true minus sign, one decimal. */
export function signedPct(value: number, digits = 1): string {
  const abs = Math.abs(value).toFixed(digits);
  if (Number(abs) === 0) return `${(0).toFixed(digits)}%`;
  return `${value > 0 ? "+" : "−"}${abs}%`;
}

/** The stocksbrew mark. */
export function Mark({ size = 36, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" style={{ display: "flex" }}>
      <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke={color} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke={color} strokeWidth="7.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A company's logo tile, the same square the site shows: the stored logo when
 * there is one, else the lettered tile in the same colours as the site's.
 */
export function LogoTile({ ticker, src, size }: { ticker: string; src: string | null | undefined; size: number }) {
  const radius = Math.round(size * 0.22);
  if (src) {
    return (
      <div style={{ display: "flex", width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0, background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={size} height={size} alt="" style={{ width: size, height: size }} />
      </div>
    );
  }
  const letters = logoInitials(ticker);
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: radius,
        background: logoFallbackColor(ticker),
        color: LOGO_FALLBACK_INK,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: MONO,
        fontSize: Math.round(size * (letters.length > 1 ? 0.36 : 0.48)),
        flexShrink: 0,
      }}
    >
      {letters}
    </div>
  );
}

/** A stock and its move: logo, ticker (or a plain label when names are hidden) and the % in green or red. */
export function MoverChip({
  ticker,
  label,
  display,
  tone,
  logo,
  size = 22,
}: {
  ticker: string | null;
  label: string;
  display: string;
  tone: Tone;
  logo: string | null | undefined;
  size?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.5),
        background: C.card,
        border: `1.5px solid ${C.border}`,
        borderRadius: 16,
        padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.7)}px ${Math.round(size * 0.36)}px ${Math.round(size * 0.4)}px`,
        flexShrink: 0,
      }}
    >
      {ticker ? <LogoTile ticker={ticker} src={logo} size={Math.round(size * 1.7)} /> : null}
      <span style={{ fontFamily: ticker ? MONO : SANS, fontSize: size, color: C.ink, paddingLeft: ticker ? 0 : Math.round(size * 0.3) }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: size, color: toneColor(tone) }}>{display}</span>
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon" for a YYYY-MM-DD day. */
export function weekdayOf(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : WEEKDAYS[date.getUTCDay()]!;
}

/**
 * Mine against the S&P 500 over the same days, in percent from the first
 * point. Each line is labelled at its end with its own figure, so the chart
 * needs no legend; a dashed line marks zero. `labels` are printed under the
 * points (weekdays for a week).
 */
export function LineChart({
  mine,
  market,
  labels,
  width,
  height,
  mineLabel = "Me",
}: {
  mine: number[];
  market: number[] | null;
  labels: string[] | null;
  width: number;
  height: number;
  mineLabel?: string;
}) {
  const labelW = 150;
  const plotW = width - labelW;
  const axisH = labels ? 30 : 0;
  const plotH = height - axisH;
  const all = [...mine, ...(market ?? []), 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const pad = 14;
  const x = (index: number, count: number) => pad + (index / Math.max(1, count - 1)) * (plotW - pad * 2);
  const y = (value: number) => pad + (1 - (value - lo) / span) * (plotH - pad * 2);
  const path = (series: number[]) => series.map((value, index) => `${index === 0 ? "M" : "L"}${x(index, series.length).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const mineEnd = mine[mine.length - 1]!;
  const marketEnd = market ? market[market.length - 1]! : null;
  const mineColor = toneColor(toneOfPct(mineEnd)) === C.ink ? C.copper : toneColor(toneOfPct(mineEnd));
  // End labels sit beside each line's last point, kept at least 56px apart (a label is about 47px tall) and inside the plot.
  const GAP = 56;
  const top = 18;
  const bottom = plotH - 18;
  let mineY = Math.max(top, Math.min(bottom, y(mineEnd)));
  let marketY = marketEnd !== null ? Math.max(top, Math.min(bottom, y(marketEnd))) : 0;
  if (marketEnd !== null && Math.abs(mineY - marketY) < GAP) {
    const mineAbove = mineEnd >= marketEnd;
    let upper = Math.min(mineY, marketY);
    let lower = upper + GAP;
    if (lower > bottom) {
      lower = bottom;
      upper = bottom - GAP;
    }
    const mid = (mineY + marketY) / 2;
    if (mid - GAP / 2 >= top && mid + GAP / 2 <= bottom) {
      upper = mid - GAP / 2;
      lower = mid + GAP / 2;
    }
    mineY = mineAbove ? upper : lower;
    marketY = mineAbove ? lower : upper;
  }
  const area = `${path(mine)} L${x(mine.length - 1, mine.length).toFixed(1)},${y(0).toFixed(1)} L${x(0, mine.length).toFixed(1)},${y(0).toFixed(1)} Z`;
  return (
    <div style={{ display: "flex", flexDirection: "column", width, height, position: "relative" }}>
      <svg width={plotW} height={plotH} viewBox={`0 0 ${plotW} ${plotH}`} style={{ display: "flex" }}>
        <path d={area} fill={mineEnd >= 0 ? C.upTint : C.downTint} opacity={0.75} />
        <line x1={pad} x2={plotW - pad} y1={y(0)} y2={y(0)} stroke={C.border} strokeWidth={2} strokeDasharray="6 6" />
        {market ? <path d={path(market)} stroke={C.faint} strokeWidth={3.5} fill="none" strokeDasharray="9 7" strokeLinejoin="round" strokeLinecap="round" /> : null}
        <path d={path(mine)} stroke={mineColor} strokeWidth={5.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(mine.length - 1, mine.length)} cy={y(mineEnd)} r={7} fill={mineColor} />
        {market && marketEnd !== null ? <circle cx={x(market.length - 1, market.length)} cy={y(marketEnd)} r={5.5} fill={C.faint} /> : null}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: plotW + 8, top: mineY - 17 }}>
        <span style={{ fontFamily: MONO, fontSize: 25, color: mineColor, lineHeight: 1 }}>{signedPct(mineEnd)}</span>
        <span style={{ fontSize: 16, color: C.muted, marginTop: 3 }}>{mineLabel}</span>
      </div>
      {marketEnd !== null ? (
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: plotW + 8, top: marketY - 17 }}>
          <span style={{ fontFamily: MONO, fontSize: 21, color: C.muted, lineHeight: 1 }}>{signedPct(marketEnd)}</span>
          <span style={{ fontSize: 16, color: C.muted, marginTop: 3 }}>{"S&P 500"}</span>
        </div>
      ) : null}
      {labels ? (
        <div style={{ display: "flex", position: "relative", width: plotW, height: axisH }}>
          {labels.map((label, index) => (
            <span
              key={index}
              style={{ position: "absolute", left: x(index, labels.length) - 30, width: 60, top: 4, display: "flex", justifyContent: "center", fontFamily: MONO, fontSize: 16, color: C.faint }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
