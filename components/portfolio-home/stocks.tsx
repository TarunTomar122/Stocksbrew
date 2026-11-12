import Link from "next/link";
import * as React from "react";

import { Bar } from "@/components/oa/kit/skeleton";
import { FitRows } from "@/components/agent-log/fit-rows";
import { FitCards } from "@/components/portfolio-home/fit-cards";
import { FoldCards } from "@/components/portfolio-home/fold-cards";
import { StockLogo } from "@/components/stock-logo";
import { fmtPlanDay } from "@/lib/dividend-plan";
import { memoFacts, toolHref, type MemoFact } from "@/lib/portfolio-home/focus";
import { TOOL_GROUPS, toolCard, type ToolId } from "@/lib/portfolio-home/pick";
import { feedSources, type HomeLoad } from "@/lib/portfolio-home/server";
import { callHref, flaggedMove, flagStep, flagWords } from "@/lib/portfolio-home/example-check";
import { loadExampleChecks } from "@/lib/portfolio-home/example-check-server";
import { ATTENTION, bookLead, extraFacts, leadParts, nextReportStep, reportAhead, sayMonthOnce, signedPct, stockCards, type BookSource, type StockCard } from "@/lib/portfolio-home/stocks";

/**
 * My stocks, about the person's stocks (owner, Nov 11): one read on how they did today and over the past week against
 * the S&P 500 with the next step, then every holding as a small card (move, gain, our call with its own level, and the one thing that
 * matters for it now), the ones that need the person first and the quiet rest folded under them. The portfolio tools
 * are one card of small tiles at the foot of the rail. Each part waits only for its own sources (lib/portfolio-home/server.ts).
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg sm:text-[17px] sm:leading-6";

/** "$91.85", "$1,204": a share price, with cents under $1,000. */
function sharePrice(value: number): string {
  const cents = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
}

function tone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "text-oa-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

/* ── the lead: how the stocks did ──────────────────────────────────────── */

const TONE_TEXT = { up: "text-signal-bullish", down: "text-signal-bearish" } as const;

/** How long the lead waits for the example agents' flag before its step falls back to the next report. */
const STEP_MS = 1200;

/**
 * The step after the lead: the example agents' flag ending on its price, then our call ("Your agent flagged NVDA's
 * 5.5% drop to $168.89 on Nov 10. Check our call on NVDA before the report."), else, for your own stocks, the soonest report on a holding.
 * The example's report day is its NVDA card's ("Reports Nov 17, after the close."), so the lead does not say it again
 * (owner rule 1, judges ship 50), and with no flag there is no step.
 */
async function leadStep(source: BookSource): Promise<{ ticker: string; step: string } | null> {
  if (source.mode === "example") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), STEP_MS);
    });
    const flag = await Promise.race([loadExampleChecks().catch(() => null), late]).finally(() => clearTimeout(timer));
    const move = flaggedMove(flag, source.today);
    // Only a holding of the example's: a flag on a stock it does not hold is not this list's step.
    const held = move ? source.portfolio.positions.find((position) => position.ticker === move.ticker && position.kind === "holding") : undefined;
    if (!move || !held) return null;
    // The same words as the briefing's card and the inbox's read on this flag: the flag, then the step.
    return { ticker: move.ticker, step: `${flagWords(move, null, source.today)} ${flagStep(move.ticker, reportAhead(held.nextEarnings, source.today))}` };
  }
  return nextReportStep(source);
}

/**
 * How the stocks did, as one read (judges, ship 46: three money tiles were counts, not a read): the headline against
 * the S&P 500, the day, the last five trading days and the total gain inside plain sentences, each with its baseline,
 * and the next step (the flagged holding's report, or the soonest report on one), which opens that stock at our call.
 */
export async function BookLead({ load }: { load: HomeLoad }) {
  const book = await load.book;
  if (book.state !== "ready") return null;
  const lead = bookLead(book.value);
  if (!lead) return null;
  const parts = leadParts(lead, book.value.mode === "example");
  return (
    <section aria-labelledby="book-head" className={`${CARD} px-4 py-3.5 sm:px-5`}>
      <h2 id="book-head" className={H2}>
        {lead.headline}
      </h2>
      {parts.length > 0 ? (
        <p className="mt-1.5 text-pretty text-[14px] leading-[21px] text-oa-muted-fg">
          {parts.map((sentence, index) => (
            <React.Fragment key={index}>
              {index > 0 ? " " : null}
              {sentence.map((part, at) =>
                part.tone ? (
                  <span key={at} className={`oa-mono font-semibold tabular-nums ${TONE_TEXT[part.tone]}`}>
                    {part.text}
                  </span>
                ) : (
                  <React.Fragment key={at}>{part.text}</React.Fragment>
                ),
              )}
            </React.Fragment>
          ))}
        </p>
      ) : null}
      {/* The step streams in on its own, so the read never waits on the agents' runs (owner rule 11). */}
      <React.Suspense fallback={null}>
        <LeadStep source={book.value} />
      </React.Suspense>
    </section>
  );
}

async function LeadStep({ source }: { source: BookSource }) {
  const step = await leadStep(source);
  if (!step) return null;
  return (
    <Link
      href={callHref(step.ticker)}
      prefetch={false}
      data-track-links="insight_clicked"
      data-track-insight-kind="home-lead-step"
      className={`-mx-4 -mb-3.5 mt-3 flex items-center gap-2.5 border-t border-oa-border px-4 py-2.5 text-pretty text-[14px] leading-5 text-oa-fg transition-colors hover:bg-oa-accent sm:-mx-5 sm:px-5 ${FOCUS}`}
    >
      <StockLogo ticker={step.ticker} size={20} eager />
      <span className="min-w-0">{step.step}</span>
    </Link>
  );
}

export function BookLeadGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3.5 sm:px-5`}>
      <Bar className="h-5 w-80 max-w-full" />
      <Bar className="mt-2.5 h-3.5 w-full" />
      <Bar className="mt-1.5 h-3.5 w-2/3" />
      <Bar className="mt-4 h-4 w-3/4" />
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

/** The fewest cards the grid shows with a fold: two full rows side by side. */
const MIN_SHOWN = 4;

/** Whether a card's one thing asks for the person: these lead, and the quiet rest can fold away (./fold-cards.tsx). */
function needsLook(card: StockCard): boolean {
  return card.fact !== null && card.fact.priority >= ATTENTION;
}

function StockCardView({ card, rest = false, className = "min-w-0" }: { card: StockCard; rest?: boolean; className?: string }) {
  const attention = needsLook(card);
  return (
    <li className={className} data-rest={rest || undefined}>
      <Link
        href={card.href}
        prefetch={false}
        title={card.name}
        data-track-links="insight_clicked"
        data-track-insight-kind={`home-stock-${card.fact?.kind ?? "none"}`}
        className={`${CARD} flex h-full flex-col px-3.5 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        <span className="block min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <StockLogo ticker={card.ticker} size={22} eager />
            <span className="oa-mono text-[14.5px] font-semibold tabular-nums text-oa-fg">{card.ticker}</span>
            {/* The stock's own price, and its day under it; not the holding's dollars (owner, Nov 12: "4 numbers are super confusing"). */}
            <span className="oa-mono ml-auto shrink-0 text-[16px] font-semibold leading-6 tabular-nums text-oa-fg">{card.price !== null ? sharePrice(card.price) : "–"}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3 text-[13px] leading-[18px]">
            <CallLine card={card} />
            {card.dayPct !== null ? <span className={`oa-mono shrink-0 text-[13px] font-medium tabular-nums ${tone(card.dayPct)}`}>{signedPct(card.dayPct, 2)}</span> : null}
          </span>
        </span>
        {card.fact ? (
          <span className={`mt-1.5 block text-pretty text-[13px] leading-[18px] ${attention ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>{card.fact.text}</span>
        ) : null}
      </Link>
    </li>
  );
}


/**
 * The list's height before the page measures it (./fit-cards.tsx): none when every card will show (ten or fewer on a
 * phone, seven rows side by side), else about the measured box, so a long list does not paint long and then jump.
 */
function firstCap(count: number): string {
  const phone = count > 10 ? "max-h-[62rem]" : "";
  const wide = count > 14 ? "sm:max-h-[42rem]" : "sm:max-h-none";
  return `${phone} ${wide}`;
}

/**
 * The list's headline, saying what the grid shows: "6 of your 11 holdings need a look" when the rest are folded away,
 * else the count ("Your 11 holdings", "All 4 of your holdings need a look").
 */
function stocksHead(total: number, need: number, example: boolean): string {
  const whose = example ? "the example's" : "your";
  const Whose = example ? "The example's" : "Your";
  if (need === 0) return `${Whose} ${total} ${total === 1 ? "holding" : "holdings"}`;
  if (need === total) return total === 1 ? `${Whose} one holding needs a look` : `All ${total} of ${whose} holdings need a look`;
  return `${need} of ${whose} ${total} holdings ${need === 1 ? "needs" : "need"} a look`;
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
  // The S&P 500's month said once above the cards when most of them lead with their month (owner rule 1).
  const { line: monthLine, cards } = sayMonthOnce(stockCards(book.value, extra), book.value.month);
  if (cards.length === 0) return null;
  const example = book.value.mode === "example";
  // The cards come sorted by urgency, then weight, so the ones that need a look lead; when some, but not all, need a
  // look, the rest fold away under the grid (owner, Nov 12: "why show me all when only 6 needs a look???"). At least
  // two full rows stay in view, topped up with the next cards in that order, so one lone card never sits by the rail.
  const need = cards.filter(needsLook).length;
  const shown = need > 0 && need < cards.length ? Math.max(need, MIN_SHOWN) : cards.length;
  const folded = Math.max(0, cards.length - shown);
  // Held and watched said apart, so the counts agree with the briefing's ("seven you hold and two you watch").
  const watching = book.value.portfolio.watching.length;
  const funds = cards.some((card) => card.fund);
  const grid = `scrollbar-hide grid grid-cols-1 content-start gap-2.5 overflow-y-auto sm:grid-cols-2 ${firstCap(shown)}`;
  const items = cards.map((card, index) => <StockCardView key={card.ticker} card={card} rest={index >= shown} />);
  return (
    <section aria-labelledby="stocks-head" className="min-w-0">
      <h2 id="stocks-head" className="px-1 pb-2.5 text-[14.5px] font-semibold leading-5 text-oa-fg">
        {stocksHead(cards.length, need, example)}
        {watching > 0 ? (
          <span className="font-normal text-oa-muted-fg">
            {" · "}
            <Link href="/portfolio?tab=watching" prefetch={false} className={`rounded underline decoration-oa-border underline-offset-[3px] hover:text-oa-fg hover:decoration-oa-fg ${FOCUS}`}>
              {watching} watched
            </Link>
          </span>
        ) : null}
        {/* Said once for the list, not on each fund's card (owner rule 1). */}
        {funds ? <span className="font-normal text-oa-muted-fg"> · no calls on funds</span> : null}
      </h2>
      {monthLine ? <p className="-mt-1 px-1 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{monthLine}</p> : null}
      {/* About eight cards on a phone and five rows side by side, the rest scrolling inside a box that ends on a whole
          row, with no visible bar (owner rule 5). The cap before the page measures it is close to the measured one
          (firstCap). With a fold, the quiet cards sit in the same grid, hidden until the toggle under it opens them. */}
      {folded > 0 ? (
        <FoldCards className={grid} rest={folded}>
          {items}
        </FoldCards>
      ) : (
        <FitCards className={grid}>{items}</FitCards>
      )}
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

/* ── the tools, at the foot of the rail ────────────────────────────────── */

/** "$62" reads as the year's dividends only with the words. */
function toolFigure(id: ToolId, figure: string): string {
  return id === "dividends" ? `${figure} a year` : figure;
}

/**
 * The portfolio tools that have something to show, as one card at the foot of the rail (owner, Nov 12: a loose strip
 * of links between two cards was "wtf is that"): small tiles two across, each the tool's name with its figure under
 * it ("Stress test", "−32%"), the tile itself the link. An odd last tile keeps its one column (owner rule 3). Tools with
 * nothing to show, or only an empty state ("Nothing to trim"), are left to the menu (owner rule 4). The weekly memo is
 * left out when its own figures sit in the rail (`MemoFigures`), so it is not linked twice.
 */
export async function ToolsCard({ load }: { load: HomeLoad }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const all = { ...sources, goal };
  const memoShown = railMemoFacts(sources.memo).length > 0;
  const tools = TOOL_GROUPS.flatMap((group) => group.tools)
    .filter((id) => !(id === "memo" && memoShown))
    .map((id) => ({ id, card: toolCard(id, all, mode) }))
    .filter(({ card }) => card.figure !== null && !card.empty);
  if (tools.length === 0) return null;
  return (
    <nav aria-labelledby="tools-head" className={`${CARD} px-4 py-3`}>
      <h2 id="tools-head" className="text-[14px] font-semibold leading-5 text-oa-fg">
        Tools
      </h2>
      <ul className="mt-2 grid grid-cols-2 gap-1.5">
        {tools.map(({ id, card }) => (
          <li key={id} className="min-w-0">
            <Link
              href={toolHref(id, mode)}
              prefetch={false}
              data-track-links="insight_clicked"
              data-track-insight-kind={`home-tool-${id}`}
              className={`block h-full rounded-lg border border-oa-border bg-oa-bg px-2.5 py-2 transition-colors hover:bg-oa-accent ${FOCUS}`}
            >
              <span className="block truncate text-[13px] font-medium leading-5 text-oa-fg">{card.title}</span>
              <span className="oa-mono mt-0.5 block truncate text-[12px] leading-4 tabular-nums text-oa-muted-fg">{toolFigure(id, card.figure!)}</span>
            </Link>
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

/** "+1.0 pts", "−0.3 pts": a holding's share of the week's move, in points of the portfolio. */
function moverPoints(points: number): string {
  return `${points >= 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`;
}

/**
 * The memo in the rail: the main risk as a figure, then the holdings that moved the week most, as small cards two
 * across (logo, ticker, its points of the portfolio's week, and its own move under them), the
 * biggest share first, up or down. On a wide screen the card sits in a box that ends with the holdings beside it
 * (my-stocks.tsx `[data-memo-box]`): the cards fill what the box leaves and the rest scroll inside, so the rail and the
 * holdings end together (owner rule 4). The week itself is the lead's, so it is not repeated. Nothing when the memo has neither.
 */
export async function MemoFigures({ load }: { load: HomeLoad }) {
  const memo = await load.sources.memo;
  // Biggest share of the week's move first, up or down, so the rows in view are the ones that mattered most when the
  // rest scroll inside.
  const movers =
    memo.state === "ready"
      ? (memo.value.memo.view?.movers ?? [])
          .filter((move) => Math.abs(move.points) >= 0.05)
          .map((move, index) => ({ move, index }))
          .sort((a, b) => Math.abs(b.move.points) - Math.abs(a.move.points) || a.index - b.index)
          .map(({ move }) => move)
      : [];
  // With the movers listed, the biggest of them is their first row rather than a figure of its own.
  const facts = railMemoFacts(memo).filter((fact) => !(movers.length > 0 && fact.id === "driver"));
  if (memo.state !== "ready" || (facts.length === 0 && movers.length === 0)) return null;
  const complete = memo.value.memo.complete;
  return (
    <Link
      href="/portfolio/memo"
      prefetch={false}
      data-track-links="insight_clicked"
      data-track-insight-kind="home-memo"
      className={`${CARD} block px-4 py-3 transition-colors hover:bg-oa-accent lg:flex lg:max-h-full lg:min-h-0 lg:flex-col ${FOCUS}`}
    >
      <span className="flex shrink-0 items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold leading-5 text-oa-fg">Weekly memo</span>
        <span className="oa-mono shrink-0 text-[12px] tabular-nums text-oa-muted-fg">Week of {fmtPlanDay(memo.value.memo.monday)}</span>
      </span>
      {facts.length > 0 ? (
      <span className={`mt-2 grid shrink-0 gap-x-4 ${facts.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
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
      ) : null}
      {movers.length > 0 ? (
        <>
          <span className="mt-3 block shrink-0 text-[12.5px] leading-[17px] text-oa-muted-fg">{complete ? "What moved the week" : "What moved the week so far"}</span>
          {/* Each mover a small card side by side (owner rule 3: the memo is cards and charts): the stock, its points of
              the portfolio's week as the figure, and its own move under them. An odd last card
              takes the row (owner rule 4). On a wide screen the rows that fit show whole and the rest scroll inside, with
              no visible bar (../agent-log/fit-rows.tsx). */}
          <FitRows box="[data-memo-box]" className="mt-1.5 grid grid-cols-2 gap-1.5 scrollbar-hide lg:min-h-0 lg:overflow-y-auto">
            {movers.map((move, index) => {
              const up = move.points >= 0;
              const own = Math.abs(move.pct) < 0.05 ? "barely moved" : `${move.pct > 0 ? "rose" : "fell"} ${Math.abs(move.pct).toFixed(1)}%`;
              return (
                <li
                  key={move.ticker}
                  className={`rounded-lg border border-oa-border bg-oa-bg px-2.5 py-2 ${index === movers.length - 1 && movers.length % 2 === 1 ? "col-span-2" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5">
                    <StockLogo ticker={move.ticker} size={16} />
                    <span className="oa-mono min-w-0 truncate font-semibold text-oa-fg">{move.ticker}</span>
                    <span className={`oa-mono ml-auto shrink-0 font-semibold tabular-nums ${up ? "text-signal-bullish" : "text-signal-bearish"}`}>{moverPoints(move.points)}</span>
                  </span>
                  {/* Its own move under the points, as a figure: no bar beside it, since the numbers already say it (owner rule 5). */}
                  <span className="oa-mono mt-0.5 block text-[12px] leading-4 tabular-nums text-oa-muted-fg">{own}</span>
                </li>
              );
            })}
          </FitRows>
        </>
      ) : null}
    </Link>
  );
}
