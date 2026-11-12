/**
 * "Our pick of these": which of the two to four compared stocks we would pick, worked out from the figures already on
 * the compare page and nothing else. Pure and deterministic: the same rows always give the same pick, the same order
 * and the same words. Every line is a template filled from stored numbers; nothing here is written by a model.
 *
 * How the pick is made
 * - Nine measures, each scored as a normalised rank among the compared stocks: 1 when a stock is clearly ahead of
 *   every other on it, 0 when every other is clearly ahead of it, a tie counting half. "Clearly" means past the
 *   measure's noise band (TOLERANCE): +41.9% against +41.2% sales growth is a tie, not a win.
 * - A stock's score is the weighted mean of its ranks (WEIGHTS), shown as 0 to 100. Our call weighs most.
 * - Call rule: a Sell some is never placed above a Buy more unless it is clearly ahead of that Buy more on every other
 *   measure we have. It reads each stock's own call, so it holds even when one stock has no call. When the rule puts a
 *   lower score above a higher one, the card shows the order and the calls but no scores.
 * - Too close: every stock whose shown score is within CLOSE_MARGIN points of the leader's joins it in a group, and with
 *   two or more there is no pick. Each gets the measures it leads ALL the others on, our call included; a figure it
 *   shares with another stock (a Buy more several have) is no one's lead. Only stocks outside the group get a "would
 *   need" line. A Buy more and a Sell some are never in one group: the call rule decides between them.
 * - A reason is only a measure the stock is best on among ALL the compared stocks (past the noise band, with printed
 *   figures that differ), set against the next best; its green bar is the true best. Every line prints both figures.
 * - Thin data: a measure counts only when every compared stock has it. With fewer than MIN_MEASURES of those, or an
 *   uncovered stock in the set, there is no card at all (null).
 */

import { isFiniteNumber, type CallWord, type ScreenerRow } from "@/lib/screener-shared";

export type PickMeasureId = "call" | "growth" | "value" | "upside" | "margin" | "buys" | "trend" | "year" | "swing";

/** How much each measure counts. Our call weighs most; the rest follow how much they say about the business. */
export const WEIGHTS: Readonly<Record<PickMeasureId, number>> = {
  call: 3,
  growth: 1.5,
  value: 1.25,
  upside: 1,
  margin: 1,
  buys: 0.75,
  trend: 0.75,
  year: 0.75,
  swing: 0.5,
};

/**
 * The noise band on each measure, in its own units (percentage points, score points; "value" is relative). Two
 * figures this close are a tie: neither stock gets the win, and neither can be named as a reason.
 */
export const TOLERANCE: Readonly<Record<PickMeasureId, number>> = {
  call: 0,
  growth: 1.5,
  value: 0.08,
  upside: 3,
  margin: 1.5,
  buys: 3,
  trend: 3,
  year: 3,
  swing: 3,
};

/** Top two this many points of 100 apart or less is "Too close to call". */
export const CLOSE_MARGIN = 5;
/** Most lines a too-close card shows (one per stock first, then a second each), so its grid rows stay full. */
const CLOSE_REASONS = 4;
/** Fewer measures than this with a value for every stock: no pick at all. */
export const MIN_MEASURES = 4;

const MINUS = "−";
const CALL_RANK: Record<CallWord, number> = { Add: 2, Hold: 1, Trim: 0 };
export const PICK_CALL_WORDS: Record<CallWord, string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/**
 * One stock's bar on a reason: the figure as shown (null when it has no bar, "no growth"), and whether it is the best
 * of all the compared stocks on that measure (several when tied), which the card draws in green.
 */
export type PickBar = { symbol: string; value: number | null; text: string; lead: boolean };

export type PickReason = {
  measure: PickMeasureId;
  /** One line, at most twelve words: "Sales growth +48.7% vs +41.9%". */
  text: string;
  /** Every compared stock on one scale, in the page's order. */
  bars: PickBar[];
  domain: [number, number];
  /** The S&P 500 on the same measure (the 1-year return), drawn as a tick. */
  mark?: { label: string; value: number; text: string };
};

export type PickPlace = {
  symbol: string;
  call: CallWord | null;
  /** Weighted score, 0 to 100. Not shown when the call rule set the order (see `ComparePick.callRuled`). */
  score: number;
  /** 1-based place after the call rule. */
  place: number;
  /** For a runner-up: the one thing it would need to catch the leader, at most twelve words. */
  need: string | null;
};

export type ComparePick = {
  kind: "pick" | "close";
  /** Every compared stock, best first. */
  ranking: PickPlace[];
  /** The pick (or, when too close, the one a hair ahead). */
  leader: string;
  /** At most ten words: "AVGO: faster sales growth and wider profit margins". */
  title: string;
  /** The leader's reasons, up to three (kind "pick"). */
  reasons: PickReason[];
  /** The one measure where another stock is clearly better than the pick (kind "pick"). */
  loses: string | null;
  /** The stocks within CLOSE_MARGIN of the top, best first, and what each leads all the others on (kind "close"). */
  close: Array<{ symbol: string; reasons: PickReason[] }>;
  /** Measures that had a value for every stock. */
  measures: PickMeasureId[];
  /** True when the call rule moved a Buy more above a Sell some with a higher score; the scores then are not shown. */
  callRuled: boolean;
};

/* ── Figures ─────────────────────────────────────────────────────────── */

function pct(value: number, digits = 1, signed = false): string {
  const body = Math.abs(value).toFixed(digits);
  if (Number(body) === 0) return `${(0).toFixed(digits)}%`;
  const sign = value < 0 ? MINUS : signed ? "+" : "";
  return `${sign}${body}%`;
}

/** The forward P/E per point of sales growth, "0.35"; flat or shrinking sales have none to pay for. */
function perPoint(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "no growth";
}

type Measure = {
  id: PickMeasureId;
  better: "high" | "low";
  /** The figure the rank is worked from. */
  score: (row: ScreenerRow) => number | null;
  /** The figure printed and drawn as the bar. */
  shown: (row: ScreenerRow) => number | null;
  text: (value: number) => string;
  /** "Sales growth +48.7% vs +41.9%"; `other` is "+41.9%" or "NVDA +41.9%". */
  line: (lead: ScreenerRow, other: ScreenerRow, otherName: string) => string;
};

const num = (value: unknown): number | null => (isFiniteNumber(value) ? value : null);

function forwardPe(row: ScreenerRow): number | null {
  const pe = num(row.fwd_pe);
  return pe !== null && pe > 0 ? pe : null;
}

/** Below this much sales growth there is no growth to pay for (and P/E per point of it would explode). */
const MIN_GROWTH = 2;

/**
 * "Forward P/E against growth": the forward P/E per point of sales growth. Flat or shrinking sales cannot earn the
 * price, so they rank last (and tie with each other).
 */
function priceForGrowth(row: ScreenerRow): number | null {
  const pe = forwardPe(row);
  const growth = num(row.rev_growth);
  if (pe === null || growth === null) return null;
  return growth >= MIN_GROWTH ? pe / growth : Number.POSITIVE_INFINITY;
}

function simple(
  id: PickMeasureId,
  field: keyof ScreenerRow,
  better: "high" | "low",
  text: (value: number) => string,
  line: (lead: string, other: string) => string,
  ok: (value: number) => boolean = () => true,
): Measure {
  const read = (row: ScreenerRow) => {
    const value = num(row[field]);
    return value !== null && ok(value) ? value : null;
  };
  return {
    id,
    better,
    score: read,
    shown: read,
    text,
    line: (lead, other, otherName) => line(text(read(lead)!), `${otherName}${text(read(other)!)}`),
  };
}

const MEASURES: readonly Measure[] = [
  simple("growth", "rev_growth", "high", (v) => pct(v, 1, true), (a, b) => `Sales growth ${a} vs ${b}`),
  {
    // Drawn as the figure it is scored on, the forward P/E per point of sales growth, so the lowest bar is the best.
    id: "value",
    better: "low",
    score: priceForGrowth,
    shown: priceForGrowth,
    text: perPoint,
    line: (lead, other, otherName) => `Forward P/E per point of sales growth ${perPoint(priceForGrowth(lead)!)} vs ${otherName}${perPoint(priceForGrowth(other)!)}`,
  },
  simple("upside", "upside", "high", (v) => pct(v, 1, true), (a, b) => `${a} to the average analyst target, vs ${b}`),
  simple("margin", "op_margin", "high", (v) => pct(v, 1), (a, b) => `Keeps ${a} of sales as operating profit, vs ${b}`),
  simple("buys", "buy_pct", "high", (v) => pct(v, 0), (a, b) => `${a} of analysts rate it a buy, vs ${b}`),
  simple("trend", "s_momentum", "high", (v) => String(Math.round(v)), (a, b) => `Price trend score ${a} of 100, vs ${b}`),
  simple("year", "ret_1y", "high", (v) => pct(v, 1, true), (a, b) => `1-year return ${a} vs ${b}`),
  simple("swing", "vol_90d", "low", (v) => pct(v, 0), (a, b) => `Price swings less: ${a} a year vs ${b}`, (v) => v > 0),
];

/** Our call as a measure: scored Sell some 0, Keep 1, Buy more 2; drawn one step longer so a Sell some still shows. */
const CALL_MEASURE: Measure = {
  id: "call",
  better: "high",
  score: (row) => (row.call && row.call in CALL_RANK ? CALL_RANK[row.call] : null),
  shown: (row) => (row.call && row.call in CALL_RANK ? CALL_RANK[row.call] + 1 : null),
  text: (value) => PICK_CALL_WORDS[(["Trim", "Hold", "Add"] as const)[value - 1]!],
  line: (lead, other, otherName) => `Our call: ${PICK_CALL_WORDS[lead.call!]} vs ${otherName}${PICK_CALL_WORDS[other.call!]}`,
};

const MEASURE_BY_ID = new Map([CALL_MEASURE, ...MEASURES].map((measure) => [measure.id, measure]));

/* ── Ranks ───────────────────────────────────────────────────────────── */

type Table = {
  rows: ScreenerRow[];
  /** Per measure, each stock's scored figure (every one present). */
  values: Map<PickMeasureId, number[]>;
};

function tied(id: PickMeasureId, a: number, b: number): boolean {
  if (a === b) return true;
  if (id === "value") {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= TOLERANCE.value * Math.max(Math.abs(a), Math.abs(b));
  }
  return Math.abs(a - b) <= TOLERANCE[id];
}

function better(id: PickMeasureId): "high" | "low" {
  return MEASURE_BY_ID.get(id)!.better;
}

/** Stock `a` is ahead of stock `b` on the measure by more than its noise band. */
function ahead(table: Table, id: PickMeasureId, a: number, b: number): boolean {
  const values = table.values.get(id)!;
  const x = values[a]!;
  const y = values[b]!;
  if (tied(id, x, y)) return false;
  return better(id) === "high" ? x > y : x < y;
}

/** 1 when clearly ahead of every other stock, 0 when every other is clearly ahead, a tie counting half. */
function rank(table: Table, id: PickMeasureId, index: number): number {
  const n = table.rows.length;
  let points = 0;
  for (let other = 0; other < n; other += 1) {
    if (other === index) continue;
    if (ahead(table, id, index, other)) points += 1;
    else if (!ahead(table, id, other, index)) points += 0.5;
  }
  return points / (n - 1);
}

/** The best of the other stocks on a measure (first in page order on a tie). */
function bestOther(table: Table, id: PickMeasureId, index: number, among?: number[]): number {
  const values = table.values.get(id)!;
  const pool = (among ?? table.rows.map((_, i) => i)).filter((i) => i !== index);
  let best = pool[0]!;
  for (const i of pool) {
    const v = values[i]!;
    const b = values[best]!;
    if (better(id) === "high" ? v > b : v < b) best = i;
  }
  return best;
}

/** How far apart two figures are, relative to the larger, for ordering lines of equal weight. */
function gap(table: Table, id: PickMeasureId, a: number, b: number): number {
  const values = table.values.get(id)!;
  const x = values[a]!;
  const y = values[b]!;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  const scale = Math.max(Math.abs(x), Math.abs(y), 1);
  return Math.abs(x - y) / scale;
}

/* ── Words ───────────────────────────────────────────────────────────── */

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

/** "1st", "2nd", "3rd", "4th". */
export function pickPlaceWord(place: number): string {
  return place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
}

/** The line and every stock's bar, for one measure, about stock `lead` (the best of all on it) against stock `other`. */
function reason(table: Table, id: PickMeasureId, lead: number, other: number, benchmark?: ScreenerRow | null): PickReason {
  const measure = MEASURE_BY_ID.get(id)!;
  const rows = table.rows;
  // With two stocks the other one is obvious; with more, it is named.
  const otherName = rows.length > 2 ? `${rows[other]!.symbol} ` : "";
  let text = measure.line(rows[lead]!, rows[other]!, otherName);
  const shown = rows.map((row) => measure.shown(row)!);
  const drawn = shown.filter((value) => Number.isFinite(value));
  let mark: PickReason["mark"];
  if (id === "year" && benchmark && isFiniteNumber(benchmark.ret_1y)) {
    mark = { label: "S&P 500", value: benchmark.ret_1y, text: pct(benchmark.ret_1y, 1, true) };
    const withIndex = `${text}, S&P 500 ${mark.text}`;
    if (wordCount(withIndex) <= 12) text = withIndex;
  }
  const domain: [number, number] = [Math.min(0, ...drawn, mark?.value ?? 0), Math.max(0, ...drawn, mark?.value ?? 0)];
  // Green marks the best of all the stocks on this measure (no other is clearly ahead of it), never just the line's.
  const top = (index: number) => rows.every((_, other) => other === index || !ahead(table, id, other, index));
  return {
    measure: id,
    text,
    bars: rows.map((row, index) => ({
      symbol: row.symbol,
      value: Number.isFinite(shown[index]!) ? shown[index]! : null,
      text: measure.text(shown[index]!),
      lead: top(index),
    })),
    domain,
    ...(mark ? { mark } : {}),
  };
}

/** The figures behind a need or a loss, "+12.0% vs +48.7%", from the stock that is behind (or ahead) first. */
function figures(table: Table, id: PickMeasureId, first: number, second: number): string {
  const rows = table.rows;
  if (id === "call") return `${PICK_CALL_WORDS[rows[first]!.call!]} vs ${PICK_CALL_WORDS[rows[second]!.call!]}`;
  const measure = MEASURE_BY_ID.get(id)!;
  if (id === "value") return `${perPoint(priceForGrowth(rows[first]!)!)} vs ${perPoint(priceForGrowth(rows[second]!)!)}`;
  return `${measure.text(measure.shown(rows[first]!)!)} vs ${measure.text(measure.shown(rows[second]!)!)}`;
}

const NEED_PHRASE: Record<PickMeasureId, string> = {
  call: "a better call from us",
  growth: "faster sales growth",
  value: "a lower P/E per point of growth",
  upside: "more analyst upside",
  margin: "wider profit margins",
  buys: "more analysts rating it a buy",
  trend: "a stronger price trend",
  year: "a better past year",
  swing: "a steadier price",
};

function fit(text: string, max: number, fallback: string): string {
  return wordCount(text) <= max ? text : fallback;
}

/** Stock `a` is ahead of `b` and the card's figures show it: "20× on +1% vs 20× on +1%" is no lead to a reader. */
function wins(table: Table, id: PickMeasureId, a: number, b: number): boolean {
  if (!ahead(table, id, a, b)) return false;
  const [x, y] = figures(table, id, a, b).split(" vs ");
  return x !== y;
}

/* ── The pick ────────────────────────────────────────────────────────── */

/**
 * The call rule's order: best total first, except that a Sell some never goes above a Buy more it is not clearly
 * ahead of on every other measure. Built greedily, so the best-scoring stock that is free to go next always does.
 */
function ruledOrder(table: Table, totals: number[], others: PickMeasureId[]): number[] {
  const rows = table.rows;
  const byTotal = rows.map((_, index) => index).sort((a, b) => totals[b]! - totals[a]! || a - b);
  const blocked = (trim: number, add: number) => !(others.length > 0 && others.every((id) => ahead(table, id, trim, add)));
  const order: number[] = [];
  const left = [...byTotal];
  while (left.length > 0) {
    const next = left.find((candidate) => rows[candidate]!.call !== "Trim" || !left.some((other) => rows[other]!.call === "Add" && blocked(candidate, other)));
    // Every stock left is a Sell some held under a Buy more, which cannot happen (a Buy more is always free), but stay safe.
    const pickIndex = next ?? left[0]!;
    order.push(pickIndex);
    left.splice(left.indexOf(pickIndex), 1);
  }
  return order;
}

/**
 * Our pick of two to four compared stocks, or null when there is nothing honest to say: fewer than two stocks, an
 * uncovered one, fewer than MIN_MEASURES measures every stock has, or a tie with nothing either side leads on.
 * `benchmark` is the S&P 500's row (SPY), for the 1-year return's line and tick only; it never changes the pick.
 */
export function buildComparePick(input: ReadonlyArray<ScreenerRow | null>, benchmark?: ScreenerRow | null): ComparePick | null {
  if (input.length < 2 || input.some((row) => row === null)) return null;
  const rows = input as ScreenerRow[];

  const values = new Map<PickMeasureId, number[]>();
  for (const measure of [CALL_MEASURE, ...MEASURES]) {
    const list = rows.map(measure.score);
    if (list.every((value): value is number => value !== null)) values.set(measure.id, list);
  }
  if (values.size < MIN_MEASURES) return null;
  const table: Table = { rows, values };
  const ids = [...values.keys()];
  const others = ids.filter((id) => id !== "call");
  const totalWeight = ids.reduce((sum, id) => sum + WEIGHTS[id], 0);
  const totals = rows.map((_, index) => ids.reduce((sum, id) => sum + WEIGHTS[id] * rank(table, id, index), 0) / totalWeight);
  const score = (index: number) => Math.round(totals[index]! * 100);

  // The call rule reads each stock's own call, so it holds even when one stock has none and the call is not scored.
  const order = ruledOrder(table, totals, others);
  const callRuled = order.some((index, position) => order.slice(position + 1).some((later) => totals[later]! > totals[index]!));
  const allIndexes = rows.map((_, index) => index);
  const leader = order[0]!;
  const second = order[1]!;
  // A Buy more against a Sell some is decided by the call rule, never "too close".
  const callSplit = (a: number, b: number) => {
    const calls = [rows[a]!.call, rows[b]!.call];
    return calls.includes("Add") && calls.includes("Trim");
  };
  // Too close is a group: every stock, down from the top, whose shown score is within CLOSE_MARGIN of the leader's.
  const group = [leader];
  for (const index of order.slice(1)) {
    if (Math.abs(score(leader) - score(index)) > CLOSE_MARGIN || group.some((member) => callSplit(member, index))) break;
    group.push(index);
  }
  const close = group.length > 1;

  /** Measures `a` leads every one of `rivals` on, best first: ahead of everyone, then weight, then the gap. */
  const leadsOn = (a: number, rivals: number[], withCall = false) => {
    const near = (id: PickMeasureId) => bestOther(table, id, a, [a, ...rivals]);
    return (withCall ? ids : others)
      .filter((id) => rivals.every((b) => wins(table, id, a, b)))
      .sort((x, y) => {
        const allX = allIndexes.every((i) => i === a || wins(table, x, a, i)) ? 1 : 0;
        const allY = allIndexes.every((i) => i === a || wins(table, y, a, i)) ? 1 : 0;
        return allY - allX || WEIGHTS[y] - WEIGHTS[x] || gap(table, y, a, near(y)) - gap(table, x, a, near(x)) || ids.indexOf(x) - ids.indexOf(y);
      });
  };

  /** Measures where `behind` trails `front`, the costliest first. */
  const gapsBehind = (behind: number, front: number): PickMeasureId[] =>
    ids
      .filter((id) => wins(table, id, front, behind))
      .map((id) => ({ id, size: WEIGHTS[id] * (rank(table, id, front) - rank(table, id, behind)) + gap(table, id, front, behind) * 1e-3 }))
      .filter((item) => item.size > 0)
      .sort((x, y) => y.size - x.size)
      .map((item) => item.id);

  const needText = (index: number, id: PickMeasureId) => {
    if (id === "call") return `Would need our call to move up from ${PICK_CALL_WORDS[rows[index]!.call!]}`;
    // No growth has no P/E per point of it: say what is missing, with both sales growth figures.
    if (id === "value" && !Number.isFinite(priceForGrowth(rows[index]!)!)) {
      return `Would need growing sales, ${pct(rows[index]!.rev_growth!, 1, true)} vs ${pct(rows[leader]!.rev_growth!, 1, true)}`;
    }
    return `Would need ${NEED_PHRASE[id]}, ${figures(table, id, index, leader)}`;
  };
  // One thing per runner-up, and never the same sentence twice down the list.
  const said = new Set<string>();
  const ranking: PickPlace[] = order.map((index, position) => {
    let need: string | null = null;
    // Only a stock clearly outside the leading group is told what it would need.
    if (!group.includes(index)) {
      for (const id of gapsBehind(index, leader)) {
        const text = needText(index, id);
        if (said.has(text)) continue;
        need = text;
        said.add(text);
        break;
      }
    }
    return { symbol: rows[index]!.symbol, call: rows[index]!.call ?? null, score: score(index), place: position + 1, need };
  });

  const base = { ranking, leader: rows[leader]!.symbol, measures: ids, callRuled };

  if (close) {
    // What each stock in the group leads ALL the others on, our call included. A figure shared with another stock
    // (within its noise band), such as a Buy more several of them have, is nobody's lead.
    const leads = group.map((a) =>
      leadsOn(
        a,
        allIndexes.filter((i) => i !== a),
        true,
      ),
    );
    // At most CLOSE_REASONS lines, taken in turn (each stock's best first), so the card's grid always fills its rows.
    const taken = group.map(() => 0);
    let total = 0;
    for (let round = 0; round < 2 && total < CLOSE_REASONS; round += 1) {
      group.forEach((_, k) => {
        if (total < CLOSE_REASONS && leads[k]!.length > round) {
          taken[k] = round + 1;
          total += 1;
        }
      });
    }
    const sides = group.map((a, k) => ({
      symbol: rows[a]!.symbol,
      reasons: leads[k]!.slice(0, taken[k]).map((id) => reason(table, id, a, bestOther(table, id, a), benchmark)),
    }));
    // Level on everything we can show: no card rather than an empty one.
    if (sides.every((side) => side.reasons.length === 0)) return null;
    return { ...base, kind: "close", title: "Too close to call", reasons: [], loses: null, close: sides };
  }

  // Reasons: only measures the pick is clearly ahead of every other stock on, each set against the next best.
  const reasons = leadsOn(
    leader,
    allIndexes.filter((i) => i !== leader),
  )
    .slice(0, 3)
    .map((id) => reason(table, id, leader, bestOther(table, id, leader), benchmark));

  // Where it loses: the measure where another stock is clearly ahead of the pick and it costs the pick the most.
  let loses: string | null = null;
  let lossSize = 0;
  for (const id of ids) {
    const rival = bestOther(table, id, leader);
    if (!wins(table, id, rival, leader)) continue;
    const size = WEIGHTS[id] * (1 - rank(table, id, leader)) + gap(table, id, rival, leader) * 1e-3;
    if (size <= lossSize) continue;
    lossSize = size;
    loses = `${rows[rival]!.symbol} has ${NEED_PHRASE[id]}, ${figures(table, id, rival, leader)}`;
  }

  const symbol = rows[leader]!.symbol;
  const callWord = rows[leader]!.call;
  // "Our only Buy more": the call leads the title only when it is a Buy more and no other stock has one.
  const onlyBest = callWord === "Add" && allIndexes.every((i) => i === leader || rows[i]!.call !== "Add");
  const measuresLed = reasons.map((item) => item.measure);
  const phrases = measuresLed.map((id) => NEED_PHRASE[id]);
  // "At a lower P/E" only when its forward P/E is the lowest of all of them, not just below the runner-up's.
  const leaderPe = forwardPe(rows[leader]!);
  const cheaperPe = leaderPe !== null && allIndexes.every((i) => i === leader || (forwardPe(rows[i]!) ?? 0) > leaderPe);
  const secondCall = rows[second]!.call;
  let title: string;
  if (onlyBest && callWord) {
    const lead = `${symbol}: our only Buy more`;
    title = phrases[0] ? fit(`${lead}, with ${phrases[0]}`, 10, `${lead} of these`) : `${lead} of these`;
  } else if (measuresLed.includes("growth") && measuresLed.includes("value") && cheaperPe) {
    title = `${symbol}: faster growth at a lower P/E`;
  } else if (phrases.length >= 2) {
    title = fit(`${symbol}: ${phrases[0]} and ${phrases[1]}`, 10, `${symbol}: ${phrases[0]}`);
  } else if (phrases.length === 1) {
    title = `${symbol}: ${phrases[0]}`;
  } else if (callWord && secondCall && CALL_RANK[callWord] > CALL_RANK[secondCall]) {
    title = `${symbol}: our ${PICK_CALL_WORDS[callWord]} call, over ${rows[second]!.symbol}'s ${PICK_CALL_WORDS[secondCall]}`;
  } else {
    title = `${symbol}: a little ahead across these measures`;
  }

  return { ...base, kind: "pick", title, reasons, loses, close: [] };
}
