/**
 * The compare desk's pure half: which tickers a URL names, which rows the
 * table shows, which value wins a row, and the plain sentences that say what
 * separates the names. Every sentence is a template filled from stored
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

/* ── What separates them ───────────────────────────────────────────────── */

/**
 * One row of "Where they differ": a topic, the one figure that leads it (the leader's number), whether that figure
 * reads as up or down, whose figure it is, a few words on what it measures, the other names' numbers beside it, and
 * the same as one sentence for a screen reader.
 */
export type Difference = {
  topic: string;
  figure: string;
  tone?: "up" | "down";
  /** The stock the figure belongs to. */
  leader: string;
  /** What the figure measures, in a few words: "operating profit per sales dollar". */
  words: string;
  /** The baseline beside it: the other name's number ("AMD", "18¢"); `logo: false` for the S&P 500. */
  others: Array<{ label: string; value: string; logo?: boolean }>;
  text: string;
};

type Known = { symbol: string; value: number };

function known(rows: ReadonlyArray<ScreenerRow>, id: keyof ScreenerRow): Known[] {
  return rows
    .map((row) => ({ symbol: row.symbol, value: row[id] }))
    .filter((item): item is Known => isFiniteNumber(item.value));
}

function extremes(items: Known[]): { top: Known; bottom: Known } | null {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  return top.value === bottom.value ? null : { top, bottom };
}

function fmt(id: string, value: number): string {
  const field = FIELD_BY_ID.get(id);
  return field ? formatField(field, value) : String(value);
}

function money(value: number): string {
  return fmt("market_cap", Math.abs(value));
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

/** "6.6×" for a small ratio, "14×" for a big one. */
function ratioText(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1).replace(/\.0$/, "")}×`;
}

/**
 * Up to seven rows on where the names differ most, each led by one figure and a short line with the other name's
 * number as its baseline (and the S&P 500's for the year, given `benchmark`). A row is only written when both ends
 * are known and the gap is big enough to matter.
 */
export function describeDifferences(input: ReadonlyArray<ScreenerRow | null>, benchmark?: ScreenerRow | null): Difference[] {
  const rows = input.filter((row): row is ScreenerRow => row !== null);
  if (rows.length < 2) return [];
  const out: Difference[] = [];

  const size = extremes(known(rows, "market_cap").filter((item) => item.value > 0));
  if (size && size.top.value / size.bottom.value >= 1.5) {
    out.push({
      topic: "Size",
      figure: ratioText(size.top.value / size.bottom.value),
      leader: size.top.symbol,
      words: `bigger by market value, at ${money(size.top.value)}`,
      others: [{ label: size.bottom.symbol, value: money(size.bottom.value) }],
      text: `How much bigger ${size.top.symbol} is than ${size.bottom.symbol}, at ${money(size.top.value)} against ${money(size.bottom.value)}.`,
    });
  }

  const growth = extremes(known(rows, "rev_growth"));
  if (growth && growth.top.value - growth.bottom.value >= 3) {
    out.push({
      topic: "Growth",
      figure: short(growth.top.value, true),
      tone: growth.top.value >= 0 ? "up" : "down",
      leader: growth.top.symbol,
      words: "sales growth over a year",
      others: [{ label: growth.bottom.symbol, value: short(growth.bottom.value, true) }],
      text:
        growth.bottom.value < 0
          ? `${growth.top.symbol}'s sales growth over a year, while ${growth.bottom.symbol}'s sales shrank ${short(Math.abs(growth.bottom.value))}.`
          : `${growth.top.symbol}'s sales growth over a year, against ${short(growth.bottom.value, true)} for ${growth.bottom.symbol}.`,
    });
  }

  const forward = extremes(known(rows, "fwd_pe").filter((item) => item.value > 0));
  const trailing = extremes(known(rows, "pe").filter((item) => item.value > 0));
  const multiple = forward ?? trailing;
  if (multiple && multiple.top.value / multiple.bottom.value >= 1.15) {
    out.push({
      topic: "Price",
      // "15.4x" said as what you pay for each dollar of profit.
      figure: `$${multiple.bottom.value.toFixed(0)}`,
      leader: multiple.bottom.symbol,
      words: `paid for each $1 of ${forward ? "next year's expected profit" : "last year's profit"}`,
      others: [{ label: multiple.top.symbol, value: `$${multiple.top.value.toFixed(0)}` }],
      text: `What you pay for $1 of ${multiple.bottom.symbol}'s ${forward ? "expected profit next year" : "profit over the last year"}, against $${multiple.top.value.toFixed(0)} for ${multiple.top.symbol}.`,
    });
  }

  const margin = extremes(known(rows, "op_margin"));
  if (margin && margin.top.value - margin.bottom.value >= 3) {
    const cents = (value: number) => `${Math.round(value)}¢`;
    out.push({
      topic: "Profit",
      figure: margin.top.value < 0 ? short(margin.top.value) : cents(margin.top.value),
      leader: margin.top.symbol,
      words: margin.top.value < 0 ? "operating margin" : "operating profit per sales dollar",
      // Same unit as the figure: cents beside cents; a loss beside a profit is said as a loss, not as a percent.
      others: [
        {
          label: margin.bottom.symbol,
          value: margin.top.value < 0 ? short(margin.bottom.value) : margin.bottom.value < 0 ? "loses money" : cents(margin.bottom.value),
        },
      ],
      text:
        margin.top.value < 0
          ? `${margin.top.symbol}'s operating margin, against ${short(margin.bottom.value)} for ${margin.bottom.symbol}. Both lose money running the business.`
          : margin.bottom.value < 0
            ? `${margin.top.symbol}'s operating profit on each sales dollar, while ${margin.bottom.symbol} loses money running its business.`
            : `${margin.top.symbol}'s operating profit on each sales dollar, against ${cents(margin.bottom.value)} for ${margin.bottom.symbol}.`,
    });
  }

  const cash = extremes(known(rows, "net_cash"));
  if (cash && cash.top.value > 0 && cash.bottom.value < 0) {
    out.push({
      topic: "Balance sheet",
      figure: money(cash.top.value),
      leader: cash.top.symbol,
      words: "more cash than debt",
      others: [{ label: cash.bottom.symbol, value: `owes ${money(cash.bottom.value)} more` }],
      text: `${cash.top.symbol}'s cash beyond its debt, while ${cash.bottom.symbol} owes ${money(cash.bottom.value)} more than it holds.`,
    });
  } else {
    const leverage = extremes(known(rows, "debt_equity").filter((item) => item.value >= 0));
    if (leverage && leverage.top.value - leverage.bottom.value >= 0.3) {
      out.push({
        topic: "Balance sheet",
        figure: fmt("debt_equity", leverage.top.value),
        leader: leverage.top.symbol,
        words: "debt for each $1 of equity",
        others: [{ label: leverage.bottom.symbol, value: fmt("debt_equity", leverage.bottom.value) }],
        text: `${leverage.top.symbol}'s debt for each dollar of equity, next to ${fmt("debt_equity", leverage.bottom.value)} for ${leverage.bottom.symbol}.`,
      });
    }
  }

  const year = extremes(known(rows, "ret_1y"));
  if (year && year.top.value - year.bottom.value >= 5) {
    out.push({
      topic: "The last year",
      figure: short(year.top.value, true),
      tone: year.top.value >= 0 ? "up" : "down",
      leader: year.top.symbol,
      words: "move over the past year",
      others: [
        { label: year.bottom.symbol, value: short(year.bottom.value, true) },
        ...(benchmark && isFiniteNumber(benchmark.ret_1y) ? [{ label: "S&P 500", value: short(benchmark.ret_1y, true), logo: false }] : []),
      ],
      // The S&P 500 as a second baseline when we have it, so the row says whether either kept up with the market.
      text: `${year.top.symbol}'s move in the year to the last close, against ${short(year.bottom.value, true)} for ${year.bottom.symbol}${
        benchmark && isFiniteNumber(benchmark.ret_1y) ? ` and ${short(benchmark.ret_1y, true)} for the S&P 500` : ""
      }.`,
    });
  }

  const swing = extremes(known(rows, "vol_90d"));
  if (swing && swing.top.value - swing.bottom.value >= 5) {
    out.push({
      topic: "Risk",
      figure: short(swing.top.value),
      leader: swing.top.symbol,
      words: "typical price swing in a year",
      others: [{ label: swing.bottom.symbol, value: short(swing.bottom.value) }],
      text: `How much ${swing.top.symbol}'s price swings in a year, against ${short(swing.bottom.value)} for ${swing.bottom.symbol}.`,
    });
  }

  const target = extremes(known(rows, "upside"));
  if (target && target.top.value - target.bottom.value >= 5) {
    // How far the analysts' target sits from today's price, said from the price's side: "81% above".
    const side = (value: number) => `${short(Math.abs(value))} ${value >= 0 ? "above" : "below"}`;
    out.push({
      topic: "Analysts",
      figure: short(target.top.value, true),
      tone: target.top.value >= 0 ? "up" : "down",
      leader: target.top.symbol,
      words: `analysts' average target ${target.top.value >= 0 ? "above" : "below"} the price`,
      others: [{ label: target.bottom.symbol, value: short(target.bottom.value, true) }],
      text: `How far analysts' average target sits ${target.top.value >= 0 ? "above" : "below"} ${target.top.symbol}'s price. For ${target.bottom.symbol} it is ${side(target.bottom.value)}.`,
    });
  }

  return out.slice(0, 7);
}
