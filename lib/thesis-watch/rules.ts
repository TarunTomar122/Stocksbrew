import { THESIS_LINES, type Thesis, type ThesisKind } from "@/lib/thesis";

import { daysBetween, type CallWord, type StockFacts } from "./facts";

/**
 * The reason watcher's rules: what weakens, breaks or completes each kind of
 * reason, from facts we already store (lib/thesis-watch/facts.ts). Rules pick
 * every fact and write every number; a model may only reword the note
 * afterwards, under the numbers check (lib/thesis-watch/word.ts).
 *
 * A signal is "soft" (one makes a reason weaker, two break it), "hard" (one
 * breaks it) or "done" (the reason did its job). The verdict is broken, then
 * played out, then weaker, then still holds. Doing nothing is a verdict too.
 *
 * Thresholds were written down before they were replayed over stored history
 * (docs/ideas.md, "Spec: the reason watcher"), and are kept here in one table.
 */

export const THRESHOLDS = {
  /** growth: TTM revenue growth at or below two thirds of the last fiscal year's, when that year grew at least 10%. */
  growthSlowShare: 2 / 3,
  growthSlowMinPrior: 10,
  /** growth: analysts expect next year's earnings per share to fall at least this much. */
  epsNextYearFallPct: 5,
  /** growth: our call has said Sell some for at least this many days. */
  callTrimDays: 30,
  /** growth: a guidance cut counts in the report's first this-many days. */
  guidanceDays: 100,
  /** dividend: payout ratio above this, percent. */
  payoutMax: 90,
  /** value: TTM earnings per share down at least this much while the P/E is still in the bottom part of its own range. */
  valueTrapEpsFallPct: 10,
  valueTrapMaxPercentile: 40,
  /** value: played out once the P/E is above this share of its own stored history. */
  valueDonePercentile: 60,
  /** product: at least this many labelled headlines in two weeks, and at least this share negative. */
  newsMinHeadlines: 8,
  newsNegativeShare: 0.6,
  /** long-term: this far below cost, together with a Sell some call. */
  longTermDrawdownPct: 30,
  /** short-term trade: held longer than this. */
  tradeMaxDays: 60,
  /** short-term trade: this far below cost breaks it, this far above completes it. */
  tradeStopPct: 15,
  tradeTargetPct: 15,
  /** short-term trade: earnings this close with no plan written. */
  tradeEarningsDays: 3,
  /** every kind: insider sales outside pre-arranged plans in 30 days, dollars. */
  insiderSalesUsd: 10_000_000,
  /** every kind: a tracked fund cut the position by at least this much. */
  fundCutPct: 50,
} as const;

export type Verdict = "holds" | "weaker" | "broken" | "played_out";
export type SignalLevel = "soft" | "hard" | "done" | "info";

export type Signal = {
  /** Stable: "growth_slowing". */
  id: string;
  level: SignalLevel;
  /** One or two plain sentences with the figures. */
  text: string;
  /** Where the fact comes from, in words. */
  source: string;
  /** Day the fact is from, YYYY-MM-DD. */
  asOf: string;
  /** The page with the evidence. */
  href: string | null;
  /** The values behind the sentence: what the wording check accepts. */
  data: Record<string, string | number | null>;
};

export type HoldingContext = {
  /** Average cost per share the person entered. */
  avgCost: number | null;
  /** Close on the day the reason was saved, used when there is no cost. */
  savedClose: number | null;
};

export type ReasonCheck = {
  instrumentId: string;
  ticker: string;
  kind: ThesisKind | null;
  verdict: Verdict;
  /** "Your reason for owning NVDA still holds." */
  headline: string;
  /** The signals that fired, worst first. */
  signals: Signal[];
  /** What was looked at and is still fine, shown when nothing fired. */
  checked: Signal[];
  /** The person's own words, quoted back, or null. */
  quote: string | null;
  /** One honest line on what this kind of reason cannot be checked against. */
  limit: string | null;
  /** The facts' day. */
  asOf: string;
};

export const VERDICT_WORDS: Record<Verdict, string> = {
  holds: "Reason still holds",
  weaker: "Reason weaker",
  broken: "Reason broken",
  played_out: "Reason played out",
};

/** Worst first: broken, weaker, played out, holds. */
export const VERDICT_RANK: Record<Verdict, number> = { broken: 0, weaker: 1, played_out: 2, holds: 3 };

/** Plain call words: the data says Add, Hold and Trim; a person reads these. */
const CALL_PLAIN: Record<CallWord, string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

const KIND_LIMITS: Partial<Record<ThesisKind, string>> = {
  product:
    "We cannot read how a product is doing directly, so this one leans on news tone, explained moves and revenue against the company's sector. It is the hardest reason to check.",
  growth: "We do not keep a history of analysts' estimates, so a cut to them only shows once their growth forecast turns negative.",
  value: "Our filings data does not flag going-concern notes, so a value stock is checked on losses and falling earnings.",
  long_term:
    "A change of chief executive or finance chief is not checked yet: the filings we keep only say that some director or officer changed, which happens to about half of companies each quarter.",
};

/* ── words ──────────────────────────────────────────────────────────────── */

/** 83.4 → "83%", 4.26 → "4.3%", 4.0 → "4%". Always positive; the sentence says which way. */
export function pctWords(value: number): string {
  const abs = Math.abs(value);
  const text = abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "");
  return `${text}%`;
}

export function roundPct(value: number): number {
  const abs = Math.abs(value);
  return abs >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** $0.53, $182.40, $12 million, $1.2 billion. */
export function moneyWords(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1).replace(/\.0$/, "")} billion`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, "")} million`;
  return `$${abs.toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-15" → "Sep 15", with the year when it is not `today`'s. */
export function dayWords(day: string, today: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  const base = `${MONTHS[month - 1]} ${date}`;
  return today.slice(0, 4) === day.slice(0, 4) ? base : `${base}, ${year}`;
}

/** A sentence quoted inside “”: its own end mark kept, a full stop added only when it has none. */
function quoted(text: string): string {
  const trimmed = text.trim().replace(/[\s,;:]+$/, "");
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The New York day a reason was saved, from its ISO time; the UTC day can be the next one in the evening. */
export function savedDay(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}

function inDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/* ── the rules ──────────────────────────────────────────────────────────── */

type Ctx = { facts: StockFacts; holding: HoldingContext; thesis: Pick<Thesis, "kind" | "reason" | "created_at">; today: string };

function stockHref(facts: StockFacts): string {
  return `/stock/${encodeURIComponent(facts.ticker)}`;
}

function screenerSignal(ctx: Ctx, id: string, level: SignalLevel, text: string, data: Signal["data"]): Signal {
  return { id, level, text, source: "Company results in our daily screen", asOf: ctx.facts.day, href: stockHref(ctx.facts), data: { ticker: ctx.facts.ticker, ...data } };
}

function revenueLine(ctx: Ctx): Signal | null {
  const { facts } = ctx;
  if (facts.revenueGrowth === null) return null;
  const now = facts.revenueGrowth;
  const verb = now >= 0 ? "grew" : "fell";
  const prior =
    facts.revenueGrowthPrior !== null && facts.priorLabel
      ? `, against ${facts.revenueGrowthPrior >= 0 ? "growth" : "a fall"} of ${pctWords(facts.revenueGrowthPrior)} in ${facts.priorLabel}`
      : "";
  return screenerSignal(ctx, "revenue", "info", `Revenue ${verb} ${pctWords(now)} over the last twelve months${prior}.`, {
    revenue_growth_pct: roundPct(now),
    prior_growth_pct: facts.revenueGrowthPrior === null ? null : roundPct(facts.revenueGrowthPrior),
    prior_label: facts.priorLabel,
  });
}

function callLine(ctx: Ctx): Signal | null {
  const call = ctx.facts.call;
  if (!call) return null;
  return {
    id: "call",
    level: "info",
    text: `Our call is ${CALL_PLAIN[call.word]}, since ${dayWords(call.since, ctx.today)}.`,
    source: "Our call history",
    asOf: call.since,
    href: stockHref(ctx.facts),
    data: { ticker: ctx.facts.ticker, call: CALL_PLAIN[call.word], since: call.since },
  };
}

/**
 * The price against what the person paid, or against the close on the day
 * the reason was saved. `low` and `high` are the least and most of the last
 * few closes against it, so a line counts as crossed only when every one of
 * them is past it.
 */
function costMove(ctx: Ctx): { pct: number; low: number; high: number; words: string; basis: number; data: Signal["data"] } | null {
  const close = ctx.facts.close;
  if (!close) return null;
  const basis = ctx.holding.avgCost ?? ctx.holding.savedClose;
  if (!basis || basis <= 0) return null;
  const pct = (close.value / basis - 1) * 100;
  const recent = (ctx.facts.recentCloses ?? [close.value]).map((value) => (value / basis - 1) * 100);
  const low = Math.min(pct, ...recent);
  const high = Math.max(pct, ...recent);
  const words = ctx.holding.avgCost
    ? `your average cost of ${moneyWords(basis)}`
    : `the ${moneyWords(basis)} it closed at on ${dayWords(savedDay(ctx.thesis.created_at), ctx.today)}, when you saved this reason`;
  return { pct, low, high, words, basis, data: { ticker: ctx.facts.ticker, move_pct: roundPct(pct), cost_usd: Math.round(basis * 100) / 100, close_usd: Math.round(close.value * 100) / 100 } };
}

function costSignal(ctx: Ctx, id: string, level: SignalLevel): Signal | null {
  const move = costMove(ctx);
  if (!move) return null;
  const close = ctx.facts.close!;
  const text =
    Math.abs(move.pct) < 0.05
      ? `It closed at ${moneyWords(close.value)}, level with ${move.words}.`
      : `It closed at ${moneyWords(close.value)}, ${pctWords(move.pct)} ${move.pct > 0 ? "above" : "below"} ${move.words}.`;
  return { id, level, text, source: "Daily closes and your own entries", asOf: close.day, href: "/watchlist", data: move.data };
}

function growthRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  if (facts.revenueGrowth !== null && facts.revenueGrowth < 0) {
    out.push(screenerSignal(ctx, "revenue_shrinking", "hard", `Revenue fell ${pctWords(facts.revenueGrowth)} over the last twelve months against the twelve before.`, { revenue_growth_pct: roundPct(facts.revenueGrowth) }));
  } else if (
    facts.revenueGrowth !== null &&
    facts.revenueGrowthPrior !== null &&
    facts.priorLabel &&
    facts.revenueGrowthPrior >= t.growthSlowMinPrior &&
    facts.revenueGrowth <= facts.revenueGrowthPrior * t.growthSlowShare
  ) {
    out.push(
      screenerSignal(ctx, "growth_slowing", "soft", `Revenue growth slowed to ${pctWords(facts.revenueGrowth)} over the last twelve months, from ${pctWords(facts.revenueGrowthPrior)} in ${facts.priorLabel}.`, {
        revenue_growth_pct: roundPct(facts.revenueGrowth),
        prior_growth_pct: roundPct(facts.revenueGrowthPrior),
        prior_label: facts.priorLabel,
      }),
    );
  }
  if (facts.epsNextYearGrowth !== null && facts.epsNextYearGrowth <= -t.epsNextYearFallPct) {
    out.push(screenerSignal(ctx, "estimates_falling", "soft", `Analysts now expect earnings per share to fall ${pctWords(facts.epsNextYearGrowth)} next year.`, { eps_next_year_pct: roundPct(facts.epsNextYearGrowth) }));
  }
  if (facts.guidance && facts.guidance.change === "lowered" && daysBetween(facts.guidance.day, ctx.today) <= t.guidanceDays) {
    out.push({
      id: "guidance_cut",
      level: "hard",
      text: `The company lowered its guidance in the report on ${dayWords(facts.guidance.day, ctx.today)}.`,
      source: "The company's earnings release",
      asOf: facts.guidance.day,
      href: facts.guidance.href,
      data: { ticker: facts.ticker, report_day: facts.guidance.day },
    });
  }
  const call = facts.call;
  if (call && call.word === "Trim") {
    const days = daysBetween(call.since, ctx.today);
    if (days >= t.callTrimDays) {
      out.push({
        id: "call_trim",
        level: "hard",
        text: `Our call has been Sell some since ${dayWords(call.since, ctx.today)}, ${days} days now.`,
        source: "Our call history",
        asOf: call.since,
        href: stockHref(facts),
        data: { ticker: facts.ticker, since: call.since, days },
      });
    }
  }
}

function dividendRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  const source = "Dividend history";
  if (facts.dividendCut) {
    const cut = facts.dividendCut;
    out.push({
      id: "dividend_cut",
      level: "hard",
      text: `The last payment was ${moneyWords(cut.to)} a share, going ex on ${dayWords(cut.day, ctx.today)}. That is ${pctWords(cut.pct)} less than the ${moneyWords(cut.from)} before it.`,
      source,
      asOf: cut.day,
      href: "/portfolio/dividends",
      data: { ticker: facts.ticker, to_per_share: cut.to, from_per_share: cut.from, cut_pct: roundPct(cut.pct), day: cut.day },
    });
  }
  if (facts.dividendStop) {
    const stop = facts.dividendStop;
    out.push({
      id: "dividend_stopped",
      level: "hard",
      text: `No dividend has gone ex since ${dayWords(stop.lastExDate, ctx.today)}, ${stop.daysSince} days ago, when it usually pays about every ${stop.usualDays} days.`,
      source,
      asOf: ctx.facts.day,
      href: "/portfolio/dividends",
      data: { ticker: facts.ticker, last_ex: stop.lastExDate, days: stop.daysSince, usual_days: stop.usualDays },
    });
  }
  if (facts.payout !== null && facts.payout > t.payoutMax) {
    out.push(
      screenerSignal(ctx, "payout_high", "soft", `It pays out ${pctWords(facts.payout)} of its earnings as dividends, which leaves little room if profits slip.`, { payout_pct: roundPct(facts.payout) }),
    );
  }
  if (facts.fcf !== null && facts.divYield !== null && facts.marketCap !== null && facts.divYield > 0) {
    const paid = (facts.divYield / 100) * facts.marketCap;
    if (facts.fcf < paid) {
      out.push(
        screenerSignal(
          ctx,
          "cash_short",
          "soft",
          facts.fcf < 0
            ? `It burned ${moneyWords(facts.fcf)} of cash over the last twelve months while paying about ${moneyWords(paid)} a year in dividends.`
            : `Its free cash flow over the last twelve months, ${moneyWords(facts.fcf)}, was less than the roughly ${moneyWords(paid)} a year it pays in dividends.`,
          { fcf_usd: Math.round(facts.fcf), dividends_usd: Math.round(paid) },
        ),
      );
    }
  }
  if (!facts.dividendCut && facts.divGrowth !== null && facts.divGrowth < 0) {
    out.push(screenerSignal(ctx, "dividend_lower", "soft", `Its dividend is ${pctWords(facts.divGrowth)} lower than a year ago.`, { div_growth_pct: roundPct(facts.divGrowth) }));
  }
}

function peWords(facts: StockFacts): string | null {
  if (facts.pe === null || facts.pePercentile === null) return null;
  return `Its P/E of ${facts.pe.toFixed(1).replace(/\.0$/, "")} is higher than on ${Math.round(facts.pePercentile)}% of the days in its stored history${
    facts.peMedian !== null ? `, where the middle is ${facts.peMedian.toFixed(1).replace(/\.0$/, "")}` : ""
  }.`;
}

function peData(facts: StockFacts): Signal["data"] {
  return { pe: facts.pe === null ? null : Math.round(facts.pe * 10) / 10, pe_percentile_pct: facts.pePercentile === null ? null : Math.round(facts.pePercentile), pe_median: facts.peMedian === null ? null : Math.round(facts.peMedian * 10) / 10 };
}

function valueRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  if (facts.netIncome !== null && facts.netIncome < 0) {
    out.push(screenerSignal(ctx, "losses", "hard", `It lost ${moneyWords(facts.netIncome)} over the last twelve months.`, { net_income_usd: Math.round(facts.netIncome) }));
  }
  if (
    facts.epsGrowth !== null &&
    facts.epsGrowth <= -t.valueTrapEpsFallPct &&
    facts.pePercentile !== null &&
    facts.pePercentile <= t.valueTrapMaxPercentile
  ) {
    out.push(
      screenerSignal(
        ctx,
        "value_trap",
        "soft",
        `Earnings per share fell ${pctWords(facts.epsGrowth)} over the last twelve months while the stock still looks cheap. A low P/E on falling earnings can stay low.`,
        { eps_growth_pct: roundPct(facts.epsGrowth), ...peData(facts) },
      ),
    );
  }
  const pe = peWords(facts);
  if (pe && facts.pePercentile !== null && facts.pePercentile > t.valueDonePercentile) {
    out.push(screenerSignal(ctx, "no_longer_cheap", "done", `The stock is no longer cheap against its own past. ${pe}`, peData(facts)));
  }
}

function productRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  if (facts.trouble) {
    const shrinking = facts.revenueGrowth !== null && facts.revenueGrowth < 0;
    out.push({
      id: "trouble",
      level: shrinking ? "hard" : "soft",
      text: `It fell ${pctWords(facts.trouble.pct)} on ${dayWords(facts.trouble.day, ctx.today)}, and our explanation was: “${quoted(facts.trouble.headline)}”${
        shrinking ? ` Revenue also fell ${pctWords(facts.revenueGrowth!)} over the last twelve months.` : ""
      }`,
      source: "Our explanation of the move",
      asOf: facts.trouble.day,
      href: facts.trouble.href,
      data: { ticker: facts.ticker, move_pct: roundPct(facts.trouble.pct), day: facts.trouble.day, headline: facts.trouble.headline, revenue_growth_pct: shrinking ? roundPct(facts.revenueGrowth!) : null },
    });
  }
  if (facts.news && facts.news.labelled >= t.newsMinHeadlines && facts.news.negative / facts.news.labelled >= t.newsNegativeShare) {
    const share = (facts.news.negative / facts.news.labelled) * 100;
    out.push({
      id: "news_negative",
      level: "soft",
      text: `${pctWords(share)} of the ${facts.news.labelled} headlines about it in the last two weeks were negative.`,
      source: "Headlines and their tone",
      asOf: facts.day,
      href: `/news?ticker=${encodeURIComponent(facts.ticker)}`,
      data: { ticker: facts.ticker, negative_pct: Math.round(share), headlines: facts.news.labelled },
    });
  }
  if (facts.revenueGrowth !== null && facts.sectorGrowthP25 !== null && facts.sectorGrowthMedian !== null && facts.sector && facts.revenueGrowth < facts.sectorGrowthP25) {
    out.push(
      screenerSignal(
        ctx,
        "behind_sector",
        "soft",
        `Revenue ${facts.revenueGrowth >= 0 ? "grew" : "fell"} ${pctWords(facts.revenueGrowth)} over the last twelve months, in the bottom quarter of ${facts.sector} stocks, where the middle ${facts.sectorGrowthMedian >= 0 ? "grew" : "fell"} ${pctWords(facts.sectorGrowthMedian)}.`,
        { revenue_growth_pct: roundPct(facts.revenueGrowth), sector_median_pct: roundPct(facts.sectorGrowthMedian), sector: facts.sector },
      ),
    );
  }
}

function longTermRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  const move = costMove(ctx);
  if (move && move.high <= -t.longTermDrawdownPct && facts.call?.word === "Trim") {
    out.push({
      id: "deep_loss",
      level: "soft",
      text: `It closed ${pctWords(move.pct)} below ${move.words}, and our call is Sell some.`,
      source: "Daily closes, your own entries and our call",
      asOf: facts.close!.day,
      href: "/watchlist",
      data: { ...move.data, call: "Sell some" },
    });
  }
  if (facts.revenueGrowth !== null && facts.revenueGrowth < 0 && facts.revenueGrowthPrior !== null && facts.revenueGrowthPrior < 0 && facts.priorLabel) {
    out.push(
      screenerSignal(
        ctx,
        "revenue_down_year",
        "hard",
        `Revenue has been falling for more than a year: down ${pctWords(facts.revenueGrowth)} over the last twelve months, after a fall of ${pctWords(facts.revenueGrowthPrior)} in ${facts.priorLabel}.`,
        { revenue_growth_pct: roundPct(facts.revenueGrowth), prior_growth_pct: roundPct(facts.revenueGrowthPrior), prior_label: facts.priorLabel },
      ),
    );
  }

}

function tradeRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  const saved = savedDay(ctx.thesis.created_at);
  const held = saved ? daysBetween(saved, ctx.today) : 0;
  const move = costMove(ctx);
  if (move && move.high <= -t.tradeStopPct) {
    out.push({ id: "trade_stop", level: "hard", text: `It closed ${pctWords(move.pct)} below ${move.words}.`, source: "Daily closes and your own entries", asOf: facts.close!.day, href: "/watchlist", data: move.data });
  } else if (move && move.low >= t.tradeTargetPct) {
    out.push({ id: "trade_target", level: "done", text: `It closed ${pctWords(move.pct)} above ${move.words}.`, source: "Daily closes and your own entries", asOf: facts.close!.day, href: "/watchlist", data: move.data });
  }
  if (held > t.tradeMaxDays) {
    out.push({
      id: "trade_too_long",
      level: "soft",
      text: `You saved this as a short-term trade ${held} days ago, on ${dayWords(saved, ctx.today)}.`,
      source: "Your own entries",
      asOf: ctx.today,
      href: "/watchlist",
      data: { ticker: facts.ticker, days: held, saved },
    });
  }
  if (facts.nextEarnings && facts.nextEarnings.days >= 0 && facts.nextEarnings.days <= t.tradeEarningsDays && !ctx.thesis.reason) {
    out.push({
      id: "earnings_no_plan",
      // The spec said broken; a trade with no written plan is a gap to fill, not a reason gone, so it is a warning.
      level: "soft",
      text: `It reports earnings ${inDays(facts.nextEarnings.days)}, on ${dayWords(facts.nextEarnings.date, ctx.today)}, and you have not written a plan for the trade.`,
      source: "Earnings calendar",
      asOf: ctx.today,
      href: `/stock/${encodeURIComponent(facts.ticker)}`,
      data: { ticker: facts.ticker, date: facts.nextEarnings.date, days: facts.nextEarnings.days },
    });
  }
}

function everyKindRules(ctx: Ctx, out: Signal[]) {
  const { facts } = ctx;
  const t = THRESHOLDS;
  if (facts.insiderSales && facts.insiderSales.usd > t.insiderSalesUsd) {
    out.push({
      id: "insider_selling",
      level: "soft",
      text: `Insiders sold ${moneyWords(facts.insiderSales.usd)} of stock in the last 30 days, outside pre-arranged trading plans.`,
      source: "Form 4 filings",
      asOf: facts.day,
      href: `/stock/${encodeURIComponent(facts.ticker)}`,
      data: { ticker: facts.ticker, sold_usd: Math.round(facts.insiderSales.usd), filings: facts.insiderSales.count },
    });
  }
  if (facts.fundCut) {
    const cut = facts.fundCut;
    out.push({
      id: "fund_cut",
      level: "soft",
      text:
        cut.action === "sold"
          ? `${cut.fund} sold all its shares, in a filing on ${dayWords(cut.day, ctx.today)}.`
          : `${cut.fund} cut its position by ${pctWords(cut.changePct ?? 0)}, in a filing on ${dayWords(cut.day, ctx.today)}.`,
      source: "13F filing",
      asOf: cut.day,
      href: cut.href,
      data: { ticker: facts.ticker, fund: cut.fund, change_pct: cut.changePct === null ? null : roundPct(cut.changePct), day: cut.day },
    });
  }
  // The growth rule has its own, stronger version of this one once Sell some has lasted a month.
  if (facts.callTurnedDown) {
    const days = daysBetween(facts.callTurnedDown.day, ctx.today);
    out.push({
      id: "call_turned_down",
      level: "soft",
      text: `Our call changed from ${CALL_PLAIN[facts.callTurnedDown.from]} to Sell some on ${dayWords(facts.callTurnedDown.day, ctx.today)} and has stayed there for ${days} days.`,
      source: "Our call history",
      asOf: facts.callTurnedDown.day,
      href: stockHref(facts),
      data: { ticker: facts.ticker, from: CALL_PLAIN[facts.callTurnedDown.from], to: "Sell some", day: facts.callTurnedDown.day, days },
    });
  }
  if (facts.bigDrop) {
    const drop = facts.bigDrop;
    const market = drop.marketPct;
    const marketWords = Math.abs(market) < 0.05 ? "while the S&P 500 was flat" : `while the S&P 500 ${market > 0 ? "rose" : "fell"} ${pctWords(market)}`;
    out.push({
      id: "unexplained_fall",
      level: "soft",
      // Owner rule: a move with no confirmed reason ends at the move; nothing is said about the missing reason.
      text: `It fell ${pctWords(drop.pct)} on ${dayWords(drop.day, ctx.today)} ${marketWords}.`,
      source: "Daily closes",
      asOf: drop.day,
      href: stockHref(facts),
      data: { ticker: facts.ticker, move_pct: roundPct(drop.pct), market_pct: roundPct(market), typical_pct: roundPct(drop.typicalPct), day: drop.day },
    });
  }
}

/** Facts that back the reason when nothing fired: what was looked at. */
function checkedFor(ctx: Ctx): Signal[] {
  const { facts } = ctx;
  const lines: Array<Signal | null> = [];
  switch (ctx.thesis.kind) {
    case "growth":
      lines.push(revenueLine(ctx), callLine(ctx));
      break;
    case "dividend":
      if (facts.lastDividend) {
        lines.push({
          id: "last_dividend",
          level: "info",
          text: `The last payment was ${moneyWords(facts.lastDividend.amount)} a share, going ex on ${dayWords(facts.lastDividend.exDate, ctx.today)}.`,
          source: "Dividend history",
          asOf: facts.lastDividend.exDate,
          href: "/portfolio/dividends",
          data: { ticker: facts.ticker, per_share: facts.lastDividend.amount, day: facts.lastDividend.exDate },
        });
      }
      if (facts.payout !== null && facts.payout >= 0) lines.push(screenerSignal(ctx, "payout", "info", `It pays out ${pctWords(facts.payout)} of its earnings as dividends.`, { payout_pct: roundPct(facts.payout) }));
      break;
    case "value": {
      const pe = peWords(facts);
      if (pe) lines.push(screenerSignal(ctx, "pe", "info", pe, peData(facts)));
      lines.push(callLine(ctx));
      break;
    }
    case "product":
      lines.push(revenueLine(ctx));
      if (facts.news && facts.news.labelled > 0) {
        const share = (facts.news.negative / facts.news.labelled) * 100;
        lines.push({
          id: "news",
          level: "info",
          text: `${pctWords(share)} of the ${facts.news.labelled} headlines about it in the last two weeks were negative.`,
          source: "Headlines and their tone",
          asOf: facts.day,
          href: `/news?ticker=${encodeURIComponent(facts.ticker)}`,
          data: { ticker: facts.ticker, negative_pct: Math.round(share), headlines: facts.news.labelled },
        });
      }
      break;
    case "long_term":
      lines.push(costSignal(ctx, "cost", "info"), revenueLine(ctx));
      break;
    case "trade":
      lines.push(costSignal(ctx, "cost", "info"), callLine(ctx));
      break;
    default:
      lines.push(callLine(ctx), revenueLine(ctx));
  }
  return lines.filter((line): line is Signal => line !== null).slice(0, 2);
}

const LEVEL_ORDER: Record<SignalLevel, number> = { hard: 0, done: 1, soft: 2, info: 3 };

export function verdictOf(signals: readonly Pick<Signal, "level">[]): Verdict {
  const hard = signals.filter((signal) => signal.level === "hard").length;
  const soft = signals.filter((signal) => signal.level === "soft").length;
  const done = signals.some((signal) => signal.level === "done");
  if (hard > 0 || soft >= 2) return "broken";
  if (done) return "played_out";
  if (soft === 1) return "weaker";
  return "holds";
}

export function headlineFor(verdict: Verdict, ticker: string): string {
  switch (verdict) {
    case "holds":
      return `Your reason for owning ${ticker} still holds.`;
    case "weaker":
      return `Your reason for owning ${ticker} is weaker.`;
    case "broken":
      return `Your reason for owning ${ticker} looks broken.`;
    case "played_out":
      return `Your reason for owning ${ticker} has played out.`;
  }
}

/** The person's own words, quoted back: "You said: “every big cloud is still buying.”" */
export function quoteOf(thesis: Pick<Thesis, "kind" | "reason">): string | null {
  const reason = thesis.reason?.trim();
  if (!reason) return thesis.kind ? `You own it ${THESIS_LINES[thesis.kind]}.` : null;
  const lead = thesis.kind ? `You own it ${THESIS_LINES[thesis.kind]}, and you said: ` : "You said: ";
  return `${lead}“${quoted(reason)}”`;
}

/**
 * One check: the facts against one reason. Pure. `today` is the New York day
 * the check runs; facts may be from a day or two before it.
 */
export function evaluate(thesis: Pick<Thesis, "kind" | "reason" | "created_at">, facts: StockFacts, holding: HoldingContext, today: string): ReasonCheck {
  const ctx: Ctx = { facts, holding, thesis, today };
  const fired: Signal[] = [];
  switch (thesis.kind) {
    case "growth":
      growthRules(ctx, fired);
      break;
    case "dividend":
      dividendRules(ctx, fired);
      break;
    case "value":
      valueRules(ctx, fired);
      break;
    case "product":
      productRules(ctx, fired);
      break;
    case "long_term":
      longTermRules(ctx, fired);
      break;
    case "trade":
      tradeRules(ctx, fired);
      break;
    default:
      break;
  }
  everyKindRules(ctx, fired);
  // One fact, one signal: the growth rule's month-long Sell some replaces the fresh-turn one.
  const ids = new Set(fired.map((signal) => signal.id));
  const signals = fired
    .filter((signal) => !(signal.id === "call_turned_down" && ids.has("call_trim")))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const verdict = verdictOf(signals);
  return {
    instrumentId: facts.instrumentId,
    ticker: facts.ticker,
    kind: thesis.kind,
    verdict,
    headline: headlineFor(verdict, facts.ticker),
    signals,
    checked: signals.length === 0 ? checkedFor(ctx) : [],
    quote: quoteOf(thesis),
    limit: thesis.kind ? KIND_LIMITS[thesis.kind] ?? null : "You did not pick a kind of reason, so we check the warnings that apply to any stock: insider sales, funds selling out, our call and sharp falls against the market.",
    asOf: facts.day,
  };
}

/** The rules' own note: the headline, then the first two findings (each one or two sentences). */
export function ruleNote(check: Pick<ReasonCheck, "headline" | "signals" | "checked" | "verdict">): string {
  const lines = (check.signals.length > 0 ? check.signals : check.checked).slice(0, 2).map((signal) => signal.text);
  const lead = check.verdict === "holds" && check.checked.length > 0 ? `${check.headline} Nothing we check has turned against it.` : check.headline;
  return [lead, ...lines].join(" ");
}
