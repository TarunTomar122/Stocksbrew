import Link from "next/link";
import * as React from "react";

import { ShowMoreGrid } from "@/components/oa/kit/show-more-grid";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { absoluteDay, capitalize, daysFromToday, dayWords, onDayWords } from "@/lib/day-words";
import {
  STATUS_LABEL,
  askOf,
  earningsSentence,
  spanWords,
  type EarningsCard,
  type FilingCard,
  type LineCard,
  type MoveCard,
  type ReplayCard,
  type ThesisCard,
  type WatchCard,
} from "@/lib/landing-agent-watch";
import { loadAgentWatch } from "@/lib/landing-agent-watch-server";
import { formatValue } from "@/lib/thesis-watch/conditions";

import { SectionHead } from "./shared";

/**
 * "Tell it what to watch, in plain English": what a person types to set up an agent, as a chat bubble, and what the
 * agent sent back, as a small result card built from real data (the example portfolio's own agents and figures, a
 * filing, a theme's replay; lib/landing-agent-watch.ts). It took the place of the three example-agent cards and of
 * the day's market-check tiles. Each card opens the page where that work lives; nothing is repeated per card. A card
 * with no real result today is left out, and the grid keeps whole rows (six or three from lg, four or two). With fewer
 * than two cards the section is left out too.
 */

const HEAD_TITLE = "Tell it what to watch, in plain English.";
const HEAD_HREF = "/agents";
const HEAD_LINK = "Create your agent";
/** Said once under the cards: which parts are made up. */
const EXAMPLE_NOTE = "Example portfolio with made-up reasons and thesis; every figure is real.";

/**
 * Fixed parts from sm, so cards side by side end level and the ghost holds their place: 28px padding, a 2px border, the
 * request's 56px (two lines), 8px, then the result: 26px of border and padding, a 24px row, 8 + 30px for the figure,
 * 8px, and the line's two lines (40px): 234px. Stacked on a phone, each card is as tall as what it says (about 210px).
 */
const CARD = "oa-surface group relative flex min-w-0 flex-col border border-oa-border bg-oa-card p-3 transition-colors sm:min-h-[234px] sm:p-3.5";
const RESULT = "mt-2 flex flex-1 flex-col rounded-xl border border-oa-border bg-oa-bg p-3 transition-colors group-hover:border-oa-fg/20";
const ROW = "flex h-6 min-w-0 items-center gap-2";
const FIGURE_ROW = "mt-2 flex h-[30px] min-w-0 items-center gap-2.5";
const FIGURE = "oa-mono shrink-0 text-[22px] font-semibold leading-[30px] tracking-[-0.02em] tabular-nums";
const SMALL = "oa-type-fixed text-[12.5px] leading-4 text-oa-muted-fg";
const LINE = "mt-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:min-h-[40px]";

/** The person's request: a chat bubble on the right, bottom-aligned in a two-line slot so results line up. */
function Ask({ text }: { text: string }) {
  return (
    <div className="flex min-h-[56px] items-end justify-end">
      <p className="w-fit max-w-[94%] text-pretty rounded-2xl rounded-br-md bg-oa-primary/[.13] px-3 py-2 text-[14px] leading-5 text-oa-fg">
        <span className="sr-only">Someone asks: </span>“{text.replace(/\.$/, "")}”
      </p>
    </div>
  );
}

/** The result's head: the kind of work as an icon, then the stocks it names. */
function Head({ icon, children, aside }: { icon: NavIconName; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={`${ROW} justify-between`}>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-oa-border bg-oa-card text-oa-primary">
          <NavIcon name={icon} className="size-[14px]" />
        </span>
        {children}
      </span>
      {aside ? <span className={`${SMALL} shrink-0`}>{aside}</span> : null}
    </div>
  );
}

function Ticker({ ticker }: { ticker: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <StockLogo ticker={ticker} size={20} circle atOnce />
      <span className="oa-mono text-[14px] font-semibold text-oa-fg">{ticker}</span>
    </span>
  );
}

/** The card: the whole card opens `href` (a link stretched over it, with the source as its hover title). */
function Card({ href, label, title, ask, children }: { href: string; label: string; title?: string; ask: string; children: React.ReactNode }) {
  return (
    <li className={`${CARD} hover:bg-oa-accent`}>
      <Ask text={ask} />
      <div className={RESULT}>{children}</div>
      <Link
        prefetch={false}
        href={href}
        aria-label={label}
        title={title}
        className="absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-fg/20"
      />
    </li>
  );
}

function signedPct(pct: number): string {
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
}

function EarningsView({ card, today }: { card: EarningsCard; today: string }) {
  const days = daysFromToday(card.date, today) ?? 0;
  return (
    <Card href="/calendar" label={`${card.ticker} reports ${dayWords(card.date, today)}`} title={`${card.ticker} reports ${absoluteDay(card.date, today)}`} ask={askOf(card)}>
      <Head icon="calendar">
        <Ticker ticker={card.ticker} />
      </Head>
      <p className={FIGURE_ROW}>
        <span className={`${FIGURE} text-oa-fg`}>{days <= 0 ? "Today" : days}</span>
        {days > 0 ? <span className={SMALL}>{days === 1 ? "day to its report" : "days to its report"}</span> : null}
      </p>
      <p className={LINE}>{earningsSentence(card, today)}</p>
    </Card>
  );
}

function MoveView({ card, today }: { card: MoveCard; today: string }) {
  return (
    <Card href={`/stock/${encodeURIComponent(card.ticker)}`} label={`${card.headline}, ${dayWords(card.day, today)}`} title="From daily closing prices" ask={askOf(card)}>
      <Head icon="movers" aside={capitalize(dayWords(card.day, today))}>
        <Ticker ticker={card.ticker} />
      </Head>
      <p className={FIGURE_ROW}>
        <span className={`${FIGURE} ${card.pct < 0 ? "text-signal-bearish" : "text-signal-bullish"}`}>{signedPct(card.pct)}</span>
        <span className={SMALL}>in a day</span>
      </p>
      <p className={LINE}>The agent flagged it in its check {onDayWords(card.ranOn, today)}.</p>
    </Card>
  );
}

function FilingView({ card, today }: { card: FilingCard; today: string }) {
  const filed = absoluteDay(card.filed, today);
  const what = card.op === "added" ? (card.count === 1 ? "new risk" : "new risks") : card.count === 1 ? "risk dropped" : "risks dropped";
  return (
    <Card
      href={`/stock/${encodeURIComponent(card.ticker)}#filing-changes`}
      label={`How ${card.ticker}'s risks changed in its ${card.form}`}
      title={`${card.ticker} ${card.form}, filed ${filed} (SEC EDGAR)`}
      ask={askOf(card)}
    >
      <Head
        icon="filings"
        aside={
          // The filing itself on SEC: the one link above the card's own.
          <a href={card.url} target="_blank" rel="noopener noreferrer" className="relative z-[2] underline decoration-oa-border underline-offset-2 hover:text-oa-fg hover:decoration-oa-fg">
            {card.form}, {filed}
          </a>
        }
      >
        <Ticker ticker={card.ticker} />
      </Head>
      <p className={FIGURE_ROW}>
        <span className={`${FIGURE} text-oa-fg`}>
          {card.op === "added" ? "+" : "−"}
          {card.count}
        </span>
        <span className={SMALL}>{what}, in its own words</span>
      </p>
      <p className={LINE}>“{card.quote.replace(/\.$/, "")}”</p>
    </Card>
  );
}

/** Where the figure is against the line, on the conditions engine's own scale (barScale): fill to the figure, tick at the line. */
function LineBar({ card }: { card: LineCard }) {
  const { scale } = card;
  const base = scale.zero ?? 0;
  const left = Math.min(base, scale.value);
  const width = Math.abs(scale.value - base);
  return (
    <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="relative block h-1.5 rounded-full bg-oa-card">
        <span className={`absolute inset-y-0 rounded-full ${card.holds ? "bg-signal-bullish" : "bg-signal-bearish"}`} style={{ left: `${left * 100}%`, width: `${width * 100}%` }} />
        <span className="absolute -inset-y-1 w-[2px] rounded-full bg-oa-fg" style={{ left: `calc(${scale.line * 100}% - 1px)` }} />
      </span>
      <span className="oa-type-fixed oa-mono flex justify-between text-[11px] leading-[13px] tabular-nums text-oa-muted-fg">
        <span>{formatValue(card.condition.metric, scale.from)}</span>
        <span>{formatValue(card.condition.metric, scale.to)}</span>
      </span>
    </span>
  );
}

function LineView({ card }: { card: LineCard }) {
  const { condition } = card;
  // The figure and the line are in the bar and the request: the sentence says what happens next.
  const said = card.holds ? "Still holds. It's checked again the night the next report lands." : "It broke, so the agent flagged it the night the report landed.";
  return (
    <Card href="/portfolio" label={`${card.ticker}: ${card.holdsIf}, now ${card.nowText}`} title={card.source} ask={askOf(card)}>
      <Head icon="portfolio" aside={card.when}>
        <Ticker ticker={card.ticker} />
      </Head>
      <div className={FIGURE_ROW}>
        <span className={`${FIGURE} ${card.holds ? "text-signal-bullish" : "text-signal-bearish"}`}>{card.nowText}</span>
        <LineBar card={card} />
      </div>
      <p className={LINE}>{said}</p>
    </Card>
  );
}

function ReplayView({ card }: { card: ReplayCard }) {
  const span = spanWords(card.from, card.to);
  return (
    <Card
      href={`/themes/${encodeURIComponent(card.slug)}`}
      label={`${card.name} replayed over 4 weeks: it would have proposed a change on ${card.changeDays} of ${card.checked} days`}
      title="A replay with the figures each day had, not a record"
      ask={askOf(card)}
    >
      <Head icon="themes" aside={span}>
        {card.changes.length > 0 ? (
          <span aria-hidden="true" className="flex -space-x-1.5">
            {card.changes.slice(0, 3).map((change) => (
              <StockLogo key={`${change.op}:${change.ticker}`} ticker={change.ticker} size={20} circle atOnce className="ring-2 ring-oa-bg" />
            ))}
          </span>
        ) : null}
        <span className="truncate text-[14px] font-medium text-oa-fg">4-week replay</span>
      </Head>
      <div className={FIGURE_ROW}>
        <span className={`${FIGURE} text-oa-fg`}>{card.changeDays}</span>
        <span className={`${SMALL} shrink-0`}>of {card.checked} days</span>
        {/* One mark per market day, oldest first, filled where it would have proposed a change. One SVG, a few hundred bytes. */}
        <svg aria-hidden="true" viewBox={`0 0 ${card.marks.length * 4 - 1} 14`} preserveAspectRatio="none" className="h-3.5 min-w-0 flex-1">
          <g className="fill-oa-border">{card.marks.map((change, index) => (change ? null : <rect key={index} x={index * 4} width="3" height="14" rx=".6" />))}</g>
          <g className="fill-oa-primary">{card.marks.map((change, index) => (change ? <rect key={index} x={index * 4} width="3" height="14" rx=".6" /> : null))}</g>
        </svg>
      </div>
      <p className={LINE}>{card.line}</p>
    </Card>
  );
}

const STATUS_TEXT: Record<ThesisCard["status"], string> = {
  holds: "text-signal-bullish",
  strain: "text-amber-800 dark:text-amber-300",
  broken: "text-signal-bearish",
  waiting: "text-oa-fg",
};

function ThesisView({ card }: { card: ThesisCard }) {
  return (
    <Card href="/agents/theses/new" label={`Example thesis, ${card.name}: ${STATUS_LABEL[card.status]}. ${card.line}`} title={card.name} ask={askOf(card)}>
      <Head icon="agents">
        <span aria-hidden="true" className="flex -space-x-1.5">
          {card.companies.map((company) => (
            <StockLogo key={company.ticker} ticker={company.ticker} size={20} circle atOnce className="ring-2 ring-oa-bg" />
          ))}
        </span>
        <span className="oa-type-fixed oa-mono truncate text-[12px] font-semibold text-oa-fg">{card.companies.map((company) => company.ticker).join(" · ")}</span>
      </Head>
      <p className={FIGURE_ROW}>
        <span className={`shrink-0 text-[20px] font-semibold leading-[30px] tracking-[-0.01em] ${STATUS_TEXT[card.status]}`}>{STATUS_LABEL[card.status]}</span>
      </p>
      <p className={LINE}>{card.line}</p>
    </Card>
  );
}

function CardView({ card, today }: { card: WatchCard; today: string }) {
  switch (card.kind) {
    case "earnings":
      return <EarningsView card={card} today={today} />;
    case "move":
      return <MoveView card={card} today={today} />;
    case "filing":
      return <FilingView card={card} today={today} />;
    case "line":
      return <LineView card={card} />;
    case "replay":
      return <ReplayView card={card} />;
    case "thesis":
      return <ThesisView card={card} />;
  }
}

/** Whole rows only: six or three in rows of three from lg, four or two in rows of two from sm. */
function shown(cards: WatchCard[]): { cards: WatchCard[]; grid: string } {
  const n = cards.length >= 6 ? 6 : cards.length >= 4 ? 4 : cards.length === 3 ? 3 : cards.length >= 2 ? 2 : 0;
  // Three stay stacked below lg: two columns there would leave the third alone in its row.
  const grid =
    n === 6 ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3" : n === 3 ? "grid grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3" : "grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3";
  return { cards: cards.slice(0, n), grid };
}

const SECTION = "scroll-mt-24";

export async function AgentWatchSection({ className = "" }: { className?: string }) {
  const watch = await loadAgentWatch();
  const all = [watch.earnings, watch.move, watch.filing, watch.line, watch.replay, watch.thesis].filter((card): card is WatchCard => card !== null);
  const { cards, grid } = shown(all);
  if (cards.length < 2) return null;
  return (
    <section id="agent-watches" className={`${SECTION} ${className}`}>
      <SectionHead title={HEAD_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <Reveal delay={60}>
        {/* Four on a phone, the rest behind one quiet "Show more" (kit ShowMoreGrid); all of them from sm. */}
        <ShowMoreGrid count={cards.length} label="What people ask their agent, and what it sent" className={grid}>
          {cards.map((card) => (
            <CardView key={card.kind} card={card} today={watch.today} />
          ))}
        </ShowMoreGrid>
        <p className="mt-3 text-[13px] leading-5 text-oa-muted-fg">{EXAMPLE_NOTE}</p>
      </Reveal>
    </section>
  );
}

/** The section's place while it loads: the same heading, six card shells at the cards' own heights (four on a phone), the note. */
export function AgentWatchGhost({ className = "" }: { className?: string }) {
  return (
    <section aria-hidden="true" className={`${SECTION} ${className}`}>
      <SectionHead title={HEAD_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 max-sm:[&>li:nth-child(n+5)]:hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={`${CARD} h-[210px] sm:h-auto`} />
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-5 text-oa-muted-fg">{EXAMPLE_NOTE}</p>
    </section>
  );
}
