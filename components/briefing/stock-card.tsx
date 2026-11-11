import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import { shortCompanyName } from "@/lib/plain-copy";

/**
 * The small stock card the Today pages share (the briefing's groups, the premarket's gappers): the logo, ticker
 * and short name, one big figure, one plain sentence and at most one highlighted fact. Quiet hairline border, no
 * coloured edge, no icon or link words repeated on every card (owner, Nov 11). The card's one link or button is
 * passed in as `cover`: it stretches over the whole card, and only an opened card's own panel sits above it.
 *
 * No hooks, so server pages and client lists both render it.
 */

/**
 * Cards side by side: 1 on a phone, 2 on a tablet, 3 from `xl` (or `lg` on a full-width page). Rows share one
 * height, and an opened card (which takes the whole row) lets the cards after it fill the gap it leaves.
 */
export function StockCardGrid({ children, wide = false, className = "" }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return <ul className={`grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : "xl:grid-cols-3"} ${className}`}>{children}</ul>;
}

// Written out whole so Tailwind finds them: [breakpoint][span - 1].
const SPANS: Record<string, string[]> = {
  sm: ["sm:col-span-1", "sm:col-span-2"],
  lg: ["lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5"],
  xl: ["xl:col-span-1", "xl:col-span-2", "xl:col-span-3"],
};

/**
 * No half-empty rows (owner rule): the last card stretches over what its row has left, at each breakpoint's column
 * count. `cols` maps a breakpoint to its columns, smallest first, e.g. { sm: 2, xl: 3 }.
 */
export function fillLastRow(index: number, count: number, cols: Partial<Record<"sm" | "lg" | "xl", number>>): string {
  if (index !== count - 1) return "";
  return (Object.entries(cols) as Array<["sm" | "lg" | "xl", number]>)
    .map(([breakpoint, columns]) => {
      const left = count % columns;
      return SPANS[breakpoint]![(left === 0 ? 1 : columns - left + 1) - 1] ?? "";
    })
    .join(" ");
}

/** The spans for StockCardGrid's own columns. */
export function stockGridFill(index: number, count: number, wide = false): string {
  return fillLastRow(index, count, wide ? { sm: 2, lg: 3 } : { sm: 2, xl: 3 });
}

export const CARD_HOVER = "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";

/** The one fact worth highlighting on a card: "Reports tomorrow after the close", "You hold it". */
export function FactChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-[22px] max-w-full items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 py-px text-[12.5px] font-medium leading-[18px] text-oa-primary">
      {children}
    </span>
  );
}

export function StockCard({
  ticker,
  name,
  figure,
  tone = "flat",
  sentence,
  fact,
  foot,
  cover,
  children,
  muted = false,
  expanded = false,
  fill = "",
  className = "",
  ...rest
}: {
  ticker: string | null;
  /** The company's name; shortened for the card. A group with no stock passes its own name ("Your jobs"). */
  name: string;
  /** The one big number: the day's move, the gap. Nothing when there is none. */
  figure?: string | null;
  tone?: "up" | "down" | "flat";
  sentence?: React.ReactNode;
  fact?: React.ReactNode;
  /** Small muted text at the foot, e.g. "2 more" on a card that folds more updates. */
  foot?: React.ReactNode;
  /** The card's one link or button, absolutely positioned over the card (`absolute inset-0`). */
  cover?: React.ReactNode;
  /** Content shown when the card is opened in place (it then spans the row). */
  children?: React.ReactNode;
  muted?: boolean;
  expanded?: boolean;
  /** Spans that stretch the last card over its row's empty columns (`stockGridFill`); an opened card takes the row anyway. */
  fill?: string;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLLIElement>, "children">) {
  const short = ticker ? shortCompanyName(name) : name;
  const label = ticker && short && short.toUpperCase() !== ticker.toUpperCase() ? short : null;
  const figureTone = tone === "up" ? "text-signal-bullish" : tone === "down" ? "text-signal-bearish" : "text-oa-fg";
  return (
    <li
      {...rest}
      className={`oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 pb-3 pt-3 ${cover ? CARD_HOVER : ""} ${expanded ? "col-span-full" : fill} ${muted ? "opacity-75" : ""} ${className}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {ticker ? (
            <StockLogo ticker={ticker} size={28} />
          ) : (
            <span aria-hidden="true" className="oa-mono flex size-7 shrink-0 items-center justify-center rounded-md bg-oa-bg text-[9px] font-medium text-oa-muted-fg">
              JOB
            </span>
          )}
          <div className="min-w-0 leading-5">
            <p className={`${ticker ? "oa-mono" : ""} text-[14px] font-semibold text-oa-fg`}>{ticker ?? name}</p>
            {label ? <p className="text-pretty text-[12.5px] leading-4 text-oa-muted-fg">{label}</p> : null}
          </div>
        </div>
        {figure ? <p className={`oa-mono shrink-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${figureTone}`}>{figure}</p> : null}
      </div>
      {sentence ? <p className="mt-2 text-pretty text-[14px] leading-5 text-oa-fg">{sentence}</p> : null}
      {fact || foot ? (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-2.5">
          {fact ? <FactChip>{fact}</FactChip> : <span />}
          {foot ? <span className="text-[12.5px] font-medium text-oa-muted-fg">{foot}</span> : null}
        </div>
      ) : null}
      {cover}
      {children ? <div className="relative z-10 mt-2 border-t border-oa-border pt-2">{children}</div> : null}
    </li>
  );
}
