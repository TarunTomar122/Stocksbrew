/**
 * The compare desk's pure half: which tickers a URL names, which rows the
 * table shows, which value wins a row, and the head-to-head scoreboard of
 * where the names differ. Every word is a template filled from stored
 * numbers; nothing here is written by a model.
 */

import { FIELD_BY_ID, formatField, isFiniteNumber, type NumericField, type ScreenerRow } from "@/lib/screener-shared";

export const COMPARE_MAX = 4;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** "nvda, amd,,AMD" -> ["NVDA", "AMD"]. Bad or repeated tickers are dropped. */
export function parseCompareSymbols(raw: string | string[] | undefined | null, max = COMPARE_MAX): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out: string[] = [];
  for (const part of text.split(/[,\s]+/)) {
    const symbol = part.trim().toUpperCase();
    if (!TICKER.test(symbol) || out.includes(symbol)) continue;
    out.push(symbol);
    if (out.length >= max) break;
  }
  return out;
}

export function compareHref(symbols: readonly string[], range?: string | null): string {
  const clean = parseCompareSymbols(symbols.join(","), 12);
  const params: string[] = [];
  if (clean.length) params.push(`symbols=${clean.join(",")}`);
  if (range) params.push(`range=${range}`);
  return params.length ? `/compare?${params.join("&")}` : "/compare";
}

/** Old /compare-stocks links used `?t=` or `?tickers=`. */
export function legacyCompareSymbols(query: Record<string, string | string[] | undefined>): string[] {
  return parseCompareSymbols(query.symbols ?? query.t ?? query.tickers ?? query.stocks ?? "");
}

/** The chart range whose return is the table's figure for the same period. */
const CHART_RETURN_FIELD: Record<string, "ret_1m" | "ret_ytd" | "ret_1y" | "ret_5y"> = { "1M": "ret_1m", YTD: "ret_ytd", "1Y": "ret_1y", "5Y": "ret_5y" };

const NEW_YORK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The rows with their 1-month, this-year, 1-year and 5-year returns taken from the chart's own lines, so the table,
 * the differences and the read say the same figure as the chart's legend (judges, ship 46: NVDA's year was −9.84% in
 * the chart and −9.78% in the table, two calculations from two start days). Only when the chart runs to the row's own
 * price day: a chart a day behind keeps the row's figures rather than mixing yesterday's return with today's price.
 */
export function withChartReturns<Row extends ScreenerRow | null>(
  rows: ReadonlyArray<Row>,
  ranges: ReadonlyArray<{ key: string; endDate: string; series: ReadonlyArray<{ symbol: string; pct: number | null }> }>,
): Row[] {
  return rows.map((row) => {
    if (!row) return row;
    const priced = row.price_at && Number.isFinite(Date.parse(row.price_at)) ? NEW_YORK_DAY.format(new Date(row.price_at)) : null;
    let next: ScreenerRow | null = null;
    for (const range of ranges) {
      const field = CHART_RETURN_FIELD[range.key];
      if (!field || (priced && range.endDate < priced)) continue;
      const pct = range.series.find((line) => line.symbol === row.symbol)?.pct;
      if (!isFiniteNumber(pct)) continue;
      next = { ...(next ?? row), [field]: pct };
    }
    return (next ?? row) as Row;
  });
}

/**
 * What a call card's figure is, in two or three words beside it (owner rules 6 and 7: "42%" alone needs the paragraph
 * to say it is sales growth), read from the words around the figure in its own sentence. Null when they do not say.
 */
export function figureLabel(reason: string, value: string): string | null {
  const bare = value.replace(/^[+\u2212-]/, "");
  // The figure whole, so "42%" is never found inside "142%".
  const at = reason.search(new RegExp(`(?<![\\d.])${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (at < 0) return null;
  const before = reason.slice(0, at).toLowerCase();
  const after = reason.slice(at + bare.length).toLowerCase();
  const span = /^\s+(?:over|in) the (?:past|last) (five trading days|week|month|three months|six months|year|12 months)\b/.exec(after)?.[1] ?? null;
  const when = span === "five trading days" ? "five trading days" : span === "12 months" || span === "year" ? "past year" : span ? `past ${span}` : null;
  // "sales grew 42%", "revenue fell 5%".
  if (/\b(?:sales|revenue)\s+(?:grew|rose|jumped|climbed|increased|fell|dropped|declined|shrank)(?:\s+by)?\s*$/.test(before)) {
    return `sales growth${when ? `, ${when}` : ""}`;
  }
  // "NVIDIA fell 13% over the past five trading days".
  if (when && /\b(?:fell|rose|gained|dropped|climbed|lost|slid|jumped)\s*$/.test(before)) return when === "five trading days" ? "in five trading days" : `in the ${when}`;
  return null;
}

export type CompareGroupId = "price" | "valuation" | "growth" | "profitability" | "balance" | "read" | "earnings";

export type CompareGroup = { id: CompareGroupId; label: string; fields: string[] };

export const COMPARE_GROUPS: CompareGroup[] = [
  { id: "price", label: "Price and returns", fields: ["price", "day_pct", "ret_1m", "ret_3m", "ret_ytd", "ret_1y", "ret_5y", "from_hi_pct", "vol_90d"] },
  { id: "valuation", label: "Valuation", fields: ["market_cap", "pe", "fwd_pe", "peg", "ps", "p_fcf", "ev_ebitda", "pe_hist_pctile"] },
  { id: "growth", label: "Growth", fields: ["rev_growth", "rev_cagr_3y", "eps_growth", "eps_next_y"] },
  { id: "profitability", label: "Profitability", fields: ["gross_margin", "op_margin", "net_margin", "fcf_margin", "roe", "roic"] },
  { id: "balance", label: "Balance sheet", fields: ["net_cash", "debt_equity", "current_ratio", "div_yield", "payout"] },
  { id: "read", label: "Our read", fields: ["score", "s_value", "s_growth", "s_quality", "s_momentum"] },
  { id: "earnings", label: "Earnings and analysts", fields: ["upside", "target", "buy_pct", "buys_chg_3m", "analyst_count"] },
];

/** Row labels on the compare table, where the screener's column header is too terse. */
export const COMPARE_LABELS: Record<string, string> = {
  price: "Price",
  day_pct: "Today",
  ret_1m: "1 month",
  ret_3m: "3 months",
  ret_ytd: "This year",
  ret_1y: "1 year",
  ret_5y: "5 years",
  from_hi_pct: "From 52-week high",
  vol_90d: "How much it swings (90 days)",
  market_cap: "Market value",
  pe: "Price vs last year's earnings",
  fwd_pe: "Price vs next year's expected earnings",
  peg: "Price vs earnings, adjusted for growth",
  ps: "Price to sales",
  p_fcf: "Price vs cash it brings in",
  ev_ebitda: "Company value vs operating profit",
  pe_hist_pctile: "Price vs earnings, against its own past (0 = cheapest)",
  rev_growth: "Revenue growth, 1 year",
  rev_cagr_3y: "Revenue growth a year, last 3 years",
  eps_growth: "Earnings per share growth, last year",
  eps_next_y: "Earnings per share growth expected next year",
  gross_margin: "Kept from sales after making the product",
  op_margin: "Kept as operating profit",
  net_margin: "Kept as final profit",
  fcf_margin: "Kept as spare cash",
  roe: "Profit on shareholders' money",
  roic: "Profit on all money put in",
  net_cash: "Net cash (cash minus debt)",
  debt_equity: "Debt for each $1 of shareholders' money",
  current_ratio: "Short-term assets per $1 of bills due",
  div_yield: "Dividend yield",
  payout: "Share of profit paid as dividends",
  score: "Our overall score (out of 100)",
  s_value: "Our value score",
  s_growth: "Our growth score",
  s_quality: "Our quality score",
  s_momentum: "Our price trend score",
  upside: "To average analyst target",
  target: "Average analyst target",
  buy_pct: "Analysts rating it a buy",
  buys_chg_3m: "Buy ratings added, 3 months",
  analyst_count: "Analysts covering",
};

/**
 * Index of the winning value in a row, or -1 when there is no winner: the
 * field has no better end, fewer than two names have a value, or the best
 * value is shared.
 */
export function bestIndex(values: ReadonlyArray<number | null | undefined>, better: "high" | "low" | undefined): number {
  if (!better) return -1;
  let best = -1;
  let known = 0;
  let tied = false;
  values.forEach((value, index) => {
    if (!isFiniteNumber(value)) return;
    known += 1;
    if (best === -1) {
      best = index;
      return;
    }
    const current = values[best] as number;
    if (value === current) tied = true;
    else if (better === "high" ? value > current : value < current) {
      best = index;
      tied = false;
    }
  });
  return known >= 2 && !tied ? best : -1;
}

export type CompareCell = { text: string; value: number | null; tone: "up" | "down" | "flat" | null; best: boolean };
export type CompareTableRow = { id: string; label: string; hint: string; cells: CompareCell[] };
export type CompareTableGroup = { id: CompareGroupId; label: string; rows: CompareTableRow[] };

function toneFor(field: NumericField, value: number): CompareCell["tone"] {
  if (field.unit !== "signed_pct" && field.unit !== "count_change") return null;
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

/** The table, group by group. A row nobody has a value for is left out entirely. */
export function buildCompareTable(rows: ReadonlyArray<ScreenerRow | null>): CompareTableGroup[] {
  const groups: CompareTableGroup[] = [];
  for (const group of COMPARE_GROUPS) {
    const tableRows: CompareTableRow[] = [];
    for (const id of group.fields) {
      const field = FIELD_BY_ID.get(id);
      if (!field) continue;
      const values = rows.map((row) => {
        const value = row ? (row as Record<string, unknown>)[id] : null;
        return isFiniteNumber(value) ? value : null;
      });
      if (values.every((value) => value === null)) continue;
      const winner = bestIndex(values, field.better);
      tableRows.push({
        id,
        label: COMPARE_LABELS[id] ?? field.short,
        hint: field.label,
        cells: values.map((value, index) => ({
          text: value === null ? "" : formatField(field, value),
          value,
          tone: value === null ? null : toneFor(field, value),
          best: index === winner,
        })),
      });
    }
    if (tableRows.length > 0) groups.push({ id: group.id, label: group.label, rows: tableRows });
  }
  return groups;
}

/** How many rows each name wins, for the tally under the header. */
export function tallyWins(groups: ReadonlyArray<CompareTableGroup>, count: number): number[] {
  const wins = Array.from({ length: count }, () => 0);
  for (const group of groups) {
    for (const row of group.rows) {
      row.cells.forEach((cell, index) => {
        if (cell.best) wins[index]! += 1;
      });
    }
  }
  return wins;
}

/* ── Where they differ: the head-to-head scoreboard ────────────────────── */

/** Which end of a metric wins. "neutral" rows are shown without a winner (company size). */
export type ScoreBetter = "high" | "low" | "neutral";

export type ScoreMetricId = "size" | "growth" | "price" | "margin" | "cash" | "year" | "swing";

export type ScoreMetric = {
  id: ScoreMetricId;
  label: string;
  better: ScoreBetter;
  /**
   * A word beside the winning value where the number alone does not say why it wins (a lower price, a smaller swing);
   * on a neutral row it sits beside the bigger value instead.
   */
  word?: string;
  /** Why it matters, in at most eight words, for the row's hover title only. */
  hint: string;
};

/** What "better" means on each row of the scoreboard, in the order the rows are shown. */
export const SCORE_METRICS: readonly ScoreMetric[] = [
  { id: "size", label: "Company size", better: "neutral", word: "bigger", hint: "Size alone doesn't make a better stock" },
  { id: "growth", label: "Sales growth, 1 yr", better: "high", hint: "Faster growth can justify a higher price" },
  { id: "price", label: "Price for $1 of next year's profit", better: "low", word: "cheaper", hint: "Lower means you pay less for profit" },
  { id: "margin", label: "Profit per $1 of sales", better: "high", hint: "Keeping more of each sale means pricing power" },
  { id: "cash", label: "Cash minus debt", better: "high", hint: "Spare cash cushions a bad year" },
  { id: "year", label: "Price change, 1 yr", better: "high", hint: "How holders did over the past year" },
  { id: "swing", label: "How much the price swings", better: "low", word: "steadier", hint: "Smaller swings make dips easier to sit through" },
];

/** One stock's figure on a row; `share` is its bar's length, 0 to 1 of the row's biggest magnitude. */
export type ScoreCell = { symbol: string; value: number; text: string; share: number };

export type ScoreRow = {
  id: ScoreMetricId;
  label: string;
  hint: string;
  better: ScoreBetter;
  cells: ScoreCell[];
  /** Index of the winning cell, or -1 on a neutral row or when the shown figures tie. */
  winner: number;
  /** The word beside one cell ("cheaper", "steadier", "bigger"), when the row has one and a side to put it on. */
  word?: { index: number; text: string };
  /** The S&P 500 on the same measure, drawn as a tick on the bar. */
  reference?: { label: string; value: number; text: string; share: number };
};

export type Scoreboard = {
  symbols: string[];
  rows: ScoreRow[];
  /** Rows won by each stock, in `symbols` order. */
  wins: number[];
  /** Rows that can be won (every row but the neutral ones). */
  scored: number;
  /** "AVGO leads on 4 of 6", "Even, 3 each of 6"; empty when nobody wins a row. */
  tally: string;
};

function money(value: number): string {
  const field = FIELD_BY_ID.get("market_cap");
  const abs = Math.abs(value);
  return field ? formatField(field, abs) : `$${abs}`;
}

/** A percentage for a scan-friendly row: whole from 10 up, one decimal below, signed when asked. */
function short(value: number, signed = false): string {
  const abs = Math.abs(value);
  const body = abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "");
  const text = `${body}%`;
  // A value that rounds to zero carries no sign: "0%", never "−0%".
  if (body === "0") return text;
  if (!signed) return value < 0 ? `−${text}` : text;
  return `${value > 0 ? "+" : "−"}${text}`;
}

function cents(value: number): string {
  const rounded = Math.round(value);
  return rounded === 0 ? "0¢" : `${rounded < 0 ? "−" : ""}${Math.abs(rounded)}¢`;
}

function signedMoney(value: number): string {
  const text = money(value);
  return value === 0 ? text : `${value > 0 ? "+" : "−"}${text}`;
}

/** Each covered stock's value for a field, or null when any of them lacks it (or fails `ok`). */
function every(rows: ReadonlyArray<ScreenerRow>, id: keyof ScreenerRow, ok: (value: number) => boolean = () => true): number[] | null {
  const out: number[] = [];
  for (const row of rows) {
    const value = row[id];
    if (!isFiniteNumber(value) || !ok(value)) return null;
    out.push(value);
  }
  return out;
}

/**
 * The winning index on a row: -1 on a neutral row, and -1 when the winner's figure reads the same as another's once
 * rounded for the card ("+21%" against "+21%" is a tie to the reader, so neither side is marked).
 */
export function scoreWinner(values: ReadonlyArray<number>, texts: ReadonlyArray<string>, better: ScoreBetter): number {
  if (better === "neutral") return -1;
  const index = bestIndex(values, better);
  if (index < 0) return -1;
  return texts.some((text, other) => other !== index && text === texts[index]) ? -1 : index;
}

function tallyText(symbols: ReadonlyArray<string>, wins: ReadonlyArray<number>, scored: number): string {
  const top = Math.max(0, ...wins);
  if (top === 0) return "";
  const leaders = symbols.filter((_, index) => wins[index] === top);
  if (leaders.length === 1) return `${leaders[0]} leads on ${top} of ${scored}`;
  if (leaders.length === symbols.length) return `Even, ${top} each of ${scored}`;
  return `${leaders.slice(0, -1).join(", ")} and ${leaders[leaders.length - 1]} lead on ${top} each of ${scored}`;
}

/**
 * "Where they differ" as a head-to-head scoreboard: one row per measure in SCORE_METRICS order, each stock's figure,
 * which side wins it and how long each side's bar is. A row any stock lacks is dropped; with fewer than three rows
 * left there is no scoreboard (null). Uncovered stocks (null rows) are left out of it.
 */
export function buildScoreboard(input: ReadonlyArray<ScreenerRow | null>, benchmark?: ScreenerRow | null): Scoreboard | null {
  const rows = input.filter((row): row is ScreenerRow => row !== null);
  if (rows.length < 2) return null;
  const symbols = rows.map((row) => row.symbol);
  const out: ScoreRow[] = [];

  for (const metric of SCORE_METRICS) {
    let values: number[] | null = null;
    let format: (value: number) => string = (value) => short(value);
    let label = metric.label;
    let reference: { label: string; value: number; text: string } | undefined;

    if (metric.id === "size") {
      values = every(rows, "market_cap", (value) => value > 0);
      format = money;
    } else if (metric.id === "growth") {
      values = every(rows, "rev_growth");
      format = (value) => short(value, true);
    } else if (metric.id === "price") {
      // Next year's expected profit when every stock has it, else last year's; a loss has no price for its profit.
      values = every(rows, "fwd_pe", (value) => value > 0);
      if (!values) {
        values = every(rows, "pe", (value) => value > 0);
        label = "Price for $1 of last year's profit";
      }
      format = (value) => `$${Math.round(value)}`;
    } else if (metric.id === "margin") {
      values = every(rows, "op_margin");
      format = cents;
    } else if (metric.id === "cash") {
      values = every(rows, "net_cash");
      format = signedMoney;
    } else if (metric.id === "year") {
      values = every(rows, "ret_1y");
      format = (value) => short(value, true);
      if (benchmark && isFiniteNumber(benchmark.ret_1y)) reference = { label: "S&P 500", value: benchmark.ret_1y, text: short(benchmark.ret_1y, true) };
    } else if (metric.id === "swing") {
      values = every(rows, "vol_90d", (value) => value > 0);
    }
    if (!values) continue;

    const texts = values.map(format);
    const scale = Math.max(...values.map(Math.abs), reference ? Math.abs(reference.value) : 0);
    const share = (value: number) => (scale > 0 ? Math.abs(value) / scale : 0);
    const winner = scoreWinner(values, texts, metric.better);
    // The word goes beside the winner, or beside the bigger figure on a neutral row (when it is not a tie).
    const wordAt = metric.better === "neutral" ? scoreWinner(values, texts, "high") : winner;

    out.push({
      id: metric.id,
      label,
      hint: metric.hint,
      better: metric.better,
      cells: values.map((value, index) => ({ symbol: symbols[index]!, value, text: texts[index]!, share: share(value) })),
      winner,
      ...(metric.word && wordAt >= 0 ? { word: { index: wordAt, text: metric.word } } : {}),
      ...(reference ? { reference: { ...reference, share: share(reference.value) } } : {}),
    });
  }

  if (out.length < 3) return null;
  const wins = symbols.map((_, index) => out.filter((row) => row.winner === index).length);
  const scored = out.filter((row) => row.better !== "neutral").length;
  return { symbols, rows: out, wins, scored, tally: tallyText(symbols, wins, scored) };
}
