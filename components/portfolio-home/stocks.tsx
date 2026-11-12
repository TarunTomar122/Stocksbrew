import Link from "next/link";
import * as React from "react";

import { Bar } from "@/components/oa/kit/skeleton";
import { StockLogo } from "@/components/stock-logo";
import { fmtPlanDay } from "@/lib/dividend-plan";
import { memoFacts, toolHref, type MemoFact } from "@/lib/portfolio-home/focus";
import { TOOL_GROUPS, toolCard, type ToolId } from "@/lib/portfolio-home/pick";
import { feedSources, type HomeLoad } from "@/lib/portfolio-home/server";
import { ATTENTION, bookLead, extraFacts, signedDollars, signedPct, stockCards, type StockCard } from "@/lib/portfolio-home/stocks";

/**
 * My stocks, about the person's stocks (owner, Nov 11): how they did today and over the past week against the
 * S&P 500, then every holding as a small card (move, gain, our call with its own level, and the one thing that
 * matters for it now), the ones that need the person first. The portfolio tools are a quiet line of links with
 * their figures at the bottom, not cards. Each part waits only for its own sources (lib/portfolio-home/server.ts).
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg sm:text-[17px] sm:leading-6";

function tone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "text-oa-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

/* ── the lead: how the stocks did ──────────────────────────────────────── */

function Stat({ caption, figure, figureTone, sub }: { caption: string; figure: string; figureTone: number | null; sub: string[] }) {
  return (
    <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
      {/* Whole, never cut with "…" (owner rule 8): the captions are short enough for a phone's third. */}
      <p className="text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{caption}</p>
      <p className={`oa-mono mt-0.5 text-[17px] font-semibold leading-6 tracking-[-0.01em] tabular-nums sm:text-[20px] sm:leading-7 ${tone(figureTone)}`}>{figure}</p>
      {/* Each part stays on one line ("S&P +1.6%" never splits on a phone); a narrow tile wraps between the parts. */}
      <p className="oa-mono text-[11.5px] leading-4 tabular-nums text-oa-muted-fg sm:text-[12px]">
        {sub.length === 0
          ? "\u00a0"
          : sub.map((part, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " · " : ""}
                <span className="whitespace-nowrap">{part}</span>
              </React.Fragment>
            ))}
      </p>
    </div>
  );
}

/** ["+1.2%", "S&P +0.4%"], or the S&P alone when the figure above is already the percent. */
function versus(pct: number | null, market: number | null): string[] {
  return [pct !== null ? signedPct(pct) : null, market !== null ? `S&P ${signedPct(market)}` : null].filter((part): part is string => part !== null);
}

export async function BookLead({ load }: { load: HomeLoad }) {
  const book = await load.book;
  if (book.state !== "ready") return null;
  const lead = bookLead(book.value);
  if (!lead) return null;
  const stats: Array<{ key: string; caption: string; figure: string; figureTone: number | null; sub: string[] }> = [];
  if (lead.today) {
    const { dollars, pct, marketPct, label } = lead.today;
    stats.push(
      dollars !== null
        ? { key: "day", caption: label, figure: signedDollars(dollars), figureTone: dollars, sub: versus(pct, marketPct) }
        : { key: "day", caption: `${label}, on average`, figure: signedPct(pct), figureTone: pct, sub: versus(null, marketPct) },
    );
  }
  if (lead.week) {
    // The last five sessions (weekMove), said as trading days so it is not read as the memo's week so far.
    const { dollars, pct, marketPct } = lead.week;
    stats.push(
      dollars !== null
        ? { key: "week", caption: "Last 5 days", figure: signedDollars(dollars), figureTone: dollars, sub: versus(pct, marketPct) }
        : { key: "week", caption: "Last 5 days, on average", figure: signedPct(pct), figureTone: pct, sub: versus(null, marketPct) },
    );
  }
  if (lead.gain) {
    const { dollars, pct, counted, of } = lead.gain;
    stats.push({
      key: "gain",
      caption: "Total gain",
      figure: signedDollars(dollars),
      figureTone: dollars,
      sub: [pct !== null ? signedPct(pct) : null, counted < of ? `${counted} of ${of} stocks` : null].filter((part): part is string => part !== null),
    });
  }
  const cols = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"][stats.length] ?? "grid-cols-3";
  return (
    <section aria-labelledby="book-head" className="min-w-0">
      <h2 id="book-head" className={`${H2} px-1 pb-2.5`}>
        {lead.headline}
      </h2>
      {stats.length > 0 ? (
        <div className={`${CARD} grid ${cols} divide-x divide-oa-border`}>
          {stats.map((stat) => (
            <Stat key={stat.key} caption={stat.caption} figure={stat.figure} figureTone={stat.figureTone} sub={stat.sub} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function BookLeadGhost() {
  return (
    <div aria-hidden="true" className="min-w-0">
      <Bar className="mx-1 mb-3 mt-1 h-4 w-72" />
      <div className={`${CARD} grid grid-cols-3 divide-x divide-oa-border`}>
        {[0, 1, 2].map((cell) => (
          <div key={cell} className="px-4 py-3">
            <Bar className="h-3 w-16" />
            <Bar className="mt-2 h-5 w-20" />
            <Bar className="mt-1.5 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the stocks ────────────────────────────────────────────────────────── */

function CallLine({ card }: { card: StockCard }) {
  if (!card.call) return <span />;
  return (
    <span className="min-w-0 truncate">
      <span className="font-medium text-oa-fg">{card.call}</span>
      {card.level ? <span className="text-oa-muted-fg"> {card.level}</span> : null}
    </span>
  );
}

function StockCardView({ card, className }: { card: StockCard; className: string }) {
  const attention = card.fact !== null && card.fact.priority >= ATTENTION;
  return (
    <li className={className}>
      <Link
        href={card.href}
        prefetch={false}
        title={card.name}
        data-track-links="insight_clicked"
        data-track-insight-kind={`home-stock-${card.fact?.kind ?? "none"}`}
        className={`${CARD} flex h-full flex-col px-3.5 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={card.ticker} size={22} eager />
          <span className="oa-mono text-[14.5px] font-semibold tabular-nums text-oa-fg">{card.ticker}</span>
          <span className="ml-auto flex shrink-0 items-baseline gap-2">
            {card.dayMove !== null ? <span className={`oa-mono text-[12px] tabular-nums ${tone(card.dayMove)}`}>{signedDollars(card.dayMove)}</span> : null}
            <span className={`oa-mono text-[16px] font-semibold leading-6 tabular-nums ${tone(card.dayPct)}`}>{card.dayPct !== null ? signedPct(card.dayPct, 2) : "–"}</span>
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3 text-[13px] leading-[18px]">
          <CallLine card={card} />
          {card.gain !== null ? (
            <span className={`oa-mono shrink-0 text-[12.5px] tabular-nums ${tone(card.gain)}`}>
              {signedDollars(card.gain)}
              {card.gainPct !== null ? <span className="text-oa-muted-fg"> {signedPct(card.gainPct, Math.abs(card.gainPct) < 0.5 ? 1 : 0)}</span> : null}
            </span>
          ) : null}
        </span>
        {card.fact ? (
          <span className={`mt-1.5 block text-pretty text-[13px] leading-[18px] ${attention ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>{card.fact.text}</span>
        ) : null}
      </Link>
    </li>
  );
}

/** Two columns from `sm`; an odd last card takes the whole row, so no row ends half empty (owner rule 4). */
function cellClass(index: number, count: number): string {
  return index === count - 1 && count % 2 === 1 ? "min-w-0 sm:col-span-2" : "min-w-0";
}

/** More cards than this and the list fills the height the side rail sets (see StockList). */
const FILL_FROM = 6;

/** "2 need a look" or nothing: the count of cards whose one thing asks for the person. */
function needWords(cards: StockCard[]): string | null {
  const n = cards.filter((card) => card.fact !== null && card.fact.priority >= ATTENTION).length;
  return n === 0 ? null : `${n} ${n === 1 ? "needs" : "need"} a look`;
}

export async function StockList({ load }: { load: HomeLoad }) {
  const [book, ideas, reasons] = await Promise.all([load.book, load.sources.ideas, load.sources.reasons]);
  if (book.state !== "ready") {
    if (book.state === "empty") return null;
    return (
      <p className={`${CARD} px-4 py-3 text-pretty text-[14px] leading-5 text-oa-muted-fg`}>
        {book.state === "slow" ? "The stocks took too long to load just now. Reload in a minute." : "The stocks could not be loaded just now. Reload in a minute."}
      </p>
    );
  }
  const extra = extraFacts({
    ideas: ideas.state === "ready" ? ideas.value : null,
    reasons: reasons?.state === "ready" ? reasons.value.checks : null,
  });
  const cards = stockCards(book.value, extra);
  if (cards.length === 0) return null;
  const example = book.value.mode === "example";
  const need = needWords(cards);
  // With more cards than a short rail is tall, the list on a wide screen ends where the rail ends (it fills the space
  // the row gives it and scrolls inside), keeping at least about six cards in view, so neither column ends far above
  // the other (owner rule 4). A short list just sits at its own height.
  const fill = cards.length > FILL_FROM;
  const list = (
    <ul
      className={`scrollbar-hide grid max-h-[47rem] grid-cols-1 content-start gap-2.5 overflow-y-auto overscroll-contain sm:max-h-[44rem] sm:grid-cols-2 ${
        fill ? "lg:absolute lg:inset-0 lg:max-h-none" : ""
      }`}
    >
      {cards.map((card, index) => (
        <StockCardView key={card.ticker} card={card} className={cellClass(index, cards.length)} />
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="stocks-head" className={`min-w-0 ${fill ? "lg:flex lg:flex-1 lg:flex-col" : ""}`}>
      <h2 id="stocks-head" className="px-1 pb-2.5 text-[14.5px] font-semibold leading-5 text-oa-fg">
        {example ? "The example's" : "Your"} {cards.length} {cards.length === 1 ? "stock" : "stocks"}
        {need ? <span className="font-normal text-oa-muted-fg"> · {need}</span> : null}
      </h2>
      {/* About eight cards in view on a phone, twelve side by side; the rest scroll inside, with no visible bar (owner rule 5). */}
      {fill ? <div className="relative min-w-0 lg:min-h-[27rem] lg:flex-1">{list}</div> : list}
    </section>
  );
}

export function StockListGhost() {
  return (
    <div aria-hidden="true" className="min-w-0">
      <Bar className="mx-1 mb-3 mt-1 h-3.5 w-40" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className={`${CARD} px-3.5 py-3`}>
            <Bar className="h-4 w-24" />
            <Bar className="mt-2 h-3 w-40" />
            <Bar className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the tools, as links ───────────────────────────────────────────────── */

/** "$62" reads as the year's dividends only with the words. */
function toolFigure(id: ToolId, figure: string): string {
  return id === "dividends" ? `${figure} a year` : figure;
}

/**
 * The portfolio tools that have something to show, as one quiet line of links under the rail (owner rule 10: tools
 * are links, not cards). Each keeps its figure in small type after its name ("Stress test −32%"), so the line still
 * says something. Tools with nothing to show, or only an empty state ("Nothing to trim"), are left to the menu (owner
 * rule 4). The weekly memo is left out when its own figures sit above (`MemoFigures`), so it is not linked twice.
 */
export async function ToolLinks({ load }: { load: HomeLoad }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const all = { ...sources, goal };
  const memoShown = railMemoFacts(sources.memo).length > 0;
  const tools = TOOL_GROUPS.flatMap((group) => group.tools)
    .filter((id) => !(id === "memo" && memoShown))
    .map((id) => ({ id, card: toolCard(id, all, mode) }))
    .filter(({ card }) => card.figure !== null && !card.empty);
  if (tools.length === 0) return null;
  return (
    <nav aria-label={mode === "example" ? "The example's tools" : "Your tools"} className="px-1 text-[13px] leading-6 text-oa-muted-fg">
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {tools.map(({ id, card }) => (
          <li key={id} className="whitespace-nowrap">
            <Link href={toolHref(id, mode)} prefetch={false} className={`rounded text-oa-fg underline decoration-oa-border underline-offset-[3px] hover:decoration-oa-fg ${FOCUS}`}>
              {card.title}
            </Link>{" "}
            <span className="oa-mono text-[12px] tabular-nums">{toolFigure(id, card.figure!)}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ── the weekly memo, in the rail ─────────────────────────────────────── */

const FACT_TONE: Record<MemoFact["tone"], string> = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" };

/** The memo facts the rail shows: all but the week, which is the lead's. None when the memo is not ready. */
function railMemoFacts(memo: Awaited<HomeLoad["sources"]["memo"]> | undefined): MemoFact[] {
  return memo?.state === "ready" ? memoFacts(memo.value.memo).filter((fact) => fact.id !== "week") : [];
}

/**
 * The memo's two figures the stock cards do not say: the holding that moved the week most and the main risk. The week
 * itself is the lead's, so it is not repeated. Nothing when the memo has neither.
 */
export async function MemoFigures({ load }: { load: HomeLoad }) {
  const memo = await load.sources.memo;
  const facts = railMemoFacts(memo);
  if (memo.state !== "ready" || facts.length === 0) return null;
  return (
    <Link
      href="/portfolio/memo"
      prefetch={false}
      data-track-links="insight_clicked"
      data-track-insight-kind="home-memo"
      className={`${CARD} block px-4 py-3 transition-colors hover:bg-oa-accent ${FOCUS}`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold leading-5 text-oa-fg">Weekly memo</span>
        <span className="oa-mono shrink-0 text-[12px] tabular-nums text-oa-muted-fg">Week of {fmtPlanDay(memo.value.memo.monday)}</span>
      </span>
      <span className={`mt-2 grid gap-x-4 ${facts.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {facts.map((fact) => (
          <span key={fact.id} className="block min-w-0">
            <span className="block text-[12.5px] leading-[17px] text-oa-muted-fg">{fact.caption}</span>
            <span className={`oa-mono block text-[18px] font-semibold leading-6 tabular-nums ${FACT_TONE[fact.tone]}`}>{fact.figure}</span>
            <span className="flex min-w-0 items-start gap-1.5 text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">
              {fact.ticker ? <StockLogo ticker={fact.ticker} size={14} className="mt-px" /> : null}
              <span className="min-w-0">{fact.label}</span>
            </span>
          </span>
        ))}
      </span>
    </Link>
  );
}
