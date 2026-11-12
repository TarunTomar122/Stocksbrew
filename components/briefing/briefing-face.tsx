import Link from "next/link";
import * as React from "react";

import { ShowMoreGrid } from "@/components/oa/kit/show-more-grid";
import { StockLogo } from "@/components/stock-logo";
import type {
  CallWord,
  DoCard,
  DoToday,
  HeatCell,
  LevelRow,
  MovedCard,
  Since,
  SinceCard,
  Strip,
  Tone,
  WeekDay,
} from "@/lib/briefing-face";
import { gapWords } from "@/lib/briefing-face";
import { shortCompanyName } from "@/lib/plain-copy";

import { longDay, sharePrice, shortDay, signedPct } from "./format";

/**
 * The daily briefing, one column (owner, Nov 12): the strip (you against the S&P 500 and a few market figures), Do
 * today, the heat of your money, the names at their levels, why things moved, the week's reports and what changed
 * since the last visit. Each module is gone when it has nothing (no empty cards); each stock shows once. Cards are
 * a figure, a few-word label and at most one line; the card is its own link and nothing repeats on every card.
 * Server-rendered: the only client code is the logos and the "Show N more" toggles under the longer grids.
 */

export type BriefingFaceProps = {
  /** "personal" is a member's own briefing or the example's; "market" is the market's view (nothing tracked yet). */
  mode: "personal" | "market";
  viewer: "signed_out" | "empty" | "pending" | "member";
  pendingTracked?: number;
  date: string;
  /** The one clock: "Before the open", "Wed close", "As of 11:42 AM ET". */
  clock: string;
  days: Array<{ day: string }>;
  archived: boolean;
  degraded: boolean;
  example: boolean;
  strip: Strip;
  doToday: DoToday | null;
  heat: HeatCell[];
  levels: LevelRow[];
  moved: MovedCard[];
  week: WeekDay[];
  since: Since | null;
  /** Standing-job findings today, for one quiet link to /agent. */
  agentFindings: number;
  /** The Free "rest of your stocks moved too" card, rendered on the server. */
  locked?: React.ReactNode;
};

const CARD = "oa-surface border border-oa-border bg-oa-card";
const HOVER = "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
/**
 * Card grids fill their module's width in equal columns (owner rule 4): no fixed pixel widths that leave the right
 * side empty, and an odd last card keeps its one column. THREE is a module across the page, PAIR one beside another.
 */
const THREE = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
const PAIR = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const ONE = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1";
/** A module's share of the page's 12 columns from `lg`; below that every module takes the one column. */
const SPAN = { all: "lg:col-span-12", narrow: "lg:col-span-4", wide: "lg:col-span-8" } as const;

const toneText = (tone: Tone) => (tone === "up" ? "text-signal-bullish" : tone === "down" ? "text-signal-bearish" : "text-oa-fg");
const toneOf = (pct: number | null | undefined): Tone => (pct == null || Math.abs(pct) < 0.005 ? "flat" : pct > 0 ? "up" : "down");


/**
 * `fill`: the section stretches to its row's height on a wide screen and hands that height to its content, so two
 * sections side by side end level (owner, Nov 12: "height issue between left and right area").
 */
function Section({ id, title, count, span = SPAN.all, fill = false, children }: { id: string; title: string; count?: string | null; span?: string; fill?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={`min-w-0 ${span} ${fill ? "lg:flex lg:flex-col lg:self-stretch" : ""}`}>
      <h2 id={`${id}-title`} className="flex items-baseline gap-2 px-2 pb-2 text-[14px] font-semibold leading-6 text-oa-fg sm:px-0">
        {title}
        {count ? <span className="oa-mono text-[12px] font-normal text-oa-muted-fg">{count}</span> : null}
      </h2>
      {fill ? <div className="lg:flex lg:flex-1 lg:flex-col [&>*]:lg:flex-1">{children}</div> : children}
    </section>
  );
}

function CallChip({ call }: { call: CallWord | null }) {
  if (!call) return null;
  const tone =
    call === "Buy more"
      ? "text-signal-bullish border-[color-mix(in_srgb,var(--signal-bullish)_35%,transparent)]"
      : call === "Sell some"
        ? "text-signal-bearish border-[color-mix(in_srgb,var(--signal-bearish)_35%,transparent)]"
        : "text-oa-muted-fg border-oa-border";
  return <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11.5px] font-medium leading-none ${tone}`}>{call}</span>;
}

/** One stock card: logo, ticker and short name, price and the day's %, the call, and one line. The card is the link. */
function StockTile({ stock, line, source }: { stock: DoCard | MovedCard | SinceCard; line: string | null; source?: string | null }) {
  const short = shortCompanyName(stock.name);
  const named = short && short.toUpperCase() !== stock.ticker ? short : null;
  const tone = toneOf(stock.pct);
  return (
    <li className="min-w-0">
      <Link
        href={stock.href}
        prefetch={false}
        className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2 px-3.5 py-3 sm:min-h-[7.25rem]`}
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <StockLogo ticker={stock.ticker} size={28} eager />
            <span className="min-w-0 leading-5">
              <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{stock.ticker}</span>
              {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end leading-5">
            {stock.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(tone)}`}>{signedPct(stock.pct, 1)}</span> : null}
            {sharePrice(stock.price) ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{sharePrice(stock.price)}</span> : null}
          </span>
        </span>
        {/* The line sits right under the header on every card; the call keeps to the bottom corner. */}
        <span className="flex min-w-0 flex-1 justify-between gap-2">
          <span className="min-w-0 self-start">
            {line ? <span className="block text-pretty text-[13.5px] leading-5 text-oa-fg">{line}</span> : null}
            {source ? <span className="mt-0.5 block truncate text-[12px] leading-4 text-oa-muted-fg">{source}</span> : null}
          </span>
          <span className="shrink-0 self-end">
            <CallChip call={stock.call} />
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * A line two or more cards would say word for word ("Our call moved to Keep") is said once above them, with the
 * tickers, and those cards keep only what differs (owner rule 1).
 */
function sharedLines<T extends { ticker: string; line: string }>(cards: readonly T[]): { notes: string[]; cards: Array<T & { shownLine: string | null }> } {
  const counts = new Map<string, string[]>();
  for (const card of cards) counts.set(card.line, [...(counts.get(card.line) ?? []), card.ticker]);
  const shared = new Map([...counts].filter(([, tickers]) => tickers.length >= 2));
  const join = (tickers: string[]) => (tickers.length === 2 ? tickers.join(" and ") : `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`);
  return {
    notes: [...shared].map(([line, tickers]) => `${line} on ${join(tickers)}.`),
    cards: cards.map((card) => ({ ...card, shownLine: shared.has(card.line) ? null : card.line })),
  };
}

function SharedNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="px-2 pb-2 sm:px-0">
      {notes.map((note) => (
        <p key={note} className="text-pretty text-[13.5px] leading-5 text-oa-fg">
          {note}
        </p>
      ))}
    </div>
  );
}

function SharedCards({ cards, label, grid = THREE }: { cards: ReadonlyArray<DoCard | SinceCard>; label: string; grid?: string }) {
  const split = sharedLines(cards);
  return (
    <>
      <SharedNotes notes={split.notes} />
      <ShowMoreGrid count={split.cards.length} label={label} className={grid}>
        {split.cards.map((card) => (
          <StockTile key={card.ticker} stock={card} line={card.shownLine} />
        ))}
      </ShowMoreGrid>
    </>
  );
}

/** "Reuters, Nov 11": who said it and when, under the reason. Our own research is not named. */
function sourceWords(card: MovedCard): string | null {
  const name = card.source?.name?.trim();
  if (!name || /^stocksbrew/i.test(name)) return null;
  const day = card.source?.at && /^\d{4}-\d{2}-\d{2}/.test(card.source.at) ? shortDay(card.source.at.slice(0, 10)) : "";
  return day ? `${name}, ${day}` : name;
}

/* ── the strip ─────────────────────────────────────────────────────────── */

function StripCell({ label, figure, tone, wide = false }: { label: string; figure: string; tone: Tone; wide?: boolean }) {
  return (
    <li className={`flex shrink-0 flex-col justify-center gap-0.5 border-r border-oa-border px-3.5 py-2.5 last:border-r-0 ${wide ? "w-[9.5rem]" : "w-[7.5rem]"}`}>
      <span className={`oa-mono text-[19px] font-semibold leading-6 tabular-nums tracking-[-0.01em] ${toneText(tone)}`}>{figure}</span>
      <span className="truncate text-[12px] leading-4 text-oa-muted-fg">{label}</span>
    </li>
  );
}

function MarketStrip({ strip, clock }: { strip: Strip; clock: string }) {
  const cells: React.ReactNode[] = [];
  if (strip.you) cells.push(<StripCell key="you" label={strip.you.label} figure={signedPct(strip.you.pct, 1)} tone={toneOf(strip.you.pct)} />);
  if (strip.sp500) {
    const label = strip.sp500.source === "futures" ? "S&P 500 futures" : "S&P 500";
    cells.push(<StripCell key="sp" label={label} figure={signedPct(strip.sp500.pct, 1)} tone={toneOf(strip.sp500.pct)} />);
  }
  if (strip.gap) {
    const label = strip.gap.word === "Ahead" ? "Ahead of the S&P" : strip.gap.word === "Behind" ? "Behind the S&P" : "Even with the S&P";
    const figure = strip.gap.word === "Flat" ? gapWords(strip.gap) : `${strip.gap.pts.toFixed(1)} pts`;
    cells.push(<StripCell key="gap" wide label={label} figure={figure} tone={strip.gap.word === "Ahead" ? "up" : strip.gap.word === "Behind" ? "down" : "flat"} />);
  }
  for (const tile of strip.tiles) cells.push(<StripCell key={tile.key} label={tile.label} figure={tile.figure} tone={tile.good} />);
  if (cells.length === 0) return null;
  return (
    // One row of figures; a phone scrolls it sideways rather than wrapping a lone figure onto a second row.
    <div className={`${CARD} w-fit max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
      <ul aria-label={`Market, ${clock}`} className="flex w-max">
        {cells}
      </ul>
    </div>
  );
}

/* ── the heat ──────────────────────────────────────────────────────────── */

function heatBackground(cell: HeatCell): string {
  const size = Math.abs(cell.pct);
  const share = size < 0.25 ? 0 : size < 1 ? 10 : size < 2 ? 18 : size < 4 ? 28 : 40;
  if (share === 0 || cell.tone === "flat") return "var(--oa-card)";
  const color = cell.tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return `color-mix(in srgb, ${color} ${share}%, var(--oa-card))`;
}

function Heat({ cells }: { cells: HeatCell[] }) {
  return (
    // About three rows show; the rest open under one "Show N more" (no inner scroll: owner, Nov 12).
    // Rows that fill the whole box (owner, Nov 12: "all the cards together cover all that area, no empty space"): each
    // tile grows from a base width by its weight, so every row, the last one too, ends at the right edge. A big move
    // weighs twice as much, so it takes twice the room.
    <ShowMoreGrid count={cells.length} cut="tiles" label="Your holdings today" className="flex flex-wrap content-stretch gap-1.5">
      {cells.map((cell) => (
        <li key={cell.ticker} style={{ flex: `${cell.size === 2 ? 2 : 1} 1 ${cell.size === 2 ? 13.5 : 6.75}rem` }} className="min-w-0">
          <Link
            href={cell.href}
            prefetch={false}
            title={shortCompanyName(cell.name) || cell.ticker}
            style={{ background: heatBackground(cell) }}
            className={`${FOCUS} flex h-[4.75rem] flex-col justify-between rounded-md border border-oa-border px-2.5 py-2 transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <StockLogo ticker={cell.ticker} size={18} eager />
              <span className="oa-mono truncate text-[12.5px] font-semibold text-oa-fg">{cell.ticker}</span>
            </span>
            {/* The ticker, its price, then the day's move. */}
            <span className="flex min-w-0 flex-col">
              {sharePrice(cell.price) ? <span className="oa-mono truncate text-[11.5px] leading-4 tabular-nums text-oa-muted-fg">{sharePrice(cell.price)}</span> : null}
              <span className={`oa-mono text-[16px] font-semibold leading-5 tabular-nums ${toneText(cell.tone)}`}>{signedPct(cell.pct, 1)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ShowMoreGrid>
  );
}

/* ── levels ────────────────────────────────────────────────────────────── */

function Levels({ rows }: { rows: LevelRow[] }) {
  return (
    // Three rows of three show (four cards on a phone); the rest open under one "Show N more".
    // Only names at or through their own call's price, each with the call's reason (lib/briefing-face.ts atYourLevels).
    <ShowMoreGrid count={rows.length} label="At our price, and why" className={THREE}>
      {rows.map((row) => {
        const away = Math.abs(row.level.gapPct);
        const levelPrice = sharePrice(row.level.level);
        const where = away < 0.05 ? `At our ${levelPrice}` : `${away.toFixed(1)}% ${row.level.gapPct < 0 ? "under" : "over"} our ${levelPrice}`;
        return (
          <li key={row.ticker} className="min-w-0">
            <Link href={row.href} prefetch={false} className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2 px-3.5 py-3`}>
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <StockLogo ticker={row.ticker} size={24} eager />
                  <span className="oa-mono text-[14px] font-semibold text-oa-fg">{row.ticker}</span>
                  <CallChip call={row.level.call} />
                </span>
                <span className="flex shrink-0 flex-col items-end leading-5">
                  {sharePrice(row.price) ? <span className="oa-mono text-[15px] font-semibold tabular-nums text-oa-fg">{sharePrice(row.price)}</span> : null}
                  <span className="oa-mono text-[11.5px] tabular-nums text-oa-muted-fg">{where}</span>
                </span>
              </span>
              <span className="text-pretty text-[13px] leading-[19px] text-oa-fg">{row.reason}</span>
            </Link>
          </li>
        );
      })}
    </ShowMoreGrid>
  );
}

/* ── the week's reports ────────────────────────────────────────────────── */

function DayStocks({ day }: { day: WeekDay }) {
  return (
    <ul className="flex flex-col gap-1">
      {day.stocks.map((stock) => {
        const result = stock.result;
        return (
          <li key={stock.ticker}>
            <Link href={stock.href} prefetch={false} className={`${FOCUS} -mx-1.5 flex h-9 items-center justify-between gap-2 rounded px-1.5 transition-colors hover:bg-oa-accent`}>
              <span className="flex min-w-0 items-center gap-1.5">
                <StockLogo ticker={stock.ticker} size={20} eager />
                <span className={`oa-mono text-[13px] font-semibold ${stock.held ? "text-oa-fg" : "text-oa-muted-fg"}`}>{stock.ticker}</span>
              </span>
              {result ? (
                <span className="flex shrink-0 items-baseline gap-1.5 text-[12px]">
                  {result.verdict ? <span className={result.verdict === "Beat" ? "text-signal-bullish" : result.verdict === "Miss" ? "text-signal-bearish" : "text-oa-muted-fg"}>{result.verdict}</span> : null}
                  {result.pct != null ? <span className={`oa-mono tabular-nums ${toneText(toneOf(result.pct))}`}>{signedPct(result.pct, 1)}</span> : null}
                </span>
              ) : stock.when ? (
                <span className="shrink-0 text-[12px] text-oa-muted-fg">{stock.when === "before the open" ? "Before open" : "After close"}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The week's reports by day. Beside another module it is one card with the days down it; on its own it is a card per
 * day in equal columns, so it neither stretches one card over the page nor leaves the row half empty on a phone.
 */
function Week({ days, beside }: { days: WeekDay[]; beside: boolean }) {
  if (beside) {
    return (
      <ol aria-label="Reports by day" className={`${CARD} divide-y divide-oa-border`}>
        {days.map((day) => (
          <li key={day.day} className="px-3.5 py-2.5">
            <p className="pb-1 text-[12.5px] font-medium leading-5 text-oa-muted-fg">{day.label}</p>
            <DayStocks day={day} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol aria-label="Reports by day" className="grid grid-cols-1 items-start gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
      {days.map((day) => (
        <li key={day.day} className={`${CARD} min-w-0 px-3 py-2.5`}>
          <p className="pb-1.5 text-[12.5px] font-medium leading-5 text-oa-muted-fg">{day.label}</p>
          <DayStocks day={day} />
        </li>
      ))}
    </ol>
  );
}

/* ── the page ──────────────────────────────────────────────────────────── */

function DayTabs({ days, date }: { days: Array<{ day: string }>; date: string }) {
  if (days.length <= 1) return null;
  return (
    <nav aria-label="Earlier briefings" className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
      {days.map((entry, position) => {
        const active = entry.day === date;
        return (
          <Link
            prefetch={false}
            key={entry.day}
            href={position === 0 ? "/briefing" : `/briefing?day=${entry.day}`}
            aria-current={active ? "page" : undefined}
            className={`${FOCUS} inline-flex h-10 shrink-0 items-center rounded-md px-2.5 text-[12.5px] transition-colors sm:h-7 ${
              active ? "bg-oa-card font-medium text-oa-fg shadow-[inset_0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
            }`}
          >
            {position === 0 ? "Today" : shortDay(entry.day)}
          </Link>
        );
      })}
    </nav>
  );
}

const LINK = "text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg";

function MarketNote({ viewer, pendingTracked }: { viewer: BriefingFaceProps["viewer"]; pendingTracked: number }) {
  if (viewer === "pending") return <>Yours appears once your {pendingTracked === 1 ? "stock is" : `${pendingTracked} stocks are`} ready.</>;
  if (viewer === "signed_out")
    return (
      <Link prefetch={false} href="/" className={LINK}>
        Try it on your stocks
      </Link>
    );
  return (
    <Link prefetch={false} href="/portfolio?tab=holdings" className={LINK}>
      Add a stock you hold or watch
    </Link>
  );
}

export function BriefingFace(props: BriefingFaceProps) {
  const { mode, viewer, date, clock, days, archived, degraded, example, strip, doToday, heat, levels, moved, week, since, agentFindings, locked } = props;
  const personal = mode === "personal";
  const title = example ? "Example briefing for a made-up portfolio of real stocks" : personal ? "Your briefing" : "Market briefing";
  // Which modules have something, so a pair that lost one side gives the other the whole row.
  const showDo = personal && doToday !== null;
  const showHeat = personal && heat.length > 0;
  const showMoved = moved.length > 0;
  const showWeek = week.length > 0;
  const showSince = Boolean(since && since.cards.length > 0);
  // The week sits beside Why it moved. With nothing moved for a reason it goes under Do today, beside the money (which
  // then spans both rows), else beside Since you last opened; only on its own does it take the row.
  const weekUnderDo = showWeek && !showMoved && showDo && showHeat;
  const sinceBeside = showSince && showWeek && !showMoved && !weekUnderDo;
  const weekBeside = showWeek && (showMoved || sinceBeside || weekUnderDo);
  return (
    // Twelve columns from `lg` with related modules side by side (owner, Nov 12: no empty right side, and no card
    // stretched for no reason); one column below that, in reading order. The bottom padding clears a phone's tab bar.
    <div className={`grid grid-cols-1 items-start gap-6 pb-20 lg:grid-cols-12 lg:pb-4 ${weekUnderDo ? "lg:grid-flow-row-dense" : ""}`}>
      <header className={`flex min-w-0 flex-col gap-1 px-2 sm:px-0 ${SPAN.all}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] font-semibold leading-6 text-oa-fg">
            {title}
            <span className="text-[13px] font-normal text-oa-muted-fg">
              {longDay(date)} · {archived ? "as it read that day" : clock}
            </span>
          </h1>
          <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-auto sm:shrink-0 sm:justify-end">
            {agentFindings > 0 && !archived ? (
              <Link prefetch={false} href="/agent" className={`${FOCUS} -my-2 inline-flex h-10 shrink-0 items-center whitespace-nowrap text-[13px] ${LINK} sm:h-7`}>
                Agents flagged {agentFindings} →
              </Link>
            ) : null}
            <DayTabs days={days} date={date} />
          </div>
        </div>
        {!personal || degraded ? (
          <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg">
            {!personal ? (
              <>
                Market view. <MarketNote viewer={viewer} pendingTracked={props.pendingTracked ?? 0} />
                {degraded ? " " : null}
              </>
            ) : null}
            {degraded ? (
              <>
                Some updates couldn&apos;t load.{" "}
                <a href={archived ? `/briefing?day=${date}` : "/briefing"} className={LINK}>
                  Try again
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className={`min-w-0 ${SPAN.all}`}>
        <MarketStrip strip={strip} clock={clock} />
      </div>

      {showDo && doToday ? (
        <Section id="do-today" title={archived ? "Needed you that day" : "Do today"} span={showHeat ? SPAN.narrow : SPAN.all} fill={showHeat}>
          {doToday.kind === "cards" ? (
            <SharedCards cards={doToday.cards} label="Stocks that need a decision" grid={showHeat ? `${ONE} lg:h-full lg:auto-rows-fr` : THREE} />
          ) : (
            <p className="px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">
              {doToday.kind === "quiet" ? "Nothing needs you today." : "What needs you couldn't load just now."}
            </p>
          )}
        </Section>
      ) : null}

      {showHeat ? (
        <Section id="heat" title="Where your money moved" span={showDo ? `${SPAN.wide} ${weekUnderDo ? "lg:row-span-2" : ""}` : SPAN.all} fill={showDo}>
          <Heat cells={heat} />
        </Section>
      ) : null}

      {levels.length > 0 ? (
        <Section id="levels" title="At our price, and why">
          <Levels rows={levels} />
        </Section>
      ) : null}

      {showMoved ? (
        <Section id="moved" title="Why it moved" span={showWeek ? SPAN.wide : SPAN.all}>
          <ShowMoreGrid count={moved.length} cut={showWeek ? "pairs" : "cards"} label="Moves with a confirmed reason" className={showWeek ? PAIR : THREE}>
            {moved.map((card) => (
              <StockTile key={card.ticker} stock={card} line={card.line} source={sourceWords(card)} />
            ))}
          </ShowMoreGrid>
        </Section>
      ) : null}

      {personal && locked ? <div className={`min-w-0 ${SPAN.all}`}>{locked}</div> : null}

      {showWeek ? (
        <Section id="week" title="Reports this week" span={weekBeside ? `${SPAN.narrow} ${weekUnderDo ? "lg:col-start-1" : ""}` : SPAN.all}>
          <Week days={week} beside={weekBeside} />
        </Section>
      ) : null}

      {since && showSince ? (
        <Section id="since" title="Since you last opened" count={`${since.count} new`} span={sinceBeside ? SPAN.wide : SPAN.all}>
          <SharedCards cards={since.cards} label="New since your last visit" grid={sinceBeside ? PAIR : THREE} />
        </Section>
      ) : null}
    </div>
  );
}
