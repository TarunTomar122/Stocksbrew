import { watchEarningsHref, watchMoveHref, earningsRequest, moveRequest } from "@/lib/agents-plain/ask-links";
import { fmtDollars, fmtPerShare, fmtPlanDay, type DividendPlan } from "@/lib/dividend-plan";
import { historyWords, oneToWatch, sessionWords, vsDayWords, whenWords, type SeasonStock } from "@/lib/earnings-season";
import type { SeasonView } from "@/lib/earnings-season-data";
import { yearlyOf } from "@/lib/goal/bootstrap";
import type { GoalData } from "@/lib/goal/data";
import { discounted, HINDSIGHT_DISCOUNT, monthWords } from "@/lib/goal/series";
import type { InsightTone, TheRead } from "@/lib/insights";
import { plainLeftOut, signedPct as memoPct } from "@/lib/memo/format";
import type { MemoPageData } from "@/lib/memo/server";
import type { IdeasView } from "@/lib/portfolio-ideas/server";
import type { CallWord } from "@/lib/portfolio-ideas/types";
import { usd } from "@/lib/portfolio-ideas/words";
import { countWord } from "@/lib/read-format";
import { coveredPct, signedPct as stressPct } from "@/lib/stress-test";
import type { StressView } from "@/lib/stress-test-data";
import { VERDICT_RANK, whatChanged, type Verdict } from "@/lib/thesis-watch/rules";
import type { CheckView } from "@/lib/thesis-watch/server";
import { fmtPct, joinList, xrayFootnote } from "@/lib/xray";
import type { XrayView } from "@/lib/xray-data";

/**
 * The My stocks overview: "what your agent noticed this week". Each portfolio
 * tool already writes its own read from real numbers (the memo, the x-ray, the
 * earnings planner, the dividend planner, the stress test, the goal planner,
 * the rebalancing ideas). These rules only pick from what those loaders
 * returned and say it once, with where to see the evidence and, where an agent
 * can do it, a ready "watch this for me" request. No number is worked out
 * here that its own page does not show. Pure, so it can be tested.
 */

/** How one source came back: in time with data, in time with nothing, too slow, or broken. */
export type Loaded<T> = { state: "ready"; value: T } | { state: "empty" } | { state: "slow" } | { state: "failed" };

export type DividendSource = { plan: DividendPlan; read: TheRead | null };

export type HomeSources = {
  memo: Loaded<MemoPageData>;
  xray: Loaded<XrayView>;
  season: Loaded<SeasonView>;
  dividends: Loaded<DividendSource>;
  stress: Loaded<StressView>;
  goal: Loaded<GoalData>;
  ideas: Loaded<IdeasView>;
  /** The reason watcher's checks (lib/thesis-watch). Optional so older callers and tests need not pass it. */
  reasons?: Loaded<ReasonsSource>;
};

/** What the reason watcher found across the person's holdings. */
export type ReasonsSource = {
  checks: Array<Pick<CheckView, "instrumentId" | "ticker" | "kind" | "verdict" | "signals" | "checked"> & Partial<Pick<CheckView, "asOf" | "change">>>;
  /** Holdings that have a reason, and all holdings. */
  withReason: number;
  holdings: number;
  /** Reasons on stocks this plan does not check. */
  locked: number;
};

export type HomeMode = "mine" | "example";

export type ToolId = "portfolio" | "memo" | "xray" | "earnings" | "dividends" | "goal" | "stress" | "ideas" | "taxes";

export type Noticed = {
  id: string;
  tool: ToolId;
  /** The tool it came from, in words: "Weekly memo". */
  caption: string;
  tone: InsightTone;
  /** One plain sentence with its number; the memo's own top line keeps its two or three. */
  text: string;
  /**
   * The short line a lead card opens on: one idea about the stock in `ticker` (or the portfolio when there is
   * none), short enough for a phone. Falls back to `text`.
   */
  headline?: string;
  /** What the headline leaves out, said once: the line under it on a lead card. Null when the headline says it all. */
  why?: string | null;
  /**
   * The finding as a small stock card (owner rule 3): one big figure ("Nov 17", "P/E 31.7", "17%") and one sentence
   * that says what it means. Null when the finding has no figure of its own; the card then shows the headline.
   */
  card?: FindingCard | null;
  /** Where the numbers come from and the day (or instant) they are from, shown beside the evidence. */
  source?: FindingSource | null;
  /** What backs it: one short sentence with the supporting figure or where it comes from. */
  evidence: string | null;
  /** The stock it is about, for its logo. */
  ticker: string | null;
  /** The page with the evidence. */
  open: { label: string; href: string };
  /** A request the agents box reads back before saving anything. */
  watch: { href: string; request: string } | null;
  /** Higher first. */
  priority: number;
  /**
   * A change that asks the person for a decision now: a reason that weakened or broke, a report
   * within a week, a trim or tax-loss idea, one company at 10% or more once funds are counted.
   * The overview leads with these (./focus.ts); the rest wait behind one fold.
   */
  needsYou?: boolean;
};

export type FindingCard = { figure: string; sentence: string };

/** "Earnings calendar", as of an instant (ISO) or a day (YYYY-MM-DD); both null when the source has no date. */
export type FindingSource = { label: string; day: string | null; at: string | null };

export const MAX_NOTICED = 5;
export const MIN_NOTICED = 3;

const CAPTIONS: Record<ToolId, string> = {
  portfolio: "Holdings",
  memo: "Weekly memo",
  xray: "What you own",
  earnings: "Earnings season",
  dividends: "Dividends",
  goal: "Goal planner",
  stress: "Stress test",
  ideas: "Rebalancing ideas",
  taxes: "Taxes",
};

export const TOOL_HREF: Record<ToolId, string> = {
  portfolio: "/portfolio?tab=holdings",
  memo: "/portfolio/memo",
  xray: "/portfolio/xray",
  earnings: "/portfolio/earnings",
  dividends: "/portfolio/dividends",
  goal: "/portfolio/goal",
  stress: "/portfolio/stress",
  ideas: "/portfolio/ideas",
  taxes: "/portfolio/taxes",
};

function ready<T>(loaded: Loaded<T> | undefined): T | null {
  return loaded?.state === "ready" ? loaded.value : null;
}

/** Whole days from `today` to `day`, both YYYY-MM-DD. */
export function daysUntil(day: string, today: string): number {
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((a - b) / 86_400_000);
}

/** A share of the portfolio as the earnings planner says it: whole numbers from 10%, one decimal below. */
function weightWords(weight: number): string {
  return weight >= 10 ? `${Math.round(weight)}%` : `${weight.toFixed(1).replace(/\.0$/, "")}%`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A source line; a value with a time in it is an instant, a bare day is a day, anything else is left out. */
function sourceOf(label: string, when: string | null | undefined): FindingSource {
  const value = (when ?? "").trim();
  if (ISO_DAY.test(value)) return { label, day: value, at: null };
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return { label, day: value.slice(0, 10), at: value };
  return { label, day: null, at: null };
}

/** The first sentence of a paragraph, and the rest. */
function firstSentence(text: string): { first: string; rest: string | null } {
  const match = /^(.+?[.!?])\s+(?=[A-Z0-9])/.exec(text.trim());
  if (!match) return { first: text.trim(), rest: null };
  const rest = text.trim().slice(match[0].length).trim();
  return { first: match[1]!, rest: rest || null };
}

function moveWatch(ticker: string | null | undefined): Noticed["watch"] {
  if (!ticker) return null;
  const href = watchMoveHref(ticker);
  const request = moveRequest(ticker);
  return href && request ? { href, request } : null;
}

/* ── the memo ──────────────────────────────────────────────────────────── */

function memoItem(data: MemoPageData): Noticed | null {
  const memo = data.memo;
  if (!memo.topLine?.trim()) return null;
  // A stored memo may still say who the figure leaves out as how the sum works; said as a fact, like new ones.
  const topLine = plainLeftOut(memo.topLine.trim(), "figure");
  const week = memo.view?.portfolioPct ?? null;
  const through = memo.endDay ? `, written from closes through ${fmtPlanDay(memo.endDay)}` : "";
  const watching = memo.hurt.length;
  const looks = memo.look.length;
  const counts =
    watching + looks > 0
      ? ` It lists ${[watching > 0 ? `${watching} ${watching === 1 ? "thing" : "things"} to watch` : null, looks > 0 ? `${looks} worth a look` : null].filter(Boolean).join(" and ")}.`
      : "";
  return {
    id: `memo-${memo.weekKey}`,
    tool: "memo",
    caption: CAPTIONS.memo,
    tone: memo.week?.tone ?? "flat",
    text: topLine,
    headline: firstSentence(topLine).first,
    why: firstSentence(topLine).rest,
    // The top line's first sentence, so a partial week still says "Together, eight of nine" and who is left out.
    card: week !== null ? { figure: memoPct(week), sentence: firstSentence(topLine).first } : null,
    evidence: `From the memo for the week of ${fmtPlanDay(memo.monday)}${through}.${counts}`,
    source: sourceOf("Weekly memo from daily closes", memo.endDay ?? memo.monday),
    ticker: null,
    open: { label: "Read the memo", href: TOOL_HREF.memo },
    watch: null,
    priority: 100,
  };
}

/* ── what you really own ───────────────────────────────────────────────── */

function xrayItem(view: XrayView): Noticed | null {
  const { xray, read } = view;
  const opened = xray.funds.some((fund) => fund.status === "ok");
  const top = xray.companies[0];
  if (!opened || !top || !read?.headline) return null;
  const lead = read.headlineTickers?.[0] ?? top.ticker;
  return {
    id: `xray-${lead}`,
    tool: "xray",
    caption: CAPTIONS.xray,
    tone: "flat",
    text: read.headline,
    // The headline names the stock the card is labelled with; when the read leads with another, its own words stay.
    headline: top.ticker === lead ? `${top.name} is ${fmtPct(top.pct)} of ${view.mode === "example" ? "the example" : "your money"} once funds are counted.` : read.headline,
    // The evidence line under it already says how much came through funds.
    why: null,
    card:
      top.ticker === lead
        ? {
            figure: fmtPct(top.pct),
            sentence: `${top.name} is ${fmtPct(top.pct)} of ${view.mode === "example" ? "the example" : "your money"} once funds are counted${top.viaFunds > 0 && top.via.length > 0 ? `, ${fmtPct(top.fundPct)} of it through ${joinList(top.via.slice(0, 2).map((slice) => slice.fund))}` : ""}.`,
          }
        : null,
    source: sourceOf(view.pricesAsOf ? "Fund holdings from SEC filings, priced at the close" : "Fund holdings from SEC filings, at today's prices", view.pricesAsOf),
    evidence:
      top.viaFunds > 0 && top.via.length > 0
        ? `${top.name}: ${top.direct > 0 ? `${fmtPct(top.directPct)} bought directly and ` : ""}${fmtPct(top.fundPct)} through ${joinList(top.via.slice(0, 3).map((slice) => slice.fund))}. ${sentence(xrayFootnote(xray))}`
        : sentence(xrayFootnote(xray)),
    ticker: lead,
    open: { label: "See what you really own", href: TOOL_HREF.xray },
    watch: moveWatch(lead),
    priority: top.pct >= 10 ? 75 : 70,
    needsYou: top.pct >= 10,
  };
}

/* ── earnings season ───────────────────────────────────────────────────── */

function earningsWatch(stock: SeasonStock, gap: number): Noticed["watch"] {
  // A reminder only helps when there is a day to spare; a report today or tomorrow gets the big-move agent instead.
  if (gap >= 2) {
    const days = gap >= 4 ? 3 : 1;
    const href = watchEarningsHref(stock.ticker, days);
    const request = earningsRequest(stock.ticker, days);
    if (href && request) return { href, request };
  }
  return moveWatch(stock.ticker);
}

function earningsItem(view: SeasonView): Noticed | null {
  const { season } = view;
  const example = view.mode === "example";
  const holdings = season.reporting.filter((stock) => stock.kind === "holding" && stock.next);
  const watch = oneToWatch(holdings);
  if (!watch?.next) return null;
  const today = season.today;
  const gap = daysUntil(watch.next.date, today);
  const session = sessionWords(watch.next.session);
  const when = `${whenWords(watch.next.date, today)}${session ? ` ${session}` : ""}`;
  const whose = example ? "the example portfolio" : "your portfolio";
  const text =
    holdings.length === 1
      ? `${watch.name} reports ${when}, the only one of ${example ? "the example's" : "your"} holdings to report in the next six weeks${watch.weight !== null ? `, and it is ${weightWords(watch.weight)} of ${whose}` : ""}.`
      : `${watch.name}'s report ${when} matters most${watch.weight !== null ? `: it is ${weightWords(watch.weight)} of ${whose}` : ""}.`;
  const history = historyWords(watch.stats, watch.past, today);
  const vsDay = watch.stats.usualKind === "single" ? null : vsDayWords(watch.stats.vsNormalDay);
  const past = history ? `It ${history}${vsDay ? `, ${vsDay}` : ""}.` : "We have no record of how it moved on past reports.";
  const others = holdings.length > 1 ? ` ${countWord(holdings.length)} of ${example ? "the example's" : "your"} holdings report in the next six weeks.` : "";
  const share = watch.weight !== null ? `It is ${weightWords(watch.weight)} of ${whose}` : null;
  const only = `the only one of ${example ? "the example's" : "your"} holdings to report in the next six weeks`;
  const sessionSaid = session ? `${watch.name} reports ${session}` : null;
  const cardSentence =
    holdings.length === 1
      ? `${sessionSaid ? `${sessionSaid}. It is` : `${watch.name} is`} the only one of ${example ? "the example's" : "your"} holdings to report in the next six weeks${watch.weight !== null ? `, and ${weightWords(watch.weight)} of ${whose}` : ""}.`
      : watch.weight !== null
        ? `${sessionSaid ? `${sessionSaid}, and at` : "At"} ${weightWords(watch.weight)} of ${whose}${sessionSaid ? " it" : ` ${watch.name}`} is the report that matters most.`
        : `${sessionSaid ?? `${watch.name} reports that day`}, the report that matters most of the ${countWord(holdings.length).toLowerCase()} coming up.`;
  return {
    id: `earnings-${watch.ticker}`,
    tool: "earnings",
    caption: CAPTIONS.earnings,
    tone: "flat",
    text,
    headline: `${watch.name} reports ${when}.`,
    why:
      holdings.length === 1
        ? share
          ? `${share}, and ${only}.`
          : `It is ${only}.`
        : `Of the holdings reporting soon, its report matters most${share ? `: it is ${weightWords(watch.weight!)} of ${whose}` : ""}.`,
    card: { figure: fmtPlanDay(watch.next.date), sentence: cardSentence },
    source: sourceOf("Earnings calendar", view.asOf),
    evidence: `${past}${others}`,
    ticker: watch.ticker,
    open: { label: "Plan earnings season", href: TOOL_HREF.earnings },
    watch: earningsWatch(watch, gap),
    priority: gap <= 7 ? 90 : 60,
    needsYou: gap <= 7,
  };
}

/* ── dividends ─────────────────────────────────────────────────────────── */

/** The next payment still to come: the earliest pay date, the bigger amount on a tie. */
export function nextPayment(plan: DividendPlan): { stock: DividendPlan["stocks"][number]; payment: NonNullable<DividendPlan["stocks"][number]["next"]> } | null {
  const rows = plan.stocks
    .filter((stock) => stock.next && !stock.next.paid && stock.next.payDate >= plan.today)
    .map((stock) => ({ stock, payment: stock.next! }));
  rows.sort((a, b) => a.payment.payDate.localeCompare(b.payment.payDate) || (b.payment.amount ?? 0) - (a.payment.amount ?? 0));
  // The one in dollars first, as the dividends page names it; a per-share one only when no holding has a share count.
  return rows.find((row) => row.payment.amount !== null) ?? rows[0] ?? null;
}

function dividendItem(source: DividendSource, example: boolean): Noticed | null {
  const next = nextPayment(source.plan);
  if (!next) return null;
  const { stock, payment } = next;
  const day = `${payment.payDateKnown ? "on" : "around"} ${fmtPlanDay(payment.payDate)}`;
  const whose = example ? "The example's" : "Your";
  const estimate = payment.status === "estimate" ? ", estimated from its past payments" : "";
  const text =
    payment.amount !== null
      ? `${whose} next dividend is about ${fmtDollars(payment.amount)} from ${stock.name} ${day}${estimate}.`
      : `${whose} next dividend is ${fmtPerShare(payment.perShare)} a share from ${stock.name} ${day}${estimate}; add your share count to see it in dollars.`;
  const gap = daysUntil(payment.payDate, source.plan.today);
  return {
    id: `dividend-${stock.ticker}-${payment.payDate}`,
    tool: "dividends",
    caption: CAPTIONS.dividends,
    tone: "up",
    text,
    evidence: source.read?.headline ?? null,
    ticker: stock.ticker,
    open: { label: "Plan your dividends", href: TOOL_HREF.dividends },
    watch: null,
    priority: gap <= 14 ? 65 : 40,
  };
}

/* ── the stress test ───────────────────────────────────────────────────── */

function stressItem(view: StressView): Noticed | null {
  const read = view.read;
  if (!read?.headline) return null;
  const together = read.insights.find((insight) => insight.id === "together");
  // The stock that did the most damage is the line under the headline; it rides along as evidence with the watch on it.
  const driver = read.insights.find((insight) => insight.id.startsWith("driver-") || insight.id.startsWith("hardest-"));
  const lead = read.headlineTickers?.[0] ?? null;
  // The line starts with the ticker (the read draws it as a logo and name); in plain evidence text, the name reads better.
  const driverText = driver ? (driver.leadName && driver.text.startsWith(`${driver.tickers?.[0]} `) ? `${driver.leadName}${driver.text.slice(driver.tickers![0]!.length)}` : driver.text) : null;
  const worst = view.result?.episodes
    .filter((item) => item.episode.kind === "fall" && item.portfolio !== null && item.market !== null)
    .sort((a, b) => a.portfolio! - b.portfolio!)[0];
  return {
    id: "stress-worst",
    tool: "stress",
    caption: CAPTIONS.stress,
    tone: together?.tone ?? "flat",
    text: read.headline,
    headline: read.headline,
    why: driverText,
    card: worst ? { figure: stressPct(worst.portfolio), sentence: read.headline } : null,
    evidence: together?.text ?? null,
    source: sourceOf("Daily closes for the holdings and the S&P 500", view.history?.last),
    ticker: lead,
    open: { label: "Run the stress test", href: TOOL_HREF.stress },
    watch: moveWatch(lead),
    priority: together?.tone === "down" ? 55 : 50,
  };
}

/* ── rebalancing and tax-loss ideas ────────────────────────────────────── */

/** "Our call on Microsoft is to keep it": the call words (Buy more / Keep / Sell some) as a sentence. */
const CALL_AIM: Record<CallWord, string> = { Add: "to buy more", Hold: "to keep it", Trim: "to sell some" };

function ideasItem(view: IdeasView): Noticed | null {
  const read = view.read;
  if (!read?.headline) return null;
  const trim = view.plan.trims[0];
  const loss = view.losses[0];
  const example = view.subject === "example";
  const whose = example ? "the example" : "your portfolio";
  const source = view.pricesAsOf ? sourceOf("Closing prices and our daily screen", view.pricesAsOf) : sourceOf("Live prices and our daily screen", view.snapshotDay);
  if (trim) {
    // The card is labelled with the stock to sell, so its lines are about that stock; the read's portfolio-wide
    // headline ("3 companies are each above 10%, led by Apple") is context in the evidence.
    const before = Number.isFinite(trim.before) ? fmtPct(trim.before) : "";
    const headline =
      !before || !trim.subject
        ? trim.sentence
        : trim.kind === "company"
          ? `${trim.subject} is ${before} of ${whose} once funds are counted.`
          : trim.kind === "sector"
            ? `Selling some ${trim.name} would bring ${trim.subject} down to ${fmtPct(trim.after)} of ${whose}.`
            : `${trim.name} has grown to ${before} of ${whose}.`;
    const call = trim.call ? CALL_AIM[trim.call] : null;
    const context = trim.subject && read.headline.startsWith(trim.subject) ? null : read.headline;
    const evidence = [context, call ? `Our call on ${trim.name} is ${call}.` : null].filter(Boolean).join(" ");
    // The sale in short, without repeating the share already in the headline (or the ideas page's "this portfolio").
    const count = Number.isFinite(trim.shares) && trim.shares > 0 ? `about ${trim.shares} ${trim.shares === 1 ? "share" : "shares"}${trim.sentence.includes(", half the") ? ", half the holding," : ""}` : null;
    const why =
      headline === trim.sentence
        ? null
        : trim.kind === "sector"
          ? `${trim.subject} is ${before} of ${whose} today.`
          : count && Number.isFinite(trim.after)
            ? `Selling ${count} would bring it to ${fmtPct(trim.after)}.`
            : trim.sentence;
    return {
      id: `ideas-trim-${trim.ticker}`,
      tool: "ideas",
      caption: CAPTIONS.ideas,
      tone: "flat",
      text: trim.sentence,
      headline,
      why,
      card: before ? { figure: before, sentence: why ? `${headline} ${why}` : headline } : null,
      evidence: evidence || null,
      source,
      ticker: trim.ticker,
      open: { label: "See where to sell some", href: TOOL_HREF.ideas },
      watch: moveWatch(trim.ticker),
      priority: 80,
      needsYou: true,
    };
  }
  if (loss) {
    const look = loss.similar[0];
    // The ideas loader already built the "falls another 5%" request; read it back out of its link.
    const request = loss.watch ? new URLSearchParams(loss.watch.href.split("?")[1] ?? "").get("q") : null;
    return {
      id: `ideas-loss-${loss.ticker}`,
      tool: "ideas",
      caption: CAPTIONS.ideas,
      tone: "down",
      text: `${loss.name} sits ${usd(loss.loss)} below ${example ? "what was paid" : "what you paid"}.`,
      card: { figure: usd(loss.loss), sentence: `${loss.name} sits that far below ${example ? "what was paid" : "what you paid"}, so selling it would book a loss for tax.` },
      evidence:
        [
          look ? `${look.name} is a similar ${look.fund ? "fund" : "company"} to hold meanwhile, so selling for the tax would not leave the money idle.` : null,
          view.losses.length > 1 ? read.headline : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      source,
      ticker: loss.ticker,
      open: { label: "See the tax-loss idea", href: TOOL_HREF.ideas },
      watch: loss.watch && request ? { href: loss.watch.href, request } : moveWatch(loss.ticker),
      priority: 75,
      needsYou: true,
    };
  }
  // Nothing to do is a real answer; it only fills a short list.
  return {
    id: "ideas-quiet",
    tool: "ideas",
    caption: CAPTIONS.ideas,
    tone: "flat",
    text: read.headline,
    evidence: null,
    ticker: null,
    open: { label: "See how we checked", href: TOOL_HREF.ideas },
    watch: null,
    priority: 10,
  };
}

/* ── the reason watcher ─────────────────────────────────────────────────── */

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const VERDICT_PHRASE: Record<Verdict, string> = { holds: "still holds", weaker: "is weaker", broken: "looks broken", played_out: "has played out" };

const oneDecimal = (value: number) => value.toFixed(1).replace(/\.0$/, "");

const VERDICT_FIGURE: Record<Verdict, string> = { holds: "Holds", weaker: "Weaker", broken: "Broken", played_out: "Played out" };

/**
 * A reason finding as a card: the figure behind the verdict ("P/E 31.7" for a stock that is no longer cheap,
 * "+24%" for a trade that reached its target), else the verdict in a word, with one sentence on what changed.
 */
function reasonCard(check: ReasonsSource["checks"][number], example: boolean, others: number): FindingCard {
  const bought = example ? "what it was bought for" : "what you bought it for";
  const done = check.verdict === "played_out" ? check.signals.find((signal) => signal.level === "done") : null;
  const more = others > 0 ? ` ${others === 1 ? "One other reason needs" : `${capital(countWord(others))} other reasons need`} a look too.` : "";
  if (done?.id === "no_longer_cheap" && typeof done.data.pe === "number" && typeof done.data.pe_percentile_pct === "number") {
    const median = typeof done.data.pe_median === "number" ? `, and half the time it has been below ${oneDecimal(done.data.pe_median)}` : "";
    return {
      figure: `P/E ${oneDecimal(done.data.pe)}`,
      sentence: `${check.ticker} has done ${bought}: it is no longer cheap, with a P/E higher than on ${Math.round(done.data.pe_percentile_pct)}% of past days${median}.${more}`,
    };
  }
  if (done?.id === "trade_target" && typeof done.data.move_pct === "number") {
    const move = done.data.move_pct;
    return {
      figure: `${move >= 0 ? "+" : "−"}${oneDecimal(Math.abs(move))}%`,
      sentence: `${check.ticker} has done ${bought} as a short-term trade.${more}`,
    };
  }
  const signal = check.signals[0]?.text?.trim();
  return {
    figure: VERDICT_FIGURE[check.verdict],
    sentence: `${signal ? signal : `The reason for owning ${check.ticker} ${VERDICT_PHRASE[check.verdict]}.`}${more}`,
  };
}

function reasonsItem(source: ReasonsSource, example: boolean): Noticed | null {
  const ranked = [...source.checks].sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.ticker.localeCompare(b.ticker));
  const worst = ranked[0];
  const owner = example ? "In the example, the reason for owning" : "Your reason for owning";
  if (worst && worst.verdict !== "holds") {
    const others = ranked.filter((check) => check !== worst && check.verdict !== "holds").length;
    const changed = whatChanged(worst);
    return {
      id: `reason-${worst.ticker}-${worst.verdict}`,
      tool: "portfolio",
      caption: "Why you own it",
      tone: worst.verdict === "played_out" ? "flat" : "down",
      text: `${owner} ${worst.ticker} ${VERDICT_PHRASE[worst.verdict]}.${others > 0 ? ` ${others === 1 ? "One other reason needs" : `${capital(countWord(others))} other reasons need`} a look too.` : ""}`,
      // A reason that played out says what changed ("UNH has done what you bought it for: it is no longer cheap…").
      headline: changed?.headline ?? `The reason for owning ${worst.ticker} ${VERDICT_PHRASE[worst.verdict]}.`,
      why: others > 0 ? `${others === 1 ? "One other reason needs" : `${capital(countWord(others))} other reasons need`} a look too.` : null,
      card: reasonCard(worst, example, others),
      evidence: changed ? changed.rest : (worst.signals[0]?.text ?? null),
      source: worst.signals[0]?.source ? sourceOf(worst.signals[0].source, worst.signals[0].asOf ?? worst.asOf) : worst.asOf ? sourceOf("The reason watcher", worst.asOf) : null,
      ticker: worst.ticker,
      open: { label: `See ${worst.ticker}`, href: `/stock/${encodeURIComponent(worst.ticker)}` },
      watch: null,
      priority: worst.verdict === "broken" ? 95 : worst.verdict === "weaker" ? 85 : 70,
      needsYou: true,
    };
  }
  if (worst) {
    // In the example the reasons are made up; a cost line would talk about "you", so a company fact backs it instead.
    const backer = ranked.find((check) => check.checked.some((line) => line.id !== "cost")) ?? worst;
    const line = backer.checked.find((item) => item.id !== "cost") ?? null;
    const missing = source.holdings - source.withReason;
    const n = ranked.length;
    return {
      id: "reasons-hold",
      tool: "portfolio",
      caption: "Why you own it",
      tone: "up",
      card: { figure: `${n} of ${n}`, sentence: example ? `All ${countWord(n).toLowerCase()} reasons in the example still hold.` : `${n === 1 ? "The reason you gave still holds" : `All ${countWord(n).toLowerCase()} reasons you gave still hold`}.` },
      text: example
        ? `All ${n} reasons in the example still hold.`
        : `${n === 1 ? "The reason we checked still holds" : `All ${n} reasons we checked still hold`}.${missing > 0 ? ` ${missing === 1 ? "One holding has" : `${capital(countWord(missing))} holdings have`} no reason yet.` : ""}`,
      evidence: line ? `${backer.ticker}: ${line.text}` : null,
      ticker: line ? backer.ticker : null,
      open: example ? { label: "See the example portfolio", href: TOOL_HREF.portfolio } : { label: missing > 0 ? "Add your reasons" : "Review your reasons", href: "/portfolio?tab=holdings&reasons=1" },
      watch: null,
      priority: 30,
    };
  }
  if (example || source.holdings === 0) return null;
  if (source.locked > 0) return null;
  return {
    id: "reasons-none",
    tool: "portfolio",
    caption: "Why you own it",
    tone: "flat",
    text:
      source.withReason === 0
        ? `You have not said why you own ${source.holdings === 1 ? "your holding" : `any of your ${source.holdings} holdings`}.`
        : "We could not check your reasons today.",
    evidence: source.withReason === 0 ? "Give each one a reason and the agent checks it against the company's numbers, and marks it when it weakens or breaks." : null,
    ticker: null,
    open: { label: "Add your reasons", href: "/portfolio?tab=holdings&reasons=1" },
    watch: null,
    priority: 25,
  };
}

/**
 * What the agent noticed: the memo's top line first, then the rest by how soon
 * and how much it matters (an earnings report within a week, a trim idea, a
 * hidden concentration, a dividend within two weeks, the worst past shock), at
 * most five. A quiet "nothing to rebalance" only fills a list shorter than three.
 * The x-ray item goes when the trim idea is about the same company.
 */
export function pickNoticed(sources: Omit<HomeSources, "goal">, mode: HomeMode): Noticed[] {
  const example = mode === "example";
  const memo = ready(sources.memo);
  const xray = ready(sources.xray);
  const season = ready(sources.season);
  const dividends = ready(sources.dividends);
  const stress = ready(sources.stress);
  const ideas = ready(sources.ideas);
  const reasons = ready(sources.reasons);

  const ideasPick = ideas ? ideasItem(ideas) : null;
  let xrayPick = xray ? xrayItem(xray) : null;
  const trim = ideas?.plan.trims[0];
  if (xrayPick && trim && trim.kind === "company" && xrayPick.ticker === trim.ticker) xrayPick = null;
  // The ideas headline already names every company over the line (a Buy more one gets no trim, so trims[0] can miss it).
  const ideasAboutSize = ideasPick !== null && !ideasPick.id.startsWith("ideas-loss-");
  if (xrayPick && ideasAboutSize && ideas?.plan.companiesOver?.some((row) => row.ticker === xrayPick?.ticker)) xrayPick = null;

  const all = [
    memo ? memoItem(memo) : null,
    season ? earningsItem(season) : null,
    ideasPick,
    xrayPick,
    dividends ? dividendItem(dividends, example) : null,
    stress ? stressItem(stress) : null,
    reasons ? reasonsItem(reasons, example) : null,
  ].filter((item): item is Noticed => item !== null);

  const ranked = [...all].sort((a, b) => b.priority - a.priority);
  const strong = ranked.filter((item) => item.priority >= 20);
  const filler = ranked.filter((item) => item.priority < 20);
  const picked = [...strong, ...filler.slice(0, Math.max(0, MIN_NOTICED - strong.length))].slice(0, MAX_NOTICED);
  // One offer per request: a second "tell me when AAPL moves 5%" further down adds nothing.
  const offered = new Set<string>();
  return picked.map((item) => {
    if (!item.watch) return item;
    if (offered.has(item.watch.href)) return { ...item, watch: null };
    offered.add(item.watch.href);
    return item;
  });
}

/* ── the tools, each with one live figure ──────────────────────────────── */

export type ToolCard = {
  id: ToolId;
  /** What you do there, in plain words: "Read this week's memo". */
  title: string;
  href: string;
  /** One live figure, or null when the source has none (or did not answer in time). */
  figure: string | null;
  /** What the figure is, or why there is none. */
  detail: string;
  /** The figure only says there is nothing there ("Nothing to trim", "No losses"): no row of its own in a list. */
  empty: boolean;
};

export type ToolGroup = { label: string; tools: ToolId[] };

/** The same three groups as the My stocks navigation (components/oa/nav-items.ts). */
export const TOOL_GROUPS: ToolGroup[] = [
  { label: "Your stocks", tools: ["portfolio", "memo", "xray"] },
  { label: "Plan ahead", tools: ["earnings", "dividends", "goal", "stress"] },
  { label: "Act", tools: ["ideas", "taxes"] },
];

/** Each tool by the name of its place (owner rule 1: no "See…" or "Plan…" on every row), as in the navigation. */
export const TOOL_TITLES: Record<ToolId, string> = {
  portfolio: "Holdings",
  memo: "Weekly memo",
  xray: "What you own",
  earnings: "Earnings season",
  dividends: "Dividends",
  goal: "Goal planner",
  stress: "Stress test",
  ideas: "Rebalancing ideas",
  taxes: "Taxes",
};

/** Which source a tool's figure comes from, so a card can wait for that one only and say plainly when it is slow. */
export const SOURCE_OF: Record<ToolId, keyof HomeSources> = {
  portfolio: "goal",
  memo: "memo",
  xray: "xray",
  earnings: "season",
  dividends: "dividends",
  goal: "goal",
  stress: "stress",
  ideas: "ideas",
  taxes: "ideas",
};

const WAITING: Record<Exclude<Loaded<unknown>["state"], "ready">, string> = {
  empty: "Nothing to show here yet.",
  slow: "Still working this out; open it to see.",
  failed: "This could not be read just now; open it to try again.",
};

/** The goal planner's yearly figure for the holdings: half their past lead over the S&P 500, as the planner replays it. */
export function goalYearly(goal: GoalData): number | null {
  const own = goal.mixes.find((mix) => mix.id === "own");
  const spy = goal.mixes.find((mix) => mix.id === "spy");
  if (!own) return null;
  return spy ? yearlyOf(discounted(own.returns, spy.returns, HINDSIGHT_DISCOUNT)) : own.yearly;
}

function figureFor(id: ToolId, sources: Partial<HomeSources>, mode: HomeMode): (Pick<ToolCard, "figure" | "detail"> & { empty?: true }) | null {
  const example = mode === "example";
  const your = example ? "the example's" : "your";
  switch (id) {
    case "portfolio": {
      const goal = ready(sources.goal);
      if (!goal) return null;
      if (goal.portfolioValue === null) return { figure: null, detail: "Add share counts in Portfolio to see what your holdings are worth." };
      const left = goal.unvalued.length;
      return {
        figure: usd(goal.portfolioValue),
        detail: `${example ? "The example's" : "Your"} holdings${goal.pricesAsOf ? ` at the ${fmtPlanDay(goal.pricesAsOf)} close` : ""}${left > 0 ? `, leaving out ${left} without a share count` : ""}.`,
      };
    }
    case "memo": {
      const memo = ready(sources.memo)?.memo;
      // The overview only reads stored memos; opening the memo writes this week's.
      if (!memo) return sources.memo?.state === "empty" && !example ? { figure: null, detail: "Open it and this week's memo is written for your holdings." } : null;
      const watch = memo.hurt.length;
      const look = memo.look.length;
      if (watch + look === 0) return { figure: "A quiet week", detail: `Nothing in ${your} stocks needs a decision.`, empty: true };
      return {
        figure: watch > 0 ? `${watch} to watch` : `${look} worth a look`,
        detail:
          watch > 0 && look > 0
            ? `Plus ${look} worth a look, in the memo for the week of ${fmtPlanDay(memo.monday)}.`
            : `In the memo for the week of ${fmtPlanDay(memo.monday)}.`,
      };
    }
    case "xray": {
      const xray = ready(sources.xray)?.xray;
      if (!xray) return null;
      const top = xray.companies[0];
      if (!xray.funds.some((fund) => fund.status === "ok") || !top) {
        return { figure: null, detail: xray.funds.length === 0 ? `None of ${your} holdings is a fund, so there is nothing hidden to add up.` : "We cannot see inside these funds yet." };
      }
      // The ticker, not the name: a long company name would wrap the figure (owner rule 3, tickers only).
      return { figure: `${top.ticker} ${fmtPct(top.pct)}`, detail: "The biggest company once funds are counted." };
    }
    case "earnings": {
      const season = ready(sources.season)?.season;
      if (!season) return null;
      const holdings = season.reporting.filter((stock) => stock.kind === "holding");
      if (holdings.length === 0) return { figure: "No reports", detail: `None of ${your} holdings reports in the next six weeks.`, empty: true };
      const first = holdings[0]!;
      return {
        figure: `${holdings.length} ${holdings.length === 1 ? "report" : "reports"}`,
        detail: `In the next six weeks; ${first.name} is first, ${whenWords(first.next!.date, season.today)}.`,
      };
    }
    case "dividends": {
      const source = ready(sources.dividends);
      if (!source) return null;
      if (source.plan.total > 0) return { figure: fmtDollars(source.plan.total), detail: "Expected over the next twelve months." };
      return { figure: null, detail: source.read?.headline ?? "Nothing to plan yet." };
    }
    case "goal": {
      const goal = ready(sources.goal);
      if (!goal) return null;
      const yearly = goalYearly(goal);
      if (yearly === null) return null;
      return {
        figure: `${(yearly * 100).toFixed(1)}% a year`,
        detail: `Before inflation, from how ${your} holdings did since ${monthWords(goal.span.first)}.`,
      };
    }
    case "stress": {
      const result = ready(sources.stress)?.result;
      if (!result) return null;
      const worst = result.episodes
        .filter((item) => item.episode.kind === "fall" && item.portfolio !== null && item.market !== null)
        .sort((a, b) => a.portfolio! - b.portfolio!)[0];
      if (!worst) return null;
      const covered = coveredPct(worst);
      return {
        figure: stressPct(worst.portfolio),
        detail: `In the ${worst.episode.name}, against ${stressPct(worst.market)} for the S&P 500${covered < 100 ? `, for the ${covered}% of ${your} holdings we have prices for then` : ""}.`,
      };
    }
    case "ideas": {
      const ideas = ready(sources.ideas);
      if (!ideas || !(ideas.plan.total > 0)) return null;
      const trims = ideas.plan.trims.length;
      if (trims === 0) return { figure: "Nothing to trim", detail: `${example ? "The example" : "Your portfolio"} is not leaning too hard on one company or sector.`, empty: true };
      return {
        figure: `${trims} trim ${trims === 1 ? "idea" : "ideas"}`,
        detail: ideas.plan.adds.length > 0 ? `With ${ideas.plan.adds.length} ${ideas.plan.adds.length === 1 ? "place" : "places"} the money could go.` : "With the tax on each sale.",
      };
    }
    case "taxes": {
      const ideas = ready(sources.ideas);
      if (!ideas || !(ideas.plan.total > 0)) return null;
      const losses = ideas.losses;
      if (losses.length === 0) return { figure: "No losses", detail: `No holding is far enough below ${example ? "what was paid" : "what you paid"} to sell for tax.`, empty: true };
      const total = losses.reduce((sum, loss) => sum + loss.loss, 0);
      return {
        figure: usd(total),
        detail: `Below ${example ? "what was paid" : "what you paid"} across ${losses.length} ${losses.length === 1 ? "holding" : "holdings"}.`,
      };
    }
  }
}

/** One tool's card; `sources` needs only the tool's own source (SOURCE_OF), and a missing one reads as slow. */
export function toolCard(id: ToolId, sources: Partial<HomeSources>, mode: HomeMode): ToolCard {
  const figure = figureFor(id, sources, mode);
  const state = sources[SOURCE_OF[id]]?.state ?? "slow";
  return {
    id,
    title: TOOL_TITLES[id],
    href: TOOL_HREF[id],
    figure: figure?.figure ?? null,
    detail: figure?.detail ?? WAITING[state === "ready" ? "empty" : state],
    empty: figure?.figure == null || figure.empty === true,
  };
}
