import * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { fmtFrac, fmtPoints, stockHref } from "@/lib/follow-shared";
import { markFor } from "@/lib/tone";
import Link from "next/link";

export const UP = "text-signal-bullish";
export const DOWN = "text-signal-bearish";

export function toneOf(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-oa-muted-fg";
  return value > 0 ? UP : DOWN;
}

/** A ticker that opens its stock page. Plain text when the filing gave no ticker. */
export function Ticker({
  ticker,
  className = "",
  logo = 16,
  logoAtOnce = false,
}: {
  ticker: string | null | undefined;
  className?: string;
  /** Logo size in px; the logo sits centred while the ticker keeps the row's text baseline. */
  logo?: number;
  /** Load the logo at once instead of lazily: a long table's logos otherwise show as empty squares until scrolled to. */
  logoAtOnce?: boolean;
}) {
  if (!ticker) return null;
  return (
    <Link prefetch={false}
      href={stockHref(ticker)}
      className={`oa-mono ftk${className ? ` ${className}` : ""}`}
    >
      <StockLogo ticker={ticker} size={logo} className="self-center" atOnce={logoAtOnce} />
      {ticker}
    </Link>
  );
}

/** A small pill for a holding: ticker and its weight. */
export function HoldingChip({
  ticker,
  name,
  weight,
  title,
  also,
}: {
  ticker: string | null;
  name: string | null;
  weight?: string;
  title?: string;
  /** Other share classes of the same company folded into this chip ("GOOG"). */
  also?: string[];
}) {
  const label = ticker ?? (name ? name.split(" ").slice(0, 2).join(" ") : "");
  if (!label) return null;
  const inner = (
    <>
      {ticker ? <StockLogo ticker={ticker} size={14} /> : null}
      <span
        className={ticker ? "oa-mono font-medium text-oa-fg" : "text-oa-fg"}
      >
        {label}
      </span>
      {also && also.length ? <span className="oa-mono text-oa-muted-fg">+{also.join(", ")}</span> : null}
      {weight ? (
        <span className="oa-mono text-oa-muted-fg">{weight}</span>
      ) : null}
    </>
  );
  // The chip's look is .hchip in app/globals.css: a directory row prints three of these.
  const shape = "hchip";
  return ticker ? (
    <Link prefetch={false}
      href={stockHref(ticker)}
      title={title ?? name ?? ticker}
      className="hchip hchip-link"
    >
      {inner}
    </Link>
  ) : (
    <span title={title ?? name ?? undefined} className={shape}>
      {inner}
    </span>
  );
}

/** A return with the gap to the S&P 500 under it. Shows a quiet "n/a" when the record is too short. */
export function ReturnCell({
  value,
  versus,
  drawdown = false,
  align = "right",
  compact = false,
  className,
  vsLabel = true,
}: {
  value: number | null | undefined;
  versus: number | null | undefined;
  drawdown?: boolean;
  align?: "left" | "right";
  /** Table cells drop the "vs S&P" words on wide screens; the table's note explains the second line. */
  compact?: boolean;
  /** Extra classes on the cell itself, so a grid row needs no wrapper around it. */
  className?: string;
  /** Print the "vs S&P" words. A compact cell that is hidden on phones never shows them, so it can leave them out. */
  vsLabel?: boolean;
}) {
  // Short classes (.rc-* in app/globals.css): a directory row prints six of these cells.
  const side = `${align === "right" ? "rc-r" : "rc-l"}${className ? ` ${className}` : ""}`;
  if (value == null) {
    return (
      <span className={`flex flex-col ${side}`}>
        <span
          className="oa-mono text-[12px] text-oa-muted-fg"
          title="The record is too short for this window"
        >
          n/a
        </span>
      </span>
    );
  }
  // A drawdown is a size, not a change: normal ink, with the shared mark when it is clearly shallow or deep.
  // A zero drawdown is a record too short to have fallen yet, not a good sign.
  const mark = drawdown && value !== 0 ? markFor("drawdown", value * 100) : undefined;
  return (
    <span className={`rc ${side}`}>
      <span className={`oa-mono rc-v ${drawdown ? "text-oa-fg" : toneOf(value)}`}>
        {mark ? <ToneGlyph tone={mark} /> : null}
        {fmtFrac(value, 1, !drawdown)}
      </span>
      {versus != null ? (
        <span
          className={`oa-mono rc-p ${toneOf(versus)}`}
          title="Percentage points against the S&P 500 over the same days"
        >
          {vsLabel ? `${fmtPoints(versus)} ` : fmtPoints(versus)}
          {vsLabel ? <span className={compact ? "rc-vs lg:hidden" : "rc-vs"}>vs S&amp;P</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/** One decimal, without a trailing ".0": a path coordinate as short as it can be. */
function coord(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * The same line as sparkPath (lib/follow-shared.ts), written short: one moveto,
 * then bare coordinate pairs (SVG reads them as linetos). A directory row draws
 * two of these, so the shorter path is most of what the row weighs.
 */
function shortPath(values: number[], width: number, height: number, lo: number, hi: number): string {
  const span = hi - lo || 1;
  const last = values.length - 1;
  return `M${values
    .map((value, index) => `${coord((index / last) * width)} ${coord(height - ((value - lo) / span) * height)}`)
    .join(" ")}`;
}

/** Two tiny lines: the follower's record in copper, the S&P 500 in grey. */
export function Sparkline({
  fund,
  spy,
  width = 72,
  height = 24,
}: {
  fund?: number[];
  spy?: number[];
  width?: number;
  height?: number;
}) {
  if (!fund || fund.length < 2)
    return <span className="block" style={{ width, height }} />;
  const all = [...fund, ...(spy ?? [])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="block overflow-visible"
    >
      {spy && spy.length > 1 ? (
        <path
          d={shortPath(spy, width, height, lo, hi)}
          fill="none"
          stroke="var(--oa-muted-fg)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      ) : null}
      <path
        d={shortPath(fund, width, height, lo, hi)}
        fill="none"
        stroke="var(--oa-primary)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PartyDot({ party }: { party?: string }) {
  if (party !== "D" && party !== "R" && party !== "I") return null;
  const tone =
    party === "D"
      ? "bg-blue-600"
      : party === "R"
        ? "bg-red-600"
        : "bg-oa-muted-fg";
  const label =
    party === "D" ? "Democrat" : party === "R" ? "Republican" : "Independent";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block size-1.5 shrink-0 rounded-full ${tone}`}
    />
  );
}

/** The small print under a table: where the numbers come from and when they were read. */
export function SourceLine({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[12px] leading-5 text-oa-muted-fg ${className}`}>
      {children}
    </p>
  );
}

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`xlink${className ? ` ${className}` : ""}`}
    >
      {children}
    </a>
  );
}
