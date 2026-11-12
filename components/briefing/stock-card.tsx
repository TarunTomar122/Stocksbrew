import Link from "next/link";
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
 * Cards side by side. On a full-width page (`wide`): 1 on a phone, 2 on a tablet, 3 from `lg`. Otherwise by the
 * column's own width (a container query), since the same list sits full width or beside a side rail: 2 from 30rem,
 * 3 from 44rem, so three cards never squeeze into a narrow column. Rows share one height, and an opened card (which
 * takes the whole row) lets the cards after it fill the gap it leaves.
 */
export function StockCardGrid({ children, wide = false, dense = false, className = "" }: { children: React.ReactNode; wide?: boolean; dense?: boolean; className?: string }) {
  if (wide) return <ul className={`grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</ul>;
  // `dense`: small cards with only a figure and one fact, so they sit closer: 2 from 20rem, 3 from 36rem.
  if (dense) {
    return (
      <div className={`[container-type:inline-size] ${className}`}>
        <ul className="grid grid-cols-1 gap-3 [@container(min-width:20rem)]:grid-cols-2 [@container(min-width:36rem)]:grid-cols-3">{children}</ul>
      </div>
    );
  }
  return (
    <div className={`[container-type:inline-size] ${className}`}>
      <ul className="grid grid-flow-row-dense grid-cols-1 gap-3 [@container(min-width:30rem)]:grid-cols-2 [@container(min-width:44rem)]:grid-cols-3">{children}</ul>
    </div>
  );
}

// Written out whole so Tailwind finds them: [breakpoint][span - 1]. `c2` and `c3` are StockCardGrid's container widths.
const SPANS = {
  sm: ["sm:col-span-1", "sm:col-span-2"],
  lg: ["lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5"],
  xl: ["xl:col-span-1", "xl:col-span-2", "xl:col-span-3"],
  c2: ["[@container(min-width:30rem)]:col-span-1", "[@container(min-width:30rem)]:col-span-2"],
  c3: ["[@container(min-width:44rem)]:col-span-1", "[@container(min-width:44rem)]:col-span-2", "[@container(min-width:44rem)]:col-span-3"],
  d2: ["[@container(min-width:20rem)]:col-span-1", "[@container(min-width:20rem)]:col-span-2"],
  d3: ["[@container(min-width:36rem)]:col-span-1", "[@container(min-width:36rem)]:col-span-2", "[@container(min-width:36rem)]:col-span-3"],
} satisfies Record<string, string[]>;

/**
 * No half-empty rows (owner rule): the last card stretches over what its row has left, at each breakpoint's column
 * count. `cols` maps a breakpoint to its columns, smallest first, e.g. { sm: 2, xl: 3 }.
 */
export function fillLastRow(index: number, count: number, cols: Partial<Record<keyof typeof SPANS, number>>): string {
  if (index !== count - 1) return "";
  return (Object.entries(cols) as Array<[keyof typeof SPANS, number]>)
    .map(([breakpoint, columns]) => {
      const left = count % columns;
      return (SPANS[breakpoint] as string[])[(left === 0 ? 1 : columns - left + 1) - 1] ?? "";
    })
    .join(" ");
}

/** The spans for StockCardGrid's own columns. */
export function stockGridFill(index: number, count: number, wide = false, dense = false): string {
  return fillLastRow(index, count, wide ? { sm: 2, lg: 3 } : dense ? { d2: 2, d3: 3 } : { c2: 2, c3: 3 });
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
  extra,
  fact,
  foot,
  cover,
  children,
  muted = false,
  expanded = false,
  fill = "",
  tag,
  eagerLogo = false,
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
  /** A second, smaller line under the sentence: the stock's next update, shown rather than folded. */
  extra?: React.ReactNode;
  fact?: React.ReactNode;
  /** Small muted text at the foot, e.g. "Show less" on an opened card. Never the same words on every card. */
  foot?: React.ReactNode;
  /** The card's one link or button, absolutely positioned over the card (`absolute inset-0`). */
  cover?: React.ReactNode;
  /** Content shown when the card is opened in place (it then spans the row). */
  children?: React.ReactNode;
  muted?: boolean;
  expanded?: boolean;
  /** Spans that stretch the last card over its row's empty columns (`stockGridFill`); an opened card takes the row anyway. */
  fill?: string;
  /** A short line under the ticker, e.g. "You watch AMD." on a stock the person watches rather than holds. */
  tag?: string | null;
  /** Load the logo with the page (owner rule 5: logos load at once), for cards in the first screens. */
  eagerLogo?: boolean;
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
            <StockLogo ticker={ticker} size={28} eager={eagerLogo} />
          ) : (
            <span aria-hidden="true" className="oa-mono flex size-7 shrink-0 items-center justify-center rounded-md bg-oa-bg text-[9px] font-medium text-oa-muted-fg">
              JOB
            </span>
          )}
          <div className="min-w-0 leading-5">
            <p className={`${ticker ? "oa-mono" : ""} text-[14px] font-semibold text-oa-fg`}>{ticker ?? name}</p>
            {label || tag ? (
              <p className="text-pretty text-[12.5px] leading-4 text-oa-muted-fg">
                {[label, tag].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        {figure ? <p className={`oa-mono shrink-0 text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${figureTone}`}>{figure}</p> : null}
      </div>
      {sentence ? <p className="mt-2 text-pretty text-[14px] leading-5 text-oa-fg">{sentence}</p> : null}
      {extra ? <p className="mt-1.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{extra}</p> : null}
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

/**
 * A stock with nothing of its own to say: its logo, ticker and figure in a small chip that opens its page, so it is
 * not a big card left empty beside its neighbours (owner rule 4). Chips sit in a wrapping row (`StockChipRow`).
 * Nothing is written about what is missing (owner rule 7).
 */
export function StockChip({
  ticker,
  name,
  figure,
  tone = "flat",
  label,
  id,
  className = "",
}: {
  ticker: string;
  name?: string | null;
  figure?: string | null;
  tone?: "up" | "down" | "flat";
  /** What a screen reader hears; defaults to the ticker, the name and the figure. */
  label?: string;
  id?: string;
  className?: string;
}) {
  const figureTone = tone === "up" ? "text-signal-bullish" : tone === "down" ? "text-signal-bearish" : "text-oa-muted-fg";
  const short = name ? shortCompanyName(name) : "";
  return (
    <li id={id} className={className}>
      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        prefetch={false}
        title={short || undefined}
        aria-label={label ?? [ticker, short && short.toUpperCase() !== ticker.toUpperCase() ? short : null, figure].filter(Boolean).join(", ")}
        className={`oa-surface flex h-10 items-center gap-2 border border-oa-border bg-oa-card pl-2 pr-3 outline-none ${CARD_HOVER} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]`}
      >
        <StockLogo ticker={ticker} size={22} />
        <span className="oa-mono text-[13.5px] font-semibold text-oa-fg">{ticker}</span>
        {figure ? <span className={`oa-mono text-[13.5px] tabular-nums ${figureTone}`}>{figure}</span> : null}
      </Link>
    </li>
  );
}

export function StockChipRow({ children, label, className = "" }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {children}
    </ul>
  );
}
