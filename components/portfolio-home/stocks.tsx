import Link from "next/link";

import { Bar } from "@/components/oa/kit/skeleton";
import { COLS, holdingsShown, showAt } from "@/components/portfolio-home/fit";
import { FoldButton } from "@/components/portfolio-home/fold-cards";
import { cardLine, sayOnce, type CardLine } from "@/components/portfolio-home/lines";
import { StockLogo } from "@/components/stock-logo";
import type { HomeLoad } from "@/lib/portfolio-home/server";
import { ATTENTION, extraFacts, signedPct, stockCards, type MonthMove, type StockCard } from "@/lib/portfolio-home/stocks";

/**
 * My stocks, about the person's stocks (owner, Nov 11): every holding as a small card (its price and day, our call with
 * its own level, and the one thing that matters for it now), the ones that need the person first and the quiet rest
 * behind one button (./fit.ts says how many show at each width). The cards are cells of the overview's one grid
 * (./fold-cards.tsx FoldScope), so the memo and agents start in whatever the holdings leave of their last row.
 * It waits only for its own sources (lib/portfolio-home/server.ts).
 */

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
export const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";

/** "$91.85", "$1,204": a share price, with cents under $1,000. */
export function sharePrice(value: number): string {
  const cents = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
}

export function tone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "text-oa-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
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

/** Whether a card's one thing asks for the person: these lead, and the quiet rest can fold away (./fold-cards.tsx). */
function needsLook(card: StockCard): boolean {
  return card.fact !== null && card.fact.priority >= ATTENTION;
}

/* ── the month bars ────────────────────────────────────────────────────── */

/** "−5.7%": a month move as a figure. */
const monthPct = (value: number) => signedPct(value, 1);

function MonthBar({ label, value, scale, strong }: { label: string; value: number; scale: number; strong: boolean }) {
  // From the middle: right for up, left for down, as far as the bigger of the two moves goes.
  const width = `${Math.min(50, (Math.abs(value) / scale) * 50)}%`;
  const fill = strong ? (value >= 0 ? "bg-signal-bullish" : "bg-signal-bearish") : "bg-oa-muted-fg/50";
  return (
    <span className="grid grid-cols-[3.75rem_minmax(0,1fr)_3rem] items-center gap-2 text-[11.5px] leading-4">
      <span className={`oa-mono truncate ${strong ? "text-oa-fg" : "text-oa-muted-fg"}`}>{label}</span>
      <span className="relative h-1.5 rounded-full bg-oa-muted">
        <span className="absolute inset-y-0 left-1/2 w-px bg-oa-border" />
        <span className={`absolute inset-y-0 rounded-full ${fill}`} style={value >= 0 ? { left: "50%", width } : { right: "50%", width }} />
      </span>
      <span className={`oa-mono text-right tabular-nums ${strong ? "text-oa-fg" : "text-oa-muted-fg"}`}>{monthPct(value)}</span>
    </span>
  );
}

/** The stock's past month against the S&P 500 over the same days, as two bars from a middle line. */
export function MonthBars({ ticker, move }: { ticker: string; move: MonthMove }) {
  const scale = Math.max(1, Math.abs(move.pct), Math.abs(move.marketPct ?? 0));
  return (
    <span className="mt-1.5 grid gap-1" title={`${ticker} ${monthPct(move.pct)} over the past month${move.marketPct !== null ? `, the S&P 500 ${monthPct(move.marketPct)}` : ""}`}>
      <MonthBar label="Month" value={move.pct} scale={scale} strong />
      {move.marketPct !== null ? <MonthBar label="S&P 500" value={move.marketPct} scale={scale} strong={false} /> : null}
    </span>
  );
}

function StockCardView({ card, line, className, textClass }: { card: StockCard; line: CardLine; className: string; textClass: string }) {
  const attention = needsLook(card);
  return (
    <div className={`min-w-0 ${className}`}>
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
            {/* atOnce, not eager: eager adds a `fetchpriority` attribute React 18 warns about in development. */}
            <StockLogo ticker={card.ticker} size={22} atOnce />
            <span className="oa-mono text-[14.5px] font-semibold tabular-nums text-oa-fg">{card.ticker}</span>
            {/* The stock's own price, and its day under it; not the holding's dollars (owner, Nov 12: "4 numbers are super confusing"). */}
            <span className="oa-mono ml-auto shrink-0 text-[16px] font-semibold leading-6 tabular-nums text-oa-fg">{card.price !== null ? sharePrice(card.price) : "–"}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3 text-[13px] leading-[18px]">
            <CallLine card={card} />
            {card.dayPct !== null ? <span className={`oa-mono shrink-0 text-[13px] font-medium tabular-nums ${tone(card.dayPct)}`}>{signedPct(card.dayPct, 2)}</span> : null}
          </span>
        </span>
        {line.text ? (
          // Hidden where the same sentence is said once above the cards (./lines.ts sayOnce).
          <span className={`mt-1.5 block text-pretty text-[13px] leading-[18px] ${attention ? "font-medium text-oa-fg" : "text-oa-muted-fg"} ${textClass}`}>{line.text}</span>
        ) : null}
        {line.month ? <MonthBars ticker={card.ticker} move={line.month} /> : null}
      </Link>
    </div>
  );
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

/** The holdings as the overview needs them: the cards in order, how many need a look, and each one's month. */
export type Holdings = {
  cards: StockCard[];
  need: number;
  example: boolean;
  watching: number;
  month: Record<string, MonthMove> | null;
};

/**
 * The holdings, or why there are none to show ("empty": no book at all). StockList and the memo and agents after it
 * (./week.tsx, which needs how many holding cards come first) both read it; the reads are the page's shared promises.
 */
export async function loadHoldings(load: HomeLoad): Promise<Holdings | "empty" | "slow" | "failed"> {
  const [book, ideas, reasons] = await Promise.all([load.book, load.sources.ideas, load.sources.reasons]);
  if (book.state !== "ready") return book.state;
  const extra = extraFacts({
    ideas: ideas.state === "ready" ? ideas.value : null,
    reasons: reasons?.state === "ready" ? reasons.value.checks : null,
  });
  const cards = stockCards(book.value, extra);
  return { cards, need: cards.filter(needsLook).length, example: book.value.mode === "example", watching: book.value.portfolio.watching.length, month: book.value.month ?? null };
}

/** How many holding cards show at each width, folded and open. */
export function holdingsCounts(holdings: Holdings | null): { shown: number[]; open: number[] } {
  const total = holdings?.cards.length ?? 0;
  return { shown: COLS.map((cols) => holdingsShown(total, holdings?.need ?? 0, cols)), open: COLS.map(() => total) };
}

const HEAD_ROW = "col-span-full flex min-w-0 items-center justify-between gap-3 px-1";

export async function StockList({ load }: { load: HomeLoad }) {
  const holdings = await loadHoldings(load);
  if (holdings === "empty") return null;
  if (holdings === "slow" || holdings === "failed") {
    return (
      <p className={`${CARD} col-span-full px-4 py-3 text-pretty text-[14px] leading-5 text-oa-muted-fg`}>
        {holdings === "slow" ? "The stocks took too long to load just now. Reload in a minute." : "The stocks could not be loaded just now. Reload in a minute."}
      </p>
    );
  }
  return <StockCells holdings={holdings} />;
}

/** The holdings' heading and cards, as cells of the overview's grid: no reads of its own, so any counts can be rendered. */
export function StockCells({ holdings }: { holdings: Holdings }) {
  const { cards, need, example, watching, month } = holdings;
  if (cards.length === 0) return null;
  // The cards come sorted by urgency, then weight, so the ones that need a look lead and every one of them shows; the
  // quiet rest wait behind the one button (owner, Nov 12: "why show me all when only 6 needs a look???"). With none
  // that need a look, the count depends on the cards across (./fit.ts), so each card says at which widths it shows:
  // nothing is measured, and nothing moves after the first paint.
  const { shown } = holdingsCounts(holdings);
  const folded = shown.map((count) => cards.length - count);
  const funds = cards.some((card) => card.fund);
  // The same sentence on several cards on screen is said once, over them (owner rule 1): each width folded, then
  // each width open, as which cards show.
  const views = [...shown.map((count) => cards.map((_, index) => index < count)), ...COLS.map(() => cards.map(() => true))];
  const { lines, shared, saidAbove } = sayOnce(
    cards.map((card) => cardLine(card, month)),
    cards,
    month,
    views,
  );
  // Folded and open halves of a per-view list, as showAt takes them.
  const split = (perView: boolean[]) => [perView.slice(0, COLS.length), perView.slice(COLS.length)] as const;
  const shownAt = (perView: boolean[], display: "block" | "flex" | "inline-flex") => {
    const [closed, open] = split(perView);
    return showAt(closed, display, open);
  };
  return (
    <>
      <div className={`${HEAD_ROW} flex-wrap`}>
        <h2 id="stocks-head" className="min-w-0 text-[14.5px] font-semibold leading-5 text-oa-fg">
          {stocksHead(cards.length, need, example)}
          {/* Held and watched said apart, so the counts agree with the briefing's ("seven you hold and two you watch"). */}
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
        <FoldButton rest={folded} />
      </div>
      {shared.map((group) => (
        // Only where two or more of its cards are on screen, naming only those (never a folded card).
        <p key={group.text} className={`col-span-full -mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[13.5px] leading-5 text-oa-fg ${shownAt(group.shown, "flex")}`}>
          <span className="font-medium">{group.text.replace(/\.$/, "")}:</span>
          {group.members.map((index) => (
            <span key={cards[index]!.ticker} className={`inline-flex items-center gap-1 ${shownAt(views.map((view) => view[index]!), "inline-flex")}`}>
              <StockLogo ticker={cards[index]!.ticker} size={16} atOnce />
              <span className="oa-mono text-[13px] font-semibold">{cards[index]!.ticker}</span>
            </span>
          ))}
        </p>
      ))}
      {cards.map((card, index) => (
        <StockCardView
          key={card.ticker}
          card={card}
          line={lines[index]!}
          className={showAt(shown.map((count) => index < count), "block", COLS.map(() => true))}
          textClass={shownAt(saidAbove[index]!.map((above) => !above), "block")}
        />
      ))}
    </>
  );
}

export function StockListGhost() {
  return (
    <>
      <div aria-hidden="true" className={HEAD_ROW}>
        <Bar className="my-0.5 h-3.5 w-40" />
      </div>
      {/* About what the page shows at each width: the six that need a look, or two rows. */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
        <div key={card} aria-hidden="true" className={`${CARD} px-3.5 py-3 ${showAt(COLS.map((cols) => card < Math.max(4, Math.ceil(6 / cols) * cols)))}`}>
          <Bar className="h-4 w-24" />
          <Bar className="mt-2 h-3 w-40" />
          <Bar className="mt-2 h-3 w-full" />
        </div>
      ))}
    </>
  );
}
