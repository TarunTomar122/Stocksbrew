import * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { fmtFrac, fmtPoints, sparkPath, stockHref } from "@/lib/follow-shared";
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
}: {
  ticker: string | null | undefined;
  className?: string;
  /** Logo size in px; the logo sits centred while the ticker keeps the row's text baseline. */
  logo?: number;
}) {
  if (!ticker) return null;
  return (
    <Link prefetch={false}
      href={stockHref(ticker)}
      className={`oa-mono inline-flex shrink-0 items-baseline gap-1.5 font-medium text-oa-fg underline decoration-oa-border decoration-1 underline-offset-[3px] outline-none transition-colors hover:text-oa-primary hover:decoration-oa-primary focus-visible:text-oa-primary ${className}`}
    >
      <StockLogo ticker={ticker} size={logo} className="self-center" />
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
  const shape =
    "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border border-oa-border bg-oa-bg px-1.5 text-[11px] leading-none";
  return ticker ? (
    <Link prefetch={false}
      href={stockHref(ticker)}
      title={title ?? name ?? ticker}
      className={`${shape} outline-none transition-colors hover:border-oa-primary/60 focus-visible:border-oa-primary`}
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
}: {
  value: number | null | undefined;
  versus: number | null | undefined;
  drawdown?: boolean;
  align?: "left" | "right";
  /** Table cells drop the "vs S&P" words on wide screens; the table's note explains the second line. */
  compact?: boolean;
}) {
  const side =
    align === "right" ? "items-end text-right" : "items-start text-left";
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
    <span className={`flex flex-col leading-tight ${side}`}>
      <span
        className={`oa-mono tabular-nums inline-flex items-center gap-1 text-[13px] font-medium ${drawdown ? "text-oa-fg" : toneOf(value)}`}
      >
        {mark ? <ToneGlyph tone={mark} /> : null}
        {fmtFrac(value, 1, !drawdown)}
      </span>
      {versus != null ? (
        <span
          className={`oa-mono tabular-nums whitespace-nowrap text-[10.5px] ${toneOf(versus)}`}
          title="Percentage points against the S&P 500 over the same days"
        >
          {fmtPoints(versus)}{" "}
          <span className={`text-oa-muted-fg ${compact ? "lg:hidden" : ""}`}>
            vs S&amp;P
          </span>
        </span>
      ) : null}
    </span>
  );
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
          d={sparkPath(spy, width, height, lo, hi)}
          fill="none"
          stroke="var(--oa-muted-fg)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      ) : null}
      <path
        d={sparkPath(fund, width, height, lo, hi)}
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
      className={`underline decoration-oa-border underline-offset-[3px] outline-none transition-colors hover:text-oa-fg hover:decoration-oa-fg focus-visible:text-oa-fg ${className}`}
    >
      {children}
    </a>
  );
}
