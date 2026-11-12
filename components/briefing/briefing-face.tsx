import Link from "next/link";
import * as React from "react";

import { Sparkline } from "@/components/markets/widgets";
import { PairBar, SignedBar } from "@/components/oa/kit/tone";
import { TileLabel, Treemap, tileClass, type TreemapLayout, type TreemapWords } from "@/components/oa/kit/treemap";
import { KindIcon } from "@/components/oa/nav-icon";
import { ShowMoreGrid } from "@/components/oa/kit/show-more-grid";
import { StockLogo } from "@/components/stock-logo";
import type {
  CallWord,
  DoCard,
  DoToday,
  HeatCell,
  LevelRow,
  MarketTile,
  MovedCard,
  PathPoint,
  Strip,
  Tone,
  WeekDay,
} from "@/lib/briefing-face";
import { dayLabel, gridColumns, levelsTitle, lineStatesCall, weekTitle, type LevelFact } from "@/lib/briefing-face";
import type { TopStory } from "@/lib/briefing-top-news";
import { capitalize, dayWords, etToday, onDayWords } from "@/lib/day-words";
import { caseWireHeadlines } from "@/lib/wire-casing";
import { shortCompanyName } from "@/lib/plain-copy";

import { longDay, sharePrice, shortDay, signedPct } from "./format";
import { FullRows } from "./full-rows";

/**
 * The daily briefing, one column (owner, Nov 12): the strip (you against the S&P 500 and a few market figures), Do
 * today, the heat of your money, the names at their levels, why things moved and the week's reports. What changed since
 * the last visit comes in as `top`, under the header. Each module is gone when it has nothing (no empty cards); each
 * stock shows once. Cards are a figure, a few-word label and at most one line; the card is its own link and nothing
 * repeats on every card.
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
  /** The market's top three stories today, or none (lib/briefing-top-news.ts). */
  topNews: TopStory[];
  doToday: DoToday | null;
  heat: HeatCell[];
  levels: LevelRow[];
  moved: MovedCard[];
  week: WeekDay[];
  /** Rendered under the header row, above the market band: "Since you looked yesterday" (components/briefing/since-visit.tsx). */
  top?: React.ReactNode;
  /** Standing-job findings today, for one quiet link to /agent. */
  agentFindings: number;
  /** Whether today's session has opened (9:30 ET), so a before-the-open report counts as out. True on a saved day. */
  sessionOpened: boolean;
  /** The Free "rest of your stocks moved too" card, rendered on the server. */
  locked?: React.ReactNode;
};

const CARD = "oa-surface border border-oa-border bg-oa-card";
const HOVER = "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
/**
 * Card grids fill their module's width in equal columns (owner rule 4): no fixed pixel widths that leave the right
 * side empty, and an odd last card keeps its one column. THREE is a module across the page, ONE the Do today column.
 */
const THREE = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
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

/**
 * One stock card: logo, ticker and short name, price and the day's %, the call, and one line. The card is the link;
 * where the line came from sits in its hover title, not under it (owner, Nov 12: "remove those sources").
 */
function StockTile({ stock, line, source, fit = false }: { stock: DoCard | MovedCard; line: string | null; source?: string | null; fit?: boolean }) {
  const short = shortCompanyName(stock.name);
  const named = short && short.toUpperCase() !== stock.ticker ? short : null;
  const tone = toneOf(stock.pct);
  // A card with no line of its own (said once above the cards) is one row: the call sits beside the move.
  const oneRow = fit && !line;
  return (
    <li className="min-w-0">
      <Link
        href={stock.href}
        prefetch={false}
        title={source ?? undefined}
        // `fit`: as tall as its content (Do today beside the map), never padded to a minimum around a short card.
        className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2 px-3.5 py-3 ${fit ? "" : "sm:min-h-[7.25rem]"}`}
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <StockLogo ticker={stock.ticker} size={28} eager />
            <span className="min-w-0 leading-5">
              <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{stock.ticker}</span>
              {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {oneRow ? <CallChip call={stock.call} /> : null}
            <span className="flex flex-col items-end leading-5">
              {stock.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(tone)}`}>{signedPct(stock.pct, 1)}</span> : null}
              {sharePrice(stock.price) ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{sharePrice(stock.price)}</span> : null}
            </span>
          </span>
        </span>
        {/* The line sits right under the header on every card; the call keeps to the bottom corner. */}
        {oneRow ? null : (
          <span className="flex min-w-0 flex-1 justify-between gap-2">
            <span className="min-w-0 self-start">
              {line ? <span className="block text-pretty text-[13.5px] leading-5 text-oa-fg">{line}</span> : null}
            </span>
            <span className="shrink-0 self-end">
              <CallChip call={stock.call} />
            </span>
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * A lone Do today card across the page, in one slim row (judges, Nov 12: never stretched to the treemap's height):
 * logo and name, the line, the call, then the move and price. On a phone it is the usual card.
 */
function SlimTile({ stock, title }: { stock: DoCard | MovedCard; title?: string | null }) {
  const short = shortCompanyName(stock.name);
  const named = short && short.toUpperCase() !== stock.ticker ? short : null;
  return (
    <Link href={stock.href} prefetch={false} title={title ?? undefined} className={`${CARD} ${HOVER} ${FOCUS} flex flex-wrap items-center gap-x-5 gap-y-2 px-3.5 py-3`}>
      <span className="flex min-w-0 items-center gap-2.5 sm:w-[13rem] sm:shrink-0">
        <StockLogo ticker={stock.ticker} size={28} eager />
        <span className="min-w-0 leading-5">
          <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{stock.ticker}</span>
          {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
        </span>
      </span>
      <span className="order-last min-w-0 basis-full text-pretty text-[13.5px] leading-5 text-oa-fg sm:order-none sm:flex-1 sm:basis-auto">{stock.line}</span>
      <span className="ml-auto flex shrink-0 items-center gap-4 sm:ml-0">
        <CallChip call={stock.call} />
        <span className="flex flex-col items-end leading-5">
          {stock.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(toneOf(stock.pct))}`}>{signedPct(stock.pct, 1)}</span> : null}
          {sharePrice(stock.price) ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{sharePrice(stock.price)}</span> : null}
        </span>
      </span>
    </Link>
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

function SharedCards({ cards, label, grid = THREE, fit = false }: { cards: ReadonlyArray<DoCard>; label: string; grid?: string; fit?: boolean }) {
  const split = sharedLines(cards);
  // A card drops its call badge only when the line shared above it states that call ("Our call moved to Keep on ASTS,
  // NVDA and SMR"), never under a line that names no call ("Reported results"): the call is said once, never hidden.
  const saidAbove = (card: (typeof split.cards)[number]) => card.shownLine === null && lineStatesCall(card.line, card.call);
  return (
    <>
      <SharedNotes notes={split.notes} />
      <ShowMoreGrid count={split.cards.length} label={label} className={grid}>
        {split.cards.map((card) => (
          <StockTile key={card.ticker} stock={saidAbove(card) ? { ...card, call: null } : card} line={card.shownLine} fit={fit} />
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

const LINE_YOU = "var(--oa-fg)";
const LINE_MARKET = "var(--oa-muted-fg)";

/** A path point's day under the chart: "Thu", and "Today" for the last. */
function pathDay(day: string, last: boolean): string {
  if (last) return "Today";
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday] ?? "";
}

/**
 * You and the S&P 500 over the last few sessions, two lines from the same close (owner, Nov 12: "make it visual").
 * The space between them is shaded green where you were ahead and red where you were behind, and the gap at the end
 * is marked and labelled in points. Each line is named at its end, so the chart reads without a legend.
 */
function PathChart({ points, you, live }: { points: PathPoint[]; you: string; live: boolean }) {
  const W = 300;
  const H = 84;
  const pad = { left: 4, right: 92, top: 10, bottom: 18 };
  const values = points.flatMap((point) => [point.you, point.market, 0]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 0.5);
  const x = (index: number) => pad.left + (index / (points.length - 1)) * (W - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - lo) / span) * (H - pad.top - pad.bottom);
  const line = (key: "you" | "market") => points.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  // The shaded gap, one piece per stretch where the same line leads (split where the lines cross).
  const pieces: Array<{ d: string; ahead: boolean }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const gapA = a.you - a.market;
    const gapB = b.you - b.market;
    const quad = (x1: number, y1a: number, y1b: number, x2: number, y2a: number, y2b: number) =>
      `M${x1.toFixed(1)},${y1a.toFixed(1)} L${x2.toFixed(1)},${y2a.toFixed(1)} L${x2.toFixed(1)},${y2b.toFixed(1)} L${x1.toFixed(1)},${y1b.toFixed(1)} Z`;
    if (gapA === 0 || gapB === 0 || Math.sign(gapA) === Math.sign(gapB)) {
      pieces.push({ d: quad(x(index), y(a.you), y(a.market), x(index + 1), y(b.you), y(b.market)), ahead: gapA + gapB >= 0 });
    } else {
      const t = gapA / (gapA - gapB);
      const cx = x(index) + t * (x(index + 1) - x(index));
      const cy = y(a.you + t * (b.you - a.you));
      pieces.push({ d: `M${x(index).toFixed(1)},${y(a.you).toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)} L${x(index).toFixed(1)},${y(a.market).toFixed(1)} Z`, ahead: gapA > 0 });
      pieces.push({ d: `M${cx.toFixed(1)},${cy.toFixed(1)} L${x(index + 1).toFixed(1)},${y(b.you).toFixed(1)} L${x(index + 1).toFixed(1)},${y(b.market).toFixed(1)} Z`, ahead: gapB > 0 });
    }
  }
  const last = points[points.length - 1]!;
  const end = x(points.length - 1);
  const gap = last.you - last.market;
  // Said over the chart's span, so it never reads as today's gap (that one is beside the figures).
  const sessions = points.length - 1;
  const gapLabel = Math.abs(gap) < 0.05 ? `Even over ${sessions} days` : `${Math.abs(gap).toFixed(1)} pts ${gap > 0 ? "ahead" : "behind"} over ${sessions} days`;
  // The two names at the line ends, kept apart when the lines end close together.
  let youY = y(last.you);
  let marketY = y(last.market);
  if (Math.abs(youY - marketY) < 12) {
    const mid = (youY + marketY) / 2;
    const up = last.you >= last.market;
    youY = mid + (up ? -6 : 6);
    marketY = mid + (up ? 6 : -6);
  }
  const tone = (ahead: boolean) => (ahead ? "var(--signal-bullish)" : "var(--signal-bearish)");
  const first = points[0]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[26rem]" role="img" aria-label={`Past ${points.length - 1} days: ${you} ${signedPct(last.you, 1)}, the S&P 500 ${signedPct(last.market, 1)}`}>
      {pieces.map((piece, index) => (
        <path key={index} d={piece.d} fill={tone(piece.ahead)} opacity={0.16} />
      ))}
      <polyline points={line("market")} fill="none" stroke={LINE_MARKET} strokeWidth={1.5} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={line("you")} fill="none" stroke={LINE_YOU} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* The gap today, marked between the two line ends. */}
      <line x1={end} x2={end} y1={y(last.you)} y2={y(last.market)} stroke={tone(gap >= 0)} strokeWidth={2} />
      <circle cx={end} cy={y(last.you)} r={2.5} fill={LINE_YOU} />
      <circle cx={end} cy={y(last.market)} r={2.5} fill={LINE_MARKET} />
      <text x={end + 6} y={youY + 3.5} fontSize={11} fontWeight={600} fill={LINE_YOU}>
        {you} {signedPct(last.you, 1)}
      </text>
      <text x={end + 6} y={marketY + 3.5} fontSize={11} fill={LINE_MARKET}>
        S&amp;P {signedPct(last.market, 1)}
      </text>
      <text x={pad.left} y={H - 4} fontSize={10.5} fill={LINE_MARKET}>
        {pathDay(first.day, false)}
      </text>
      <text x={end} y={H - 4} fontSize={10.5} fill={LINE_MARKET} textAnchor="end">
        {/* A saved earlier day, or a weekend's last session, ends on its own day, never "Today". */}
        {live ? "Today" : pathDay(last.day, false)}
      </text>
      <text x={(pad.left + end) / 2} y={H - 4} fontSize={10.5} fill={tone(gap >= 0)} textAnchor="middle" fontWeight={600}>
        {gapLabel}
      </text>
    </svg>
  );
}

/** You and the S&P 500 today, the gap, and the last few sessions as a chart beside them when the closes are there. */
function YouPanel({ strip, live, date }: { strip: Strip; live: boolean; date: string }) {
  // On a weekend, a holiday or overnight the figures are the last session's: said by its day, never as "today".
  const current = live && (!strip.day || strip.day === date);
  const when = !live ? "that day" : current || !strip.day ? "today" : onDayWords(strip.day, date) || "that day";
  const sp = strip.sp500;
  const gap = strip.gap;
  const gapTone: Tone = gap?.word === "Ahead" ? "up" : gap?.word === "Behind" ? "down" : "flat";
  const gapText = gap ? (gap.word === "Flat" ? "Even with the S&P 500" : `${gap.pts.toFixed(1)} pts ${gap.word === "Ahead" ? "ahead" : "behind"} ${when}`) : null;
  const chart = Boolean(strip.path && strip.you);
  return (
    // With its chart the panel takes the band's spare width; without one it keeps to its figures and the market tiles
    // take the rest, so the band never has a hole in the middle.
    <div className={`flex min-w-0 flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-5 ${chart ? "flex-1 lg:flex-[1_1_34rem]" : "lg:shrink-0"}`}>
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* Beside the chart, today's two moves are one bar pair (below) that prints both figures, so the big figures are
            not printed again (owner rule 1). */}
        <div className={`flex items-end gap-5 ${chart && strip.you && sp ? "hidden" : ""}`}>
          {strip.you ? (
            <span className="flex flex-col">
              <span className={`oa-mono text-[24px] font-semibold leading-7 tabular-nums tracking-[-0.02em] ${toneText(toneOf(strip.you.pct))}`}>{signedPct(strip.you.pct, 1)}</span>
              <span className="text-[12px] leading-4 text-oa-muted-fg">{strip.you.label}</span>
            </span>
          ) : null}
          {sp ? (
            <span className="flex flex-col">
              <span className={`oa-mono text-[24px] font-semibold leading-7 tabular-nums tracking-[-0.02em] ${toneText(toneOf(sp.pct))}`}>{signedPct(sp.pct, 1)}</span>
              <span className="text-[12px] leading-4 text-oa-muted-fg">{sp.source === "futures" ? "S&P 500 futures" : "S&P 500"}</span>
            </span>
          ) : null}
        </div>
        {/* Beside the five-day chart, today's two moves as a bar pair (judges, ship 85: the chart covers five days, so
            today's comparison needs its own picture), then the gap in points. */}
        {chart && strip.you && sp ? (
          <span className="block w-[13rem] max-w-full">
            <PairBar
              value={strip.you.pct}
              versus={sp.pct}
              labels={[strip.you.label, sp.source === "futures" ? "S&P futures" : "S&P 500"]}
              texts={[signedPct(strip.you.pct, 1), signedPct(sp.pct, 1)]}
              className="w-full"
            />
          </span>
        ) : null}
        {gapText ? (
          <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[12px] font-medium leading-4 ${toneText(gapTone)} bg-[color-mix(in_srgb,currentColor_10%,transparent)]`}>{gapText}</span>
        ) : null}
      </div>
      {chart && strip.path && strip.you ? (
        // Centred in the spare width, so a wide screen keeps the chart its size with even space either side.
        <div className="flex min-w-0 flex-1 justify-center">
          <PathChart points={strip.path} you={strip.you.label === "You" ? "You" : "Yours"} live={current} />
        </div>
      ) : strip.you && sp ? (
        // No line to draw (a saved day, or closes we don't have): the two returns as bars on one zero line, so the
        // comparison is still a picture, not just two figures (judges, Nov 12).
        <div className="w-full min-w-0 sm:w-[20rem]">
          <PairBar
            value={strip.you.pct}
            versus={sp.pct}
            labels={[strip.you.label, sp.source === "futures" ? "S&P 500 futures" : "S&P 500"]}
            texts={[signedPct(strip.you.pct, 1), signedPct(sp.pct, 1)]}
            className="w-full"
          />
        </div>
      ) : null}
    </div>
  );
}

/** A market figure with its last month as a line, coloured by what its move means for stocks (lib/market-verdict.ts). */
function MarketTileCell({ tile }: { tile: MarketTile }) {
  return (
    <li className="flex min-w-0 flex-col justify-center gap-1 px-3.5 py-3" title={tile.spark ? "The line is the past month." : undefined}>
      <span className="flex items-baseline justify-between gap-2">
        <span className={`oa-mono text-[19px] font-semibold leading-6 tabular-nums tracking-[-0.01em] ${toneText(tile.good)}`}>{tile.figure}</span>
      </span>
      <span className="truncate text-[12px] leading-4 text-oa-muted-fg">{tile.label}</span>
      {tile.spark ? <Sparkline values={tile.spark} tone={tile.good} width={132} height={26} className="mt-0.5 h-[26px] w-full max-w-[9rem]" /> : null}
    </li>
  );
}

/**
 * The top band (owner, Nov 12: "make it visual"): you against the S&P 500 with the last few sessions as a chart, then
 * the 10-year and the VIX with their month as a line. One row on a wide screen; on a phone the market figures take a
 * second row, in equal columns, so nothing scrolls sideways.
 */
function MarketBand({ strip, clock, live, date }: { strip: Strip; clock: string; live: boolean; date: string }) {
  const hasYou = Boolean(strip.you || strip.sp500);
  if (!hasYou && strip.tiles.length === 0) return null;
  const cols = strip.tiles.length >= 3 ? "grid-cols-3" : strip.tiles.length === 2 ? "grid-cols-2" : "grid-cols-1";
  const chart = Boolean(strip.path && strip.you);
  // Beside the chart the tiles share the spare width with it, so a wide screen has no hole in the middle; without it
  // (or without you) they take the rest of the row.
  const tileWidth = chart ? "lg:flex-[1_1_22rem] [&>li]:lg:flex-1" : "lg:flex-1 [&>li]:lg:flex-1";
  return (
    <section aria-label={`Market, ${clock}`} className={`${CARD} flex min-w-0 flex-col lg:flex-row ${!chart && strip.tiles.length === 0 ? "w-fit max-w-full" : ""}`}>
      {hasYou ? <YouPanel strip={strip} live={live} date={date} /> : null}
      {strip.tiles.length > 0 ? (
        <ul className={`grid ${cols} min-w-0 divide-x divide-oa-border border-oa-border lg:flex lg:divide-x ${tileWidth} ${hasYou ? "border-t lg:border-l lg:border-t-0" : ""}`}>
          {strip.tiles.map((tile) => (
            <MarketTileCell key={tile.key} tile={tile} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ── top market news ───────────────────────────────────────────────────── */

/**
 * The market's three biggest stories today (lib/briefing-top-news.ts), side by side at equal height: the stock's logo
 * or the event's icon, the move it caused, and the headline as the card's one line (owner rule 8). The card opens the
 * story; its hover title says who ran it, when, and the measured line on why it matters.
 */
function TopNews({ stories }: { stories: TopStory[] }) {
  return (
    <ul aria-label="Top market news" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {stories.map((story) => {
        const tone = toneOf(story.reaction.pct);
        return (
          <li key={story.id} className="min-w-0">
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              // Who ran it, when, and why it matters sit behind the link, in its hover title (owner: "remove those sources").
              title={[[story.source, story.day ? capitalize(story.day) : ""].filter(Boolean).join(" · "), story.why].filter(Boolean).join(". ") || undefined}
              className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2 px-3.5 py-3`}
            >
              <span className="flex items-center justify-between gap-3">
                {story.ticker ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <StockLogo ticker={story.ticker} size={28} eager />
                    <span className="oa-mono text-[14px] font-semibold text-oa-fg">{story.ticker}</span>
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-oa-accent text-oa-fg">
                      <KindIcon name={story.icon ?? "globe"} className="size-4" />
                    </span>
                    <span className="text-[13px] font-medium text-oa-fg">{story.reaction.label}</span>
                  </span>
                )}
                <span className="flex shrink-0 items-baseline gap-1.5">
                  {story.reaction.price != null && sharePrice(story.reaction.price) ? (
                    <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{sharePrice(story.reaction.price)}</span>
                  ) : null}
                  <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(tone)}`}>{signedPct(story.reaction.pct, 1)}</span>
                </span>
              </span>
              <span className="text-pretty text-[15px] font-semibold leading-5 text-oa-fg">{story.headline}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/* ── the heat ──────────────────────────────────────────────────────────── */

/** The tile's tint: the up or down colour mixed into the card colour, stronger for a bigger move (4% or more is full). */
function heatTint(cell: HeatCell): string {
  if (cell.tone === "flat" || Math.abs(cell.pct) < 0.05) return "var(--oa-card)";
  const share = Math.round(10 + Math.min(Math.abs(cell.pct) / 4, 1) * 34);
  return `color-mix(in srgb, var(${cell.tone === "up" ? "--signal-bullish" : "--signal-bearish"}) ${share}%, var(--oa-card))`;
}

/** A holding's words on its tile: logo and ticker, its move, and its price where the tile has room. */
function heatWords(cell: HeatCell): TreemapWords {
  return { full: cell.ticker, short: cell.ticker, mono: true, move: signedPct(cell.pct, 1), price: sharePrice(cell.price) || undefined };
}

/**
 * About how tall the Do today column is beside the map, in pixels: its shared note, then each card at its own height
 * (a card with a line is taller than one without). The map is laid out at these proportions, then drawn at the
 * column's real height, so the two end level without either being padded.
 */
function doColumnHeight(cards: readonly DoCard[]): number {
  const split = sharedLines(cards);
  const notes = split.notes.length * 22 + (split.notes.length > 0 ? 8 : 0);
  const tiles = split.cards.reduce((sum, card) => sum + (card.shownLine ? 112 : 66), 0);
  return notes + tiles + 12 * Math.max(cards.length - 1, 0);
}

/**
 * The map across the page, laid out at the narrowest width each is drawn at: a 320 phone (less its 8px gutters), a tablet, the column beside
 * the sidebar on a 1024 screen, and on a 1280 one. Each map's height follows its tile count (lib/treemap.ts).
 */
/** Every holding is a tile with its price (owner, Nov 12): the map grows as tall as that takes rather than leave one off. */
const HEAT_LAYOUTS: TreemapLayout[] = [
  { width: 304, className: "sm:hidden", keepAll: true },
  { width: 592, className: "hidden sm:block lg:hidden", keepAll: true },
  { width: 736, className: "hidden lg:block xl:hidden", keepAll: true },
  { width: 992, className: "hidden xl:block", keepAll: true },
];
/** Beside Do today the map is laid out at eight of the twelve columns; past this many holdings it runs across instead. */
const HEAT_BESIDE_MAX = 14;

/**
 * Every holding's move as a true treemap (owner, Nov 12: "cards need to be the size depending on the percentage
 * change", then "why did u give so much height to some of these and why some are as chips below wtf"): every holding
 * is a tile, its area by the square root of its move, each with its logo, ticker, move and price, in a map whose
 * height follows how many tiles it holds (components/oa/kit/treemap.tsx). Beside Do today, from 1024px, it is at least
 * that column's height (`height`, the column's own estimate) at eight of the twelve columns' width, taller if its
 * holdings need it; with more than HEAT_BESIDE_MAX holdings it runs across the page instead.
 */
function Heat({ cells, beside, height }: { cells: HeatCell[]; beside: boolean; height: number }) {
  // At least the column's height, taller when the holdings need it (never one left off), and filling the row.
  const besideShape = { minHeight: Math.min(Math.max(height, 180), 560) };
  const layouts: TreemapLayout[] = beside
    ? [
        HEAT_LAYOUTS[0]!,
        HEAT_LAYOUTS[1]!,
        { width: 482, fill: true, keepAll: true, shape: besideShape, className: "hidden lg:block xl:hidden" },
        { width: 653, fill: true, keepAll: true, shape: besideShape, className: "hidden xl:block" },
      ]
    : HEAT_LAYOUTS;
  return (
    <div className="min-w-0 lg:h-full">
      <Treemap
        items={cells}
        keyOf={(cell) => cell.ticker}
        moveOf={(cell) => cell.pct}
        wordsOf={heatWords}
        layouts={layouts}
        gap={4}
        label="Your holdings today"
        renderTile={(cell) => {
          const words = heatWords(cell);
          return (
            <Link
              href={cell.href}
              prefetch={false}
              aria-label={`${cell.ticker}${words.price ? ` ${words.price}` : ""}, ${words.move} today`}
              title={shortCompanyName(cell.name) || cell.ticker}
              style={{ background: heatTint(cell) }}
              className={`${FOCUS} block h-full w-full rounded-md border border-oa-border transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110 ${tileClass(words)}`}
            >
              <TileLabel icon={<StockLogo ticker={cell.ticker} size={14} eager />} words={words} moveClassName={toneText(cell.tone)} />
            </Link>
          );
        }}
      />
    </div>
  );
}

/* ── levels ────────────────────────────────────────────────────────────── */

/** Equal columns by how many cards there are (lib/briefing-face.ts gridColumns), written out whole for Tailwind. */
const LG_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };
const XXL_COLS: Record<number, string> = { 3: "2xl:grid-cols-3", 4: "2xl:grid-cols-4", 5: "2xl:grid-cols-5" };
/** Two moves beside the week: a third of the row per card, the week the last third. */
const MOVED_SPAN = "lg:col-span-8";
const WEEK_SPAN = "lg:col-span-4";

/** A fact in a word or two, for the list beside the cards: "+49% sales", "$7.40 EPS", "22× P/E". */
function factWord(fact: LevelFact): string {
  if (fact.kind === "move") return fact.label === "past month" ? "in a month" : `in ${fact.label}`;
  return { sales: "sales", eps: "EPS", dividend: "yield", valuation: "P/E" }[fact.kind];
}

/** The level line on a card or a list row: "Level $309.92 · 0.4% under". */
function levelWords(row: LevelRow, mixed: boolean): string {
  const away = Math.abs(row.level.gapPct);
  const where = away < 0.05 ? "right at it" : `${away.toFixed(1)}% ${row.level.gapPct < 0 ? "under" : "over"}`;
  const name = mixed ? (row.level.call === "Sell some" ? "Sell level" : "Buy level") : "Level";
  return `${name} ${sharePrice(row.level.level)} · ${where}`;
}

/**
 * The level cards and the short list beside them. A stock whose facts would only repeat another card's is listed
 * (lib/briefing-face.ts pickLevelFacts). When the cards and the list would leave the last row of a three- or
 * four-column grid short, the cards furthest from their level join the list until the row is whole, so the grid
 * fills the width with no gap (judges, Nov 12), and nothing is dropped.
 */
function levelCells(rows: LevelRow[]): { cards: Array<LevelRow & { fact: LevelFact }>; listed: LevelRow[] } {
  const all = rows.filter((row): row is LevelRow & { fact: LevelFact } => row.fact !== null);
  const repeats = rows.filter((row) => row.fact === null);
  const whole = (cells: number) => cells <= 4 || cells % 3 === 0 || cells % 4 === 0;
  for (let keep = all.length; keep >= Math.min(all.length, 3); keep -= 1) {
    const listed = [...all.slice(keep), ...repeats];
    if (whole(keep + (listed.length > 0 ? 1 : 0))) return { cards: all.slice(0, keep), listed };
  }
  return { cards: all, listed: repeats };
}

function Levels({ rows }: { rows: LevelRow[] }) {
  const mixed = new Set(rows.map((row) => row.level.call)).size > 1;
  const { cards, listed } = levelCells(rows);
  // One scale for every card's price-to-level bar: the furthest card sets it, never under 1%.
  const gapSpan = Math.max(1, ...cards.map((row) => Math.abs(row.level.gapPct)));
  const cells = cards.length + (listed.length > 0 ? 1 : 0);
  // The cells were made to fill three or four columns (levelCells), at every wide size.
  const columns = { sm: 2, lg: gridColumns(cells, [3, 4]), xxl: gridColumns(cells, [3, 4]) };
  const grid = `grid grid-cols-1 gap-3 sm:grid-cols-2 ${LG_COLS[columns.lg]} ${XXL_COLS[columns.xxl]}`;
  return (
    // Only names at or through their own call's price (lib/briefing-face.ts atYourLevels). The call is said once, in
    // the section's title; a card names its own level only when buys and sells are mixed. No two cards say the same.
    <FullRows count={cells} columns={columns} label={levelsTitle(rows)} className={grid}>
      {cards.map((row) => {
        const fact = row.fact;
        return (
          <li key={row.ticker} className="min-w-0">
            <Link href={row.href} prefetch={false} className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2.5 px-3.5 py-3`}>
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <StockLogo ticker={row.ticker} size={24} eager />
                    <span className="oa-mono text-[14px] font-semibold text-oa-fg">{row.ticker}</span>
                  </span>
                  <span className="oa-mono whitespace-nowrap text-[12px] leading-4 tabular-nums text-oa-muted-fg">{levelWords(row, mixed)}</span>
                  {/* The price against its level as a bar from the level's line: under it runs left, over it right, all
                      cards on one scale (judges, ship 85: two prices compared get a picture). */}
                  <SignedBar value={row.level.gapPct} domain={[-gapSpan, gapSpan]} color="var(--oa-primary)" className="mt-1.5 !h-1.5 w-28" />
                </span>
                <span className="flex shrink-0 flex-col items-end leading-5">
                  {sharePrice(row.price) ? <span className="oa-mono text-[15px] font-semibold tabular-nums text-oa-fg">{sharePrice(row.price)}</span> : null}
                  {row.pct != null ? <span className={`oa-mono text-[12.5px] tabular-nums ${toneText(toneOf(row.pct))}`}>{signedPct(row.pct, 1)}</span> : null}
                </span>
              </span>
              {/* One measured fact: a big figure, what it is, and at most one line. */}
              <span className="flex min-w-0 flex-col gap-0.5 border-t border-oa-border pt-2.5">
                {/* A narrow card puts the label under the figure rather than cut either. */}
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className={`oa-mono whitespace-nowrap text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.02em] ${toneText(fact.tone)}`}>{fact.figure}</span>
                  <span className="text-[12.5px] leading-4 text-oa-muted-fg">{fact.label}</span>
                </span>
                {fact.line ? <span className="text-pretty text-[13px] leading-[18px] text-oa-fg">{fact.line}</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
      {listed.length > 0 ? (
        <li className="min-w-0">
          <ul aria-label="Also at their level" className={`${CARD} flex h-full flex-col justify-center divide-y divide-oa-border px-3.5 py-1.5`}>
            {listed.map((row) => (
              <li key={row.ticker}>
                <Link href={row.href} prefetch={false} className={`${FOCUS} -mx-1.5 flex items-center justify-between gap-2 rounded px-1.5 py-1.5 transition-colors hover:bg-oa-accent`}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <StockLogo ticker={row.ticker} size={20} eager />
                      <span className="oa-mono text-[13px] font-semibold text-oa-fg">{row.ticker}</span>
                      {/* Its strongest fact as a short figure, even when a card already has that kind. */}
                      <span className="oa-mono whitespace-nowrap text-[13px] tabular-nums">
                        <span className={`font-semibold ${toneText((row.fact ?? row.best).tone)}`}>{(row.fact ?? row.best).figure}</span>{" "}
                        <span className="text-oa-muted-fg">{factWord(row.fact ?? row.best)}</span>
                      </span>
                    </span>
                    <span className="oa-mono whitespace-nowrap text-[12px] leading-4 tabular-nums text-oa-muted-fg">{levelWords(row, mixed)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end leading-5">
                    {sharePrice(row.price) ? <span className="oa-mono text-[13px] font-semibold tabular-nums text-oa-fg">{sharePrice(row.price)}</span> : null}
                    {row.pct != null ? <span className={`oa-mono text-[12.5px] tabular-nums ${toneText(toneOf(row.pct))}`}>{signedPct(row.pct, 1)}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ) : null}
    </FullRows>
  );
}

/* ── the week's reports ────────────────────────────────────────────────── */

/** A lone day's stocks laid across its card: across the page, or in one column beside two moves (`narrow`). */
const ACROSS = {
  // Three to a row up to 2xl: four at 1280 left each row too narrow, and a move ran into "After close" (judges, ship 81).
  full: "grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  narrow: "grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-1",
} as const;

function DayStocks({ day, across = false, narrow = false }: { day: WeekDay; across?: boolean; narrow?: boolean }) {
  const grid = narrow ? ACROSS.narrow : ACROSS.full;
  return (
    <ul className={across ? grid : "flex flex-col gap-1"}>
      {day.stocks.map((stock) => {
        const result = stock.result;
        return (
          <li key={stock.ticker}>
            <Link href={stock.href} prefetch={false} className={`${FOCUS} -mx-1.5 flex h-9 items-center justify-between gap-2 rounded px-1.5 transition-colors hover:bg-oa-accent`}>
              <span className="flex min-w-0 items-center gap-1.5">
                <StockLogo ticker={stock.ticker} size={20} eager />
                <span className={`oa-mono text-[13px] font-semibold ${stock.held ? "text-oa-fg" : "text-oa-muted-fg"}`}>{stock.ticker}</span>
                {/* Its price and today's move, as every stock on the page shows them. */}
                {sharePrice(stock.price) ? <span className="oa-mono ml-1 text-[12.5px] tabular-nums text-oa-muted-fg">{sharePrice(stock.price)}</span> : null}
                {stock.pct != null ? <span className={`oa-mono text-[12.5px] font-medium tabular-nums ${toneText(toneOf(stock.pct))}`}>{signedPct(stock.pct, 1)}</span> : null}
              </span>
              {result ? (
                <span className="flex shrink-0 items-baseline gap-1.5 text-[12px]">
                  {result.verdict ? <span className={result.verdict === "Beat" ? "text-signal-bullish" : result.verdict === "Miss" ? "text-signal-bearish" : "text-oa-muted-fg"}>{result.verdict}</span> : null}
                  {/* The reaction only when the row has no move of its own beside the price: never two percents. */}
                  {result.pct != null && stock.pct == null ? <span className={`oa-mono tabular-nums ${toneText(toneOf(result.pct))}`}>{signedPct(result.pct, 1)}</span> : null}
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

/** Columns for the week's day cards, by how many days there are, written out whole for Tailwind. */
const WEEK_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * The week's reports by day: a card per day in equal columns that fill the row (as many columns as days, up to five),
 * each card as tall as the row's tallest day. A lone day lays its stocks across. Beside two moves (`narrow`, a third of
 * the row) the days stack in one column and keep their own height, top-aligned.
 */
function Week({ days, narrow = false }: { days: WeekDay[]; narrow?: boolean }) {
  const lone = days.length === 1;
  const cols = WEEK_COLS[narrow ? 1 : Math.min(days.length, 5)];
  return (
    <ol aria-label="Reports by day" className={`grid grid-cols-1 gap-3 ${lone ? "" : "min-[420px]:grid-cols-2"} ${cols}`}>
      {days.map((day) => (
        <li key={day.day} className={`${CARD} min-w-0 px-3.5 py-2.5`}>
          <p className="pb-1.5 text-[12.5px] font-medium leading-5 text-oa-muted-fg">{day.label}</p>
          <DayStocks day={day} across={lone} narrow={narrow} />
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
            {/* Day words, never a bare date for the last week: "Yesterday", "Tuesday" (owner rule 4). */}
            {position === 0 ? "Today" : dayLabel(entry.day, days[0]!.day)}
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
    <Link prefetch={false} href="/portfolio" className={LINK}>
      Add a stock you hold or watch
    </Link>
  );
}

/** The moved cards' lines in sentence case through the wire's shared casing (owner rule 8: no scraped Title Case). */
function casedMoved(cards: MovedCard[]): MovedCard[] {
  const names = Object.fromEntries(cards.map((card) => [card.ticker, card.name]));
  return caseWireHeadlines(
    cards.map((card) => ({ ...card, title: card.line, tickers: [card.ticker] })),
    names,
  ).map(({ title, tickers: _tickers, ...card }) => ({ ...card, line: title }));
}

/** The briefing's day in words (owner rule 4): "Today", "Yesterday", "Tuesday", a date only past a week. */
function headDay(date: string): string {
  return capitalize(dayWords(date, etToday())) || longDay(date);
}

/** "Thu close" beside "Today" on a Thursday says the day twice: it reads "At the close" instead. */
function headClock(date: string, clock: string): string {
  return date === etToday() && clock === `${longDay(date).slice(0, 3)} close` ? "At the close" : clock;
}

export function BriefingFace(props: BriefingFaceProps) {
  const { mode, viewer, date, clock, days, archived, degraded, example, strip, topNews, doToday, heat, levels, week, top, agentFindings, locked, sessionOpened } = props;
  const moved = casedMoved(props.moved);
  const personal = mode === "personal";
  const title = example ? "Example briefing for a made-up portfolio of real stocks" : personal ? "Your briefing" : "Market briefing";
  // Which modules have something, so a pair that lost one side gives the other the whole row.
  const showDo = personal && doToday !== null;
  const showHeat = personal && heat.length > 0;
  const doCards = doToday?.kind === "cards" ? doToday.cards : [];
  // Do today sits beside the money only with two or more cards to match its height, and a book small enough for the
  // narrower map; one card (or a quiet line) runs across the page above it, so nothing is stretched to fit (judges,
  // Nov 12), and a big book's map gets the page's width.
  const doBeside = showHeat && doCards.length >= 2 && heat.length <= HEAT_BESIDE_MAX;
  const showMoved = moved.length > 0;
  const showWeek = week.length > 0;
  // A lone move is one slim row across the page, like a lone Do today card (judges, ship 85: one card beside the
  // reports left a large empty area). Two sit beside the week's reports in two thirds of the row, each side as tall
  // as its own content, top-aligned (council, ship 81). Otherwise the cards keep their fixed width in the page's three
  // or four columns (owner rule 4: never one card stretched across the row).
  const movedSlim = moved.length === 1;
  const movedBeside = showWeek && moved.length === 2;
  const movedColumns = movedBeside
    ? { sm: 2, lg: 2, xxl: 2 }
    : { sm: 2, lg: gridColumns(moved.length, [3, 4]), xxl: gridColumns(moved.length, [4, 5]) };
  const movedGrid = movedBeside
    ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
    : `grid grid-cols-1 gap-3 sm:grid-cols-2 ${LG_COLS[movedColumns.lg]} ${XXL_COLS[movedColumns.xxl]}`;
  return (
    // Twelve columns from `lg`: your own stocks first (Do today and the money side by side), then the market's news, the
    // levels, why things moved and the week, each across the page so no side ends early (judges, Nov 12). One column
    // below `lg`, in reading order. The bottom padding clears a phone's tab bar.
    <div className="grid grid-cols-1 items-start gap-6 pb-24 lg:grid-cols-12 lg:pb-4">
      <header className={`flex min-w-0 flex-col gap-1 px-2 sm:px-0 ${SPAN.all}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px] font-semibold leading-6 text-oa-fg">
            {title}
            <span className="text-[13px] font-normal text-oa-muted-fg">
              {headDay(date)} · {archived ? "as it read that day" : headClock(date, clock)}
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

      {top ? <div className={`min-w-0 ${SPAN.all}`}>{top}</div> : null}

      <div className={`min-w-0 ${SPAN.all}`}>
        <MarketBand strip={strip} clock={clock} live={!archived} date={date} />
      </div>

      {/* Nothing to do is one quiet line, not a titled module around it (owner rule 4: no card without data). */}
      {showDo && doToday && doCards.length === 0 ? (
        <p className={`min-w-0 px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0 ${SPAN.all}`}>
          {doToday.kind === "quiet" ? (archived ? "Nothing needed you that day." : "Nothing needs you today.") : "What needs you couldn't load just now."}
        </p>
      ) : null}

      {showDo && doToday && doCards.length > 0 ? (
        <Section id="do-today" title={archived ? "Needed you that day" : "Do today"} span={doBeside ? SPAN.narrow : SPAN.all}>
          {doBeside ? (
            // Each card as tall as its content; the map beside takes this column's height, not the other way round.
            <SharedCards cards={doCards} label="Stocks that need a decision" grid={ONE} fit />
          ) : doCards.length === 1 ? (
            <>
              <ul aria-label="Stocks that need a decision" className="sm:hidden">
                <StockTile stock={doCards[0]!} line={doCards[0]!.line} />
              </ul>
              <div className="hidden sm:block">
                <SlimTile stock={doCards[0]!} />
              </div>
            </>
          ) : (
            <SharedCards cards={doCards} label="Stocks that need a decision" grid={THREE} />
          )}
        </Section>
      ) : null}

      {showHeat ? (
        <Section id="heat" title="Where your money moved" span={doBeside ? SPAN.wide : SPAN.all} fill={doBeside}>
          <Heat cells={heat} beside={doBeside} height={doColumnHeight(doCards)} />
        </Section>
      ) : null}

      {topNews.length > 0 ? (
        <Section id="top-news" title="Top market news">
          <TopNews stories={topNews} />
        </Section>
      ) : null}

      {levels.length > 0 ? (
        <Section id="levels" title={levelsTitle(levels)}>
          <Levels rows={levels} />
        </Section>
      ) : null}

      {showMoved ? (
        <Section id="moved" title="Why it moved" span={movedBeside ? MOVED_SPAN : SPAN.all}>
          {movedSlim ? (
            <>
              <ul aria-label="Moves with a confirmed reason" className="sm:hidden">
                <StockTile stock={moved[0]!} line={moved[0]!.line} source={sourceWords(moved[0]!)} />
              </ul>
              <div className="hidden sm:block">
                <SlimTile stock={moved[0]!} title={sourceWords(moved[0]!)} />
              </div>
            </>
          ) : (
            // Whole rows only: a short last row folds behind "Show N more" rather than leave a gap.
            <FullRows count={moved.length} columns={movedColumns} label="Moves with a confirmed reason" className={movedGrid}>
              {moved.map((card) => (
                <StockTile key={card.ticker} stock={card} line={card.line} source={sourceWords(card)} />
              ))}
            </FullRows>
          )}
        </Section>
      ) : null}

      {personal && locked && !movedBeside ? <div className={`min-w-0 ${SPAN.all}`}>{locked}</div> : null}

      {showWeek ? (
        <Section id="week" title={weekTitle(week, date, sessionOpened)} span={movedBeside ? WEEK_SPAN : SPAN.all}>
          <Week days={week} narrow={movedBeside} />
        </Section>
      ) : null}

      {personal && locked && movedBeside ? <div className={`min-w-0 ${SPAN.all}`}>{locked}</div> : null}
    </div>
  );
}
