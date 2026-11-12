import Link from "next/link";

import { WATCH_LINK } from "@/components/agent-watch/watch-list";
import { SectorIcon } from "@/components/oa/sector-icon";
import { AgentCell, loadAgents, QuietCell, type AgentsView } from "@/components/portfolio-home/agents";
import { COLS, planFlow, showAt, type FlowPlan } from "@/components/portfolio-home/fit";
import { CARD, FOCUS, holdingsCounts, loadHoldings, sharePrice, tone } from "@/components/portfolio-home/stocks";
import { StockLogo } from "@/components/stock-logo";
import { fmtPlanDay } from "@/lib/dividend-plan";
import { newYorkToday } from "@/lib/portfolio-data";
import { memoFacts, type MemoFact } from "@/lib/portfolio-home/focus";
import type { HomeLoad } from "@/lib/portfolio-home/server";
import { signedPct } from "@/lib/portfolio-home/stocks";

/**
 * After the holdings on My stocks: the weekly memo's figures and the person's agents, as cards of the same grid
 * (owner, Nov 12: "empty space on left side, u didn't fix all possible cases"). They were a side rail, which could
 * only end level with the holdings for a few counts of each. Now they start in whatever the holdings leave of their
 * last row, and ./fit.ts picks, at each width and with the holdings folded or open, how many of the memo's movers
 * show and whether the quiet agents share a card, so the last row ends full too. It waits for the holdings' count,
 * the memo and the agents together, since the layout depends on all three.
 */

const HEAD_ROW = "col-span-full flex min-w-0 items-baseline justify-between gap-3 px-1 pt-3";
const H2 = "text-[14.5px] font-semibold leading-5 text-oa-fg";
/** A part's name at the top of its first card, where it starts beside the cards before it. */
const INLINE_LABEL = "mb-1 truncate text-[12px] font-semibold leading-4 text-oa-muted-fg";

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[1px] text-[12px] font-medium text-oa-primary">
    Example
  </span>
);

/* ── the memo ─────────────────────────────────────────────────────────── */

export type Mover = {
  ticker: string;
  href: string;
  points: number;
  pct: number;
  price: number | null;
  dayPct: number | null;
};

export type MemoView = { monday: string; complete: boolean; facts: MemoFact[]; movers: Mover[] };

/**
 * The memo's figures for the overview: its main risk (not the week's own return, owner rule 7), and the holdings that
 * moved the week most, biggest share first, up or down, each with its price and day from the same quotes as the
 * stock cards (owner rule 4: every stock tile shows its current price). Null when the memo has neither.
 */
async function loadMemo(load: HomeLoad): Promise<MemoView | null> {
  const [memo, book] = await Promise.all([load.sources.memo, load.book]);
  if (memo.state !== "ready") return null;
  const positions = book.state === "ready" ? [...book.value.portfolio.positions, ...book.value.portfolio.watching] : [];
  const quote = (ticker: string) => positions.find((position) => position.ticker === ticker) ?? null;
  const movers = (memo.value.memo.view?.movers ?? [])
    .filter((move) => Math.abs(move.points) >= 0.05)
    .map((move, index) => ({ move, index }))
    .sort((a, b) => Math.abs(b.move.points) - Math.abs(a.move.points) || a.index - b.index)
    .map(({ move }): Mover => {
      const position = quote(move.ticker);
      return { ticker: move.ticker, href: move.href || `/stock/${move.ticker}`, points: move.points, pct: move.pct, price: position?.price ?? null, dayPct: position?.dayPct ?? null };
    });
  // Only the main risk: the biggest lift or drag is the first mover card, and the week's own return is a summary figure.
  const facts = memoFacts(memo.value.memo).filter((fact) => fact.id === "risk");
  if (facts.length === 0 && movers.length === 0) return null;
  return { monday: memo.value.memo.monday, complete: memo.value.memo.complete, facts, movers };
}

const FACT_TONE: Record<MemoFact["tone"], string> = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" };

/** "in Technology, against 37% of the S&P 500" with a "74%" figure: the two shares to draw as bars, else null. */
function shareBars(fact: MemoFact): { yours: number; market: number; rest: string } | null {
  const figure = /^(\d+(?:\.\d+)?)%$/.exec(fact.figure.trim());
  const against = /^(.*?),?\s*against (\d+(?:\.\d+)?)% of the S&P 500\.?$/.exec(fact.label.trim());
  if (!figure || !against) return null;
  const yours = Number(figure[1]);
  const market = Number(against[2]);
  if (!(yours >= 0 && yours <= 100 && market >= 0 && market <= 100)) return null;
  return { yours, market, rest: against[1]!.trim() };
}

function ShareBar({ label, value, strong }: { label: string; value: number; strong: boolean }) {
  return (
    <span className="grid grid-cols-[3.75rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-[11.5px] leading-4">
      <span className="text-oa-muted-fg">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-oa-muted">
        <span className={`block h-full rounded-full ${strong ? "bg-oa-primary" : "bg-oa-muted-fg/50"}`} style={{ width: `${value}%` }} />
      </span>
      {/* Yours is the card's figure already, so only the S&P 500's share is said beside its bar. */}
      <span className="oa-mono text-right tabular-nums text-oa-muted-fg">{strong ? null : `${Math.round(value)}%`}</span>
    </span>
  );
}

type CellProps = { className: string; label: React.ReactNode };

/** A memo figure: what it is and the figure, then what it is about; a share against the S&P 500 as two bars. */
function FactCell({ fact, className, label }: CellProps & { fact: MemoFact }) {
  const bars = shareBars(fact);
  // "in Technology" -> "Technology", which SectorIcon draws when it knows it.
  const sector = /^in\s+(.+)$/i.exec((bars?.rest ?? fact.label).trim())?.[1]?.replace(/[.,].*$/, "") ?? null;
  return (
    <div className={`${CARD} ${className}`}>
      <Link href="/portfolio/memo" prefetch={false} data-track-links="insight_clicked" data-track-insight-kind="home-memo" className={`flex h-full flex-col px-3.5 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}>
        {label}
        <span className="flex min-w-0 items-center gap-2">
          {fact.ticker ? <StockLogo ticker={fact.ticker} size={22} atOnce /> : null}
          {/* The sector it is about, by its icon (owner rule 4, VISUALS CHECK); none for a risk that is not a sector. */}
          {!fact.ticker && sector ? <SectorIcon id={sector} size={18} /> : null}
          <span className="min-w-0 truncate text-[14px] font-semibold leading-5 text-oa-fg">
            {fact.caption}
            {bars?.rest ? <span className="font-normal text-oa-muted-fg"> {bars.rest}</span> : null}
          </span>
          <span className={`oa-mono ml-auto shrink-0 text-[16px] font-semibold leading-6 tabular-nums ${FACT_TONE[fact.tone]}`}>{fact.figure}</span>
        </span>
        {bars ? (
          // Theirs against the S&P 500 (owner rule 4, VISUALS CHECK: a comparison of numbers gets a bar).
          <span className="mt-1.5 grid gap-1">
            <ShareBar label="You" value={bars.yours} strong />
            <ShareBar label="S&P 500" value={bars.market} strong={false} />
          </span>
        ) : (
          <span className="mt-0.5 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{fact.label}</span>
        )}
      </Link>
    </div>
  );
}

/**
 * "Added 2.1 points to your week's return", "Took 1.5 points off your week's return": the holding's share of the
 * portfolio's week, in percentage points, said plainly on every card (council, Nov 12: not "2.1%", which reads as
 * the stock's own move, and not a bare "pts"). What "points" means is said once, in the memo's heading.
 */
function shareWords(points: number): string {
  const size = Math.abs(points).toFixed(1);
  return points >= 0 ? `Added ${size} points to your week's return` : `Took ${size} points off your week's return`;
}

/** Said once over the movers: what their points are. */
/**
 * The memo's week in words (owner rule: day words, not dates): "This week, so far", "Last week", else "Week of Nov 2".
 * `monday` and `today` are New York calendar days, YYYY-MM-DD.
 */
export function weekWords(monday: string, today: string, complete: boolean): string {
  const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
  const days = Math.round((at(today) - at(monday)) / 86_400_000);
  if (Number.isFinite(days) && days >= 0 && days < 7) return complete ? "This week" : "This week, so far";
  if (Number.isFinite(days) && days >= 7 && days < 14) return "Last week";
  return `Week of ${fmtPlanDay(monday)}${complete ? "" : ", so far"}`;
}

const POINTS_MEANING = "Points: each stock's share of your week's return";

/**
 * One of the week's movers, laid out like the stock cards: logo, ticker and price; its own week and its day; then
 * what it did to the portfolio's week. Which week is said once, in the memo's heading (owner rule 1).
 */
function MoverCell({ move, className, label }: CellProps & { move: Mover }) {
  const own = Math.abs(move.pct) < 0.05 ? "Barely moved" : `${move.pct > 0 ? "Rose" : "Fell"} ${Math.abs(move.pct).toFixed(1)}%`;
  return (
    <div className={`${CARD} ${className}`}>
      <Link href={move.href} prefetch={false} data-track-links="insight_clicked" data-track-insight-kind="home-memo-mover" className={`flex h-full flex-col px-3.5 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}>
        {label}
        <span className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={move.ticker} size={22} atOnce />
          <span className="oa-mono text-[14.5px] font-semibold tabular-nums text-oa-fg">{move.ticker}</span>
          <span className="oa-mono ml-auto shrink-0 text-[16px] font-semibold leading-6 tabular-nums text-oa-fg">{move.price !== null ? sharePrice(move.price) : "–"}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3 text-[13px] leading-[18px]">
          <span className="min-w-0 truncate font-medium text-oa-fg">{own}</span>
          {move.dayPct !== null ? <span className={`oa-mono shrink-0 font-medium tabular-nums ${tone(move.dayPct)}`}>{signedPct(move.dayPct, 2)}</span> : null}
        </span>
        <span className={`mt-1.5 block truncate text-[13px] font-medium leading-[18px] tabular-nums ${move.points >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{shareWords(move.points)}</span>
      </Link>
    </div>
  );
}

/* ── the memo and agents, as cells ────────────────────────────────────── */

export async function WeekBand({ load }: { load: HomeLoad }) {
  const [holdings, memo, agents] = await Promise.all([loadHoldings(load), loadMemo(load), loadAgents(load)]);
  const counts = holdingsCounts(typeof holdings === "string" ? null : holdings);
  const order = typeof holdings === "string" ? [] : holdings.cards.map((card) => card.ticker);
  return <WeekCells memo={memo} agents={agents} today={newYorkToday()} holdings={{ ...counts, order }} />;
}

/**
 * The memo and agents as cells of the overview's grid, after `holdings` cards (at each width, folded and open): no
 * reads of its own, so any counts can be rendered.
 */
export function WeekCells({
  memo,
  agents,
  today,
  holdings,
}: {
  memo: MemoView | null;
  agents: AgentsView | null;
  today: string;
  /** Holding cards shown at each width, folded and open, and their tickers in card order. */
  holdings: { shown: number[]; open: number[]; order?: readonly string[] };
}) {
  const lines = agents?.lines ?? [];
  const memoCells = memo ? [...memo.facts.map((fact) => ({ fact })), ...memo.movers.map((move) => ({ move }))] : [];
  const factCount = memo?.facts.length ?? 0;
  // A mover whose holding card is on screen in a view (a width, folded or open) hides there, so one stock is never
  // drawn twice in the grid; each cell's place counts only the cells that can show in that view (Infinity: hidden).
  const order = holdings.order ?? [];
  const places = (count: number) => {
    const onGrid = new Set(order.slice(0, count));
    let rank = 0;
    return memoCells.map((cell) => ("move" in cell && onGrid.has(cell.move.ticker) ? Infinity : rank++));
  };
  const foldedPlace = holdings.shown.map(places);
  const openPlace = holdings.open.map(places);
  const memoCounts = (place: number[]) => {
    const can = place.filter((value) => value !== Infinity).length;
    return memo && can > 0 ? { facts: factCount, movers: can - factCount } : null;
  };
  const agentCounts = lines.length > 0 ? { lines: lines.length, quiet: agents!.quiet } : null;
  const folded = COLS.map((cols, at) => planFlow(holdings.shown[at]!, memoCounts(foldedPlace[at]!), agentCounts, cols));
  const opened = COLS.map((cols, at) => planFlow(holdings.open[at]!, memoCounts(openPlace[at]!), agentCounts, cols));
  // Shown or not at each width, folded and open; `display` as the cell needs it.
  const at = (pick: (plan: FlowPlan) => boolean, display: "block" | "flex" | "inline" = "block") => showAt(folded.map(pick), display, opened.map(pick));
  const note = agents?.note ?? null;
  const hasMemo = Boolean(memo && [...folded, ...opened].some((plan) => plan.memo));
  const hasAgents = Boolean(agents && folded[0]!.agents);
  if (!hasMemo && !hasAgents && !note) return null;

  const memoWhen = memo ? weekWords(memo.monday, today, memo.complete) : "";
  /** Whether a plan shows any mover, for the line that says what their points are. */
  const showsMover = (plan: FlowPlan) => (plan.memo?.cells ?? 0) > factCount;
  // The memo's name rides on its first card where it starts beside the holdings: the first cell folded, the first
  // that can show opened (a mover whose holding card is on screen hides there).
  const memoLabel = (index: number) =>
    [...foldedPlace, ...openPlace].some((place) => place[index] === 0) ? (
      <span
        className={`${INLINE_LABEL} ${showAt(
          folded.map((plan, at) => foldedPlace[at]![index] === 0 && Boolean(plan.memo?.inline)),
          "block",
          opened.map((plan, at) => openPlace[at]![index] === 0 && Boolean(plan.memo?.inline)),
        )}`}
      >
        Weekly memo · {memoWhen}
      </span>
    ) : null;
  const quietFrom = lines.length - (agents?.quiet ?? 0);
  // All quiet and in one card: the shared card is the first one, so it carries the name.
  const mergedFirst = (plan: FlowPlan) => Boolean(plan.agents?.merged) && quietFrom === 0;
  // The same words as the heading: "[Example] Agents" signed out, else "Your agents".
  const agentsName = agents?.example ? (
    <>
      {EXAMPLE_TAG}
      Agents
    </>
  ) : (
    "Your agents"
  );
  const agentLabel = (first: (plan: FlowPlan) => boolean) => <span className={`${INLINE_LABEL} ${at((plan) => Boolean(plan.agents?.inline) && first(plan))}`}>{agentsName}</span>;
  // The note line carries the agents' link where they start beside the memo and so have no heading.
  const linkHere = Boolean(agents && !agents.failed && hasAgents && [...folded, ...opened].some((plan) => plan.agents?.inline));

  return (
    <>
      {hasMemo && memo ? (
        <>
          <div className={`${HEAD_ROW} ${at((plan) => Boolean(plan.memo) && !plan.memo!.inline, "flex")}`}>
            <h2 id="memo-head" className={`${H2} min-w-0`}>
              <Link href="/portfolio/memo" prefetch={false} className={`rounded hover:underline ${FOCUS}`}>
                Weekly memo
              </Link>
              {memo.movers.length > 0 ? <span className={`font-normal text-oa-muted-fg ${at(showsMover, "inline")}`}> · {POINTS_MEANING}</span> : null}
            </h2>
            <span className="oa-mono shrink-0 text-[12px] tabular-nums text-oa-muted-fg">{memoWhen}</span>
          </div>
          {memoCells.map((cell, index) => {
            const className = showAt(
              folded.map((plan, at) => foldedPlace[at]![index]! < (plan.memo?.cells ?? 0)),
              "block",
              opened.map((plan, at) => openPlace[at]![index]! < (plan.memo?.cells ?? 0)),
            );
            const label = memoLabel(index);
            return "fact" in cell ? (
              <FactCell key={cell.fact.id} fact={cell.fact} className={className} label={label} />
            ) : (
              <MoverCell key={cell.move.ticker} move={cell.move} className={className} label={label} />
            );
          })}
        </>
      ) : null}
      {hasAgents && agents ? (
        <>
          <div className={`${HEAD_ROW} ${at((plan) => !plan.agents?.inline, "flex")}`}>
            <h2 id="agents-head" className={H2}>
              {/* The tag already says whose: "[Example] Agents", not "the example's agents". */}
              {agents.example ? EXAMPLE_TAG : null}
              {agents.example ? "Agents" : "Your agents"}
            </h2>
            {agents.failed ? null : (
              <Link href="/agents" prefetch={false} className={`shrink-0 text-[13px] ${WATCH_LINK}`}>
                {agents.example ? "Set one up" : "Manage"}
              </Link>
            )}
          </div>
          {lines.map((line, index) => (
            <AgentCell
              key={line.id}
              line={line}
              today={today}
              className={index >= quietFrom ? at((plan) => !plan.agents?.merged) : ""}
              label={index === 0 ? agentLabel((plan) => !mergedFirst(plan)) : null}
            />
          ))}
          {agents.quiet >= 2 && [...folded, ...opened].some((plan) => plan.agents?.merged) ? (
            <QuietCell lines={lines.slice(quietFrom)} today={today} className={at((plan) => Boolean(plan.agents?.merged))} label={agentLabel(mergedFirst)} />
          ) : null}
        </>
      ) : null}
      {hasMemo && memo && memo.movers.length > 0 && [...folded, ...opened].some((plan) => plan.memo?.inline && showsMover(plan)) ? (
        // What the movers' points are, where the memo starts beside the holdings and so has no heading to say it; a
        // full row at the end of the grid, so it never leaves a row short.
        <p className={`col-span-full px-1 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg ${at((plan) => Boolean(plan.memo?.inline) && showsMover(plan))}`}>{POINTS_MEANING}.</p>
      ) : null}
      {note || linkHere ? (
        <p className="col-span-full px-1 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
          {note}
          {/* The agents' one link, here only where they have no heading to carry it (they start beside the memo, or
              every agent is paused), and never after a failed read. */}
          {agents && !agents.failed ? (
            <span className={hasAgents ? at((plan) => Boolean(plan.agents?.inline), "inline") : ""}>
              {note ? " " : null}
              <Link href="/agents" prefetch={false} className={WATCH_LINK}>
                {agents.example ? "Set one up" : "Manage"}
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
