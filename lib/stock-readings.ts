/**
 * Plain-sentence readings of a company's numbers for the stock page.
 *
 * Every sentence here is assembled by code from reported figures. No language
 * model writes or rounds these, so a sentence can never drift from the number
 * printed beside it. When an input is missing the reading is null and the page
 * shows nothing.
 */

import type { StockFacts } from "@/lib/stock";
import { rsiWord, toneFor } from "@/lib/tone";

export type ReadingTone = "good" | "bad" | "neutral";
/**
 * `verdict` is the one or two words a reader needs to know whether the sentence
 * is good or bad for the company ("Growing", "Thin margin"). The page shows it
 * as a coloured chip beside the sentence.
 */
export type Reading = { statement: string; tone: ReadingTone; verdict: string };

type HistoryRow = NonNullable<StockFacts["financial_history"]>[number];

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function compactMoney(value: number, currency = "$"): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${currency}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** 83.38 to "83%", 8.4 to "8.4%". One decimal only where it carries information. */
export function roundPct(value: number): string {
  const abs = Math.abs(value);
  return `${abs >= 20 ? Math.round(abs) : abs.toFixed(1).replace(/\.0$/, "")}%`;
}

function cents(marginPct: number): string {
  const n = Math.round(Math.abs(marginPct));
  return `${n} ${n === 1 ? "cent" : "cents"}`;
}

/** `financial_history` arrives newest first with "TTM" at the head. */
export function chronologicalHistory(history: StockFacts["financial_history"]): HistoryRow[] {
  return [...(history ?? [])].reverse();
}

function periodLabel(period: string): string {
  return period === "TTM" ? "the last twelve months" : period;
}

export function growthReading(facts: StockFacts | null | undefined, currency = "$"): Reading | null {
  const growth = facts?.financials?.revenue_growth_yoy_pct;
  const revenue = facts?.financials?.revenue;
  const period = facts?.financials?.fiscal_year || "TTM";
  if (fin(growth) && fin(revenue)) {
    const size = `${compactMoney(revenue, currency)} in ${periodLabel(period)}`;
    if (growth >= 0.5) {
      return {
        statement: `Revenue grew ${roundPct(growth)} from a year earlier, to ${size}.`,
        tone: growth >= 8 ? "good" : "neutral",
        verdict: growth >= 20 ? "Fast growth" : growth >= 8 ? "Growing" : "Slow growth",
      };
    }
    // Strictly under -0.5, the same edge as THRESHOLDS.revenueGrowth, so the chip and the mark beside the figure agree.
    if (growth < -0.5) return { statement: `Revenue fell ${roundPct(growth)} from a year earlier, to ${size}.`, tone: "bad", verdict: "Shrinking" };
    return { statement: `Revenue was flat from a year earlier, at ${size}.`, tone: "neutral", verdict: "Flat" };
  }
  const rows = chronologicalHistory(facts?.financial_history).filter((row) => fin(row.revenue));
  if (rows.length >= 2) {
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    if (first.revenue! > 0) {
      const change = ((last.revenue! - first.revenue!) / first.revenue!) * 100;
      const verb = change >= 0 ? "grew" : "fell";
      return {
        statement: `Revenue ${verb} ${roundPct(change)} between ${first.period} and ${periodLabel(last.period)}, to ${compactMoney(last.revenue!, currency)}.`,
        tone: change >= 0 ? "good" : "bad",
        verdict: change >= 0 ? "Growing" : "Shrinking",
      };
    }
  }
  return null;
}

export function marginReading(facts: StockFacts | null | undefined): Reading | null {
  const rows = chronologicalHistory(facts?.financial_history).filter((row) => fin(row.operating_margin_pct));
  const last = rows[rows.length - 1];
  if (!last) return null;
  const now = last.operating_margin_pct!;
  // Compare against the oldest year we have, as long as it is a different period.
  const base = rows.length >= 3 ? rows[0]! : null;
  const baseText =
    base && fin(base.operating_margin_pct) && Math.abs(base.operating_margin_pct - now) >= 2
      ? `, ${now > base.operating_margin_pct ? "up" : "down"} from ${base.operating_margin_pct < 0 ? "a loss of " : ""}${cents(base.operating_margin_pct)} in ${base.period}`
      : "";
  if (now >= 0) {
    return {
      statement: `It keeps ${cents(now)} of every revenue dollar as operating profit${baseText}.`,
      tone: now >= 15 ? "good" : "neutral",
      verdict: now >= 25 ? "High margin" : now >= 15 ? "Healthy margin" : now >= 5 ? "Modest margin" : "Thin margin",
    };
  }
  return {
    statement: `It loses ${cents(now)} on every revenue dollar at the operating line${baseText}.`,
    tone: "bad",
    verdict: "Losing money",
  };
}

export function balanceReading(facts: StockFacts | null | undefined, currency = "$"): Reading | null {
  const cash = facts?.balance?.cash_and_investments;
  const debt = facts?.balance?.total_debt;
  if (!fin(cash) || !fin(debt)) return null;
  const net = fin(facts?.balance?.net_cash) ? facts!.balance!.net_cash! : cash - debt;
  if (debt <= 0) {
    return { statement: `It holds ${compactMoney(cash, currency)} in cash and investments and carries no debt.`, tone: "good", verdict: "No debt" };
  }
  if (net >= 0) {
    return {
      statement: `It holds ${compactMoney(cash, currency)} in cash and investments against ${compactMoney(debt, currency)} of debt, which leaves ${compactMoney(net, currency)} of net cash.`,
      tone: "good",
      verdict: "Net cash",
    };
  }
  // Net debt far above cash reads heavy, unless debt to equity (shown in Key figures on the same page) says the
  // balance sheet carries it comfortably: Walmart's 0.72 should not sit under a red "Heavy debt" chip.
  const debtToEquity = toneFor("debtToEquity", facts?.quality?.debt_to_equity);
  const heavy = Math.abs(net) > cash * 3 && (debtToEquity === null || debtToEquity === "down");
  return {
    statement: `It owes ${compactMoney(debt, currency)} and holds ${compactMoney(cash, currency)} in cash and investments, so net debt is ${compactMoney(Math.abs(net), currency)}.`,
    tone: heavy ? "bad" : "neutral",
    verdict: heavy ? "Heavy debt" : "Some debt",
  };
}

export function cashFlowReading(facts: StockFacts | null | undefined, currency = "$"): Reading | null {
  const rows = chronologicalHistory(facts?.financial_history).filter((row) => fin(row.free_cash_flow));
  const last = rows[rows.length - 1];
  if (!last) return null;
  const fcf = last.free_cash_flow!;
  const when = periodLabel(last.period);
  if (fcf < 0) {
    return { statement: `It burned ${compactMoney(Math.abs(fcf), currency)} of free cash in ${when}.`, tone: "bad", verdict: "Burning cash" };
  }
  if (fin(last.revenue) && last.revenue > 0) {
    const share = (fcf / last.revenue) * 100;
    return {
      statement: `It turned ${roundPct(share)} of revenue into free cash flow: ${compactMoney(fcf, currency)} in ${when}.`,
      tone: share >= 10 ? "good" : "neutral",
      verdict: share >= 20 ? "Strong cash" : share >= 10 ? "Good cash" : "Little cash",
    };
  }
  return { statement: `It generated ${compactMoney(fcf, currency)} of free cash flow in ${when}.`, tone: "good", verdict: "Makes cash" };
}

/**
 * Return on equity, the profit measure that works for a bank or an insurer. Used in place
 * of the cash-flow and net-cash readings for them (lib/financial-company.ts).
 */
export function returnOnEquityReading(facts: StockFacts | null | undefined): Reading | null {
  const roe = facts?.quality?.roe_pct;
  if (!fin(roe)) return null;
  if (roe < 0) return { statement: `It lost ${roundPct(roe)} of shareholders' equity over the last twelve months.`, tone: "bad", verdict: "Losing money" };
  return {
    statement: `It earned ${roundPct(roe)} on shareholders' equity over the last twelve months.`,
    // The same edges as THRESHOLDS.roe in lib/tone, so this chip and the mark in Key figures agree.
    tone: roe >= 15 ? "good" : "neutral",
    verdict: roe >= 15 ? "High return" : roe >= 8 ? "Fair return" : "Low return",
  };
}

/** The dividend and how much of profit it takes. Null without both the dividend and the payout ratio. */
export function payoutReading(facts: StockFacts | null | undefined, currency = "$"): Reading | null {
  const dividend = facts?.dividends?.annual_dividend;
  const payout = facts?.dividends?.payout_ratio_pct;
  if (!fin(dividend) || dividend <= 0 || !fin(payout) || payout <= 0) return null;
  const years = facts?.dividends?.growth_years;
  const raised = fin(years) && years >= 2 ? `, and it has raised it ${Math.round(years)} years in a row` : "";
  return {
    statement: `It pays ${currency}${dividend.toFixed(2)} a share in dividends, ${roundPct(payout)} of its earnings${raised}.`,
    tone: payout > 90 ? "bad" : payout <= 60 ? "good" : "neutral",
    verdict: payout > 90 ? "Stretched payout" : payout <= 60 ? "Covered payout" : "High payout",
  };
}

/**
 * The readings under "In plain numbers". For a bank, insurer or lender (`balanceSheet`), free
 * cash flow and cash minus debt mislead, so return on equity and the payout take their place.
 */
export function overviewReadings(facts: StockFacts | null | undefined, currency = "$", balanceSheet = false): Array<Reading | null> {
  if (balanceSheet) return [growthReading(facts, currency), returnOnEquityReading(facts), payoutReading(facts, currency)];
  return [growthReading(facts, currency), marginReading(facts), cashFlowReading(facts, currency), balanceReading(facts, currency)];
}

/** The section headline: the two readings that say the most, in one sentence. */
export function businessHeadline(facts: StockFacts | null | undefined, balanceSheet = false): string | null {
  const growth = facts?.financials?.revenue_growth_yoy_pct;
  const rows = chronologicalHistory(facts?.financial_history);
  const margin = balanceSheet ? undefined : [...rows].reverse().find((row) => fin(row.operating_margin_pct))?.operating_margin_pct;
  // A bank's free cash flow moves with its loan book; its return on equity says how profitable it is.
  const fcfRow = balanceSheet ? undefined : [...rows].reverse().find((row) => fin(row.free_cash_flow));
  const roe = balanceSheet ? facts?.quality?.roe_pct : undefined;

  const growthPart = fin(growth)
    ? growth >= 0.5
      ? `Revenue is up ${roundPct(growth)} in a year`
      : growth <= -0.5
        ? `Revenue is down ${roundPct(growth)} in a year`
        : "Revenue is flat on a year ago"
    : null;
  const marginPart = fin(margin)
    ? margin >= 0
      ? `${cents(margin)} of every dollar becomes operating profit`
      : `it loses ${cents(margin)} on every dollar of sales`
    : null;
  const cashPart = fcfRow && fin(fcfRow.free_cash_flow)
    ? fcfRow.free_cash_flow >= 0
      ? "it produces free cash"
      : "it is burning cash"
    : fin(roe)
      ? roe >= 0
        ? `it earns ${roundPct(roe)} on its equity`
        : `it lost ${roundPct(roe)} of its equity`
      : null;

  if (growthPart && marginPart) {
    const sameDirection = (growth! >= 0.5 && margin! >= 0) || (growth! <= -0.5 && margin! < 0);
    return `${growthPart}, ${sameDirection ? "and" : "but"} ${marginPart}.`;
  }
  if (growthPart && cashPart) return `${growthPart}, and ${cashPart}.`;
  if (growthPart) return `${growthPart}.`;
  if (marginPart) return `${marginPart.charAt(0).toUpperCase()}${marginPart.slice(1)}.`;
  return null;
}

export function valuationHeadline(input: {
  ticker: string;
  price: number;
  pe?: number | null;
  forwardPe?: number | null;
  priceToSales?: number | null;
  sectorPe?: number | null;
  targetMid?: number | null;
}): string | null {
  const { ticker, price } = input;
  let first: string | null = null;
  if (fin(input.pe) && input.pe > 0) {
    first = `${ticker} trades at ${input.pe.toFixed(1)} times earnings`;
    if (fin(input.sectorPe) && input.sectorPe > 0) {
      const gap = ((input.pe - input.sectorPe) / input.sectorPe) * 100;
      if (Math.abs(gap) < 5) first += ", in line with its sector";
      else first += `, ${roundPct(gap)} ${gap > 0 ? "above" : "below"} its sector average`;
    }
  } else if (fin(input.forwardPe) && input.forwardPe > 0) {
    first = `${ticker} has no trailing profit to price against and trades at ${input.forwardPe.toFixed(1)} times next year's expected earnings`;
  } else if (fin(input.priceToSales) && input.priceToSales > 0) {
    first = `${ticker} has no earnings to price against and trades at ${input.priceToSales.toFixed(1)} times sales`;
  }

  let second: string | null = null;
  if (fin(input.targetMid) && input.targetMid > 0 && price > 0) {
    const gap = ((input.targetMid - price) / price) * 100;
    second =
      Math.abs(gap) < 2
        ? "the middle analyst target sits at today's price"
        : `the middle analyst target sits ${roundPct(gap)} ${gap > 0 ? "above" : "below"} today's price`;
  }

  if (first && second) return `${first}, and ${second}.`;
  if (first) return `${first}.`;
  if (second) return `For ${ticker}, ${second}.`;
  return null;
}

export function ownershipHeadline(input: {
  ticker: string;
  institutionalPct?: number | null;
  congressBuys: number;
  congressSells: number;
  congressOther: number;
  windowDays: number;
  /** False when the congressional feed does not apply (non-US). */
  hasCongressFeed: boolean;
}): string | null {
  const parts: string[] = [];
  if (fin(input.institutionalPct) && input.institutionalPct > 0) {
    parts.push(`Institutions hold ${roundPct(input.institutionalPct)} of ${input.ticker}.`);
  }
  if (input.hasCongressFeed) {
    const total = input.congressBuys + input.congressSells + input.congressOther;
    if (total === 0) {
      parts.push(`No member of Congress has disclosed a trade in it in the last ${input.windowDays} days.`);
    } else {
      const bits: string[] = [];
      if (input.congressBuys) bits.push(`${input.congressBuys} ${input.congressBuys === 1 ? "buy" : "buys"}`);
      if (input.congressSells) bits.push(`${input.congressSells} ${input.congressSells === 1 ? "sale" : "sales"}`);
      if (input.congressOther) bits.push(`${input.congressOther} other ${input.congressOther === 1 ? "trade" : "trades"}`);
      parts.push(`Congress disclosed ${bits.join(" and ")} in the last ${input.windowDays} days.`);
    }
  }
  return parts.length ? parts.join(" ") : null;
}

// ─── Technicals ──────────────────────────────────────────────────────────────

type TechnicalsInput = {
  rsi_14?: { value?: number; state?: string };
  moving_averages?: { sma_20?: number | null; sma_50?: number | null; sma_200?: number | null; ema_20_slope_state?: string };
  distance?: { from_52w_high_pct?: number | null; from_52w_low_pct?: number | null };
};

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Where the price sits against its moving averages, as one sentence. */
export function trendReading(price: number, technicals: TechnicalsInput | null | undefined): Reading | null {
  const averages = technicals?.moving_averages;
  if (!fin(price) || price <= 0 || !averages) return null;
  const rows = [
    { label: "20-day", value: averages.sma_20 },
    { label: "50-day", value: averages.sma_50 },
    { label: "200-day", value: averages.sma_200 },
  ].filter((row): row is { label: string; value: number } => fin(row.value) && row.value > 0);
  if (!rows.length) return null;
  const above = rows.filter((row) => price >= row.value).map((row) => row.label);
  const below = rows.filter((row) => price < row.value).map((row) => row.label);
  if (!below.length) {
    return { statement: `The price is above its ${listWords(above)} ${above.length === 1 ? "average" : "averages"}.`, tone: "good", verdict: "Uptrend" };
  }
  if (!above.length) {
    return { statement: `The price is below its ${listWords(below)} ${below.length === 1 ? "average" : "averages"}.`, tone: "bad", verdict: "Downtrend" };
  }
  return {
    statement: `The price is above its ${listWords(above)} ${above.length === 1 ? "average" : "averages"} and below its ${listWords(below)}.`,
    tone: "neutral",
    verdict: "Mixed trend",
  };
}

/** RSI in words. 70 and 30 are the conventional lines. */
export function rsiReading(technicals: TechnicalsInput | null | undefined): Reading | null {
  const value = technicals?.rsi_14?.value;
  if (!fin(value) || value < 0 || value > 100) return null;
  const figure = value.toFixed(0);
  // The word comes from lib/tone so Ask cards and this page call the same RSI the same thing.
  const verdict = rsiWord(value)?.word ?? "Normal";
  if (value >= 70) return { statement: `RSI is ${figure}, above the 70 line that traders read as overbought.`, tone: "neutral", verdict };
  if (value <= 30) return { statement: `RSI is ${figure}, under the 30 line that traders read as oversold.`, tone: "neutral", verdict };
  return { statement: `RSI is ${figure}, inside the 30 to 70 band, so momentum is neither stretched nor washed out.`, tone: "neutral", verdict };
}

/** Distance from the 52-week high and low. */
export function rangeReading(technicals: TechnicalsInput | null | undefined): Reading | null {
  const high = technicals?.distance?.from_52w_high_pct;
  const low = technicals?.distance?.from_52w_low_pct;
  if (!fin(high) || !fin(low)) return null;
  const down = Math.abs(high);
  if (down < 0.5) return { statement: `It is at its 52-week high, ${roundPct(low)} above the low.`, tone: "good", verdict: "At the high" };
  return {
    statement: `It is ${roundPct(down)} below its 52-week high and ${roundPct(low)} above the low.`,
    tone: down >= 30 ? "bad" : "neutral",
    verdict: down >= 30 ? "Far off the high" : down <= 10 ? "Near the high" : "Off the high",
  };
}

// ─── Valuation table ─────────────────────────────────────────────────────────

export type ValuationRow = {
  key: string;
  label: string;
  value: number;
  /** Sector average when the scoring pipeline stored one. */
  sector: number | null;
  /** How far above (+) or below (−) the sector, in percent. */
  gapPct: number | null;
};

type ValuationMetric = { label?: string; value?: number | null; benchmark?: number | null; benchmark_label?: string };

/** A scored metric that carries a sector average. The pair comes from one snapshot, so they are compared as stored. */
function sectorPair(metrics: ValuationMetric[] | null | undefined, label: string): { value: number; sector: number } | null {
  const metric = (metrics ?? []).find((item) => String(item.label ?? "").toLowerCase() === label.toLowerCase());
  if (!metric || !fin(metric.benchmark) || metric.benchmark <= 0 || !fin(metric.value) || metric.value <= 0) return null;
  return /sector/i.test(String(metric.benchmark_label ?? "")) ? { value: metric.value, sector: metric.benchmark } : null;
}

/** The multiples we store, each next to its sector average when one exists. Missing multiples are left out. */
export function valuationRows(input: {
  pe?: number | null;
  forwardPe?: number | null;
  priceToSales?: number | null;
  priceToFcf?: number | null;
  evToEbitda?: number | null;
  sectorMetrics?: ValuationMetric[] | null;
}): ValuationRow[] {
  const candidates: Array<{ key: string; label: string; value: number | null | undefined; sectorLabel?: string }> = [
    { key: "pe", label: "P/E (trailing)", value: input.pe, sectorLabel: "P/E TTM" },
    { key: "fpe", label: "P/E (forward)", value: input.forwardPe, sectorLabel: "Forward P/E" },
    { key: "ps", label: "Price / sales", value: input.priceToSales },
    { key: "pfcf", label: "Price / free cash flow", value: input.priceToFcf },
    { key: "ev", label: "EV / EBITDA", value: input.evToEbitda },
  ];
  const rows: ValuationRow[] = [];
  for (const item of candidates) {
    const pair = item.sectorLabel ? sectorPair(input.sectorMetrics, item.sectorLabel) : null;
    const value = pair?.value ?? item.value;
    if (!fin(value) || value <= 0) continue;
    rows.push({
      key: item.key,
      label: item.label,
      value,
      sector: pair?.sector ?? null,
      gapPct: pair ? ((pair.value - pair.sector) / pair.sector) * 100 : null,
    });
  }
  return rows;
}
