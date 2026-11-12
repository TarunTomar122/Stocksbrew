/**
 * The briefing's face: what each module on /briefing shows, worked out from the briefing the builder already made
 * (lib/briefing.ts), the person's positions and a few cheap joins (premarket quotes, the market figures, results).
 * Pure: no React, no I/O, no clock, so every rule here is tested on its own (lib/briefing-face.test.ts).
 *
 * The page, top to bottom (owner, Nov 12: no read block, no rail, nothing repeated per card):
 *   the strip      you vs the S&P 500 (with the last few sessions as a line), then the 10-year and the VIX;
 *   Top news       the market's three biggest stories today (lib/briefing-top-news.ts);
 *   Do today       at most three stocks that need a decision;
 *   the heat       every holding's move as a treemap (components/oa/kit/treemap.tsx), sized by its move;
 *   Levels         names at their own call's price, each with one measured fact;
 *   Why it moved   moves with a confirmed reason only;
 *   Reports        the week's earnings, by day;
 *   Since you last opened  what changed since the last visit.
 * A stock shows once, in the first module that wants it.
 */

import {
  daysBetween,
  type Briefing,
  type BriefingCallChange,
  type BriefingIndex,
  type BriefingItem,
  type BriefingPosition,
} from "@/lib/briefing";
import { unTitle } from "@/components/briefing/card-words";
import { capitalize, dayWords } from "@/lib/day-words";
import { newsRank } from "@/lib/briefing-news";
import { isDecision, moveRowText, plainCallWord } from "@/lib/briefing-groups";
import { premarketMove } from "@/lib/memo/premarket-leg";
import { addDays, weekdayOf } from "@/lib/memo/week";
import { etWallTimeToUtcMs, isNyseHoliday, type MarketSessionKind } from "@/lib/market-session";
import { asSentence, firstFullSentence } from "@/lib/plain-copy";
import { vixDayVerdict, yieldDayVerdict, type VerdictLine } from "@/lib/market-verdict";
import type { ResultRead } from "@/lib/results/types";

export type Tone = "up" | "down" | "flat";
export type CallWord = "Buy more" | "Keep" | "Sell some";

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const upper = (ticker: string | null | undefined) => (ticker ?? "").trim().toUpperCase();
const toneOf = (pct: number | null | undefined): Tone => (!fin(pct) || Math.abs(pct) < 0.005 ? "flat" : pct > 0 ? "up" : "down");
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A card's one line is at most this many words (owner rule 8). */
export const LINE_WORDS = 15;
/** Gaps smaller than this, in points, read as "Flat" against the S&P 500. */
export const GAP_FLAT_PTS = 0.15;
/** Do today holds at most this many cards. */
export const DO_TODAY_MAX = 3;
/** Earnings this close on a holding are a decision. */
export const EARNINGS_DECISION_DAYS = 2;
/** A news story is a reason for a move only when the move is at least this big. */
const NEWS_REASON_MIN_PCT = 1.5;

/* ── the clock ──────────────────────────────────────────────────────────── */

/** Which prices the page shows: this morning's premarket quotes, the live session, or the last close. */
export type FaceMode = "premarket" | "session" | "close";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The page's one clock. Before the open with this morning's quotes it is "Before the open"; during the session the
 * quote time ("11:42 AM ET"); otherwise the close the prices are from ("Wed close").
 */
export function faceMode(session: MarketSessionKind, premarketLive: boolean): FaceMode {
  if (session === "premarket" && premarketLive) return "premarket";
  if (session === "open") return "session";
  return "close";
}

export function clockWords(mode: FaceMode, pricesDay: string | null, clock: string | null): string {
  if (mode === "premarket") return "Before the open";
  if (mode === "session") return clock ? `As of ${clock}` : "Market open";
  return pricesDay ? `${WEEKDAY_SHORT[weekdayOf(pricesDay)]} close` : "Last close";
}

/* ── the call and its own level ─────────────────────────────────────────── */

export function callWordOf(stance: string | null | undefined): CallWord | null {
  const word = plainCallWord(stance);
  return word === "Buy more" || word === "Keep" || word === "Sell some" ? word : null;
}

export type OwnLevel = {
  call: "Buy more" | "Sell some";
  /** "buy-more below", "buy-more above" (a breakout) or "sell-some above". */
  side: "buy_below" | "buy_above" | "sell_above";
  level: number;
  /** Signed percent from the level to the price: (price − level) / level. */
  gapPct: number;
  /** The price is on the call's side of its level. */
  crossed: boolean;
};

/**
 * The one level a call names (owner rule 8): Buy more → its buy-more price (below, or above for a breakout when it
 * has no buy-below price), Sell some → its sell-some price, and only for a stock you hold. Keep has none. Null
 * without a price or a level (a Free stock outside the covered picks has its levels cleared by the loader).
 */
export function ownLevel(position: Pick<BriefingPosition, "stance" | "price" | "add_below" | "breakout_above" | "trim_above" | "relation">): OwnLevel | null {
  const price = position.price;
  if (!fin(price) || price <= 0) return null;
  const call = callWordOf(position.stance);
  const make = (side: OwnLevel["side"], level: number | null | undefined): OwnLevel | null => {
    if (!fin(level) || level <= 0) return null;
    const gapPct = ((price - level) / level) * 100;
    const crossed = side === "buy_below" ? price <= level : price >= level;
    return { call: side === "sell_above" ? "Sell some" : "Buy more", side, level, gapPct, crossed };
  };
  if (call === "Buy more") return make("buy_below", position.add_below) ?? make("buy_above", position.breakout_above);
  // "Avoid" reads as Sell some but names no level of its own (lib/briefing.ts zoneHit says the same).
  if (call === "Sell some" && position.relation === "holding" && (position.stance ?? "").trim().toLowerCase() !== "avoid") return make("sell_above", position.trim_above);
  return null;
}

/**
 * One percent and no dollar figures (owner, Nov 12: never "At $128.43, under the buy-more price of $128.43"):
 * "2.1% under the buy-more price", "3.0% below the sell-some price", "At the buy-more price".
 */
export function levelLine(level: OwnLevel): string {
  const away = Math.abs(level.gapPct);
  const name = level.call === "Buy more" ? "buy-more" : "sell-some";
  if (away < 0.05) return `At the ${name} price`;
  const side = level.gapPct < 0 ? "under" : "over";
  return `${away.toFixed(1)}% ${side} the ${name} price`;
}

/* ── the strip: you vs the S&P 500 ─────────────────────────────────────── */

export type Gap = { word: "Ahead" | "Behind" | "Flat"; pts: number };

/**
 * "Ahead 4.0 pts", "Behind 1.2 pts" or "Flat" (under GAP_FLAT_PTS), from the two moves as the strip shows them (one
 * decimal), so the gap always agrees with the two figures beside it.
 */
export function gapOf(you: number | null | undefined, market: number | null | undefined): Gap | null {
  if (!fin(you) || !fin(market)) return null;
  const pts = Number((Number(you.toFixed(1)) - Number(market.toFixed(1))).toFixed(1));
  if (Math.abs(pts) < GAP_FLAT_PTS) return { word: "Flat", pts: 0 };
  return { word: pts > 0 ? "Ahead" : "Behind", pts: Math.abs(pts) };
}

export function gapWords(gap: Gap): string {
  return gap.word === "Flat" ? "Flat" : `${gap.word} ${gap.pts.toFixed(1)} pts`;
}

/** What a holding is worth: shares times the price, else the stored value. */
export function holdingValue(position: Pick<BriefingPosition, "quantity" | "price" | "market_value">): number | null {
  if (fin(position.quantity) && position.quantity > 0 && fin(position.price) && position.price > 0) return position.quantity * position.price;
  return fin(position.market_value) && position.market_value > 0 ? position.market_value : null;
}

export type YouFigure = { pct: number; label: "You" | "Your stocks" };

/**
 * How the person's holdings did: weighted by money when every priced holding has a value (the briefing's own
 * portfolio figure in a session; the premarket quotes reweighted over the quoted holdings before the open), else
 * the plain average of the holdings' moves, labelled "Your stocks" so it never passes for a money figure.
 */
export function youFigure(
  holdings: readonly BriefingPosition[],
  mode: FaceMode,
  portfolio: Briefing["portfolio"],
  premarket: Readonly<Record<string, number>> | null,
): YouFigure | null {
  const priced = holdings.filter((position) => position.relation === "holding");
  if (priced.length === 0) return null;
  const valued = priced.every((position) => holdingValue(position) != null);
  if (mode === "premarket" && premarket) {
    const weights = priced.map((position) => ({ ticker: upper(position.ticker), weight: valued ? (holdingValue(position) as number) : 1 }));
    const move = premarketMove(weights, premarket);
    return move ? { pct: move.pct, label: valued ? "You" : "Your stocks" } : null;
  }
  if (valued && portfolio && portfolio.counted > 0 && fin(portfolio.day_change_pct)) return { pct: portfolio.day_change_pct, label: "You" };
  const moves = priced.map((position) => position.day_change_pct).filter(fin);
  if (moves.length === 0) return null;
  return { pct: moves.reduce((sum, value) => sum + value, 0) / moves.length, label: "Your stocks" };
}

/**
 * One figure in the strip: the day's change and what it is a change of, coloured by what it means for stocks
 * (lib/market-verdict.ts): the indexes by their direction, the 10-year yield and the VIX by what their day's move means
 * (a rise in either is bad for stocks). Never by the sign alone; with no verdict the figure is plain.
 */
export type MarketTile = {
  key: string;
  label: string;
  figure: string;
  pct: number | null;
  good: Tone;
  /** The last month or so of daily levels, oldest first, for the tile's line; null when there is no stored series. */
  spark: number[] | null;
};

export type MarketExtra = {
  id: "vix" | "us10y";
  price: number;
  change: number | null;
  changeMode: "pct" | "bps" | "abs";
  /** Daily levels, oldest first, ending today (lib/markets getMarketSeries); absent when the series is missing. */
  spark?: number[] | null;
};

/** A tile's line needs at least this many daily levels. */
const SPARK_MIN = 5;
const sparkOf = (extra: MarketExtra | undefined): number[] | null => {
  const values = (extra?.spark ?? []).filter(fin);
  return values.length >= SPARK_MIN ? values : null;
};

/** A good/bad-for-stocks verdict as the strip's colour: good is green, bad is red, neutral or unknown is plain. */
const verdictTone = (line: VerdictLine | null): Tone => (line?.verdict === "good" ? "up" : line?.verdict === "bad" ? "down" : "flat");

function signed(value: number, digits = 1): string {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${value > 0 ? "+" : "−"}${fixed}%`;
}

/**
 * The market figures after the S&P 500: the Nasdaq 100's day, the 10-year yield's day in basis points and the VIX's
 * day in percent, each with its level in the label ("10-yr 5.0%", "VIX 18.2"). One decimal throughout. A figure with
 * no change for the day is left out rather than shown as a bare level. The colour is the day's verdict for stocks
 * (lib/market-verdict.ts): yields or the VIX rising read as bad, falling as good, a small move as plain.
 */
export function marketTiles(indices: readonly BriefingIndex[], extras: readonly MarketExtra[]): MarketTile[] {
  const out: MarketTile[] = [];
  const nasdaq = indices.find((index) => index.name === "Nasdaq 100");
  if (nasdaq && fin(nasdaq.change_pct)) out.push({ key: "ndx", label: "Nasdaq 100", figure: signed(nasdaq.change_pct), pct: nasdaq.change_pct, good: toneOf(nasdaq.change_pct), spark: null });
  const ten = extras.find((extra) => extra.id === "us10y");
  const bps = ten && fin(ten.change) ? (ten.changeMode === "bps" ? ten.change : ten.changeMode === "abs" ? ten.change * 100 : null) : null;
  if (ten && fin(ten.price) && bps != null) {
    const shown = Math.round(bps * 10) / 10;
    const figure = Math.abs(shown) < 0.05 ? "0.0 bps" : `${shown > 0 ? "+" : "−"}${Math.abs(shown).toFixed(1)} bps`;
    // Coloured by the figure it sits beside, the day's move: "+10 bps" is bad for stocks even when the month fell.
    out.push({ key: "us10y", label: `10-yr ${ten.price.toFixed(1)}%`, figure, pct: null, good: verdictTone(yieldDayVerdict(bps / 100)), spark: sparkOf(ten) });
  }
  const vix = extras.find((extra) => extra.id === "vix");
  if (vix && fin(vix.price) && vix.changeMode === "pct" && fin(vix.change)) {
    out.push({ key: "vix", label: `VIX ${vix.price.toFixed(1)}`, figure: signed(vix.change), pct: vix.change, good: verdictTone(vixDayVerdict(vix.change)), spark: sparkOf(vix) });
  }
  return out;
}

/** One day on the you-against-the-S&P line: percent from the close the line starts at. */
export type PathPoint = { day: string; you: number; market: number };

/** Sessions on the line: the close it starts from, then the days to today. */
export const PATH_SESSIONS = 5;
/**
 * Holdings with fresh stored closes must carry at least this share of the money (or of the names, unweighted); the
 * line is those holdings'. A new listing or a lagging series leaves a small holding out rather than the whole chart.
 */
const PATH_COVERAGE = 0.75;

/**
 * You against the S&P 500 over the last few sessions, as two lines from the same close (owner, Nov 12: "make it
 * visual"). There is no intraday series on file, so the line is daily: the stored closes (lib/screener-series.ts) for
 * the sessions before today, then today's move on top of the last close, so the line ends where the strip's figures
 * say. Your line holds today's shares through the days (money-weighted when every holding has a size, else each
 * name equally). Null, and no chart, when the closes are stale or missing for too much of the money: never a line
 * made up to fill the gap.
 */
export function youVsMarketPath(input: {
  holdings: readonly BriefingPosition[];
  series: Readonly<Record<string, ReadonlyArray<{ date: string; close: number }>>>;
  /** The New York day the strip's figures are for. */
  today: string;
  /** Today's move per holding, as the strip counts it (premarket before the open). */
  todayPct: (position: BriefingPosition) => number | null;
  marketToday: number | null;
}): PathPoint[] | null {
  const { holdings, series, today, todayPct, marketToday } = input;
  if (!fin(marketToday) || holdings.length === 0) return null;
  const spy = (series.SPY ?? []).filter((point) => point.date < today && fin(point.close) && point.close > 0);
  const days = spy.slice(-PATH_SESSIONS).map((point) => point.date);
  if (days.length < PATH_SESSIONS || days[days.length - 1] !== tradingDayBefore(today)) return null;
  const closesOn = (points: ReadonlyArray<{ date: string; close: number }> | undefined) => {
    const byDay = new Map((points ?? []).map((point) => [point.date, point.close]));
    const closes = days.map((day) => byDay.get(day));
    return closes.every((close): close is number => fin(close) && close > 0) ? closes : null;
  };
  // Shares held: the quantity, or the holding's value over today's price when only the value is on file.
  const sharesOf = (position: BriefingPosition): number | null => {
    if (fin(position.quantity) && position.quantity > 0) return position.quantity;
    const worth = holdingValue(position);
    return worth != null && fin(position.price) && position.price > 0 ? worth / position.price : null;
  };
  const valued = holdings.every((position) => sharesOf(position) != null);
  const legs: Array<{ closes: number[]; weight: number; pct: number }> = [];
  let total = 0;
  let covered = 0;
  const seen = new Set<string>();
  for (const position of holdings) {
    const ticker = upper(position.ticker);
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    const share = valued ? (holdingValue(position) as number) : 1;
    total += share;
    const closes = closesOn(series[ticker]);
    const pct = todayPct(position);
    if (!closes || !fin(pct)) continue;
    covered += share;
    // Money-weighted: today's shares held through the days; else one unit of each name's own line.
    legs.push({ closes, weight: valued ? (sharesOf(position) as number) : 1 / closes[0]!, pct });
  }
  if (legs.length === 0 || covered < total * PATH_COVERAGE) return null;
  const value = (index: number) => legs.reduce((sum, leg) => sum + leg.weight * leg.closes[index]!, 0);
  const last = days.length - 1;
  const youValues = [...days.map((_, index) => value(index)), legs.reduce((sum, leg) => sum + leg.weight * leg.closes[last]! * (1 + leg.pct / 100), 0)];
  const spyCloses = closesOn(series.SPY)!;
  const marketValues = [...spyCloses, spyCloses[last]! * (1 + marketToday / 100)];
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...days, today].map((day, index) => ({
    day,
    you: round((youValues[index]! / youValues[0]! - 1) * 100),
    market: round((marketValues[index]! / marketValues[0]! - 1) * 100),
  }));
}

export type Strip = {
  you: YouFigure | null;
  /** The S&P 500's move: SPY's premarket (or futures) before the open, else the index. */
  sp500: { pct: number; source: "index" | "SPY" | "futures" } | null;
  gap: Gap | null;
  tiles: MarketTile[];
  /** You and the S&P 500 over the last few sessions, for the strip's chart; null when the closes are not there. */
  path: PathPoint[] | null;
  /** The New York day the figures are for (a weekend or overnight page shows the last session's); absent when unknown. */
  day?: string | null;
};

export function marketStrip(input: {
  briefing: Pick<Briefing, "market" | "portfolio">;
  positions: readonly BriefingPosition[];
  mode: FaceMode;
  premarket: { stocks: Readonly<Record<string, number>>; sp500: { pct: number; source: "SPY" | "futures" } | null } | null;
  extras: readonly MarketExtra[];
  /** Daily closes for the holdings and SPY (lib/screener-series.ts), for the chart; absent leaves the strip without one. */
  series?: Readonly<Record<string, ReadonlyArray<{ date: string; close: number }>>> | null;
  /** The New York day today's figures are for. */
  today?: string | null;
}): Strip {
  const { briefing, positions, mode, premarket, extras } = input;
  const holdings = positions.filter((position) => position.relation === "holding");
  const you = youFigure(holdings, mode, briefing.portfolio ?? null, mode === "premarket" ? premarket?.stocks ?? null : null);
  const index = briefing.market.indices.find((entry) => entry.name === "S&P 500");
  // Before the open, only this morning's SPY or futures: yesterday's index beside today's quotes would be a false gap.
  const sp500 =
    mode === "premarket"
      ? premarket?.sp500
        ? { pct: premarket.sp500.pct, source: premarket.sp500.source }
        : null
      : index && fin(index.change_pct)
        ? { pct: index.change_pct, source: "index" as const }
        : null;
  // Before the open the other figures are yesterday's: only the premarket pair is shown then.
  const tiles = mode === "premarket" ? [] : marketTiles(briefing.market.indices, extras);
  const premarketStocks = mode === "premarket" ? premarket?.stocks ?? null : null;
  const path =
    input.series && input.today && you
      ? youVsMarketPath({
          // The line follows the same figure as "You": money-weighted only when the strip's figure is.
          holdings: you.label === "You" ? holdings : holdings.map((position) => ({ ...position, quantity: null, market_value: null })),
          series: input.series,
          today: input.today,
          todayPct: (position) => shownPct(position, null, premarketStocks),
          marketToday: sp500?.pct ?? null,
        })
      : null;
  return { you, sp500, gap: gapOf(you?.pct, sp500?.pct), tiles, path, day: input.today ?? null };
}

/* ── Do today ───────────────────────────────────────────────────────────── */

export type FaceStock = {
  ticker: string;
  name: string;
  price: number | null;
  pct: number | null;
  call: CallWord | null;
  href: string;
};

export type DoReason = "call" | "level" | "alert" | "earnings";
export type DoCard = FaceStock & { reason: DoReason; line: string };

export type DoToday = { kind: "cards"; cards: DoCard[] } | { kind: "quiet" } | { kind: "unavailable" };

const DO_RANK: Record<DoReason, number> = { call: 0, level: 1, alert: 2, earnings: 3 };

/** The sources a "Nothing needs you today" depends on: without them, quiet could be a failed read. */
const DO_SOURCES = ["prices", "call changes", "alerts", "earnings dates"];

function earningsWhen(days: number, time: BriefingPosition["earnings_time"]): string {
  const day = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  if (time === "amc") return `Reports ${day} after the close`;
  if (time === "bmo") return `Reports ${day} before the open`;
  return `Reports ${day}`;
}

function stockOf(item: BriefingItem, position: BriefingPosition | undefined, pct: number | null, prices: Readonly<Record<string, number>> | null = null): FaceStock {
  const ticker = upper(item.ticker);
  return {
    ticker,
    name: position?.name || item.name || ticker,
    price: shownPrice(position, item.price ?? null, prices),
    pct,
    call: callWordOf(position?.stance ?? item.call ?? null),
    href: `/stock/${encodeURIComponent(ticker)}`,
  };
}

/**
 * The price a card shows: this morning's premarket price before the open (`prices` is given only then), else the
 * stock's last price. A stock with no premarket quote keeps its last price.
 */
export function shownPrice(position: Pick<BriefingPosition, "ticker" | "price"> | undefined, fallback: number | null, prices: Readonly<Record<string, number>> | null): number | null {
  const pre = position && prices ? prices[upper(position.ticker)] : undefined;
  if (fin(pre) && pre > 0) return pre;
  return position?.price ?? fallback;
}

/** The day's % a card shows: this morning's premarket move before the open, else the session's. */
/**
 * The day's % a card shows: before the open, this morning's premarket move only (a stock with no premarket quote
 * shows no figure rather than yesterday's, which would read as this morning's); otherwise the session's.
 */
export function shownPct(position: Pick<BriefingPosition, "ticker" | "day_change_pct"> | undefined, fallback: number | null, premarket: Readonly<Record<string, number>> | null): number | null {
  if (premarket) {
    const pre = position ? premarket[upper(position.ticker)] : undefined;
    return fin(pre) ? pre : null;
  }
  return position?.day_change_pct ?? fallback;
}

/**
 * At most three stocks that need a decision, strongest reason first: a call change on a holding, a holding that
 * just crossed its own call's level, the person's own alert, a holding that reports within two days. One card per
 * stock (its strongest reason). With nothing to show, "quiet" only when the sources loaded; otherwise "unavailable".
 */
export function doToday(input: {
  items: readonly BriefingItem[];
  positions: readonly BriefingPosition[];
  degraded: readonly string[];
  premarket?: Readonly<Record<string, number>> | null;
  premarketPrices?: Readonly<Record<string, number>> | null;
}): DoToday {
  const byTicker = new Map(input.positions.map((position) => [upper(position.ticker), position]));
  const best = new Map<string, DoCard>();
  for (const item of input.items) {
    const ticker = upper(item.ticker);
    if (!ticker || !isDecision(item)) continue;
    const position = byTicker.get(ticker);
    let reason: DoReason;
    let line: string | null = null;
    switch (item.kind) {
      case "call_changed": {
        reason = "call";
        const to = plainCallWord(item.metric);
        line = to ? `Our call moved to ${to}` : "Our call changed";
        break;
      }
      case "zone_entered": {
        reason = "level";
        const level = position ? ownLevel(position) : null;
        // A zone the stock's own call does not name is no decision (Keep has no level).
        if (!level || !level.crossed) continue;
        line = levelLine(level);
        break;
      }
      case "alert_triggered": {
        reason = "alert";
        const target = /triggered: (above|below) (\$[\d,.]+)/.exec(item.headline);
        line = target ? `Your alert fired: ${target[1]} ${target[2]}` : "Your alert fired";
        break;
      }
      case "earnings_upcoming": {
        reason = "earnings";
        if (item.deadline_days == null || item.deadline_days > EARNINGS_DECISION_DAYS) continue;
        line = earningsWhen(item.deadline_days, position?.earnings_time ?? null);
        break;
      }
      default:
        continue;
    }
    const card: DoCard = { ...stockOf(item, position, shownPct(position, item.day_change_pct, input.premarket ?? null), input.premarketPrices ?? null), reason, line };
    const held = best.get(ticker);
    if (!held || DO_RANK[reason] < DO_RANK[held.reason]) best.set(ticker, card);
  }
  const cards = [...best.values()]
    .sort((a, b) => DO_RANK[a.reason] - DO_RANK[b.reason] || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) || a.ticker.localeCompare(b.ticker))
    .slice(0, DO_TODAY_MAX);
  if (cards.length > 0) return { kind: "cards", cards };
  return input.degraded.some((label) => DO_SOURCES.includes(label)) ? { kind: "unavailable" } : { kind: "quiet" };
}

/* ── the heat ───────────────────────────────────────────────────────────── */

export type HeatCell = { ticker: string; name: string; price: number | null; pct: number; tone: Tone; size: 1 | 2; href: string };

/**
 * Every holding with a move, from the biggest gain to the biggest fall, sized by the size of its move. A holding with
 * no move is left out. Watched names stay out: this is where the money moved.
 */
export function heatCells(
  positions: readonly BriefingPosition[],
  premarket: Readonly<Record<string, number>> | null = null,
  premarketPrices: Readonly<Record<string, number>> | null = null,
): HeatCell[] {
  const holdings = positions.filter((position) => position.relation === "holding");
  const valued = holdings.length > 0 && holdings.every((position) => holdingValue(position) != null);
  const seen = new Set<string>();
  const shown = holdings
    .map((position) => ({ position, pct: shownPct(position, null, premarket), value: valued ? (holdingValue(position) as number) : 0 }))
    .filter((entry): entry is { position: BriefingPosition; pct: number; value: number } => fin(entry.pct) && Math.abs(entry.pct) <= 100)
    .filter((entry) => {
      const key = upper(entry.position.ticker);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Sized and ordered by the move, not by the money (owner, Nov 12: "shouldn't the sizes be decided by increase
  // decrease?"): the biggest gain first, down to the biggest fall, and a cell twice as wide when its move is at least
  // twice the typical move of the day and at least 1.5%.
  const moves = shown.map((entry) => Math.abs(entry.pct)).sort((a, b) => a - b);
  const mid = moves.length / 2;
  const median = moves.length === 0 ? 0 : moves.length % 2 ? moves[Math.floor(mid)]! : (moves[mid - 1]! + moves[mid]!) / 2;
  return shown
    .sort((a, b) => b.pct - a.pct || b.value - a.value || a.position.ticker.localeCompare(b.position.ticker))
    .map(({ position, pct }) => ({
      ticker: upper(position.ticker),
      name: position.name,
      price: shownPrice(position, null, premarketPrices),
      pct,
      tone: toneOf(pct),
      size: Math.abs(pct) >= 1.5 && Math.abs(pct) >= 2 * median ? 2 : 1,
      href: `/stock/${encodeURIComponent(upper(position.ticker))}`,
    }));
}

/* ── At your levels ─────────────────────────────────────────────────────── */

export type LevelFactKind = "sales" | "eps" | "dividend" | "valuation" | "move";

/**
 * One measured fact behind a call at its level, as a card shows it: a big figure ("+16%"), a few words saying what it
 * is ("sales growth"), and at most one line (≤15 words). `weight` is how strongly it backs the call, for picking.
 */
export type LevelFact = { kind: LevelFactKind; figure: string; label: string; line: string | null; tone: Tone; weight: number };

/**
 * `fact` is the card's fact, null for a stock whose facts all say what another card already says: it is listed, not
 * carded, with `best` (its strongest fact, which may repeat a card's kind) as a short figure.
 */
export type LevelRow = FaceStock & { level: OwnLevel; line: string; held: boolean; fact: LevelFact | null; best: LevelFact };

/** A card shows once the price is through its level, or this close to it (percent). */
export const AT_LEVEL_PCT = 0.5;
/** Before the open, reasons are read for names this much further out too: this morning's price can still cross. */
const PREMARKET_SLACK_PCT = 3;
/** At most this many reasons are read for one briefing. */
const MAX_LEVEL_READS = 16;

export type LevelCandidate = { ticker: string; instrumentId: string; call: OwnLevel["call"] };

/**
 * The US names whose reason is worth reading before the page knows which cards it shows: at or through their own
 * call's level on the last price, or (before the open, when this morning's price decides) within a few percent of it.
 * Closest first, capped, so a long watchlist never fans out into many reads.
 */
export function levelCandidates(positions: readonly BriefingPosition[], beforeOpen: boolean): LevelCandidate[] {
  const near = AT_LEVEL_PCT + (beforeOpen ? PREMARKET_SLACK_PCT : 0);
  const seen = new Set<string>();
  const out: Array<LevelCandidate & { gap: number }> = [];
  for (const position of positions) {
    const ticker = upper(position.ticker);
    if (!ticker || seen.has(ticker) || !position.instrument_id?.startsWith("US_")) continue;
    const level = ownLevel(position);
    if (!level || !(level.crossed || Math.abs(level.gapPct) < near)) continue;
    seen.add(ticker);
    out.push({ ticker, instrumentId: position.instrument_id, call: level.call, gap: level.crossed ? 0 : Math.abs(level.gapPct) });
  }
  return out
    .sort((a, b) => a.gap - b.gap || a.ticker.localeCompare(b.ticker))
    .slice(0, MAX_LEVEL_READS)
    .map(({ ticker, instrumentId, call }) => ({ ticker, instrumentId, call }));
}

const MONTH_INDEX: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "Nov 4" or "Dec 22, 2025" (lib/call-evidence.ts `day`) back to a day, said as the briefing says days: "On Monday". */
function reportDayWords(label: string, today: string): string | null {
  const match = /^([A-Z][a-z]{2})\s(\d{1,2})(?:,\s(\d{4}))?$/.exec(label.trim());
  const month = match ? MONTH_INDEX[match[1]!] : undefined;
  if (!match || !month) return null;
  const iso = `${match[3] ?? today.slice(0, 4)}-${String(month).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  const said = dayWords(iso, today);
  if (!said) return null;
  // "Nov 4" keeps its non-breaking space, so a date never splits across lines.
  return capitalize(said === "today" || said === "yesterday" ? said : `on ${said.replace(/ (\d)/, " $1")}`);
}

/** "On Nov 4" → "on Nov 4", "Today" → "today": the report's day inside a line. */
function reportOnDay(label: string, today: string): string | null {
  const said = reportDayWords(label, today);
  return said ? said.charAt(0).toLowerCase() + said.slice(1) : null;
}

const percentOf = (text: string) => Number(text.replace(/[%,]/g, ""));
const signedFigure = (text: string, up: boolean) => `${up ? "+" : "−"}${text.replace(/^[+−-]/, "")}`;

/**
 * A stock-page evidence line (lib/call-evidence.ts `buildCallEvidence`) as a card's fact: one figure, a few words and
 * at most one line, for the call it backs. Rising sales, a beat, a dividend raised for years or a cheaper P/E back a
 * Buy more; falling sales, a miss or a richer P/E back a Sell some; a move backs the call it goes with. A fall from the
 * year's high is context, not a reason (judges, Nov 12), so it never makes a card. Null for anything else, including
 * wording we do not recognise, so a card never shows half a thought or a reason for the other call.
 */
export function levelFact(line: { id: string; text: string }, call: OwnLevel["call"], today: string): LevelFact | null {
  const buy = call === "Buy more";
  const text = line.text.trim();
  const fits = (sentence: string | null) => (sentence && words(sentence) <= LINE_WORDS ? sentence : null);
  switch (line.id) {
    case "sales": {
      const m = /^\S+'s sales (rose|fell|were flat)(?: (\S+%))? over the last four quarters, to \S+?(?:, (.+))?\.$/.exec(text);
      if (!m || !m[2] || m[1] === "were flat" || (buy ? m[1] !== "rose" : m[1] !== "fell")) return null;
      const growth = percentOf(m[2]);
      const tail = m[3] ?? "";
      // Each shape of the year's comparison has its own label, so two sales cards rarely say the same words.
      let label = buy ? "sales growth" : "sales fell";
      let said: string | null = null;
      let faster = false;
      let t: RegExpExecArray | null;
      if ((t = /^faster than its (\S+) growth in fiscal (\d{4})$/.exec(tail))) {
        const before = percentOf(t[1]!);
        const delta = Math.round(growth - before);
        // Growth more than twice last year's reads as such; else the step up in points.
        label = before > 0 && growth >= 2 * before ? "growth more than doubled" : "growth sped up";
        said = `Up ${delta} pts from ${t[1]} in fiscal ${t[2]}.`;
        faster = true;
      } else if ((t = /^about the same as its (\S+) growth in fiscal (\d{4})$/.exec(tail))) {
        label = "steady sales growth";
        said = `About the same as its ${t[1]} in fiscal ${t[2]}.`;
      } else if ((t = /^after flat sales in fiscal (\d{4})$/.exec(tail))) {
        label = buy ? "sales back to growth" : "sales turned down";
        said = `${buy ? "Up" : "Down"} from flat sales in fiscal ${t[1]}.`;
      } else if ((t = /^after (falling|growing) (\S+) in fiscal (\d{4})$/.exec(tail))) {
        label = t[1] === "falling" ? (buy ? "sales back to growth" : "sales still falling") : "sales turned down";
        said = t[1] === "falling" ? `After a ${t[2]} fall in fiscal ${t[3]}.` : `Down from ${t[2]} growth in fiscal ${t[3]}.`;
      }
      // "Slower than" never sits under a Buy more; with no comparison the line says the period.
      return {
        kind: "sales",
        figure: signedFigure(m[2], buy),
        label,
        line: fits(said) ?? "Over the past four quarters.",
        tone: buy ? "up" : "down",
        weight: buy ? 1.5 + Math.min(growth, 60) / 40 + (faster ? 0.5 : 0) : 1.5 + Math.min(growth, 30) / 20,
      };
    }
    case "eps": {
      const won = /^In its (.+?) report, \S+'s earnings per share of (\S+) (beat|missed|matched) the (\S+) analysts expected\.$/.exec(text);
      const lost = won ? null : /^In its (.+?) report, \S+ (lost|earned) (\S+) a share, (better than|worse than|in line with) the (\S+) (loss|profit) analysts expected\.$/.exec(text);
      const good = won ? won[3] === "beat" : lost ? lost[4] === "better than" : null;
      const bad = won ? won[3] === "missed" : lost ? lost[4] === "worse than" : null;
      if (good === null || (buy ? !good : !bad)) return null;
      const label = (won ?? lost)![1]!;
      const when = reportOnDay(label, today);
      if (!when) return null;
      // Fresher reports and bigger surprises weigh more.
      const match = /^([A-Z][a-z]{2})\s(\d{1,2})(?:,\s(\d{4}))?$/.exec(label.trim());
      const iso = match ? `${match[3] ?? today.slice(0, 4)}-${String(MONTH_INDEX[match[1]!] ?? 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}` : today;
      const age = daysBetween(iso, today) ?? 90;
      const money = (value: string) => Number(value.replace(/[$,−-]/g, ""));
      const actual = won ? money(won[2]!) : money(lost![3]!);
      const forecast = won ? money(won[4]!) : money(lost![5]!);
      const surprise = forecast > 0 ? Math.min(Math.abs(actual - forecast) / forecast, 0.5) : 0.25;
      const weight = 2.5 + (age <= 30 ? 1 : age <= 60 ? 0.5 : 0) + surprise;
      // The label says how the report went; the line says against what, and when.
      if (won) {
        const beat = won[3] === "beat";
        return {
          kind: "eps",
          figure: won[2]!,
          label: beat ? "beat the forecast" : "missed the forecast",
          line: fits(`${won[4]} expected, reported ${when}.`),
          tone: buy ? "up" : "down",
          weight,
        };
      }
      const lossNow = lost![2] === "lost";
      const better = lost![4] === "better than";
      return {
        kind: "eps",
        figure: lossNow ? `−${lost![3]!.replace(/^[−-]/, "")}` : lost![3]!,
        label: lossNow ? (better ? "smaller loss than forecast" : "bigger loss than forecast") : better ? "better than forecast" : "worse than forecast",
        line: fits(`A ${lost![5]} ${lost![6]} expected, reported ${when}.`),
        tone: buy ? "up" : "down",
        weight,
      };
    }
    case "move": {
      const m = /^\S+ (rose|fell) (\S+) in the (\w+ trading days|month) to [^,]+, while (the S&P 500 (?:rose \S+|fell \S+|was flat))\.$/.exec(text);
      if (!m || (buy ? m[1] !== "rose" : m[1] !== "fell")) return null;
      return {
        kind: "move",
        figure: signedFigure(m[2]!, m[1] === "rose"),
        label: m[3] === "month" ? "past month" : m[3]!,
        line: fits(`${capitalize(m[4]!)} over the same ${m[3] === "month" ? "month" : "days"}.`),
        tone: m[1] === "rose" ? "up" : "down",
        weight: 0.8,
      };
    }
    case "dividend": {
      const m = /^\S+ pays \S+ a share a year, (\S+) of today's price, and has raised its dividend (\d+) years in a row\.$/.exec(text);
      if (!m || !buy) return null;
      const years = Number(m[2]);
      return { kind: "dividend", figure: m[1]!, label: "dividend yield", line: fits(`Raised ${years} years in a row.`), tone: "flat", weight: 1.6 + (years >= 10 ? 0.4 : 0) + Math.min(percentOf(m[1]!), 6) / 10 };
    }
    case "valuation": {
      const m = /^At (\S+) times its past year's earnings, \S+ is (cheaper|more expensive) than its median of (\S+) from (.+?) to .+\.$/.exec(text);
      if (!m || (buy ? m[2] !== "cheaper" : m[2] !== "more expensive")) return null;
      const off = Math.abs(Number(m[1]) / Number(m[3]) - 1);
      return {
        kind: "valuation",
        figure: `${m[1]}×`,
        label: buy ? "P/E under its usual" : "P/E over its usual",
        line: fits(`Its median P/E is ${m[3]} since ${m[4]}.`),
        tone: "flat",
        weight: 1.5 + (Number.isFinite(off) ? Math.min(off, 0.5) * 2 : 0),
      };
    }
    default:
      return null;
  }
}

/**
 * One fact per card, and no two cards saying the same thing (judges, Nov 12: "sales growth" on four cards in a row).
 * The strongest facts go first across the whole section: first one card per kind of fact (sales, a report, the
 * dividend, the P/E, the move), then any fact whose label no card has used yet. A stock left with only labels already
 * taken gets no card: it shows in the section's short list instead (with its price and move), never with a repeat.
 */
export function pickLevelFacts(tickers: readonly string[], facts: Readonly<Record<string, readonly LevelFact[]>>): Map<string, LevelFact> {
  const pairs = tickers
    .flatMap((ticker, order) => (facts[ticker] ?? []).map((fact) => ({ ticker, fact, order })))
    .sort((a, b) => b.fact.weight - a.fact.weight || a.order - b.order);
  const out = new Map<string, LevelFact>();
  const kinds = new Set<LevelFactKind>();
  const labels = new Set<string>();
  for (const pass of ["kind", "label"] as const) {
    for (const { ticker, fact } of pairs) {
      if (out.has(ticker) || labels.has(fact.label) || (pass === "kind" && kinds.has(fact.kind))) continue;
      out.set(ticker, fact);
      kinds.add(fact.kind);
      labels.add(fact.label);
    }
  }
  return out;
}

/** The section's title: one word for the call when every card shares it, so no card needs a call chip. */
export function levelsTitle(rows: ReadonlyArray<Pick<LevelRow, "level">>): string {
  const sells = rows.some((row) => row.level.call === "Sell some");
  const buys = rows.some((row) => row.level.call === "Buy more");
  return sells && buys ? "At our buy and sell levels" : sells ? "Sell some levels" : "Buy more levels";
}

/**
 * How many equal columns a row of `count` cards takes, from the widths the screen allows: the one that leaves the
 * fewest empty slots in the last row, the wider grid on a tie (7 cards: 4 + 3, not 3 + 3 + 1).
 */
export function gridColumns(count: number, choices: readonly number[]): number {
  let best = choices[0] ?? 1;
  let bestEmpty = Infinity;
  for (const columns of choices) {
    const empty = count <= 0 ? 0 : (columns - (count % columns)) % columns;
    if (empty < bestEmpty || (empty === bestEmpty && columns > best)) {
      best = columns;
      bestEmpty = empty;
    }
  }
  return best;
}

/**
 * Only the names where the price has reached its own call's level (crossed it, or within half a percent) AND we can
 * say concretely why (owner, Nov 12: "show me the ones where you concretely know why to buy more"): one measured fact
 * from the stock page's evidence (`facts`, by ticker, from lib/briefing-level-reasons.ts), picked so the cards don't
 * repeat one kind of fact (`pickLevelFacts`), never the call's summary. A name without one is left out. Crossed
 * first, then the closest; stocks already in Do today are left out.
 */
export function atYourLevels(
  positions: readonly BriefingPosition[],
  exclude: ReadonlySet<string>,
  facts: Readonly<Record<string, readonly LevelFact[]>>,
  premarket: Readonly<Record<string, number>> | null = null,
  premarketPrices: Readonly<Record<string, number>> | null = null,
): LevelRow[] {
  const seen = new Set<string>();
  const rows: Array<Omit<LevelRow, "fact" | "best">> = [];
  for (const position of positions) {
    const ticker = upper(position.ticker);
    if (!ticker || exclude.has(ticker) || seen.has(ticker)) continue;
    // Before the open the distance is from this morning's price, the same price the card shows.
    const price = shownPrice(position, null, premarketPrices);
    const level = ownLevel({ ...position, price });
    if (!level || !(level.crossed || Math.abs(level.gapPct) < AT_LEVEL_PCT)) continue;
    if (!(facts[ticker]?.length)) continue;
    seen.add(ticker);
    rows.push({
      ticker,
      name: position.name,
      price,
      pct: shownPct(position, null, premarket),
      call: level.call,
      href: `/stock/${encodeURIComponent(ticker)}`,
      level,
      line: levelLine(level),
      held: position.relation === "holding",
    });
  }
  // Crossed first, then the closest; holdings before watched names on a tie. The facts are picked in that order.
  rows.sort(
    (a, b) => Number(b.level.crossed) - Number(a.level.crossed) || Math.abs(a.level.gapPct) - Math.abs(b.level.gapPct) || Number(b.held) - Number(a.held) || a.ticker.localeCompare(b.ticker),
  );
  const picked = pickLevelFacts(
    rows.map((row) => row.ticker),
    facts,
  );
  const strongest = (ticker: string) => [...(facts[ticker] ?? [])].sort((a, b) => b.weight - a.weight)[0]!;
  return rows.map((row) => ({ ...row, fact: picked.get(row.ticker) ?? null, best: strongest(row.ticker) }));
}

/* ── Why it moved ───────────────────────────────────────────────────────── */

export type MovedSource = { name: string; url: string | null; at: string | null };
export type MovedCard = FaceStock & { line: string; source: MovedSource | null; kind: "news" | "move" | "results" };

const MOVE_FIGURE = /\b(?:rose|rises|rallied|rallies|jumped|jumps|surged|surges|soared|soars|gained|gains|climbed|climbs|popped|fell|falls|dropped|drops|slid|slides|sank|sinks|tumbled|tumbles|plunged|plunges|slumped|slumps|lost|up|down)\s+(?:by\s+)?(?:about\s+)?(\d+(?:\.\d+)?)%/i;

/**
 * A reason that names a move of its own far from the figure on the card ("rallied 10.83%" on a +5.5% card): it is
 * about another session, so it would read as a contradiction beside our number.
 */
export function citesOtherMove(line: string, pct: number | null | undefined): boolean {
  const match = MOVE_FIGURE.exec(line);
  if (!match || !fin(pct)) return false;
  return Math.abs(Number(match[1]) - Math.abs(pct)) > Math.max(1, Math.abs(pct) * 0.25);
}

/** The shortest whole sentence among the candidates that fits the line budget; null when none does. */
export function fittingLine(candidates: ReadonlyArray<string | null | undefined>, max = LINE_WORDS): string | null {
  const fits = candidates
    .map((text) => asSentence(firstFullSentence(text ?? "")))
    .filter((text) => text.length > 0 && words(text) <= max)
    .sort((a, b) => words(a) - words(b));
  return fits[0] ?? null;
}

function newsTitle(item: BriefingItem): string {
  return item.headline.replace(/^News on [^:]+:\s*/, "").trim();
}

/**
 * Moves with a confirmed reason only (owner rule 7: no reason, nothing written): the research's own confirmed
 * reason, a story that is a reason for this stock (results, a rating, a company event: newsRank 2) on a real move,
 * a report in the last three days, or this week's results read. Ranked by the size of the move times the money in
 * it (equal money when sizes are unknown). Stocks in `exclude` are already on the page.
 */
export function whyItMoved(input: {
  items: readonly BriefingItem[];
  positions: readonly BriefingPosition[];
  results: readonly ResultRead[];
  exclude: ReadonlySet<string>;
  today: string;
  resultFact?: (read: ResultRead) => string | null;
}): MovedCard[] {
  const byTicker = new Map(input.positions.map((position) => [upper(position.ticker), position]));
  const results = new Map(input.results.map((read) => [upper(read.ticker), read]));
  const picked = new Map<string, MovedCard & { rank: number }>();
  const kindRank = { results: 0, move: 1, news: 2 } as const;
  const offer = (card: MovedCard) => {
    // A reason quoting another session's move beside our figure reads as a contradiction: no card.
    if (citesOtherMove(card.line, card.pct)) return;
    const held = picked.get(card.ticker);
    if (!held || kindRank[card.kind] < kindRank[held.kind]) picked.set(card.ticker, { ...card, rank: kindRank[card.kind] });
  };
  for (const item of input.items) {
    const ticker = upper(item.ticker);
    if (!ticker || input.exclude.has(ticker) || item.relation === "market") continue;
    const position = byTicker.get(ticker);
    // A stock the plan does not cover gets no explanation (lib/entitlements): its move stays in the heat only.
    if (position?.covered === false) continue;
    const pct = position?.day_change_pct ?? item.day_change_pct;
    if (!fin(pct)) continue;
    const base = stockOf(item, position, pct);
    if (item.kind === "price_move" && item.reason_status === "confirmed") {
      const line = fittingLine([moveRowText(item, { name: base.name, ticker }, pct), item.why].map((text) => (text && citesOtherMove(asSentence(firstFullSentence(text)), pct) ? null : text)));
      const story = item.evidence.find((entry) => entry.source !== "Market quote");
      if (line) offer({ ...base, kind: "move", line, source: story ? { name: story.source, url: story.url, at: story.at } : null });
    } else if (item.kind === "news" && Math.abs(pct) >= NEWS_REASON_MIN_PCT) {
      const title = newsTitle(item);
      const rank = newsRank({ title, summary: item.why, published_at: item.as_of ?? undefined }, { ticker, name: base.name, day_change_pct: pct, price_as_of: item.price_as_of ?? null });
      if (rank !== 2) continue;
      // Never in a scraped headline's Title Case (owner rule 8).
      const line = citesOtherMove(title, pct) ? null : fittingLine([unTitle(title, base.name)]);
      const story = item.evidence[0];
      if (line) offer({ ...base, kind: "news", line, source: story ? { name: story.source, url: story.url, at: story.at } : null });
    } else if (item.kind === "earnings_reported") {
      const read = results.get(ticker);
      const fact = read && input.resultFact ? input.resultFact(read) : null;
      const line = fittingLine([fact, item.why]);
      const story = item.evidence[0];
      if (line) offer({ ...base, kind: "results", line, source: story ? { name: story.source, url: story.url, at: story.at } : null });
    }
  }
  // A results read for a tracked stock with no report item (results night, this week).
  for (const read of input.results) {
    const ticker = upper(read.ticker);
    const position = byTicker.get(ticker);
    if (!position || position.covered === false || input.exclude.has(ticker) || picked.get(ticker)?.kind === "results") continue;
    const days = daysBetween(read.reportDate, input.today);
    if (days == null || days < 0 || days > 3 || !fin(position.day_change_pct)) continue;
    const line = fittingLine([input.resultFact ? input.resultFact(read) : null]);
    if (!line) continue;
    const source = read.sources[0];
    offer({
      ticker,
      name: position.name,
      price: position.price,
      pct: position.day_change_pct,
      call: callWordOf(position.stance),
      href: read.reportHref ?? `/stock/${encodeURIComponent(ticker)}`,
      kind: "results",
      line,
      source: source ? { name: source.source, url: source.url, at: source.at } : null,
    });
  }
  const weight = (ticker: string) => {
    const position = byTicker.get(ticker);
    const valued = input.positions.filter((entry) => entry.relation === "holding").every((entry) => holdingValue(entry) != null);
    if (!position || position.relation !== "holding") return valued ? 0 : 0.5;
    return valued ? (holdingValue(position) as number) : 1;
  };
  return [...picked.values()]
    .sort((a, b) => Math.abs(b.pct ?? 0) * weight(b.ticker) - Math.abs(a.pct ?? 0) * weight(a.ticker) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) || a.ticker.localeCompare(b.ticker))
    .map(({ rank: _rank, ...card }) => card);
}

/* ── Reports this week ──────────────────────────────────────────────────── */

export type WeekStock = {
  ticker: string;
  name: string;
  held: boolean;
  when: "before the open" | "after the close" | null;
  /** The stock's price and today's move, as every stock on the page shows them. */
  price: number | null;
  pct: number | null;
  /** After the report: beat, miss or in line, and the reaction. */
  result: { verdict: "Beat" | "Miss" | "In line" | null; pct: number | null } | null;
  href: string;
};
export type WeekDay = { day: string; label: string; stocks: WeekStock[] };

function isTradingDay(day: string): boolean {
  return weekdayOf(day) < 5 && !isNyseHoliday(day);
}

/** The trading day before `day`. */
export function tradingDayBefore(day: string): string {
  let at = addDays(day, -1);
  for (let i = 0; i < 10 && !isTradingDay(at); i++) at = addDays(at, -1);
  return at;
}

/**
 * "Today", "Tomorrow", "Yesterday", "Monday" within six days, else "Nov 3" (lib/day-words.ts, owner rule 4). A day in
 * next week says so ("Monday, next week"), so a Thursday's list never reads as if Monday came first (judges, Nov 12).
 */
export function dayLabel(day: string, today: string): string {
  const said = capitalize(dayWords(day, today));
  const mondayOf = (value: string) => addDays(value, -weekdayOf(value));
  const nextWeek = day > today && mondayOf(day) > mondayOf(today) && !/^(?:Today|Tomorrow)$/.test(said) && /^[A-Z][a-z]+day$/.test(said);
  return nextWeek ? `${said}, next week` : said;
}

/**
 * Whether a line shared above several cards already states this card's call ("Our call moved to Keep on ASTS, NVDA
 * and SMR" says Keep), so the card can drop its call badge without hiding the call (owner rule 1). A shared line that
 * names no call ("Reported results") says nothing about it: the card keeps its badge.
 */
export function lineStatesCall(line: string, call: CallWord | null): boolean {
  if (!call) return false;
  const escaped = call.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(line);
}

/** Whether `today`'s regular session has opened (9:30 ET) by `nowMs`. */
export function sessionOpened(today: string, nowMs: number): boolean {
  const [year, month, day] = today.split("-").map(Number);
  if (!year || !month || !day) return true;
  return nowMs >= etWallTimeToUtcMs(year, month, day, 9, 30);
}

/**
 * The week's heading, true to what it holds (judges, Nov 12): "Reports coming up" when every report is still ahead,
 * "Recent and upcoming reports" when one already out is in the list too. Out means a past day, a report with its
 * result, or today's before-the-open report once the session has opened (`opened`); before 9:30 that one may not be
 * out yet.
 */
export function weekTitle(days: readonly WeekDay[], today: string, opened: boolean): string {
  const out = days.some(
    (day) => day.day < today || day.stocks.some((stock) => stock.result !== null || (opened && day.day === today && stock.when === "before the open")),
  );
  return out ? "Recent and upcoming reports" : "Reports coming up";
}

const VERDICT: Record<string, "Beat" | "Miss" | "In line"> = { beat: "Beat", miss: "Miss", in_line: "In line" };

/**
 * The tracked stocks reporting from the last trading day through the next six days, grouped by day, only the days
 * that have a report. A day already past shows how the report went when we have it (beat or miss, and the move).
 */
export function earningsWeek(input: {
  positions: readonly BriefingPosition[];
  items: readonly BriefingItem[];
  results: readonly ResultRead[];
  today: string;
  /** Before the open, this morning's moves and prices (the same the rest of the page shows). */
  premarket?: Readonly<Record<string, number>> | null;
  premarketPrices?: Readonly<Record<string, number>> | null;
}): WeekDay[] {
  const { positions, today } = input;
  const quote = (position: BriefingPosition | undefined, fallback: { price: number | null; pct: number | null } = { price: null, pct: null }) => ({
    price: position ? shownPrice(position, fallback.price, input.premarketPrices ?? null) : fallback.price,
    pct: position ? shownPct(position, fallback.pct, input.premarket ?? null) : fallback.pct,
  });
  const from = tradingDayBefore(today);
  const to = addDays(today, 6);
  const inWindow = (day: string | null | undefined): day is string => Boolean(day) && /^\d{4}-\d{2}-\d{2}$/.test(day!) && day! >= from && day! <= to;
  const byTicker = new Map(positions.map((position) => [upper(position.ticker), position]));
  const results = new Map(input.results.map((read) => [upper(read.ticker), read]));
  const days = new Map<string, Map<string, WeekStock>>();
  const add = (day: string, stock: WeekStock) => {
    const list = days.get(day) ?? new Map<string, WeekStock>();
    if (!list.has(stock.ticker)) list.set(stock.ticker, stock);
    days.set(day, list);
  };
  const resultOf = (ticker: string, day: string): WeekStock["result"] => {
    const read = results.get(ticker);
    if (!read || read.reportDate !== day) return null;
    return { verdict: read.eps ? VERDICT[read.eps.verdict] ?? null : null, pct: read.move?.pct ?? null };
  };
  const timeWords = (time: BriefingPosition["earnings_time"] | string | null | undefined): WeekStock["when"] =>
    time === "bmo" || time === "before_open" ? "before the open" : time === "amc" || time === "after_close" ? "after the close" : null;
  const reported = new Set<string>();
  // Reports already out: the report items (last three days) and the results reads.
  for (const item of input.items) {
    if (item.kind !== "earnings_reported") continue;
    const ticker = upper(item.ticker);
    const day = /\d{4}-\d{2}-\d{2}/.exec(item.id.split("_").slice(-1)[0] ?? "")?.[0] ?? null;
    if (!ticker || !inWindow(day)) continue;
    const position = byTicker.get(ticker);
    reported.add(ticker);
    add(day, { ticker, name: position?.name ?? item.name, held: position?.relation === "holding", when: timeWords(results.get(ticker)?.session), ...quote(position, { price: item.price, pct: item.day_change_pct }), result: resultOf(ticker, day), href: `/stock/${encodeURIComponent(ticker)}` });
  }
  for (const read of input.results) {
    const ticker = upper(read.ticker);
    const position = byTicker.get(ticker);
    if (!position || !inWindow(read.reportDate) || read.reportDate > today) continue;
    reported.add(ticker);
    add(read.reportDate, { ticker, name: position.name, held: position.relation === "holding", when: timeWords(read.session), ...quote(position), result: resultOf(ticker, read.reportDate), href: read.reportHref ?? `/stock/${encodeURIComponent(ticker)}` });
  }
  // Reports coming up, from each stock's next report date.
  for (const position of positions) {
    const ticker = upper(position.ticker);
    if (!ticker || reported.has(ticker) || !inWindow(position.earnings_date) || position.earnings_date < today) continue;
    add(position.earnings_date, { ticker, name: position.name, held: position.relation === "holding", when: timeWords(position.earnings_time), ...quote(position), result: null, href: `/stock/${encodeURIComponent(ticker)}` });
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      label: dayLabel(day, today),
      stocks: [...list.values()].sort((a, b) => Number(b.held) - Number(a.held) || (a.when === b.when ? 0 : a.when === "before the open" ? -1 : 1) || a.ticker.localeCompare(b.ticker)),
    }));
}

/* ── Since you last opened ──────────────────────────────────────────────── */

export type SinceCard = FaceStock & { line: string; at: string };
export type Since = { count: number; cards: SinceCard[] };

/** At most this many cards under "Since you last opened". */
export const SINCE_MAX = 3;

/**
 * What changed on the person's stocks since their last visit: call changes and results that came out after it.
 * Null on a first visit (no last visit) or when nothing is new. Stocks already on the page above are not repeated
 * as cards, but they still count.
 */
export function sinceLastOpened(input: {
  since: string | null;
  callChanges: readonly BriefingCallChange[];
  results: readonly ResultRead[];
  positions: readonly BriefingPosition[];
  exclude: ReadonlySet<string>;
  resultFact?: (read: ResultRead) => string | null;
}): Since | null {
  const since = input.since ? Date.parse(input.since) : NaN;
  if (!Number.isFinite(since)) return null;
  // A stock the plan does not cover gets no call or report read here, the same as in whyItMoved.
  const byTicker = new Map(input.positions.filter((position) => position.covered !== false).map((position) => [upper(position.ticker), position]));
  const events: SinceCard[] = [];
  const seen = new Set<string>();
  for (const change of input.callChanges) {
    const ticker = upper(change.ticker);
    const at = Date.parse(change.at);
    const position = byTicker.get(ticker);
    const to = plainCallWord(change.new_stance);
    const from = plainCallWord(change.prev_stance);
    if (!position || !Number.isFinite(at) || at <= since || !to || to === from) continue;
    const key = `call:${ticker}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ ...faceStockOf(position), call: callWordOf(to), line: from ? `Call moved from ${from} to ${to}` : `Call moved to ${to}`, at: change.at });
  }
  for (const read of input.results) {
    const ticker = upper(read.ticker);
    const position = byTicker.get(ticker);
    // When the report came out, as a New York instant: before the open, after the close, or (time unknown) the close.
    const out = reportInstant(read.reportDate, read.session);
    if (!position || out == null || out <= since) continue;
    const fact = fittingLine([input.resultFact ? input.resultFact(read) : null]);
    events.push({ ...faceStockOf(position), line: fact ?? "Reported results", at: new Date(out).toISOString() });
  }
  if (events.length === 0) return null;
  events.sort((a, b) => b.at.localeCompare(a.at) || a.ticker.localeCompare(b.ticker));
  // One card per stock, and none for a stock already on the page; the count is the stocks that are new here.
  const shown = new Set<string>();
  const cards = events.filter((event) => {
    if (input.exclude.has(event.ticker) || shown.has(event.ticker)) return false;
    shown.add(event.ticker);
    return true;
  });
  if (cards.length === 0) return null;
  return { count: cards.length, cards: cards.slice(0, SINCE_MAX) };
}

/** A report's time as an instant: 7:00 ET on its day before the open, 16:00 ET after the close or when unknown. */
export function reportInstant(day: string, session: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [hour, minute] = session === "bmo" ? [7, 0] : [16, 0];
  return etWallTimeToUtcMs(Number(match[1]), Number(match[2]), Number(match[3]), hour, minute);
}

function faceStockOf(position: BriefingPosition): FaceStock {
  const ticker = upper(position.ticker);
  return { ticker, name: position.name, price: position.price, pct: position.day_change_pct, call: callWordOf(position.stance), href: `/stock/${encodeURIComponent(ticker)}` };
}

/**
 * Where the "since" window starts for this open: the day's own saved start when the person already opened today
 * (so a reload keeps showing the same changes), else their last visit. Null on a first visit.
 */
export function sinceStart(todaySince: string | null | undefined, lastVisit: string | null | undefined): string | null {
  const valid = (value: string | null | undefined) => (value && Number.isFinite(Date.parse(value)) ? value : null);
  return valid(todaySince) ?? valid(lastVisit);
}

/** Agent findings in today's briefing (standing jobs that told you), for the one quiet link to /agent. */
export function agentFindingCount(items: readonly BriefingItem[]): number {
  return items.filter((item) => item.kind === "agent_job").length;
}

/** Briefing items that are about one stock (standing jobs are on /agent, never pinned to a stock card). */
export function stockItems(briefing: Pick<Briefing, "needs_you" | "also_today">): BriefingItem[] {
  return [...briefing.needs_you, ...briefing.also_today].filter((item) => item.kind !== "agent_job" && upper(item.ticker));
}

/** Positions for a saved earlier day, which has no positions of its own: what its items and quiet names say. */
export function positionsFromBriefing(briefing: Pick<Briefing, "needs_you" | "also_today" | "quiet">): BriefingPosition[] {
  const out = new Map<string, BriefingPosition>();
  const blank = (ticker: string, name: string, relation: "holding" | "watching", price: number | null, pct: number | null, call: string | null): BriefingPosition => ({
    instrument_id: ticker,
    ticker,
    name,
    relation,
    price,
    day_change_pct: pct,
    price_as_of: null,
    stance: call,
    call_summary: null,
    watch_out: null,
    add_below: null,
    breakout_above: null,
    trim_above: null,
    earnings_date: null,
    earnings_time: null,
    pre_earnings_headline: null,
  });
  for (const item of stockItems(briefing)) {
    const ticker = upper(item.ticker);
    if (out.has(ticker) || item.relation === "market") continue;
    out.set(ticker, blank(ticker, item.name, item.relation, item.price, item.day_change_pct, item.call ?? null));
  }
  for (const name of briefing.quiet?.names ?? []) {
    const ticker = upper(name.ticker);
    if (!out.has(ticker)) out.set(ticker, blank(ticker, ticker, name.relation, name.price ?? null, name.day_change_pct, null));
  }
  return [...out.values()];
}

/* ── the market view (nothing tracked yet) ──────────────────────────────── */

/** The market view's movers with a confirmed reason, biggest first, as Why it moved cards. */
export function marketMoved(market: Pick<Briefing["market"], "gainers" | "losers">): MovedCard[] {
  const cards: MovedCard[] = [];
  for (const mover of [...market.gainers, ...market.losers]) {
    if (mover.reason_status !== "confirmed" || !fin(mover.day_change_pct)) continue;
    const ticker = upper(mover.ticker);
    const line = fittingLine([unTitle(mover.reason, mover.name)]);
    if (!line || citesOtherMove(line, mover.day_change_pct)) continue;
    cards.push({ ticker, name: mover.name, price: mover.price, pct: mover.day_change_pct, call: null, href: `/stock/${encodeURIComponent(ticker)}`, line, source: null, kind: "move" });
  }
  return cards.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).slice(0, 6);
}

/** The market view's week: the widely followed names reporting soon (the builder's "earnings_upcoming" market items). */
export function marketWeek(items: readonly BriefingItem[], today: string): WeekDay[] {
  const positions: BriefingPosition[] = items
    .filter((item) => item.kind === "earnings_upcoming" && item.relation === "market" && /^\d{4}-\d{2}-\d{2}$/.test(item.as_of ?? ""))
    .map((item) => ({
      instrument_id: item.ticker,
      ticker: upper(item.ticker),
      name: item.name,
      relation: "watching" as const,
      // The item's own quote, so the week shows each name's price and move like the rest of the page.
      price: fin(item.price) ? item.price : null,
      day_change_pct: fin(item.day_change_pct) ? item.day_change_pct : null,
      price_as_of: null,
      stance: null,
      call_summary: null,
      watch_out: null,
      add_below: null,
      breakout_above: null,
      trim_above: null,
      earnings_date: item.as_of,
      earnings_time: / before the open$/.test(item.headline) ? "bmo" : / after the close$/.test(item.headline) ? "amc" : null,
      pre_earnings_headline: null,
    }));
  return earningsWeek({ positions, items: [], results: [], today });
}
