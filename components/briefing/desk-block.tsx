"use client";

import Link from "next/link";
import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import type { DeskCard } from "@/lib/briefing-desk";
import { shortCompanyName } from "@/lib/plain-copy";

import { sharePrice, signedPct } from "./format";

/**
 * The desk's two compact blocks (council, Nov 13: the desk must leave the market read on the first screen):
 * - "You decided": one line per answer (logo, ticker, what, when), at most three, then one link to the rest.
 * - "Checked: nothing to do": a small card per stock (logo, ticker and name, the move and price, and the fact that
 *   settled it) in equal columns that end full; a lone one is said in the heading's own line.
 * An after-hours card leaves at the next regular open (its `dropAt`), as the Overnight strip does, and the block is laid
 * out again without it.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const HEADING = "flex items-baseline gap-2 px-1 pb-2 text-[15px] font-semibold leading-6 text-oa-fg";
const COUNT = "oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg";

const toneText = (pct: number | null) => (pct == null || Math.abs(pct) < 0.005 ? "text-oa-fg" : pct > 0 ? "text-signal-bullish" : "text-signal-bearish");


/** `max`: how many lines the desk lists (lib/briefing-desk.ts ANSWERED_SHOWN); the rest are one link to the record. */
export function DecidedList({ cards, max }: { cards: DeskCard[]; max: number }) {
  if (cards.length === 0) return null;
  const shown = cards.slice(0, max);
  const rest = cards.length - shown.length;
  return (
    <section aria-labelledby="desk-decided-title" className="min-w-0">
      <h2 id="desk-decided-title" className={HEADING}>
        You decided
        <span className={COUNT}>{cards.length}</span>
      </h2>
      <ul className="oa-surface min-w-0 divide-y divide-oa-border overflow-hidden border border-oa-border bg-oa-card">
        {shown.map((card) => (
          <li key={card.ticker}>
            <Link
              href={card.href}
              prefetch={false}
              // What it was about, and where that came from, are the hover: the line is what was decided.
              title={[card.line, card.source].filter(Boolean).join(" · ")}
              className={`${FOCUS} flex min-w-0 items-center gap-3 px-3.5 py-2 transition-colors hover:bg-oa-accent`}
            >
              <StockLogo ticker={card.ticker} size={20} eager />
              <span className="oa-mono w-14 shrink-0 text-[13px] font-semibold text-oa-fg">{card.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-oa-fg">{card.decision}</span>
              {card.when ? <span className="shrink-0 text-[12.5px] text-oa-muted-fg">{card.when}</span> : null}
            </Link>
          </li>
        ))}
        {rest > 0 ? (
          <li>
            <Link href="/agent" prefetch={false} className={`${FOCUS} flex h-9 items-center justify-center text-[13px] font-medium text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg`}>
              {rest} more
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** Columns by how many cards there are, written out whole for Tailwind: every row ends full at every width. */
const GRID: Record<number, string> = {
  2: "gap-3 sm:grid-cols-2",
  3: "gap-3 sm:grid-cols-3",
  4: "gap-3 sm:grid-cols-2 lg:grid-cols-4",
};

const CARD = "oa-surface border border-oa-border bg-oa-card transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";

function Name({ card }: { card: DeskCard }) {
  const short = shortCompanyName(card.name);
  const named = short && short.toUpperCase() !== card.ticker ? short : null;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <StockLogo ticker={card.ticker} size={28} eager />
      <span className="min-w-0 leading-5">
        <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{card.ticker}</span>
        {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
      </span>
    </span>
  );
}

function Move({ card }: { card: DeskCard }) {
  return (
    <span className="flex shrink-0 flex-col items-end leading-5">
      {card.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(card.pct)}`}>{signedPct(card.pct, 1)}</span> : null}
      {sharePrice(card.price) ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{sharePrice(card.price)}</span> : null}
    </span>
  );
}

/** The fact that settled it, the card's one highlighted line. */
function Fact({ text }: { text: string }) {
  return <span className="inline-flex max-w-full items-center rounded bg-oa-bg px-1.5 py-0.5 text-[12.5px] font-medium leading-4 text-oa-fg">{text}</span>;
}

/**
 * A small card per stock (owner rule 3: cards over rows): logo, ticker and name, the move and price, and the fact that
 * settled "nothing to do". The move's reason and its source are the hover.
 */
function CheckedCard({ card }: { card: DeskCard }) {
  return (
    // A wide card (1920) lays its fact between the name and the move, so it is never half empty.
    <Link
      href={card.href}
      prefetch={false}
      title={[card.line, card.source].filter(Boolean).join(" · ")}
      className={`${CARD} ${FOCUS} flex h-full flex-col gap-2.5 px-3.5 py-3 [@container(min-width:26rem)]:flex-row [@container(min-width:26rem)]:items-center [@container(min-width:26rem)]:gap-4`}
    >
      <span className="flex min-w-0 items-start justify-between gap-3 [@container(min-width:26rem)]:contents">
        {/* In one row the name gives way (truncates) before the fact does. */}
        <span className="min-w-0 [@container(min-width:26rem)]:flex-1">
          <Name card={card} />
        </span>
        <span className="hidden shrink-0 whitespace-nowrap [@container(min-width:26rem)]:block">
          <Fact text={card.decision} />
        </span>
        <Move card={card} />
      </span>
      <span className="block [@container(min-width:26rem)]:hidden">
        <Fact text={card.decision} />
      </span>
    </Link>
  );
}

/**
 * A lone checked stock, said in the heading's own line ("Checked: nothing to do · AMD +5.9% $585.58 · Our call stays
 * Buy more"), so one card never stretches across the page (council, Nov 13).
 */
function CheckedInline({ card }: { card: DeskCard }) {
  return (
    <Link href={card.href} prefetch={false} title={[card.line, card.source].filter(Boolean).join(" · ")} className={`${FOCUS} -my-1 inline-flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 font-normal transition-colors hover:bg-oa-accent`}>
      <StockLogo ticker={card.ticker} size={20} eager />
      <span className="oa-mono text-[13.5px] font-semibold text-oa-fg">{card.ticker}</span>
      {card.pct != null ? <span className={`oa-mono text-[13.5px] font-semibold tabular-nums ${toneText(card.pct)}`}>{signedPct(card.pct, 1)}</span> : null}
      {sharePrice(card.price) ? <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{sharePrice(card.price)}</span> : null}
      <Fact text={card.decision} />
    </Link>
  );
}

/** On a phone, a card in one short row (logo and ticker, the fact, the move and price), so three fit in one screen. */
function CheckedRow({ card }: { card: DeskCard }) {
  return (
    <Link href={card.href} prefetch={false} title={[card.line, card.source].filter(Boolean).join(" · ")} className={`${CARD} ${FOCUS} flex items-center gap-3 px-3 py-2.5`}>
      <StockLogo ticker={card.ticker} size={24} eager />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="oa-mono text-[13.5px] font-semibold leading-4 text-oa-fg">{card.ticker}</span>
        <Fact text={card.decision} />
      </span>
      <Move card={card} />
    </Link>
  );
}

export function CheckedCards({ cards: all }: { cards: DeskCard[] }) {
  // Null until mounted, so the first paint matches the server's; then the clock, moved on at each card's drop time.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const drops = [...new Set(all.flatMap((card) => (card.dropAt && card.dropAt > Date.now() ? [card.dropAt] : [])))];
    const timers = drops.map((at) => window.setTimeout(() => setNow(Date.now()), Math.min(at - Date.now() + 50, 2_000_000_000)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [all]);
  const cards = now === null ? all : all.filter((card) => !card.dropAt || card.dropAt > now);
  if (cards.length === 0) return null;
  if (cards.length === 1) {
    return (
      <section aria-labelledby="desk-checked-title" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 id="desk-checked-title" className="text-[15px] font-semibold leading-6 text-oa-fg">
          Checked: nothing to do
        </h2>
        <CheckedInline card={cards[0]!} />
      </section>
    );
  }
  return (
    <section aria-labelledby="desk-checked-title" className="min-w-0">
      <h2 id="desk-checked-title" className={HEADING}>
        Checked: nothing to do
        <span className={COUNT}>{cards.length}</span>
      </h2>
      {/* A phone gets one short row each; from sm, cards in equal columns. */}
      <ul aria-label="Checked: nothing to do" className="flex flex-col gap-2 sm:hidden">
        {cards.map((card) => (
          <li key={card.ticker} className="min-w-0">
            <CheckedRow card={card} />
          </li>
        ))}
      </ul>
      <ul aria-label="Checked: nothing to do" className={`hidden sm:grid ${GRID[Math.min(cards.length, 4)]}`}>
        {cards.map((card) => (
          <li key={card.ticker} className="min-w-0 [container-type:inline-size]">
            <CheckedCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}
