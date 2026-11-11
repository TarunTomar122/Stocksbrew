import { leftOutSentence, netCallChanges, type WeekPerformance } from "./facts";
import { pct, points, weekGap } from "./format";
import type { CallFlip, CallWord, MemoCallChange, MemoItemCard, MemoCurvePoint, MemoInputs, MemoMover, MemoView, MemoVisual } from "./types";

/**
 * What the memo page draws, shaped from the same facts as the memo's
 * sentences: a short headline, the week's line against the S&P 500, the
 * holdings that moved it, and the calls that changed. Pure functions, so the
 * page and its tests read the same thing.
 */

/** Holdings shown on each side of "who moved it". */
export const MOVERS_PER_SIDE = 3;


/** "0.8 points behind the S&P 500", "in step with the S&P 500". */
export function gapWords(portfolioPct: number, marketPct: number): string {
  const gap = weekGap(portfolioPct, marketPct);
  if (gap.side === "in step") return "in step with the S&P 500";
  return `${points(gap.points)} ${gap.side === "ahead" ? "ahead of" : "behind"} the S&P 500`;
}

/**
 * "Down so far, 2.1 points behind the S&P 500": twelve words at most and one number, the gap. The week's own
 * figure sits beside it in the chart's legend. With no S&P 500 close, the week's figure is the one number.
 */
export function memoHeadline(perf: Pick<WeekPerformance, "portfolioPct" | "marketPct"> | null, complete: boolean): string {
  if (!perf) return "Not enough prices to measure this week yet";
  // "so far" alone while the week runs: the "In progress" tag and the date line beside it say which week.
  const when = complete ? "this week" : "so far";
  const flat = Math.abs(perf.portfolioPct) < 0.05;
  if (perf.marketPct === null) return flat ? `Flat ${when}` : `${perf.portfolioPct >= 0 ? "Up" : "Down"} ${pct(perf.portfolioPct)} ${when}`;
  const direction = flat ? "Flat" : perf.portfolioPct >= 0 ? "Up" : "Down";
  return `${direction} ${when}, ${gapWords(perf.portfolioPct, perf.marketPct)}`;
}

/** The plain call words and the tone of their chip. */
export const CALL_CHIP: Record<CallWord, { label: string; tone: "up" | "neutral" | "down" }> = {
  Add: { label: "Buy more", tone: "up" },
  Hold: { label: "Keep", tone: "neutral" },
  Trim: { label: "Sell some", tone: "down" },
};

/**
 * What a changed call shows beside its chip (owner rule 9: calls stay put, and never a sale beside Keep or Buy
 * more). `was` is the call it replaced, shown only for a one-step move between Keep and Buy more; a flip (a skipped
 * step, a reversal within five sessions, two changes in one week) shows the call it is now and its date, plus the
 * reason when the memo has one. A memo stored before flips were kept still has its skips caught from the two calls.
 */
export function callShows(call: Pick<MemoCallChange, "from" | "to" | "flip">): { was: CallWord | null; flip: CallFlip | null } {
  const step: Record<CallWord, number> = { Trim: 0, Hold: 1, Add: 2 };
  const flip = call.flip ?? (Math.abs(step[call.to] - step[call.from]) > 1 ? "skip" : null);
  const sale = call.from === "Trim" || call.to === "Trim";
  return { was: flip || sale ? null : call.from, flip };
}

/**
 * The items listed as cards under a section. Calls have their own table once
 * the memo has a view, and the week's return and its drivers are drawn above,
 * so neither repeats as a card.
 */
export function cardItems<T extends { kind: string }>(items: readonly T[], hasView: boolean): T[] {
  return items.filter((item) => item.kind !== "performance" && (!hasView || (item.kind !== "drivers" && item.kind !== "call")));
}

/**
 * Where tapping a holding's bar goes: its earnings report when it reported this week (the report explains the
 * move), else why it moved on its biggest explained day, else the stock.
 */
export function moverHref(inputs: Pick<MemoInputs, "moves" | "reports" | "week" | "today">, ticker: string): string {
  const end = inputs.week.complete ? inputs.week.friday : inputs.today;
  const inWeek = (day: string) => day >= inputs.week.monday && day <= end;
  const report = inputs.reports.filter((row) => row.ticker === ticker && inWeek(row.day)).sort((a, b) => b.day.localeCompare(a.day))[0];
  if (report) return `/stock/${encodeURIComponent(ticker)}/earnings/${report.day}`;
  const move = inputs.moves
    .filter((row) => row.ticker === ticker && inWeek(row.day))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.day.localeCompare(b.day))[0];
  if (move) return `/stock/${encodeURIComponent(ticker)}/moves/${move.day}`;
  return `/stock/${encodeURIComponent(ticker)}`;
}

/** The top helpers (biggest first), then the top hurters (the worst last), so the bars read top to bottom. */
export function pickMovers(perf: Pick<WeekPerformance, "moves"> | null, perSide = MOVERS_PER_SIDE): WeekPerformance["moves"] {
  if (!perf) return [];
  const sorted = [...perf.moves].sort((a, b) => b.contribution - a.contribution || a.ticker.localeCompare(b.ticker));
  const up = sorted.filter((move) => move.contribution > 0).slice(0, perSide);
  const down = sorted.filter((move) => move.contribution < 0).slice(-perSide);
  return [...up, ...down];
}

export function buildView(inputs: MemoInputs, perf: WeekPerformance | null): MemoView {
  const nameOf = (ticker: string) => inputs.holdings.find((holding) => holding.ticker === ticker)?.name || ticker;
  const movers: MemoMover[] = pickMovers(perf).map((move) => ({
    ticker: move.ticker,
    name: move.name || move.ticker,
    pct: move.pct,
    points: move.contribution,
    href: moverHref(inputs, move.ticker),
  }));
  const calls: MemoCallChange[] = netCallChanges(inputs).map((call) => ({
    ticker: call.ticker,
    name: nameOf(call.ticker),
    from: call.from,
    to: call.to,
    date: call.date,
    flip: call.flip,
  }));
  return {
    headline: memoHeadline(perf, inputs.week.complete),
    portfolioPct: perf?.portfolioPct ?? null,
    marketPct: perf?.marketPct ?? null,
    curve: perf && perf.daily.length >= 2 ? perf.daily : [],
    movers,
    calls,
    footnote: perf ? leftOutSentence(perf) || null : null,
  };
}

/* ── reading a stored view back ─────────────────────────────────────────── */

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const str = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CALLS: readonly CallWord[] = ["Add", "Hold", "Trim"];
const isCall = (value: unknown): value is CallWord => CALLS.includes(value as CallWord);

function readVisual(raw: unknown): MemoVisual | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "share" && num(row.pct)) {
    return { kind: "share", pct: row.pct, benchmarkPct: num(row.benchmarkPct) ? row.benchmarkPct : null, label: str(row.label) ? row.label : "" };
  }
  if (row.kind === "pair" && num(row.portfolio) && num(row.market)) return { kind: "pair", portfolio: row.portfolio, market: row.market };
  return null;
}

/** A stored card, or null when it is missing or malformed (the page then shows the item's sentence). */
export function readItemCard(raw: unknown): MemoItemCard | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!str(row.figure) || !str(row.label)) return null;
  return {
    figure: row.figure,
    label: row.label,
    sign: row.sign === "up" || row.sign === "down" ? row.sign : null,
    visual: readVisual(row.visual),
  };
}

/**
 * A stored view, or null when it has no headline (the page then falls back to the memo's sentences). A bad
 * mover or call row is skipped; a bad point drops the whole curve, since a line with a missing day would mislead.
 */
export function readView(raw: unknown): MemoView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!str(row.headline)) return null;
  const rows = (value: unknown): Array<Record<string, unknown>> =>
    Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  let curve: MemoCurvePoint[] = [];
  for (const p of rows(row.curve)) {
    if (!str(p.day) || !DAY.test(p.day) || !num(p.portfolio)) {
      curve = [];
      break;
    }
    curve.push({ day: p.day, portfolio: p.portfolio, market: num(p.market) ? p.market : null });
  }
  if (Array.isArray(row.curve) && curve.length !== row.curve.length) curve = [];
  const movers: MemoMover[] = rows(row.movers)
    .filter((m) => str(m.ticker) && num(m.pct) && num(m.points) && str(m.href))
    .map((m) => ({ ticker: m.ticker as string, name: str(m.name) ? m.name : (m.ticker as string), pct: m.pct as number, points: m.points as number, href: m.href as string }));
  const calls: MemoCallChange[] = rows(row.calls)
    .filter((c) => str(c.ticker) && isCall(c.from) && isCall(c.to) && str(c.date))
    .map((c) => ({
      ticker: c.ticker as string,
      name: str(c.name) ? c.name : (c.ticker as string),
      from: c.from as CallWord,
      to: c.to as CallWord,
      date: c.date as string,
      flip: c.flip === "skip" || c.flip === "reversal" || c.flip === "twice" ? c.flip : null,
    }));
  return {
    headline: row.headline,
    portfolioPct: num(row.portfolioPct) ? row.portfolioPct : null,
    marketPct: num(row.marketPct) ? row.marketPct : null,
    curve,
    movers,
    calls,
    footnote: str(row.footnote) ? row.footnote : null,
  };
}
