import * as React from "react";

/**
 * Small pieces the Ask cards and the Explore desk share. They mirror the page
 * kit (`components/oa/kit`) but carry no server imports, so client components
 * can use them: the kit's index pulls in the site header, which is server-only.
 */

export const NUM = "oa-mono tabular-nums";
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-05" -> "Nov 5" (with the year when asked). Parsed by hand so no timezone can move the day. */
export function fmtDay(iso: string | null | undefined, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return withYear ? `${month} ${Number(match[3])}, ${match[1]}` : `${month} ${Number(match[3])}`;
}

/** A day stays a day ("Nov 5, 2026"); an instant becomes "Nov 9, 4:05 PM ET". */
export function fmtAsOf(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDay(value, true);
  // Filing stamps are US Eastern wall time without a zone: show them as written.
  const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (wall) {
    const hour = Number(wall[2]);
    return `${fmtDay(wall[1], true)}, ${hour % 12 || 12}:${wall[3]} ${hour < 12 ? "AM" : "PM"} ET`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
}

/** "18m", "3h", "2d": how long ago. */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function fmtMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtCompact(value: number | null | undefined, prefix = ""): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      return `${sign}${prefix}${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}${unit}`;
    }
  }
  return `${sign}${prefix}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function toneOf(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function toneText(tone: "up" | "down" | "flat" | undefined): string {
  if (tone === "up") return "text-signal-bullish";
  if (tone === "down") return "text-signal-bearish";
  return tone === "flat" ? "text-oa-muted-fg" : "text-oa-fg";
}

/** A signed change, coloured. "n/a" when the value is unknown. */
export function Delta({ value, digits = 2, suffix = "%", className = "" }: { value: number | null | undefined; digits?: number; suffix?: string; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={`${NUM} text-oa-muted-fg ${className}`}>n/a</span>;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span className={`${NUM} ${toneText(toneOf(value))} ${className}`}>
      {sign}
      {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

export type TagTone = "neutral" | "up" | "down" | "primary" | "warn";

const TAG_TONES: Record<TagTone, string> = {
  neutral: "border-oa-border text-oa-muted-fg",
  up: "border-[color-mix(in_srgb,var(--signal-bullish)_35%,transparent)] text-signal-bullish",
  down: "border-[color-mix(in_srgb,var(--signal-bearish)_35%,transparent)] text-signal-bearish",
  primary: "border-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] text-oa-primary",
  warn: "border-[color-mix(in_srgb,var(--oa-label)_45%,transparent)] text-oa-label",
};

export function Tag({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: TagTone; className?: string }) {
  return (
    <span className={`oa-mono inline-flex h-[18px] shrink-0 items-center rounded border px-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${TAG_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** "SEC EDGAR · as of Nov 9, 4:00 PM ET". Every card ends with one. */
export function SourceLine({ source, asOf, href, note, className = "" }: { source?: React.ReactNode; asOf?: string | null; href?: string | null; note?: React.ReactNode; className?: string }) {
  const stamp = fmtAsOf(asOf);
  const external = href ? /^https?:\/\//.test(href) : false;
  const parts = [
    source ? (
      href ? (
        <a key="s" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          {source}
        </a>
      ) : (
        <span key="s">{source}</span>
      )
    ) : null,
    stamp ? <span key="a">as of {stamp}</span> : null,
    note ? <span key="n">{note}</span> : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className={`oa-mono flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] leading-4 text-oa-muted-fg ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </React.Fragment>
      ))}
    </p>
  );
}

/** A ticker that links to its stock page. No logo: cards hold many of them. */
export function TickerLink({ symbol, className = "" }: { symbol: string; className?: string }) {
  return (
    <a href={`/stock/${encodeURIComponent(symbol)}`} className={`${NUM} rounded text-[13.5px] font-medium text-oa-fg hover:underline ${FOCUS} ${className}`}>
      {symbol}
    </a>
  );
}

/** Inline SVG sparkline. Draws nothing with fewer than two points. */
export function Spark({ values, width = 96, height = 28, tone, className = "" }: { values: Array<number | null | undefined>; width?: number; height?: number; tone?: "up" | "down" | "flat"; className?: string }) {
  const points = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (width - 2) / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${(1 + i * step).toFixed(1)} ${(1 + (height - 2) * (1 - (v - min) / span)).toFixed(1)}`).join(" ");
  const resolved = tone ?? toneOf(points[points.length - 1]! - points[0]!);
  const stroke = resolved === "up" ? "var(--signal-bullish)" : resolved === "down" ? "var(--signal-bearish)" : "var(--oa-muted-fg)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
