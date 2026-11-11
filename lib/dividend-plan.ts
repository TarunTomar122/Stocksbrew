/**
 * The dividend planner's model: pure functions, safe on both sides.
 *
 * Inputs, all stored data:
 * - past payments per stock (`tm_dividend_history`, `backend/agentdata/dividend_history.py`):
 *   ex-dates and amounts per share, the cadence, and the usual gap to the pay date;
 * - announced dividends (`tm_agent_calendar`, kind "dividend", from Nasdaq's
 *   calendar): ex-date, pay date and amount;
 * - the payout ratio from the screening snapshot;
 * - the user's share counts and average costs.
 *
 * The plan covers twelve calendar months starting with this one. A payment is
 * "confirmed" when its amount is known: announced on the calendar, or its
 * ex-date has passed (the amount is then on record even if the cash has not
 * arrived). Everything else is an "estimate": the latest regular amount
 * repeated on the stock's own cadence. An estimate is never shown as
 * announced, and a stock we cannot project (no history, an irregular payer, one
 * that stopped) is said so rather than counted as zero.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";

export type DividendFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "irregular" | "none";

export type DividendHistory = {
  symbol: string;
  payments: Array<{ exDate: string; amount: number; special?: boolean }>;
  frequency: DividendFrequency;
  perYear: number | null;
  latestAmount: number | null;
  yearAgoAmount: number | null;
  /** Typical days from ex-date to payment for this stock, when the calendar has shown us any. */
  payLagDays: number | null;
  fetchedAt: string | null;
};

export type AnnouncedDividend = { exDate: string; payDate: string | null; amount: number };

export type PlanHoldingInput = {
  ticker: string;
  name: string;
  shares: number | null;
  avgCost: number | null;
  price: number | null;
  /** null when the history job has no document for the stock. */
  history: DividendHistory | null;
  announced: AnnouncedDividend[];
  /** Share of earnings paid out as dividends, percent. */
  payout: number | null;
  /** Sector from the screening snapshot. Real estate trusts are left out of the payout rule. */
  sector?: string | null;
};

export type PlannedPayment = {
  ticker: string;
  exDate: string;
  payDate: string;
  /** False when the pay date is the ex-date plus the stock's usual gap. */
  payDateKnown: boolean;
  perShare: number;
  /** perShare x shares; null when the share count is unknown. */
  amount: number | null;
  status: "confirmed" | "estimate";
  /** A one-off on top of the regular dividend; never repeated. */
  special: boolean;
  /** Pay date before today. */
  paid: boolean;
};

export type StockStatus = "pays" | "no_dividend" | "stopped" | "irregular" | "no_history";

export type StockPlan = {
  ticker: string;
  name: string;
  shares: number | null;
  status: StockStatus;
  frequency: DividendFrequency;
  payments: PlannedPayment[];
  /** Sum of per-share payments in the window. */
  perShare: number;
  /** The same without specials: what the yields are worked out on. */
  regularPerShare: number;
  /** Dollars in the window; null without a share count, or when we cannot plan the stock. */
  income: number | null;
  confirmedIncome: number | null;
  /** First payment on or after today. */
  next: PlannedPayment | null;
  /** The window's regular per-share dividends against today's price, percent. */
  yieldOnPrice: number | null;
  /** The same against the user's average cost, percent. */
  yieldOnCost: number | null;
  payout: number | null;
  /** Payout above 90% of earnings, or a dividend paid while losing money. Never for real estate trusts. */
  atRisk: boolean;
  /** Change in the regular per-share payment against a year earlier, percent. */
  changePct: number | null;
  latestAmount: number | null;
  yearAgoAmount: number | null;
  lastExDate: string | null;
  /** Past payments on record, so a first-time payer can be told from an irregular one. */
  paymentsOnRecord: number;
};

export type MonthBucket = {
  /** "2026-11" */
  month: string;
  confirmed: number;
  estimated: number;
  total: number;
  /** Tickers paying this month, largest amount first. */
  tickers: string[];
};

export type DividendPlan = {
  today: string;
  months: MonthBucket[];
  stocks: StockPlan[];
  /** Dollars over the twelve months, from holdings with a share count. */
  total: number;
  confirmed: number;
  estimated: number;
  /** Holdings that would pay something but have no share count. */
  missingShares: string[];
  costBasis: number | null;
  marketValue: number | null;
  /** Dollars from holdings that have both a cost and a price, for the two yields. */
  incomeOnCost: number | null;
  /** Newest `fetchedAt` among the histories. */
  asOf: string | null;
};

export const DEFAULT_PAY_LAG_DAYS = 21;
export const AT_RISK_PAYOUT = 90;
/** An announced amount this far above the usual one is a special; it is not repeated. */
const SPECIAL_MULTIPLE = 2.5;
/** Ex-dates this close are the same payment (the calendar and the history both have it). */
const SAME_PAYMENT_DAYS = 5;
/** The history window that can still hold a payment whose cash lands in this month. */
const LOOKBACK_DAYS = 130;

/* ── dates ──────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;

function toTime(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY);
}

/** Same day of month `months` later, clamped to the month's last day (Jan 31 + 1 -> Feb 28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The twelve "YYYY-MM" keys starting with the month `today` is in. */
export function planMonths(today: string): string[] {
  const first = `${today.slice(0, 7)}-01`;
  return Array.from({ length: 12 }, (_, i) => addMonths(first, i).slice(0, 7));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-03" -> "March". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "2026-03" -> "Mar". */
export function monthShort(month: string): string {
  return monthName(month).slice(0, 3);
}

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/* ── one stock ──────────────────────────────────────────────────────────── */

function noPlan(input: PlanHoldingInput, status: StockStatus): StockPlan {
  const history = input.history;
  return {
    ticker: input.ticker,
    name: input.name,
    shares: input.shares,
    status,
    frequency: history?.frequency ?? "none",
    payments: [],
    perShare: 0,
    regularPerShare: 0,
    // Zero only when we know it pays nothing; an unknown is never a zero.
    income: input.shares && status === "no_dividend" ? 0 : null,
    confirmedIncome: input.shares && status === "no_dividend" ? 0 : null,
    next: null,
    yieldOnPrice: null,
    yieldOnCost: null,
    payout: input.payout,
    atRisk: false,
    changePct: null,
    latestAmount: history?.latestAmount ?? null,
    yearAgoAmount: history?.yearAgoAmount ?? null,
    lastExDate: history?.payments.at(-1)?.exDate ?? null,
    paymentsOnRecord: history?.payments.length ?? 0,
  };
}

/** Payment rows for one holding over the plan's months. */
export function planStock(input: PlanHoldingInput, today: string): StockPlan {
  const months = planMonths(today);
  const windowStart = `${months[0]}-01`;
  const windowEnd = addDays(`${addMonths(`${months[11]}-01`, 1)}`, -1);
  const history = input.history;
  const shares = fin(input.shares) && input.shares > 0 ? input.shares : null;
  const lag = history?.payLagDays != null && history.payLagDays >= 0 ? history.payLagDays : DEFAULT_PAY_LAG_DAYS;
  const regular = (history?.payments ?? []).filter((payment) => !payment.special && fin(payment.amount) && payment.amount > 0);
  const usual = history?.latestAmount ?? regular.at(-1)?.amount ?? null;

  const announced = input.announced
    .filter((row) => fin(row.amount) && row.amount > 0 && /^\d{4}-\d{2}-\d{2}/.test(row.exDate))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));

  // Known amounts: the calendar first (it has the pay date), then past ex-dates from the history.
  const known: Array<{ exDate: string; payDate: string; payDateKnown: boolean; perShare: number; special: boolean }> = [];
  for (const row of announced) {
    const special = usual != null && row.amount > usual * SPECIAL_MULTIPLE;
    const payDate = row.payDate && /^\d{4}-\d{2}-\d{2}/.test(row.payDate) ? row.payDate.slice(0, 10) : addDays(row.exDate, lag);
    known.push({ exDate: row.exDate.slice(0, 10), payDate, payDateKnown: Boolean(row.payDate), perShare: row.amount, special });
  }
  const lookback = addDays(windowStart, -LOOKBACK_DAYS);
  for (const payment of history?.payments ?? []) {
    if (payment.exDate < lookback || !(payment.amount > 0)) continue;
    if (known.some((row) => Math.abs(daysBetween(row.exDate, payment.exDate)) <= SAME_PAYMENT_DAYS)) continue;
    known.push({ exDate: payment.exDate, payDate: addDays(payment.exDate, lag), payDateKnown: false, perShare: payment.amount, special: Boolean(payment.special) });
  }

  if (!history && known.length === 0) return noPlan(input, "no_history");

  const payments: PlannedPayment[] = [];
  const row = (
    exDate: string,
    payDate: string,
    payDateKnown: boolean,
    perShare: number,
    status: PlannedPayment["status"],
    special = false,
  ): PlannedPayment => ({
    ticker: input.ticker,
    exDate,
    payDate,
    payDateKnown,
    perShare,
    amount: shares != null ? perShare * shares : null,
    status,
    special,
    paid: payDate < today,
  });
  for (const item of known) {
    if (item.payDate >= windowStart && item.payDate <= windowEnd) {
      payments.push(row(item.exDate, item.payDate, item.payDateKnown, item.perShare, "confirmed", item.special));
    }
  }

  // Estimates: the latest regular amount on the stock's cadence, after the latest known ex-date.
  const perYear = history?.perYear ?? null;
  const frequency = history?.frequency ?? "none";
  let status: StockStatus = "pays";
  const regularKnown = [...regular.map((p) => ({ exDate: p.exDate, perShare: p.amount })), ...known.filter((k) => !k.special)].sort((a, b) =>
    a.exDate.localeCompare(b.exDate),
  );
  const anchor = regularKnown.at(-1) ?? null;
  if (!anchor) {
    status = payments.length > 0 ? "pays" : "no_dividend";
  } else if (!perYear || perYear <= 0) {
    status = payments.length > 0 ? "pays" : "irregular";
  } else {
    const stepMonths = 12 / perYear;
    const interval = 365 / perYear;
    if (daysBetween(anchor.exDate, today) > interval * 1.5) {
      status = payments.length > 0 ? "pays" : "stopped";
    } else {
      for (let k = 1; k <= perYear + 1; k++) {
        const exDate = addMonths(anchor.exDate, Math.round(stepMonths * k));
        const payDate = addDays(exDate, lag);
        if (payDate > windowEnd) break;
        // Cash that should already have arrived but is not on record: we will not claim it happened.
        if (payDate < today) continue;
        // An ex-date the history should already hold but does not was most likely skipped.
        if (exDate < today && history?.fetchedAt && exDate <= history.fetchedAt.slice(0, 10)) continue;
        // A special next to it does not replace the regular payment.
        if (payments.some((p) => !p.special && Math.abs(daysBetween(p.exDate, exDate)) < interval / 2)) continue;
        payments.push(row(exDate, payDate, false, anchor.perShare, "estimate"));
      }
    }
  }
  payments.sort((a, b) => a.payDate.localeCompare(b.payDate));

  const perShare = payments.reduce((sum, p) => sum + p.perShare, 0);
  const regularPerShare = payments.reduce((sum, p) => sum + (p.special ? 0 : p.perShare), 0);
  const confirmedIncome = shares != null ? payments.filter((p) => p.status === "confirmed").reduce((sum, p) => sum + p.perShare * shares, 0) : null;
  const price = fin(input.price) && input.price > 0 ? input.price : null;
  const cost = fin(input.avgCost) && input.avgCost > 0 ? input.avgCost : null;
  const payout = fin(input.payout) ? input.payout : null;
  const latest = history?.latestAmount ?? null;
  const yearAgo = history?.yearAgoAmount ?? null;
  const changePct = latest != null && yearAgo != null && yearAgo > 0 ? (latest / yearAgo - 1) * 100 : null;
  return {
    ticker: input.ticker,
    name: input.name,
    shares,
    status: payments.length > 0 ? "pays" : status,
    frequency,
    payments,
    perShare,
    regularPerShare,
    income: shares != null && (payments.length > 0 || status === "no_dividend") ? perShare * shares : null,
    confirmedIncome,
    next: payments.find((p) => !p.paid) ?? null,
    yieldOnPrice: price && regularPerShare > 0 ? (regularPerShare / price) * 100 : null,
    yieldOnCost: cost && regularPerShare > 0 ? (regularPerShare / cost) * 100 : null,
    payout,
    // Real estate trusts must pay out most of their income, so a high payout is normal for them.
    atRisk: perShare > 0 && payout != null && !isRealEstate(input.sector) && (payout > AT_RISK_PAYOUT || payout < 0),
    changePct,
    latestAmount: latest,
    yearAgoAmount: yearAgo,
    lastExDate: history?.payments.at(-1)?.exDate ?? null,
    paymentsOnRecord: history?.payments.length ?? 0,
  };
}

function isRealEstate(sector: string | null | undefined): boolean {
  return typeof sector === "string" && /real estate|reit/i.test(sector);
}

/* ── the whole plan ─────────────────────────────────────────────────────── */

export function buildDividendPlan(holdings: PlanHoldingInput[], today: string): DividendPlan {
  const keys = planMonths(today);
  const stocks = holdings.map((holding) => planStock(holding, today));
  const byMonth = new Map(keys.map((month) => [month, { month, confirmed: 0, estimated: 0, total: 0, perTicker: new Map<string, number>() }]));
  for (const stock of stocks) {
    for (const payment of stock.payments) {
      if (payment.amount == null) continue;
      const bucket = byMonth.get(payment.payDate.slice(0, 7));
      if (!bucket) continue;
      if (payment.status === "confirmed") bucket.confirmed += payment.amount;
      else bucket.estimated += payment.amount;
      bucket.total += payment.amount;
      bucket.perTicker.set(stock.ticker, (bucket.perTicker.get(stock.ticker) ?? 0) + payment.amount);
    }
  }
  const months: MonthBucket[] = keys.map((key) => {
    const bucket = byMonth.get(key)!;
    return {
      month: key,
      confirmed: bucket.confirmed,
      estimated: bucket.estimated,
      total: bucket.total,
      tickers: [...bucket.perTicker.entries()].sort((a, b) => b[1] - a[1]).map(([ticker]) => ticker),
    };
  });
  const confirmed = months.reduce((sum, m) => sum + m.confirmed, 0);
  const estimated = months.reduce((sum, m) => sum + m.estimated, 0);

  let costBasis = 0;
  let marketValue = 0;
  let incomeOnCost = 0;
  for (const [index, stock] of stocks.entries()) {
    const holding = holdings[index]!;
    if (stock.income == null || stock.shares == null) continue;
    const cost = fin(holding.avgCost) && holding.avgCost > 0 ? holding.avgCost : null;
    const price = fin(holding.price) && holding.price > 0 ? holding.price : null;
    // Both yields are over the same holdings, so they compare like for like.
    if (cost == null || price == null) continue;
    costBasis += cost * stock.shares;
    marketValue += price * stock.shares;
    // Specials are left out here too, so the two yields describe the regular dividend.
    incomeOnCost += stock.regularPerShare * stock.shares;
  }

  const asOf = holdings.reduce<string | null>((latest, h) => {
    const at = h.history?.fetchedAt ?? null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);

  return {
    today,
    months,
    stocks: stocks.sort((a, b) => (b.income ?? -1) - (a.income ?? -1) || b.perShare - a.perShare || a.ticker.localeCompare(b.ticker)),
    total: confirmed + estimated,
    confirmed,
    estimated,
    missingShares: stocks.filter((s) => s.shares == null && s.perShare > 0).map((s) => s.ticker),
    costBasis: costBasis > 0 ? costBasis : null,
    marketValue: marketValue > 0 ? marketValue : null,
    incomeOnCost: costBasis > 0 ? incomeOnCost : null,
    asOf,
  };
}

/* ── reading the stored documents ───────────────────────────────────────── */

const FREQUENCIES: DividendFrequency[] = ["monthly", "quarterly", "semiannual", "annual", "irregular", "none"];

function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** A `tm_dividend_history` document, or null when it is not one. */
export function parseHistoryDoc(raw: unknown): DividendHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  const symbol = typeof doc.symbol === "string" ? doc.symbol.toUpperCase() : null;
  if (!symbol || !Array.isArray(doc.payments)) return null;
  const payments = doc.payments
    .map((p) => {
      const item = (p ?? {}) as Record<string, unknown>;
      const exDate = isoOrNull(item.ex_date);
      const amount = item.amount;
      return exDate && fin(amount) && amount > 0 ? { exDate, amount, special: item.special === true } : null;
    })
    .filter((p): p is { exDate: string; amount: number; special: boolean } => p !== null)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  const frequency = FREQUENCIES.includes(doc.frequency as DividendFrequency) ? (doc.frequency as DividendFrequency) : payments.length ? "irregular" : "none";
  const perYear = fin(doc.per_year) && doc.per_year > 0 ? doc.per_year : null;
  return {
    symbol,
    payments,
    frequency,
    perYear,
    latestAmount: fin(doc.latest_amount) && doc.latest_amount > 0 ? doc.latest_amount : null,
    yearAgoAmount: fin(doc.year_ago_amount) && doc.year_ago_amount > 0 ? doc.year_ago_amount : null,
    payLagDays: fin(doc.pay_lag_days) ? doc.pay_lag_days : null,
    fetchedAt: typeof doc.fetched_at === "string" ? doc.fetched_at : null,
  };
}

/** A `tm_agent_calendar` dividend row, or null. */
export function parseAnnouncedRow(raw: unknown): (AnnouncedDividend & { ticker: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (doc.kind !== "dividend" || doc.superseded === true) return null;
  const ticker = typeof doc.ticker === "string" ? doc.ticker.toUpperCase() : null;
  const exDate = isoOrNull(doc.date);
  const amount = doc.amount;
  if (!ticker || !exDate || !fin(amount) || amount <= 0) return null;
  return { ticker, exDate, payDate: isoOrNull(doc.payment_date), amount };
}

/* ── the read ───────────────────────────────────────────────────────────── */

/** "$1,240" for a sum, "$29" for a payment, "$4.80" under $10. The caller says "about". */
export function fmtDollars(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000) return `$${(Math.round(value / 10) * 10).toLocaleString("en-US")}`;
  if (Math.abs(value) >= 10) return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${value.toFixed(2)}`;
}

/** A per-share amount: "$0.98", or "$0.004" below a cent, so split-adjusted amounts never read "$0.00". */
export function fmtPerShare(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 3 : 2)}`;
}

/** "AAPL", "AAPL and MSFT", "AAPL, MSFT and JPM". */
export function joinNames(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "2026-12-10" -> "Dec 10". */
export function fmtPlanDay(iso: string): string {
  return `${monthShort(iso.slice(0, 7))} ${Number(iso.slice(8, 10))}`;
}

export type DividendReadOptions = {
  /** The example portfolio shown to visitors: "This example portfolio" instead of "Your stocks". */
  example?: boolean;
  /** Where share counts are edited. */
  editHref?: string;
};

/**
 * The page's lead: what the holdings should pay over the twelve months, how
 * much is already announced, then up to three plain points. Payout risk comes
 * first because it is the one thing that can change the rest.
 */
export function buildDividendRead(plan: DividendPlan, options: DividendReadOptions = {}): TheRead | null {
  const example = options.example === true;
  const editHref = options.editHref ?? "/portfolio?tab=holdings";
  if (plan.stocks.length === 0) return null;
  const payers = plan.stocks.filter((s) => s.perShare > 0);

  let headline: string;
  if (plan.total > 0) {
    const first = monthName(plan.months[0]!.month);
    const last = monthName(plan.months[11]!.month);
    // "Paid" only when the calendar gave the pay date; a passed ex-date alone means declared, not paid.
    const paidSoFar = plan.stocks.some((s) => s.payments.some((p) => p.paid && p.payDateKnown && p.amount != null));
    const lead = example ? "This example portfolio should pay" : "Your stocks should pay you";
    const known =
      plan.confirmed >= 0.5
        ? `, ${fmtDollars(plan.confirmed)} of it already ${paidSoFar ? "announced or paid" : "announced"}.`
        : `, all of it an estimate until it is announced.`;
    headline = `${lead} about ${fmtDollars(plan.total)} from ${first} to ${last}${known}`;
  } else if (payers.length > 0) {
    headline = "Add how many shares you own to see what your dividends come to.";
  } else if (plan.stocks.every((s) => s.status === "no_history")) {
    headline = "We do not have dividend records for these stocks yet.";
  } else {
    headline = `None of ${example ? "these stocks" : "your stocks"} pays a regular dividend, so there is nothing to plan yet.`;
  }

  const items: Array<Insight | null> = [];

  // Payout risk.
  // `atRisk` leaves out property trusts, which must pay out most of their income.
  const stretched = payers.filter((s) => s.atRisk && s.payout != null && s.payout > AT_RISK_PAYOUT).sort((a, b) => b.payout! - a.payout!);
  const losing = payers.filter((s) => s.atRisk && s.payout != null && s.payout < 0);
  if (stretched.length === 1) {
    const s = stretched[0]!;
    items.push({
      id: `payout-${s.ticker}`,
      tone: "down",
      text: `${s.ticker} pays out ${Math.round(s.payout!)}% of its earnings as dividends, which leaves little room to keep paying if profits fall.`,
      tickers: [s.ticker],
      leadName: s.name,
      action: { label: "Read the report", href: `/stock/${encodeURIComponent(s.ticker)}` },
    });
  } else if (stretched.length > 1) {
    items.push({
      id: "payout-many",
      tone: "down",
      text: `${joinNames(stretched.map((s) => `${s.ticker} (${Math.round(s.payout!)}%)`))} pay out more than ${AT_RISK_PAYOUT}% of their earnings as dividends, which leaves little room to keep paying if profits fall.`,
      tickers: stretched.map((s) => s.ticker),
    });
  }
  if (losing.length > 0) {
    const one = losing.length === 1;
    items.push({
      id: "payout-losing",
      tone: "down",
      text: `${joinNames(losing.map((s) => s.ticker))} ${one ? "is" : "are"} paying a dividend while losing money over the last year, so ${one ? "that payment is" : "those payments are"} at risk.`,
      tickers: losing.map((s) => s.ticker),
    });
  }

  // A cut.
  const cuts = payers.filter((s) => s.changePct != null && s.changePct <= -5).sort((a, b) => a.changePct! - b.changePct!);
  if (cuts.length > 0) {
    const s = cuts[0]!;
    items.push({
      id: `cut-${s.ticker}`,
      tone: "down",
      text: `${s.ticker} cut its dividend from ${fmtPerShare(s.yearAgoAmount!)} to ${fmtPerShare(s.latestAmount!)} a share over the past year.`,
      tickers: [s.ticker],
      leadName: s.name,
    });
  }

  // Share counts missing: ahead of the rest, since the totals above leave those stocks out.
  if (plan.missingShares.length > 0 && !example) {
    const one = plan.missingShares.length === 1;
    const shown = plan.missingShares.slice(0, 4);
    items.push({
      id: "missing-shares",
      tone: "flat",
      text: `${joinNames(shown)}${plan.missingShares.length > 4 ? ` and ${plan.missingShares.length - 4} more` : ""} ${one ? "pays" : "pay"} dividends, but without a share count ${one ? "it is" : "they are"} left out of the totals.`,
      tickers: shown,
      action: { label: "Add shares", href: editHref },
    });
  }

  // The biggest month (or months, when they tie to the dollar) and the empty ones.
  if (plan.total > 0) {
    const most = Math.max(...plan.months.map((m) => Math.round(m.total)));
    const tops = plan.months.filter((m) => Math.round(m.total) === most);
    const empty = plan.months.filter((m) => m.total === 0).map((m) => monthName(m.month));
    const whose = example ? "its" : "your";
    let text: string;
    if (tops.length === 1) {
      const top = tops[0]!;
      const share = Math.round((top.total / plan.total) * 100);
      text = `${monthName(top.month)} is ${whose} biggest month, with about ${fmtDollars(top.total)} from ${joinNames(top.tickers.slice(0, 3))}${top.tickers.length > 3 ? " and others" : ""}${share >= 20 ? `, ${share}% of the year` : ""}.`;
    } else if (tops.length <= 4) {
      text = `${joinNames(tops.map((m) => monthName(m.month)))} are ${whose} biggest months, with about ${fmtDollars(tops[0]!.total)} each.`;
    } else {
      text = `The money comes in evenly, about ${fmtDollars(tops[0]!.total)} in each of ${tops.length} months.`;
    }
    if (empty.length > 0 && empty.length <= 3) text += ` Nothing is expected in ${joinNames(empty)}.`;
    else if (empty.length > 3) text += ` ${empty.length} of the 12 months have nothing expected.`;
    items.push({ id: "month-top", tone: "flat", text });
  }

  // The biggest raise.
  const raises = payers.filter((s) => s.changePct != null && s.changePct >= 3).sort((a, b) => b.changePct! - a.changePct!);
  if (raises.length > 0) {
    const s = raises[0]!;
    const others = raises.slice(1, 4).map((r) => r.ticker);
    items.push({
      id: `raise-${s.ticker}`,
      tone: "up",
      text:
        s.changePct! >= 100
          ? `${s.ticker} raised its dividend from ${fmtPerShare(s.yearAgoAmount!)} to ${fmtPerShare(s.latestAmount!)} a share over the past year.`
          : `${s.ticker} raised its dividend ${Math.round(s.changePct!)}% over the past year, to ${fmtPerShare(s.latestAmount!)} a share.`,
      soWhat: others.length > 0 ? `${joinNames(others)} raised ${others.length === 1 ? "its" : "theirs"} too.` : undefined,
      tickers: [s.ticker],
      leadName: s.name,
    });
  }

  // Yield on cost against today's price.
  if (plan.incomeOnCost != null && plan.costBasis && plan.marketValue && plan.incomeOnCost > 0) {
    const onCost = (plan.incomeOnCost / plan.costBasis) * 100;
    const onPrice = (plan.incomeOnCost / plan.marketValue) * 100;
    if (Math.abs(onCost - onPrice) >= 0.05) {
      items.push({
        id: "yield-cost",
        tone: onCost >= onPrice ? "up" : "flat",
        text: `On what ${example ? "was" : "you"} paid for these shares, the dividends come to ${onCost.toFixed(2)}% a year. At today's prices the same payments are ${onPrice.toFixed(2)}%.`,
      });
    }
  }

  // The next payment.
  const next = plan.stocks
    .map((s) => s.next)
    .filter((p): p is PlannedPayment => p != null && p.amount != null)
    .sort((a, b) => a.payDate.localeCompare(b.payDate))[0];
  if (next) {
    const when = next.payDateKnown ? `on ${fmtPlanDay(next.payDate)}` : `around ${fmtPlanDay(next.payDate)}`;
    items.push({
      id: `next-${next.ticker}`,
      tone: "flat",
      text: `${next.ticker} pays next, about ${fmtDollars(next.amount!)} ${when}${next.status === "confirmed" ? ", already announced" : ", an estimate"}.`,
      tickers: [next.ticker],
      leadName: plan.stocks.find((s) => s.ticker === next.ticker)?.name,
    });
  }

  return { headline, insights: pickInsights(items, 3) };
}
