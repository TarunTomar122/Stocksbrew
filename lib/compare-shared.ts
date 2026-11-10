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

export type Difference = { topic: string; text: string };

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

/**
 * Up to seven sentences on where the names differ most, each built from two
 * stored numbers. A sentence is only written when both ends are known and the
 * gap is big enough to matter.
 */
export function describeDifferences(input: ReadonlyArray<ScreenerRow | null>): Difference[] {
  const rows = input.filter((row): row is ScreenerRow => row !== null);
  if (rows.length < 2) return [];
  const out: Difference[] = [];

  const size = extremes(known(rows, "market_cap").filter((item) => item.value > 0));
  if (size && size.top.value / size.bottom.value >= 1.5) {
    const ratio = size.top.value / size.bottom.value;
    out.push({
      topic: "Size",
      text: `${size.top.symbol} is worth ${money(size.top.value)}, ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} times ${size.bottom.symbol} at ${money(size.bottom.value)}.`,
    });
  }

  const growth = extremes(known(rows, "rev_growth"));
  if (growth && growth.top.value - growth.bottom.value >= 3) {
    out.push({
      topic: "Growth",
      text:
        growth.bottom.value < 0
          ? `${growth.top.symbol} grew revenue ${fmt("rev_growth", growth.top.value)} over the last year while ${growth.bottom.symbol}'s revenue shrank ${fmt("rev_growth", Math.abs(growth.bottom.value)).replace("+", "")}.`
          : `${growth.top.symbol} is growing revenue fastest, ${fmt("rev_growth", growth.top.value)} over the last year against ${fmt("rev_growth", growth.bottom.value)} for ${growth.bottom.symbol}.`,
    });
  }

  const forward = extremes(known(rows, "fwd_pe").filter((item) => item.value > 0));
  const trailing = extremes(known(rows, "pe").filter((item) => item.value > 0));
  const multiple = forward ? { ...forward, id: "fwd_pe", name: "next year's expected earnings" } : trailing ? { ...trailing, id: "pe", name: "the last 12 months of earnings" } : null;
  if (multiple && multiple.top.value / multiple.bottom.value >= 1.15) {
    out.push({
      topic: "Price",
      // "15.4x" said as what you pay for each dollar of profit.
      text: `For each $1 of ${multiple.name}, you pay about $${multiple.bottom.value.toFixed(0)} for ${multiple.bottom.symbol} and $${multiple.top.value.toFixed(0)} for ${multiple.top.symbol}.`,
    });
  }

  const margin = extremes(known(rows, "op_margin"));
  if (margin && margin.top.value - margin.bottom.value >= 3) {
    out.push({
      topic: "Profit",
      text:
        margin.bottom.value < 0
          ? `${margin.top.symbol} keeps ${Math.round(margin.top.value)} cents of each sales dollar as operating profit; ${margin.bottom.symbol} loses money running its business (${fmt("op_margin", margin.bottom.value)}).`
          : `${margin.top.symbol} keeps ${Math.round(margin.top.value)} cents of each sales dollar as operating profit; ${margin.bottom.symbol} keeps ${Math.round(margin.bottom.value)} cents.`,
    });
  }

  const cash = extremes(known(rows, "net_cash"));
  if (cash && cash.top.value > 0 && cash.bottom.value < 0) {
    out.push({
      topic: "Balance sheet",
      text: `${cash.top.symbol} holds ${money(cash.top.value)} more cash than debt; ${cash.bottom.symbol} owes ${money(cash.bottom.value)} more than it holds.`,
    });
  } else {
    const leverage = extremes(known(rows, "debt_equity").filter((item) => item.value >= 0));
    if (leverage && leverage.top.value - leverage.bottom.value >= 0.3) {
      out.push({
        topic: "Balance sheet",
        text: `${leverage.top.symbol} carries the most debt against its equity (${fmt("debt_equity", leverage.top.value)}); ${leverage.bottom.symbol} the least (${fmt("debt_equity", leverage.bottom.value)}).`,
      });
    }
  }

  const year = extremes(known(rows, "ret_1y"));
  if (year && year.top.value - year.bottom.value >= 5) {
    const bottom = year.bottom.value < 0 ? `is down ${fmt("ret_1y", Math.abs(year.bottom.value)).replace("+", "")}` : `is up ${fmt("ret_1y", year.bottom.value).replace("+", "")}`;
    const top = year.top.value < 0 ? `is down ${fmt("ret_1y", Math.abs(year.top.value)).replace("+", "")}` : `is up ${fmt("ret_1y", year.top.value).replace("+", "")}`;
    out.push({ topic: "The last year", text: `${year.top.symbol} ${top} over the last year; ${year.bottom.symbol} ${bottom}.` });
  }

  const swing = extremes(known(rows, "vol_90d"));
  if (swing && swing.top.value - swing.bottom.value >= 5) {
    out.push({
      topic: "Risk",
      text: `${swing.top.symbol}'s price jumps around more: over the last 90 trading days its swings ran at ${fmt("vol_90d", swing.top.value)} a year, against ${fmt("vol_90d", swing.bottom.value)} for ${swing.bottom.symbol}.`,
    });
  }

  const target = extremes(known(rows, "upside"));
  if (target && target.top.value - target.bottom.value >= 5) {
    // How far the analysts' target sits from today's price, said from the price's side: "81% above".
    const upside = (value: number) => (value >= 0 ? `${fmt("upside", value).replace("+", "")} above` : `${fmt("upside", Math.abs(value)).replace("+", "").replace("−", "")} below`);
    out.push({
      topic: "Analysts",
      text: `Analysts' average price target is ${upside(target.top.value)} ${target.top.symbol}'s price and ${upside(target.bottom.value)} ${target.bottom.symbol}'s.`,
    });
  }

  return out.slice(0, 7);
}
