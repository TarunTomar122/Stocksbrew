import Link from "next/link";
import * as React from "react";

import { StockLogo } from "@/components/stock-logo";

/**
 * The analysis page's building blocks. One fixed card width (304px) for a figure, two (624px) for a chart, in a
 * grid that wraps and never stretches a card to fill a row; one column on a phone. A figure card is a few-word
 * label, one big number and at most one short line. Lists show about eight rows and scroll inside, then hand the
 * scroll back to the page (no overscroll containment).
 */

export const NUM = "oa-mono tabular-nums";
export const CARD = "oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card";
export const WIDE = "md:col-span-2";
/** A chart that must start its own row, so it never sits beside (and stretches) a figure card. */
export const NEW_ROW = "md:col-start-1";
/** About eight 32px rows. */
export const LIST = "max-h-[16.5rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const UP = "var(--signal-bullish)";
export const DOWN = "var(--signal-bearish)";
export const FLAT = "var(--signal-neutral)";
/** The S&P 500's colour in every chart: quiet ink, so the person's own mix (copper) leads. */
export const SP = "color-mix(in srgb, var(--oa-muted-fg) 55%, transparent)";
export const MINE = "var(--oa-primary)";

export function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Math.abs(value) < 0.05) return "text-oa-fg";
  return value > 0 ? "text-[color:var(--signal-bullish)]" : "text-[color:var(--signal-bearish)]";
}

/** "24%", "4.5%", "0.3%": whole numbers once they are big enough to read that way. */
export function pct(value: number, digits?: number): string {
  if (value === 0) return "0%";
  const d = digits ?? (Math.abs(value) >= 9.95 ? 0 : 1);
  return `${value.toFixed(d).replace(/^-/, "−")}%`;
}

export function signedPct(value: number, digits = 1): string {
  const shown = Number(value.toFixed(digits));
  if (shown === 0) return `${(0).toFixed(digits)}%`;
  return `${shown > 0 ? "+" : "−"}${Math.abs(shown).toFixed(digits)}%`;
}

export function signedPts(value: number, digits = 1): string {
  const shown = Number(value.toFixed(digits));
  if (shown === 0) return `${(0).toFixed(digits)} pts`;
  return `${shown > 0 ? "+" : "−"}${Math.abs(shown).toFixed(digits)} pts`;
}

export function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-12" -> "Nov 12"; with `year`, "Nov 12, 2026". */
export function day(iso: string | null | undefined, year = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const out = `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
  return year ? `${out}, ${match[1]}` : out;
}

/** "2026-11" -> "Nov". */
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** One module: a quiet title and its cards in the fixed-width grid. */
export function Module({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-20">
      <h2 className="mb-2 px-2 text-[15px] font-medium leading-5 text-oa-fg sm:px-0">{title}</h2>
      <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fill,304px)] md:gap-4">{children}</div>
    </section>
  );
}

/** A label, one big number, at most one line. */
export function FigureCard({
  label,
  figure,
  line,
  tone,
  children,
  className = "",
}: {
  label: React.ReactNode;
  figure: React.ReactNode;
  line?: React.ReactNode;
  tone?: number | null;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD} gap-1 px-4 py-3 ${className}`}>
      <p className="text-[12.5px] leading-4 text-oa-muted-fg">{label}</p>
      <p className={`${NUM} text-[28px] font-medium leading-9 tracking-[-0.01em] ${tone === undefined ? "text-oa-fg" : toneClass(tone)}`}>{figure}</p>
      {line ? <p className="text-[13px] leading-[18px] text-oa-muted-fg">{line}</p> : null}
      {children}
    </div>
  );
}

/** A titled card for a chart or a list. `wide` takes two columns from md up. */
export function ChartCard({
  title,
  aside,
  wide = true,
  flush = false,
  newRow = false,
  children,
  className = "",
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  wide?: boolean;
  flush?: boolean;
  newRow?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD} ${wide ? WIDE : ""} ${newRow ? NEW_ROW : ""} ${className}`}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-oa-border px-4 py-2">
        <h3 className="min-w-0 text-[14px] font-medium leading-5 text-oa-fg">{title}</h3>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-oa-muted-fg">{aside}</div> : null}
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${flush ? "" : "p-4"}`}>{children}</div>
    </div>
  );
}

/** Logo and ticker, linking to the stock page. */
export function Tick({ ticker, size = 18, link = true }: { ticker: string; size?: number; link?: boolean }) {
  const body = (
    <>
      <StockLogo ticker={ticker} size={size} atOnce />
      <span className={`${NUM} text-[13px] font-medium text-oa-fg`}>{ticker}</span>
    </>
  );
  if (!link) return <span className="inline-flex min-w-0 items-center gap-1.5">{body}</span>;
  return (
    <Link href={`/stock/${encodeURIComponent(ticker)}`} prefetch={false} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
      {body}
    </Link>
  );
}

/** A small key for a chart: a swatch and a word. */
export function Key({ color, children, line = false }: { color: string; children: React.ReactNode; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={line ? "inline-block h-[2px] w-3 rounded-full" : "inline-block size-2.5 rounded-[2px]"} style={{ background: color }} />
      {children}
    </span>
  );
}
