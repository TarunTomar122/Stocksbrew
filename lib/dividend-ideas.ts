/**
 * "For more dividend income" on /portfolio/dividends: pure functions, safe on both sides.
 *
 * Research, not advice. Every idea passes one stated rule built from stored
 * fields (the screening snapshot's yield inputs, payout ratio, years of
 * raises and our call; `tm_dividend_history` for the payment calendar), and
 * the person's own plan decides which months need filling. Nothing is bought,
 * sold or written.
 */

import type { CallWord } from "@/lib/stock-chart";

import {
  AT_RISK_PAYOUT,
  DEFAULT_PAY_LAG_DAYS,
  addDays,
  fmtDollars,
  fmtPerShare,
  fmtPlanDay,
  joinNames,
  monthName,
  monthShort,
  planMonths,
  type DividendHistory,
  type DividendPlan,
  type PlannedPayment,
  type StockPlan,
} from "@/lib/dividend-plan";

/* ── the rule ───────────────────────────────────────────────────────────── */

export const IDEA_RULE = {
  minYield: 2.5,
  maxYield: 7,
  maxPayout: 75,
  minRaiseYears: 10,
} as const;

/** At most this many names to fill the person's empty months, and at least this many when there are enough. */
export const FILL_MAX = 6;
export const FILL_MIN = 3;
/** A month counts as quiet when it brings in less than this share of an average month. */
const QUIET_SHARE = 0.4;
/** A default amount for "what it would add". */
export const DEFAULT_AMOUNT = 1000;

/** The rule in one sentence, as the page says it. */
export const RULE_SENTENCE =
  `Every stock here yields ${IDEA_RULE.minYield}% to ${IDEA_RULE.maxYield}% at the latest close, pays out less than ${IDEA_RULE.maxPayout}% of its profit as dividends, ` +
  `has raised its dividend at least ${IDEA_RULE.minRaiseYears} years in a row, and is one we would not sell. ` +
  `Property trusts have to pay out most of their income by law, so they skip the payout test.`;

/* ── types ──────────────────────────────────────────────────────────────── */

/** One stock that passes the rule, before the person's plan is known. Plain JSON, so it can be cached. */
export type IdeaStock = {
  ticker: string;
  /** Short company name, or the ticker when the snapshot has none. */
  name: string;
  realEstate: boolean;
  /** Last close from the screening snapshot. */
  price: number;
  /** The regular dividend over a year at its current rate (latest amount x payments a year), per share. */
  annualPerShare: number;
  /** annualPerShare / price, percent. */
  yieldPct: number;
  /** Share of profit paid out, percent; null for a property trust whose number is not shown. */
  payout: number | null;
  raiseYears: number;
  call: CallWord;
  /** Our company reason, only when it was written for the call shown. */
  callReason: string | null;
  /** "YYYY-MM" months in the plan's twelve-month window when it should pay, in window order. */
  payMonths: string[];
};

/** The facts the rule reads, from the snapshot row and the dividend history. */
export type IdeaInput = {
  ticker: string;
  name: string;
  sector: string | null;
  price: number | null;
  /** Payments a year on the stock's own cadence (history `per_year`), null when irregular. */
  perYear: number | null;
  /** Latest regular payment per share. */
  latestAmount: number | null;
  /** The regular payment a year earlier, to catch a cut the snapshot has not seen. */
  yearAgoAmount: number | null;
  payout: number | null;
  raiseYears: number | null;
  call: CallWord | null;
  callReason: string | null;
  payMonths: string[];
};

export type DividendIdeas = {
  /** Months the person's holdings leave empty, or the quietest ones when none is empty. */
  target: { kind: "empty" | "quiet"; months: string[] } | null;
  /** Names that pay in the target months, each with the target months it covers. */
  fill: Array<IdeaStock & { fills: string[] }>;
  /** Target months none of the fill names covers. */
  unfilled: string[];
  /** Everything else that passes the rule, highest yield first. */
  steady: IdeaStock[];
  /** How many stocks passed the rule before the person's holdings were taken out. */
  passed: number;
  /** A line about the person's own payers that cut or might cut, or null. */
  watch: string | null;
};

/* ── helpers ────────────────────────────────────────────────────────────── */

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Same test the planner uses for its payout warning. */
export function isRealEstate(sector: string | null | undefined): boolean {
  return typeof sector === "string" && /real estate|reit/i.test(sector);
}

/** Calendar order (Jan first), so a recurring pattern reads "Mar, Jun, Sep and Dec". */
function byCalendar(months: string[]): string[] {
  return [...new Set(months)].sort((a, b) => a.slice(5, 7).localeCompare(b.slice(5, 7)) || a.localeCompare(b));
}

/** "Mar, Jun, Sep and Dec" (a yearly pattern, so calendar order), or "every month" for twelve. */
export function payMonthsWords(months: string[]): string {
  const unique = byCalendar(months);
  if (new Set(unique.map((m) => m.slice(5, 7))).size >= 12) return "every month";
  return joinNames(unique.map(monthShort));
}

/** "November, February and May" in the order given (the plan's window order, as the chart reads). */
export function monthNamesWords(months: string[]): string {
  return joinNames([...new Set(months)].map(monthName));
}

/**
 * The months a stock pays in, as a yearly pattern placed in the plan's window:
 * the window's own payments, plus the month each of the past year's regular
 * payments landed in. A payment whose ex-date has already passed this month
 * still marks the month, since it comes round again next year; and an expected
 * payment the planner skipped does not leave a hole in the pattern.
 */
export function yearlyPayMonths(payments: PlannedPayment[], history: DividendHistory | null, today: string): string[] {
  const keys = planMonths(today);
  const byMonthOfYear = new Map(keys.map((key) => [key.slice(5, 7), key]));
  const found = new Set<string>();
  for (const payment of payments) if (!payment.special) found.add(payment.payDate.slice(0, 7));
  // Only to fill gaps: a stock already showing as many months as it pays a year needs nothing added.
  const perYear = Math.min(12, Math.round(history?.perYear ?? 0));
  if (found.size < perYear) {
    const lag = history?.payLagDays != null && history.payLagDays >= 0 ? history.payLagDays : DEFAULT_PAY_LAG_DAYS;
    const yearAgo = addDays(today, -365);
    const index = (key: string) => Number(key.slice(5, 7));
    for (const payment of history?.payments ?? []) {
      if (found.size >= perYear) break;
      if (payment.special || payment.exDate < yearAgo || payment.exDate > today) continue;
      const key = byMonthOfYear.get(addDays(payment.exDate, lag).slice(5, 7));
      if (!key || found.has(key)) continue;
      // A month next to one already found is most likely the same payment landing a few days either side of a month end.
      const near = perYear < 12 && [...found].some((other) => [1, 11].includes((index(key) - index(other) + 12) % 12));
      if (!near) found.add(key);
    }
  }
  return keys.filter((key) => found.has(key));
}

/** "4.19%" -> "4.2%". */
export function fmtYield(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Dollars a year from `amount` put in the stock at today's price. Fractional shares, regular dividend only. */
export function addedIncome(stock: Pick<IdeaStock, "annualPerShare" | "price">, amount: number): number | null {
  if (!fin(amount) || amount <= 0 || !(stock.price > 0) || !(stock.annualPerShare > 0)) return null;
  return (amount / stock.price) * stock.annualPerShare;
}

/** "It yields 4.2% at its current rate, has raised its dividend 54 years in a row and pays out 74% of its profit." */
export function factsSentence(stock: IdeaStock): string {
  const years = `has raised its dividend ${stock.raiseYears} years in a row`;
  // "At its current rate": the latest payment times its payments a year, which can differ from a trailing yield.
  const yields = `It yields ${fmtYield(stock.yieldPct)} at its current rate`;
  if (stock.realEstate || stock.payout == null) {
    return `${yields} and ${years}. As a property trust, it has to pay out most of its income.`;
  }
  // Rounded down, so 74.6% never reads as 75% under a rule of "less than 75%".
  return `${yields}, ${years} and pays out ${Math.floor(stock.payout)}% of its profit.`;
}

/** "Putting $1,000 in Coca-Cola would add about $26 a year, paid in Apr, Jul, Oct and Dec." */
export function addSentence(stock: Pick<IdeaStock, "name" | "price" | "annualPerShare" | "payMonths">, amount: number): string | null {
  const added = addedIncome(stock, amount);
  if (added == null) return null;
  const words = stock.payMonths.length ? payMonthsWords(stock.payMonths) : "";
  const paid = !words ? "" : words === "every month" ? ", paid every month" : `, paid in ${words}`;
  return `Putting ${fmtAmount(amount)} in ${stock.name} would add about ${fmtDollars(added)} a year${paid}.`;
}

/** "$1,000", "$2,500", "$250": whole dollars as typed, never rounded to tens. */
export function fmtAmount(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** The amount a person typed: digits, commas, a dollar sign. Null when it is not a usable amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  // Whole dollars, so the amount shown and the amount worked out on are the same.
  const value = Math.round(Number(cleaned));
  return value >= 1 && value <= 100_000_000 ? value : null;
}

/* ── the rule, per stock ────────────────────────────────────────────────── */

/** The stock as an idea when it passes the rule, else null. */
export function passesRule(input: IdeaInput): IdeaStock | null {
  if (input.call !== "Add" && input.call !== "Hold") return null;
  if (!fin(input.price) || input.price <= 0) return null;
  if (!fin(input.perYear) || input.perYear <= 0 || !fin(input.latestAmount) || input.latestAmount <= 0) return null;
  // A cut over the past year, even if the snapshot's streak has not caught up.
  if (fin(input.yearAgoAmount) && input.yearAgoAmount > 0 && input.latestAmount < input.yearAgoAmount * 0.95) return null;
  if (!fin(input.raiseYears) || input.raiseYears < IDEA_RULE.minRaiseYears) return null;
  const realEstate = isRealEstate(input.sector);
  if (!realEstate && (!fin(input.payout) || input.payout <= 0 || input.payout >= IDEA_RULE.maxPayout)) return null;
  const annualPerShare = input.latestAmount * input.perYear;
  const yieldPct = (annualPerShare / input.price) * 100;
  if (yieldPct < IDEA_RULE.minYield || yieldPct > IDEA_RULE.maxYield) return null;
  if (input.payMonths.length === 0) return null;
  return {
    ticker: input.ticker,
    name: input.name || input.ticker,
    realEstate,
    price: input.price,
    annualPerShare,
    yieldPct,
    payout: realEstate ? null : input.payout,
    raiseYears: Math.round(input.raiseYears),
    call: input.call,
    callReason: input.callReason,
    payMonths: input.payMonths,
  };
}

/** Highest yield first; more years of raises breaks a tie. */
export function rankIdeas(stocks: IdeaStock[]): IdeaStock[] {
  return [...stocks].sort((a, b) => b.yieldPct - a.yieldPct || b.raiseYears - a.raiseYears || a.ticker.localeCompare(b.ticker));
}

/* ── the person's plan ──────────────────────────────────────────────────── */

/**
 * The months to fill. Empty means none of the holdings pays then (by payment
 * date, share count or not, so a missing share count is not an empty month).
 * With no empty month, the quiet ones: under 40% of an average month.
 */
export function targetMonths(plan: DividendPlan): DividendIdeas["target"] {
  const keys = plan.months.map((m) => m.month);
  const paying = new Set<string>();
  for (const stock of plan.stocks) for (const payment of stock.payments) paying.add(payment.payDate.slice(0, 7));
  const empty = keys.filter((month) => !paying.has(month));
  if (empty.length > 0) return { kind: "empty", months: empty };
  if (plan.total <= 0) return null;
  const average = plan.total / 12;
  const quiet = plan.months.filter((m) => m.total < average * QUIET_SHARE).map((m) => m.month);
  // A quiet stretch that is most of the year is not "the quiet months".
  return quiet.length > 0 && quiet.length <= 6 ? { kind: "quiet", months: quiet } : null;
}

/**
 * Up to six names that pay in the target months: each pick covers the most
 * months still uncovered (higher yield breaks a tie), then a few more that
 * pay in any target month so there are at least three to look at.
 */
export function pickFill(target: string[], pool: IdeaStock[]): { fill: Array<IdeaStock & { fills: string[] }>; unfilled: string[] } {
  const ranked = rankIdeas(pool);
  const wanted = new Set(target);
  const uncovered = new Set(target);
  const picks: Array<IdeaStock & { fills: string[] }> = [];
  const used = new Set<string>();
  while (uncovered.size > 0 && picks.length < FILL_MAX) {
    let best: IdeaStock | null = null;
    let bestCount = 0;
    for (const stock of ranked) {
      if (used.has(stock.ticker)) continue;
      const count = stock.payMonths.filter((m) => uncovered.has(m)).length;
      if (count > bestCount) {
        best = stock;
        bestCount = count;
      }
    }
    if (!best) break;
    used.add(best.ticker);
    for (const m of best.payMonths) uncovered.delete(m);
    picks.push({ ...best, fills: best.payMonths.filter((m) => wanted.has(m)) });
  }
  if (picks.length < FILL_MIN) {
    const more = ranked
      .filter((stock) => !used.has(stock.ticker))
      .map((stock) => ({ stock, count: stock.payMonths.filter((m) => wanted.has(m)).length }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || b.stock.yieldPct - a.stock.yieldPct);
    for (const { stock } of more) {
      if (picks.length >= FILL_MIN) break;
      used.add(stock.ticker);
      picks.push({ ...stock, fills: stock.payMonths.filter((m) => wanted.has(m)) });
    }
  }
  return { fill: picks, unfilled: target.filter((m) => uncovered.has(m)) };
}

/** One line on the person's own payers that cut or might cut. Null when there is nothing to say. */
export function watchLine(stocks: StockPlan[], example: boolean): string | null {
  const payers = stocks.filter((s) => s.perShare > 0);
  const stretched = payers.filter((s) => s.payout != null && s.payout > AT_RISK_PAYOUT && s.atRisk);
  const losing = payers.filter((s) => s.payout != null && s.payout < 0 && s.atRisk);
  const cut = payers.filter((s) => s.changePct != null && s.changePct <= -5 && s.latestAmount != null && s.yearAgoAmount != null);
  const parts: string[] = [];
  if (stretched.length === 1) {
    parts.push(`${stretched[0]!.ticker} pays out ${Math.round(stretched[0]!.payout!)}% of its profit, which leaves its dividend little room if profits fall.`);
  } else if (stretched.length > 1) {
    parts.push(`${joinNames(stretched.map((s) => `${s.ticker} (${Math.round(s.payout!)}%)`))} pay out more than ${AT_RISK_PAYOUT}% of their profit, which leaves those dividends little room if profits fall.`);
  }
  if (losing.length > 0) {
    parts.push(`${joinNames(losing.map((s) => s.ticker))} ${losing.length === 1 ? "is" : "are"} paying a dividend while losing money.`);
  }
  const stopped = stocks.filter((s) => s.status === "stopped" && s.lastExDate);
  for (const s of stopped.slice(0, 2)) {
    parts.push(`${s.ticker} has not paid a dividend since ${fmtPlanDay(s.lastExDate!)}, ${s.lastExDate!.slice(0, 4)}.`);
  }
  for (const s of cut.slice(0, 2)) {
    parts.push(`${s.ticker} cut its dividend from ${fmtPerShare(s.yearAgoAmount!)} to ${fmtPerShare(s.latestAmount!)} a share over the past year.`);
  }
  if (parts.length === 0) return null;
  const lead = example ? "In the example portfolio" : "Of the stocks you own";
  return `${lead}, ${parts.join(" ")}`;
}

/** The section for one plan: what to fill, the rest of the list, and the watch line. */
export function buildDividendIdeas(plan: DividendPlan, pool: IdeaStock[], options: { example?: boolean } = {}): DividendIdeas {
  const held = new Set(plan.stocks.map((s) => s.ticker.toUpperCase()));
  const open = pool.filter((stock) => !held.has(stock.ticker.toUpperCase()));
  const target = targetMonths(plan);
  const { fill, unfilled } = target ? pickFill(target.months, open) : { fill: [], unfilled: [] };
  const picked = new Set(fill.map((s) => s.ticker));
  return {
    // Quiet months with nothing to add to them are not worth a line; empty ones always are.
    target: target && (fill.length > 0 || target.kind === "empty") ? target : null,
    fill,
    unfilled,
    steady: rankIdeas(open.filter((s) => !picked.has(s.ticker))),
    passed: pool.length,
    watch: watchLine(plan.stocks, options.example === true),
  };
}

/**
 * The sentence above the fill names. "Nothing is expected in February, May,
 * August and September. These steady payers pay in those months, so with them
 * money would come in every month."
 */
export function fillLead(ideas: DividendIdeas, example: boolean): string | null {
  const target = ideas.target;
  if (!target) return null;
  const one = target.months.length === 1;
  const months = monthNamesWords(target.months);
  if (target.kind === "quiet") {
    return `${months} ${one ? "is" : "are"} ${example ? "the example's" : "your"} ${one ? "quietest month" : "quietest months"}. These steady payers pay in ${one ? "it" : "them"}.`;
  }
  const all = target.months.length === 12;
  const opening = all
    ? `None of ${example ? "the example's stocks" : "your stocks"} has a payment expected in the next twelve months.`
    : `Nothing is expected in ${months}.`;
  if (ideas.fill.length === 0) return `${opening} None of the steady payers below pays in ${one ? "that month" : "those months"}.`;
  const except = ideas.unfilled.length > 0 ? ` except ${monthNamesWords(ideas.unfilled)}` : "";
  if (all) return `${opening} Between them, these steady payers would pay in every month${except}.`;
  return `${opening} These steady payers pay in ${one ? "that month" : "those months"}, so with them money would come in every month${except}.`;
}

/**
 * What a fill row covers, after its "paid in ..." line has already named the months:
 * "That fills all four empty months." or "That fills February and August."
 */
export function fillsSentence(fills: string[], target: { kind: "empty" | "quiet"; months: string[] } | null): string | null {
  if (!target || fills.length === 0) return null;
  const verb = target.kind === "quiet" ? "adds to" : "fills";
  const which = target.kind === "quiet" ? "quiet" : "empty";
  if (fills.length === target.months.length) {
    if (fills.length === 1) return `That ${verb} the one ${which} month.`;
    return `That ${verb} ${fills.length === 2 ? "both" : `all ${countWords(fills.length)}`} ${which} months.`;
  }
  return `That ${verb} ${monthNamesWords(fills)}.`;
}

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function countWords(n: number): string {
  return COUNT[n] ?? String(n);
}
