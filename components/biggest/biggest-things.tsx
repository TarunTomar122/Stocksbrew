import Link from "next/link";

import { sharePrice, signedPct } from "@/components/briefing/format";
import { KindIcon, type KindIconName } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import type { BigKind, BigThing } from "@/lib/biggest";
import { capitalize, dayWords } from "@/lib/day-words";
import { shortCompanyName } from "@/lib/plain-copy";

/**
 * "Biggest things" at the top of /agent and the briefing (lib/biggest.ts): a card per event, strongest first, each the
 * stock's logo, ticker and name, the move that is the story big with the price under it, one line on what happened,
 * and what kind of event it was and when. Two or four go two across, three go three across, and a lone one is said in
 * the heading's line. The source is the hover (owner rule 4); the card is the link to the stock.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const CARD = "oa-surface border border-oa-border bg-oa-card transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";

const KIND: Record<BigKind, { word: string; icon: KindIconName }> = {
  results: { word: "Earnings", icon: "calendar" },
  news: { word: "News", icon: "news" },
  analyst: { word: "Analyst", icon: "target" },
  move: { word: "Big move", icon: "pulse" },
  insider: { word: "Insider buy", icon: "person" },
  filing: { word: "Filing", icon: "filings" },
};

const toneText = (pct: number | null) => (pct == null || Math.abs(pct) < 0.005 ? "text-oa-fg" : pct > 0 ? "text-signal-bullish" : "text-signal-bearish");

/** "Yesterday", "Today", "Wednesday": the day it happened, in words (owner rule 4). */
export function bigWhen(thing: Pick<BigThing, "day">, today: string): string | null {
  return thing.day ? capitalize(dayWords(thing.day, today)) || null : null;
}

/** "after hours", "pre-market": the session of a move outside the regular one, said beside its price. */
export function sessionWords(session: BigThing["session"]): string | null {
  return session === "post" ? "after hours" : session === "pre" ? "pre-market" : null;
}

function Name({ thing }: { thing: BigThing }) {
  const short = shortCompanyName(thing.name);
  const named = short && short.toUpperCase() !== thing.ticker ? short : null;
  return (
    <>
      <StockLogo ticker={thing.ticker} size={28} eager />
      <span className="min-w-0 leading-5">
        <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{thing.ticker}</span>
        {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
      </span>
    </>
  );
}

function Move({ thing }: { thing: BigThing }) {
  const price = sharePrice(thing.price);
  return (
    <>
      {thing.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(thing.pct)}`}>{signedPct(thing.pct, 1)}</span> : null}
      {price ? (
        <span className="whitespace-nowrap text-[12px] tabular-nums text-oa-muted-fg">
          <span className="oa-mono">{price}</span>
          {sessionWords(thing.session) ? ` ${sessionWords(thing.session)}` : null}
        </span>
      ) : null}
    </>
  );
}

function Kind({ thing, today }: { thing: BigThing; today: string }) {
  const kind = KIND[thing.kind];
  const when = bigWhen(thing, today);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-4 text-oa-muted-fg">
      <KindIcon name={kind.icon} className="size-3.5 shrink-0" />
      <span className="truncate">{when ? `${kind.word} · ${when}` : kind.word}</span>
    </span>
  );
}

/**
 * A lone event, said in the heading's own line (logo, ticker, move and price, then its line), so one card never
 * stretches across the page or sits beside an empty half (owner rule 4; as the desk's lone checked stock).
 */
function LoneLine({ thing, today }: { thing: BigThing; today: string }) {
  const price = sharePrice(thing.price);
  const session = sessionWords(thing.session);
  return (
    <Link href={thing.href} prefetch={false} title={thing.source ?? undefined} className={`${FOCUS} -my-1 inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1.5 py-1 font-normal transition-colors hover:bg-oa-accent`}>
      <StockLogo ticker={thing.ticker} size={20} eager />
      <span className="oa-mono text-[13.5px] font-semibold text-oa-fg">{thing.ticker}</span>
      {thing.pct != null ? <span className={`oa-mono text-[13.5px] font-semibold tabular-nums ${toneText(thing.pct)}`}>{signedPct(thing.pct, 1)}</span> : null}
      {price ? <span className="text-[12.5px] tabular-nums text-oa-muted-fg"><span className="oa-mono">{price}</span>{session ? ` ${session}` : null}</span> : null}
      {thing.line ? <span className="min-w-0 text-pretty text-[13.5px] font-medium text-oa-fg">{thing.line}</span> : null}
      <Kind thing={thing} today={today} />
    </Link>
  );
}

/**
 * A card: the name and the move across the top, the line, then its kind and when. Side by side the line sits in a box
 * of two lines (three when three cards share the row), centred, so the cards end level with no blank band under the
 * shorter one.
 */
function TileCard({ thing, today, three = false }: { thing: BigThing; today: string; three?: boolean }) {
  return (
    <Link href={thing.href} prefetch={false} title={thing.source ?? undefined} className={`${CARD} ${FOCUS} flex h-full min-w-0 flex-col gap-2 px-3.5 py-3`}>
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <Name thing={thing} />
        </span>
        <span className="flex shrink-0 flex-col items-end leading-5">
          <Move thing={thing} />
        </span>
      </span>
      {thing.line ? (
        <span className={`flex min-w-0 flex-1 items-center ${three ? "[@container(min-width:56rem)]:min-h-[60px]" : "[@container(min-width:44rem)]:min-h-10"}`}>
          <span className="block text-pretty text-[14px] font-medium leading-5 text-oa-fg">{thing.line}</span>
        </span>
      ) : null}
      <span className="mt-auto">
        <Kind thing={thing} today={today} />
      </span>
    </Link>
  );
}

/** Columns at the section's width, written out whole for Tailwind: two or four in pairs, three across. */
const GRID: Record<number, string> = {
  2: "grid-cols-1 [@container(min-width:44rem)]:grid-cols-2",
  3: "grid-cols-1 [@container(min-width:56rem)]:grid-cols-3",
  4: "grid-cols-1 [@container(min-width:44rem)]:grid-cols-2",
};

export function BiggestThings({ things: all, today }: { things: readonly BigThing[]; today: string }) {
  const things = all.slice(0, 4);
  if (things.length === 0) return null;
  if (things.length === 1) {
    return (
      <section aria-labelledby="biggest-title" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 id="biggest-title" className="text-[15px] font-semibold leading-6 text-oa-fg">
          Biggest things
        </h2>
        <LoneLine thing={things[0]!} today={today} />
      </section>
    );
  }
  return (
    <section aria-labelledby="biggest-title" className="min-w-0 [container-type:inline-size]">
      <h2 id="biggest-title" className="px-1 pb-2 text-[15px] font-semibold leading-6 text-oa-fg">
        Biggest things
      </h2>
      {/* Equal columns that end level: every card the same width, none stretched over an empty slot (owner rule 4). */}
      <ul className={`grid gap-3 ${GRID[things.length]}`}>
        {things.map((thing) => (
          <li key={thing.ticker} className="min-w-0">
            <TileCard thing={thing} today={today} three={things.length === 3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
