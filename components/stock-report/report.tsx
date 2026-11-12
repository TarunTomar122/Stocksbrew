import { Suspense, type ReactNode } from "react";
import { todayET } from "@/lib/calendar-shared";

import { MarketStatusInline } from "@/components/market-status";
import { RangeBar } from "@/components/oa/kit";
import { CALL_PLAIN, countWord, plainAction, plainCallReason, wholeSentences } from "@/lib/plain-copy";
import { callBasis, factHasDate, lastReportOn } from "@/lib/call-basis";
import { CoverButton, LockCard } from "@/components/oa/gate";
import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StockLogo } from "@/components/stock-logo";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import { TrackButton } from "@/components/track-button";
import { TrackView } from "@/components/track-view";
import { AskPageHint } from "@/components/ask/ask-page-hint";
import { TheRead } from "@/components/oa/insight";
import { packChartRanges, type CallWord, type ChartRange, type PackedChartRanges } from "@/lib/stock-chart";

import { AlertControls, type SuggestedAlert } from "./alert-controls";
import { callHeading, callMeaning } from "./call-line";
import { capTier, compactMoney, daysBetween, fin, fmtDate, fmtStamp, levelFormatter, moneyFormatter, relativeDays, signedPct } from "./format";
import { PricePanel, type PanelZone } from "./price-panel";
import { LockIcon, Missing, MoreLink, NUM, Panel, PROSE, Tag, TONE_COLOR, type Tone } from "./primitives";
import { PhoneSections } from "./phone-sections";
import { NO_EXTRAS, toSectionData } from "./section-data";
import { sectionAvailability } from "./sections";
import type { ReportData } from "./types";
import { stockCallSteps, type CallSteps } from "@/lib/next-steps";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";
import { ownCallLevel, type CallLevel } from "@/lib/call-level";
import { askContext, formatAskContext } from "@/lib/ask-context";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";
import { limitFor } from "@/lib/entitlements";
import { LatestResults } from "@/components/results/latest-results";

const CALL_TONE: Record<CallWord, Tone | null> = { Add: "up", Hold: null, Trim: "down" };

/** Long research reports a free account gets each month (lib/entitlements.ts). */
const LONG_REPORTS_FREE = limitFor("deep_research", "free");

/**
 * The long research report on a US stock, for a signed-in reader, who can run it on their plan's monthly allowance.
 * Not for a signed-out reader who sees the full-report box: it says the long report comes with a free account, so the
 * page keeps one lock.
 */
function LongReportLink({ ticker }: { ticker: string }) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}/research`}
      prefetch={false}
      data-track="research_entry_clicked"
      data-track-ticker={ticker}
      className="oa-surface flex items-center gap-3 border border-oa-border bg-oa-card px-3.5 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 text-oa-primary" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2.5h7l3 3v8H3z" />
        <path d="M10 2.5v3h3M5.5 8.5h5M5.5 11h3.5" />
      </svg>
      <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">
        <span className="font-medium">Read a long, sourced report on {ticker}.</span>{" "}
        <span className="text-oa-muted-fg">The business, the case for and against, valuation against peers and what to watch.</span>
      </span>
    </Link>
  );
}

/** Shown where the price zones would be, on a stock the viewer's agent does not cover. */
function LevelsLock({ ticker, instrumentId, tracked, gate, market }: { ticker: string; instrumentId: string; tracked: boolean; gate: ReportData["gate"]; market: "US" | "IN" }) {
  // "Covering" is our word; readers get "the full report on five (three on PAYWALL_V2) stocks you pick".
  const left = `${gate.slotsLeft} of your ${FREE_COVERED_WORD} free full reports ${gate.slotsLeft === 1 ? "is" : "are"} left`;
  const title = gate.plan === "anon" ? `Sign in to read the full report on ${ticker}` : `Get the full report on ${ticker}`;
  const body =
    gate.plan === "anon"
      ? // The page's one lock (owner, Nov 12): the long research report, which also needs an account, is said here
        // instead of in a second box at the foot of the page.
        `Our call, why we made it and what would change it are free for everyone. A free account also gets the full report on ${FREE_COVERED_WORD} stocks you pick, with the prices where we'd buy more or sell some and a note before earnings${market === "US" && LONG_REPORTS_FREE > 0 ? `, and ${countWord(LONG_REPORTS_FREE).toLowerCase()} long research ${LONG_REPORTS_FREE === 1 ? "report" : "reports"} a month on any stock` : ""}.`
      : !tracked
        ? gate.slotsLeft > 0
          ? `Add ${ticker} to your portfolio and it gets one of your free full reports: the prices where we'd act, the whole brief and a note before earnings. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Add ${ticker} to your portfolio and swap it in for one of them (one swap a week on Free), or go Pro for a full report on every stock.`
        : gate.slotsLeft > 0
          ? `You follow ${ticker}. Turn on its full report to see the prices where we'd act, the whole brief and a note before earnings. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Swap one out in Portfolio (free any time) to make room for ${ticker}, or go Pro for a full report on every stock.`;
  return (
    <div className="flex flex-col gap-2">
      <LockCard feature="stock_zones" plan={gate.plan} trialEligible={gate.trialEligible} ticker={ticker} title={title} body={body} stacked />
      {gate.plan === "free" && tracked ? (
        gate.slotsLeft > 0 ? (
          <CoverButton instrumentId={instrumentId} ticker={ticker} />
        ) : (
          <Link prefetch={false} href="/portfolio?tab=holdings" className="self-start text-[13px] font-medium text-oa-primary hover:underline">
            Choose your {FREE_COVERED_WORD} in Portfolio
          </Link>
        )
      ) : null}
    </div>
  );
}

function ProLock({ ticker, market, what, compact = false }: { ticker: string; market: "US" | "IN"; what: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-3.5 py-4 sm:px-4">
      <p className="flex items-start gap-2 text-[14px] leading-5 text-oa-fg">
        <span className="mt-0.5 text-oa-primary">
          <LockIcon />
        </span>
        <span>
          {what}
          {compact ? null : ` The numbers, filings, news and charts on this page are free for every stock, including ${ticker}.`}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {market === "US" ? (
          <ProCheckoutButton size="sm">Unlock with Pro</ProCheckoutButton>
        ) : null}
        <MoreLink href="/pricing">See what Pro includes</MoreLink>
      </div>
    </div>
  );
}

/** The call's next steps: ask about it, or have an agent watch it. Each opens prefilled; nothing runs or saves on its own. */
function CallNextSteps({ ticker, steps, stacked = false }: { ticker: string; steps: CallSteps; stacked?: boolean }) {
  const link = "rounded font-medium text-oa-primary hover:underline";
  if (stacked) {
    // Under the price on a wide screen: one link per line, so the call column keeps only the call and its reasons.
    return (
      <ul
        role="list"
        data-track-links="insight_clicked"
        data-track-insight-id="stock-call"
        data-track-insight-kind="call"
        data-track-ticker={ticker}
        className="flex flex-col gap-1.5 text-[13px] leading-5"
      >
        {steps.ask.map((step) => (
          <li key={step.href}>
            <AppLink href={step.href} data-track-target="ask" className={link}>
              {/* No trailing arrow (owner rule 1): the line itself is the control. */}
              {step.label}
            </AppLink>
          </li>
        ))}
        {steps.watch ? (
          <li>
            <AppLink href={steps.watch.href} data-track-target="watch" className={link}>
              {steps.watch.label}
            </AppLink>
          </li>
        ) : null}
      </ul>
    );
  }
  return (
    <div
      data-track-links="insight_clicked"
      data-track-insight-id="stock-call"
      data-track-insight-kind="call"
      data-track-ticker={ticker}
      className="mt-2.5 border-t border-oa-border pt-2.5 text-[13px] leading-5"
    >
      <p className="flex flex-wrap gap-x-4 gap-y-2 sm:gap-y-1">
        <span className="text-oa-muted-fg">Ask about this</span>
        {steps.ask.map((step) => (
          <AppLink key={step.href} href={step.href} data-track-target="ask" className={link}>
            {step.label}
          </AppLink>
        ))}
      </p>
      {steps.watch ? (
        <p className="mt-2 sm:mt-1.5">
          <AppLink href={steps.watch.href} data-track-target="watch" className={link}>
            {steps.watch.label}
          </AppLink>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The key stats under the chart: a ruled table, label on the left and the
 * figure on the right at reading size, two columns from md. Reads like a
 * fact sheet rather than a strip of captions.
 */
function KeyStats({ items }: { items: Array<{ label: string; value: ReactNode; sub?: ReactNode }> }) {
  // Labels are plain words ("Company value", "Today's range"), so they wrap rather than cut off.
  if (!items.length) return null;
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)].filter((column) => column.length);
  return (
    <div className="grid px-3.5 py-1.5 sm:px-4 md:grid-cols-2 md:gap-x-8">
      {columns.map((column, index) => (
        <dl key={index} className={index > 0 ? "max-md:border-t max-md:border-oa-border" : ""}>
          {column.map((item) => (
            <div key={item.label} className="flex min-h-[38px] items-center justify-between gap-4 border-b border-oa-border py-1.5 last:border-b-0">
              <dt className="min-w-0 text-pretty text-[15px] leading-[22px] text-oa-muted-fg">{item.label}</dt>
              <dd className={`${NUM} shrink-0 text-right text-[15px] font-medium leading-[22px] text-oa-fg`}>
                {item.value}
                {item.sub ? <span className="ml-1.5 text-[13px] font-normal text-oa-muted-fg">{item.sub}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}

/** The chart's ranges as one shared series when they pack (a quarter of the bytes), else as they are. */
function packedOrRanges(ranges: ChartRange[]): { packed: PackedChartRanges } | { ranges: ChartRange[] } {
  const packed = packChartRanges(ranges);
  return packed ? { packed } : { ranges };
}

/** The call block's short words for its own level. */
const CALL_LEVEL_WORDS: Record<CallLevel["label"], string> = {
  "We'd buy more below": "Buy more below",
  "We'd buy more above": "Buy more above",
  "We'd sell some above": "Sell some above",
};

export function StockReport({
  data,
  related,
  below,
}: {
  data: ReportData;
  /** Links to the stock's sector, rivals, insiders and earnings pages, streamed in under the head. */
  related?: ReactNode;
  /** What changed and the deeper report (below.tsx), streamed in after the top. */
  below?: ReactNode;
}) {
  const { stock, market, currency, nowIso, read, readState, facts, fundamentals } = data;
  const today = todayET(Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now());
  const money = moneyFormatter(currency);
  const level = levelFormatter(currency);

  const dayPct = fin(stock.day_change_pct) ? stock.day_change_pct : null;
  const dayAbs = fin(stock.day_change_abs) ? stock.day_change_abs : null;
  const dayTone: Tone | undefined = dayPct == null ? undefined : dayPct >= 0 ? "up" : "down";
  const marketCap = facts?.quick_stats?.market_cap ?? fundamentals?.market_cap ?? null;
  const tierLabel = capTier(marketCap);
  const subline = [stock.exchange, stock.sector, stock.industry && stock.industry !== stock.sector ? stock.industry : null, tierLabel]
    .filter(Boolean)
    .join(" · ");

  // ── the call on the chart ─────────────────────────────────────────────────
  const zones: PanelZone[] = [];
  const suggested: SuggestedAlert[] = [];
  // The call's own price level, the one source for the chart, the alert suggestions and the call block below.
  let own: CallLevel | null = null;
  if (read && readState === "ready") {
    // Levels more than half the price away are left out everywhere on the page: header, chart, read and alert suggestions.
    const within = (value: number | null | undefined) =>
      value && fin(stock.price) && stock.price > 0 && Math.abs(value - stock.price) / stock.price <= 0.5 ? value : null;
    const addBelow = within(read.zones.addBelow);
    const addAbove = within(read.zones.addAbove);
    const trimAbove = within(read.zones.trimAbove);
    // The call shows only its own level (owner rule 8, lib/call-level.ts): the buy-more price on Buy more, the
    // sell-some price on Sell some, none on Keep. The chart and the alert suggestions follow it, so a Keep never sits
    // beside a price to buy or sell at.
    own = ownCallLevel(read.call, { addBelow, addAbove, trimAbove: trimAbove && (!addBelow || trimAbove > addBelow) ? trimAbove : null });
    if (own?.label === "We'd buy more below") {
      zones.push({ key: "add", price: own.price, side: "below", tone: "up", label: `Buy more below ${level(own.price)}` });
      suggested.push({ id: "add", label: "Buy-more price", condition: "below", price: own.price, note: `Buy more below ${level(own.price)}` });
    } else if (own?.label === "We'd buy more above") {
      suggested.push({ id: "add", label: "Buy if it breaks higher", condition: "above", price: own.price, note: `Buy more above ${level(own.price)}` });
    } else if (own?.label === "We'd sell some above") {
      zones.push({ key: "trim", price: own.price, side: "above", tone: "down", label: `Sell some above ${level(own.price)}` });
      suggested.push({ id: "trim", label: "Sell-some price", condition: "above", price: own.price, note: `Sell some above ${level(own.price)}` });
    }
  }
  // Support and resistance stay in Technicals: the chart carries at most two labels.

  const nextEarnings = data.earnings.next;
  const earningsIn = nextEarnings ? daysBetween(today, nextEarnings.event_date) : null;
  const earningsLabel = nextEarnings
    ? `${fmtDate(nextEarnings.event_date, false)}${nextEarnings.time === "bmo" ? " before open" : nextEarnings.time === "amc" ? " after close" : ""}`
    : null;

  // ── header stats ──────────────────────────────────────────────────────────
  const pe = fundamentals?.pe_ttm ?? facts?.quick_stats?.pe_ttm ?? null;
  const high52 = fundamentals?.week_52_high;
  const low52 = fundamentals?.week_52_low;
  const headerStats = [
    fin(marketCap) && marketCap > 0 ? { label: "Company value", value: compactMoney(marketCap, currency) } : null,
    fin(pe) && pe > 0 ? { label: "Price / last year's earnings", value: `${pe.toFixed(1)}×` } : null,
    fin(stock.day_low) && fin(stock.day_high) && stock.day_high > stock.day_low
      ? { label: "Today's range", value: <RangeBar low={stock.day_low} high={stock.day_high} value={stock.price} className="w-36 sm:w-44" /> }
      : null,
    fin(low52) && fin(high52) && high52 > low52 ? { label: "Past year's range", value: <RangeBar low={low52} high={high52} value={stock.price} className="w-36 sm:w-44" /> } : null,
    fin(stock.previous_close) && stock.previous_close > 0 ? { label: "Yesterday's close", value: money(stock.previous_close) } : null,
    fin(fundamentals?.beta)
      ? { label: "Swings vs the market", value: `${fundamentals.beta.toFixed(1)}×`, sub: fundamentals.beta >= 1.3 ? "bigger" : fundamentals.beta <= 0.8 ? "smaller" : "about the same" }
      : null,
    // One yield on the whole page: the annual dividend at the current rate over today's price (lib/stock-header-facts.ts).
    fin(fundamentals?.dividend_yield_pct) && fundamentals.dividend_yield_pct > 0
      ? {
          label: "Dividend yield",
          value: `${fundamentals.dividend_yield_pct.toFixed(2)}%`,
          sub: fin(fundamentals.annual_dividend) && fundamentals.annual_dividend > 0 ? `${money(fundamentals.annual_dividend)} a year` : undefined,
        }
      : null,
    earningsLabel && earningsIn != null && earningsIn >= 0
      ? {
          label: "Next earnings",
          value: fmtDate(nextEarnings!.event_date, false),
          sub: relativeDays(earningsIn),
        }
      : null,
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 8);

  // ── whether the deeper report will have anything (the sections themselves stream in below) ──
  // From the top's own data (a US stock always has ownership). below.tsx gets the same answer, so a stock whose only
  // sections come from the lower half's reads (news, rivals) shows them with "Changes" on a phone.
  const hasReport = Object.values(sectionAvailability(toSectionData(data, NO_EXTRAS))).some(Boolean);

  const callTone = read?.call ? CALL_TONE[read.call] : null;
  const askStock = askContext("stock", { ticker: stock.ticker });

  const ready = readState === "ready" && read ? read : null;
  // A missing or zero quote must not turn into "Infinity% from here".
  const hasPrice = fin(stock.price) && stock.price > 0;
  const fromHere = (price: number) => (hasPrice ? signedPct(((price - stock.price) / stock.price) * 100) : null);
  // A call shows only the price that goes with it (`own`, above): where we'd buy more on Buy more, where we'd sell
  // some on Sell some, and none on Keep; the chart and the alert suggestions use the same level.
  const callLevels = ready && own ? [{ label: CALL_LEVEL_WORDS[own.label], price: own.price }] : [];
  // A call written weeks ago keeps its date in view: its horizon ("the next few weeks") ran from then, and a reason
  // rewritten from newer numbers says so beside it.
  const writtenMs = ready?.writtenAt ? Date.parse(ready.writtenAt) : NaN;
  const callDay = Number.isFinite(writtenMs) ? todayET(writtenMs) : null;
  const callAge = callDay ? daysBetween(callDay, today) : null;
  const callIsOld = callAge != null && callAge > 14;
  const reasonIsNewer = Boolean(callDay && ready?.reasonAsOf && ready.reasonAsOf > callDay);
  const sinceWords = ready?.since ? fmtDate(ready.since, ready.since.slice(0, 4) !== today.slice(0, 4)) : "";
  const reviewedWords = ready?.writtenAt ? fmtStamp(ready.writtenAt) : "";
  // "Our call since Nov 9, last reviewed Nov 10, 4:30 PM ET." One sentence instead of two small labels.
  const callDates = sinceWords
    ? `Our call since ${sinceWords}${reviewedWords ? `, last reviewed ${reviewedWords}` : ""}.`
    : reviewedWords
      ? `${callIsOld || reasonIsNewer ? "Last reviewed" : "Reviewed"} ${reviewedWords}.`
      : "";
  // The evidence under the call (each line with its source and date) and the measurable conditions that would change
  // it (lib/call-evidence.ts). Both are open on every stock, for every reader, like the call itself.
  const evidence = ready ? data.callEvidence?.evidence ?? [] : [];
  const conditions = ready ? data.callEvidence?.conditions ?? [] : [];
  // Without measured conditions, the steady call's own sentence, when it is published.
  const ruleChange = ready && !conditions.length ? ready.whatWouldChange : null;
  // The brief's written "what would change our mind" list, only when the call block has no measured conditions.
  const showChangers = Boolean(ready?.changers.length) && !conditions.length;
  const showReasons = Boolean(ready?.reasons.length);
  const hasChangeBox = conditions.length > 0 || Boolean(ruleChange);
  // The company reason taken apart: the facts the call rests on, each dated, then what would change it (lib/call-basis.ts).
  // Only for the reason written from the company's own numbers; any other reason stays one paragraph.
  const callReason = ready ? plainCallReason(ready.actionSummary) : "";
  const basis =
    ready?.reasonAsOf && callReason
      ? callBasis(callReason, {
          asOf: ready.reasonAsOf,
          lastReport: lastReportOn(
            data.earnings.past.map((event) => event.event_date),
            ready.reasonAsOf,
            facts?.captured_at ?? null,
          ),
        })
      : null;
  // A fact with no day of its own ("It pays a 2.2% dividend") gets the day its figures are from.
  const basisAsOf = basis && ready?.reasonAsOf ? fmtDate(ready.reasonAsOf, false) : "";
  // The brief leads with its own first sentence (what is happening to the company, in plain facts), not the
  // engine's title ("AI growth remains powerful as scrutiny raises the proof required"); the title is the fallback.
  const briefBody = (ready?.body ?? "").trim().replace(/\s+/g, " ");
  const briefFirst = briefBody ? wholeSentences(briefBody, 1) : "";
  const briefLead = briefFirst || ready?.headline || "";
  const briefRest = briefFirst && briefBody.startsWith(briefFirst) ? briefBody.slice(briefFirst.length).trim() : briefFirst ? "" : briefBody;
  // A level more than half the price away says little about today (the engine still sets some that far out); the landing card uses the same rule.
  const nearLevel = (value: number) => hasPrice && Math.abs(value - stock.price) / stock.price <= 0.5;
  const nearLevels = callLevels.filter((item) => nearLevel(item.price));
  // Where today's price sits against the level: past it, right at it, or how far off ("−0.0% from here" said nothing).
  const levelNote = (item: { label: string; price: number }): ReactNode => {
    if (!hasPrice) return null;
    const below = item.label.endsWith("below");
    if (below ? stock.price <= item.price : stock.price >= item.price) return "The price is there now";
    if (Math.abs(item.price - stock.price) / stock.price < 0.005) return "Right at today's price";
    return (
      <>
        <span className={NUM}>{fromHere(item.price)}</span> from here
      </>
    );
  };
  const callWord = ready?.call ? (CALL_PLAIN[ready.call as keyof typeof CALL_PLAIN] ?? ready.call) : null;
  const callAction = ready ? plainAction(ready.actionLabel, ready.call) : null;
  // One heading: the call word, toned, inside the sentence that says what it means ("[Buy more] on a dip, not at
  // today's price."), so the call is said once (./call-line.ts). `meaning` is the line when there is no call word.
  const meaning = callMeaning(callWord, callAction);
  const callHeadline = callWord ? callHeading(callWord, callAction) : null;
  // What would change the call, set apart from the reasons so it reads as the conditions to watch.
  const changeBlock = (lines: string[]) => (
    // Capped on a wide screen so the box never widens the price column at the call's expense.
    <div className="max-w-[62ch] rounded-lg border border-oa-border bg-oa-bg px-3 py-2 text-[14px] leading-5 text-oa-fg md:max-w-[29rem]">
      <p className="font-medium">What would change it</p>
      <div className="mt-0.5 flex flex-col gap-1">
        {lines.map((line) => (
          <p key={line} className="text-pretty">
            {line}
          </p>
        ))}
      </div>
    </div>
  );

  // Under the call: two questions for Ask and one thing to watch (lib/next-steps.ts). Ask and agents cover US stocks.
  const allSteps =
    ready && market === "US"
      ? stockCallSteps({ ticker: stock.ticker, fullRead: data.gate.levels, dayPct, earningsInDays: earningsIn })
      : null;
  // One next step under the call (owner rule 1: no stack of identical "… →" lines): the thing to watch when there is
  // one, else the question about today. "What would change your mind" is never it: the conditions box answers it.
  const callSteps: CallSteps | null = allSteps
    ? allSteps.watch
      ? { ask: [], watch: allSteps.watch }
      : allSteps.ask.length
        ? { ask: [allSteps.ask[allSteps.ask.length - 1]!], watch: null }
        : null
    : null;

  const stats = headerStats.length ? <KeyStats items={headerStats} /> : null;
  // On a phone the page below the chart is one part at a time (PhoneSections).
  // Signed out, the lock's "Sign in" is the one next step under the call (owner rule 1): no alerts box beside it,
  // since setting an alert needs the same account. Follow stays (on a phone, in its own part).
  const anon = data.gate.plan === "anon";
  const phoneSections = [
    // Short enough that all of them fit across a phone, so none is cut at the edge. What changed is in "Our view",
    // so its rows are on the first screen without tapping a chip (owner rule 2).
    { id: "view", label: "Our view" },
    ...(stats ? [{ id: "facts", label: "Facts" }] : []),
    ...(hasReport ? [{ id: "report", label: "Report" }] : []),
    // Signed out there are no alerts to set: Follow sits at the foot of the read on a phone, not behind a chip.
    ...(anon ? [] : [{ id: "alerts", label: "Alerts" }]),
  ];

  return (
    <div data-phone-tab="view" className="mx-auto w-full max-w-[84rem] px-2 pb-[72px] pt-3 sm:px-6 sm:pt-6 lg:pb-10">
      <div className="grid grid-cols-1 gap-4">
        {/* ── the lead: price and call, then the chart, across the full width ── */}
        <div className="order-1 min-w-0">
          <Panel>
            <header className="px-3.5 pb-3 pt-3 sm:px-4 sm:pt-3.5">
              {/* No "Research › Technology" trail over the name (owner rule 6: no small label above a heading). Search
                  engines still get the page's BreadcrumbList JSON-LD (components/seo/stock-page-schema.tsx). */}
              <div className="flex min-w-0 items-center gap-3">
                <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={36} eager />
                <div className="min-w-0 flex-1">
                  <h1 className="flex flex-wrap items-baseline gap-x-2 text-[18px] font-medium leading-6 tracking-tight text-oa-fg sm:text-[20px] sm:leading-7">
                    <span className="min-w-0">{stock.name}</span>
                    <span className="oa-mono text-[14px] font-semibold text-oa-muted-fg">{stock.ticker}</span>
                  </h1>
                  {subline ? <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg sm:truncate">{subline}</p> : null}
                </div>
                {/* Follow is a quiet outline: the call is the one coloured thing up here. */}
                <div className="oa-track-outline hidden shrink-0 sm:block">
                  <TrackButton
                    ticker={stock.ticker}
                    instrumentId={stock.instrument_id}
                    tier={data.tier}
                    isSubscribed={data.subscribed}
                    isTracked={data.isTracked}
                    untrackedLabel={`+ Follow ${stock.ticker}`}
                    signedOutLabel={`+ Follow ${stock.ticker}`}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(15rem,auto)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start">
                <div className="min-w-0 md:col-start-1 md:row-start-1">
                  <p className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className={`${NUM} text-[36px] font-semibold leading-[44px] text-oa-fg sm:text-[42px] sm:leading-[48px]`}>{money(stock.price)}</span>
                    {dayPct != null ? (
                      <span className={`${NUM} text-[17px] font-medium`} style={{ color: TONE_COLOR[dayTone ?? "flat"] }}>
                        {dayAbs != null ? `${dayAbs >= 0 ? "+" : "−"}${Math.abs(dayAbs).toFixed(2)} ` : ""}({signedPct(dayPct, 2)})
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-col md:items-start">
                    {/* Two clocks on one card read as a contradiction; each says what it is the time of. */}
                    {stock.captured_at ? <p className="text-[12px] leading-4 text-oa-muted-fg">Price at {fmtStamp(stock.captured_at)}</p> : null}
                    <MarketStatusInline nowIso={nowIso} surface="stock" />
                    {data.premarketQuote ? <StockPremarketQuote currency={currency} market={market} quote={data.premarketQuote} /> : null}
                  </div>
                </div>

                {/* The call sits beside the price on a wide screen and right under it on a phone. */}
                <section aria-label={`Our call on ${stock.ticker}`} className="min-w-0 border-t border-oa-border pt-3 md:col-start-2 md:row-span-2 md:row-start-1 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  {/* With a call, the chip is the heading and its dates are a sentence under it (no small label above it). */}
                  {!ready ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="oa-caption">Our call</h2>
                      {readState === "locked" ? <Tag tone="primary">Pro</Tag> : null}
                    </div>
                  ) : null}
                  {ready ? (
                    <>
                      {/* One heading (owner rule 6): the call word, toned, inside the sentence that says what it means
                          ("Buy more on a dip, not at today's price."), never a small chip over a second heading. */}
                      {callWord ? (
                        <h2 className="mt-1.5 text-pretty text-[17px] font-medium leading-7 tracking-tight text-oa-fg">
                          <span
                            className="whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold [box-decoration-break:clone]"
                            style={{
                              color: callTone ? TONE_COLOR[callTone] : "var(--oa-fg)",
                              background: `color-mix(in srgb, ${callTone ? TONE_COLOR[callTone] : "var(--oa-fg)"} 12%, transparent)`,
                            }}
                          >
                            {callHeadline!.word}
                          </span>
                          {callHeadline!.rest}
                        </h2>
                      ) : meaning ? (
                        <h2 className="mt-1.5 text-pretty text-[17px] font-medium leading-6 tracking-tight text-oa-fg">{meaning}</h2>
                      ) : null}
                      {/* How long the call has stood (a call that keeps its date is one you can hold us to) and when we last
                          looked at it again: the brief is rewritten, and the call decided, at that time. */}
                      {callDates ? <p className="mt-1.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{callDates}</p> : null}
                      {/* A showcase stock shows its whole report to everyone; say so, so nobody takes it for the free plan. */}
                      {data.gate.example ? (
                        <p className="mt-1.5">
                          <Tag tone="primary" className="!font-sans !text-[12.5px] !normal-case !tracking-normal">
                            Example, open to everyone
                          </Tag>
                        </p>
                      ) : null}
                      {/* What the call rests on (each fact with its source and date), then what would change it.
                          All of it comes before any price, so a level never reads as more certain than its reasons. */}
                      {evidence.length ? (
                        // No "Why:" label over the reasons (owner rule 6: no small labels over content); they follow the call.
                        <div className="mt-2.5 max-w-[62ch] text-[15px] leading-[21px] text-oa-fg">
                          <ul role="list" aria-label={`Why we say ${callWord ?? "this"}`} className="flex flex-col gap-1.5">
                            {evidence.map((line) => (
                              <li key={line.id} className="flex gap-2.5">
                                <span aria-hidden="true" className="mt-[8px] size-[5px] shrink-0 rounded-full bg-oa-muted-fg" />
                                <span className="min-w-0 text-pretty">
                                  {line.text} <span className="text-[13px] leading-[18px] text-oa-muted-fg">{line.source}.</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : basis ? (
                        <div className="mt-2.5 max-w-[62ch] text-[15px] leading-[21px] text-oa-fg">
                          <ul role="list" aria-label={`Why we say ${callWord ?? "this"}`} className="flex flex-col gap-1">
                            {basis.facts.map((fact) => (
                              <li key={fact} className="flex gap-2.5">
                                <span aria-hidden="true" className="mt-[8px] size-[5px] shrink-0 rounded-full bg-oa-muted-fg" />
                                <span className="min-w-0 text-pretty">
                                  {basisAsOf && !factHasDate(fact) && basis.facts.some((other) => factHasDate(other)) ? (
                                    <>
                                      {fact.replace(/[.!?]$/, "")}
                                      <span className="text-oa-muted-fg">, as of {basisAsOf.replace(" ", "\u00a0")}</span>.
                                    </>
                                  ) : (
                                    // "Nov 2" never splits across lines.
                                    fact.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d)/g, "$1\u00a0$2")
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {/* One date for all the reasons when they share it, said once under them instead of a "Why, as of" label. */}
                          {basisAsOf && basis.facts.every((fact) => !factHasDate(fact)) ? (
                            <p className="mt-1 text-[13px] leading-[18px] text-oa-muted-fg">As of {basisAsOf.replace(" ", "\u00a0")}.</p>
                          ) : null}
                        </div>
                      ) : callReason ? (
                        <p className="mt-2.5 max-w-[62ch] text-pretty text-[15px] leading-[21px] text-oa-fg">
                          {callReason}
                          {reasonIsNewer && ready.reasonAsOf ? (
                            <span className="text-[13px] text-oa-muted-fg"> This reason uses data to {fmtDate(ready.reasonAsOf, false)}.</span>
                          ) : null}
                        </p>
                      ) : null}
                      {/* With the conditions box under the price, the next steps move here on a wide screen so the two sides
                          stay even. On a phone they stay after the box, where they were. */}
                      {callSteps && hasChangeBox ? (
                        <div className="mt-3 hidden md:block">
                          <CallNextSteps ticker={stock.ticker} steps={callSteps} stacked />
                        </div>
                      ) : null}
                    </>
                  ) : readState === "locked" ? (
                    <div className="-mx-3.5 -mb-3">
                      <ProLock compact ticker={stock.ticker} market={market} what={`Our add, hold or trim call on ${stock.ticker} and its price zones are part of Pro.`} />
                    </div>
                  ) : (
                    <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
                      {readState === "held"
                        ? `No current call on ${stock.ticker}. A fresh one is on the way.`
                        : readState === "stale"
                          ? "The last call predates a big price move, so it is hidden. A fresh one is on the way."
                          : `We have not written a call on ${stock.ticker} yet.`}
                    </p>
                  )}
                </section>
                {/* Under the price on a wide screen (after the call on a phone): the price that goes with the call, and
                    what to do next. The call column keeps only the call and its reasons (owner, Nov 11: "left empty, right too much text"). */}
                {ready && (hasChangeBox || nearLevels.length > 0 || callSteps) ? (
                  <div className="flex min-w-0 flex-col gap-3 border-t border-oa-border pt-3 md:col-start-1 md:row-start-2 md:border-t-0 md:pt-0">
                  {/* What would change the call, under the price where the left side has room: measured conditions first,
                      the steady call's own sentence when there are none. The company reason's "if sales slow sharply"
                      line is never shown: it names nothing anyone can check. */}
                  {conditions.length ? changeBlock(conditions) : ruleChange ? changeBlock([ruleChange]) : null}
                  {nearLevels.length ? (
                    <dl className="flex flex-wrap gap-x-6 gap-y-2">
                      {nearLevels.map((item) => (
                        <div key={item.label} className="min-w-0">
                          <dt className="text-[12.5px] leading-4 text-oa-muted-fg">{item.label}</dt>
                          <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                            <span className={`${NUM} text-[15px] font-medium leading-[22px] text-oa-fg`}>{level(item.price)}</span>
                            {levelNote(item) ? <span className="text-[12.5px] leading-4 text-oa-muted-fg">{levelNote(item)}</span> : null}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {/* No lock line here: the page has one lock, the full-report box after the reasons (owner, Nov 12). */}
                  {callSteps ? (
                    <div className={hasChangeBox ? "md:hidden" : undefined}>
                      <CallNextSteps ticker={stock.ticker} steps={callSteps} stacked />
                    </div>
                  ) : null}
                  </div>
                ) : null}
              </div>
            </header>

            {related}

            {data.chart ? (
              <PricePanel
                ticker={stock.ticker}
                {...packedOrRanges(data.chart.ranges)}
                events={data.chart.events}
                zones={zones}
                currency={currency}
                defaultRange={data.chart.ranges.some((range) => range.key === "1Y") ? "1Y" : "6M"}
              />
            ) : (
              <Missing className="border-t border-oa-border">We do not have enough price history for {stock.ticker} to draw a chart yet.</Missing>
            )}

            {/* On a phone the read comes before the key facts, so they are printed again below it. */}
            {stats ? <div className="hidden border-t border-oa-border md:block">{stats}</div> : null}
          </Panel>
        </div>

        <PhoneSections sections={phoneSections} className="order-1" />

        {/* ── follow and alerts: in the page's one column, after the read. No side rail: a rail that ended halfway
            down the page left an empty column beside the rest (owner rule 4). Follow lives in the header from sm up,
            so on a phone it sits here, once; Compare is the panel at the foot of the page, once (owner rule 1). ── */}
        {/* Signed out there are no alerts to set: only the phone's Follow is left, at the end of the read (the header has
            Follow from sm up, so the aside is gone there and leaves no gap of its own). */}
        <aside data-phone-section={anon ? undefined : "alerts"} className={`flex min-w-0 flex-col gap-4 ${anon ? "order-5 sm:hidden" : "order-3"}`}>
          <div className="oa-track-outline flex flex-col gap-2 sm:hidden [&_button]:w-full">
            <TrackButton
              ticker={stock.ticker}
              instrumentId={stock.instrument_id}
              tier={data.tier}
              isSubscribed={data.subscribed}
              isTracked={data.isTracked}
              untrackedLabel={`+ Follow ${stock.ticker}`}
              signedOutLabel={`+ Follow ${stock.ticker}`}
            />
            <p className="px-1 text-[12.5px] leading-4 text-oa-muted-fg">Stocks you follow show up in your briefing.</p>
          </div>
          {anon ? null : (
          <Panel label={`Alerts on ${stock.ticker} by email`}>
            <AlertControls
              wide
              ticker={stock.ticker}
              instrumentId={stock.instrument_id}
              currency={currency}
              currentPrice={stock.price}
              suggested={suggested}
              earnings={nextEarnings && earningsLabel && earningsIn != null && earningsIn >= 0 ? { eventDate: nextEarnings.event_date, label: earningsLabel, shortLabel: fmtDate(nextEarnings.event_date, false) } : null}
            />
          </Panel>
          )}
          {/* No Ask link here (owner rule 1): the shell's Ask is the page's one Ask, and this tells it the stock. */}
          {askStock ? <AskPageHint context={formatAskContext(askStock)} /> : null}
        </aside>

        {/* ── the read: what today means, what is coming, then our brief ──── */}
        <div className="order-2 flex min-w-0 flex-col gap-4">
          <div data-phone-section="view" className="flex min-w-0 flex-col gap-4">
          {/* Results night: the latest report's figures, move and call for ten days after it (components/results). */}
          {market === "US" ? (
            <Suspense fallback={null}>
              <LatestResults ticker={stock.ticker} name={stock.name} call={callWord} />
            </Suspense>
          ) : null}
          <TheRead read={data.insightRead} label={`The read on ${stock.ticker}`} />
          <Panel
            id="read"
            // The call card above is the one opinion on the page; this panel is the news and the reasons under it.
            label="The news behind our call"
            className="scroll-mt-16 lg:scroll-mt-4"
            meta={
              ready?.writtenAt ? (
                <>
                  <span className="max-sm:hidden">written </span>
                  {fmtStamp(ready.writtenAt)}
                  {ready.articleCount ? ` · ${ready.articleCount} articles` : ""}
                  {ready.sourceCount ? ` · ${ready.sourceCount} sources` : ""}
                </>
              ) : undefined
            }
          >
            {ready ? (
              <div>
                <div className="px-3.5 py-4 sm:px-4">
                  {ready.changed ? (
                    <p className="mb-2 flex flex-wrap items-center gap-2">
                      <Tag tone="primary" className="!font-sans !text-[12.5px] !normal-case !tracking-normal">
                        {ready.changed.from && callWord
                          ? `We changed our call from ${CALL_PLAIN[ready.changed.from as keyof typeof CALL_PLAIN] ?? ready.changed.from} to ${callWord}`
                          : "We changed our call"}
                      </Tag>
                    </p>
                  ) : null}
                  {briefLead ? (
                    // Body text, not a second headline: the call's "Why" leads the page, so the news reads as evidence under it.
                    <p className="max-w-[66ch] text-pretty text-[16px] font-medium leading-6 text-oa-fg">{briefLead}</p>
                  ) : null}
                  {briefRest ? <p className={`mt-2.5 max-w-[66ch] ${PROSE}`}>{briefRest}</p> : null}
                  {ready.changed?.reason ? (
                    <p className="mt-2.5 max-w-[66ch] text-[14px] leading-5 text-oa-muted-fg">
                      <span className="font-medium text-oa-fg">Why the call changed: </span>
                      {ready.changed.reason}
                    </p>
                  ) : null}
                  {/* Zero-size marker: `read_viewed` once the end of the brief is on screen. */}
                  <TrackView event="read_viewed" properties={{ ticker: stock.ticker, full_read: data.gate.levels, call: ready.call ?? null }} />
                </div>
                {showReasons || showChangers ? (
                  <div className={`grid border-t border-oa-border ${showReasons && showChangers ? "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""}`}>
                    {showReasons ? (
                      <div className={`px-3.5 py-3 sm:px-4 ${showChangers ? "border-b border-oa-border md:border-b-0 md:border-r" : ""}`}>
                        {/* No small label over the list (owner rule 6): the numbered lines stand alone. */}
                        <ol aria-label={`Why we made the call on ${stock.ticker}`} className="flex flex-col gap-2.5">
                          {ready.reasons.map((reason, index) => (
                            <li key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1.5 text-[14px] leading-5 text-oa-fg">
                              <span className="oa-mono text-[12px] leading-5 text-oa-muted-fg">{index + 1}</span>
                              <span className="max-w-[60ch] text-pretty">{reason}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {/* The measured conditions in the call block replace these written ones; two lists of what would
                        change the call would disagree. */}
                    {showChangers ? (
                      <div className="px-3.5 py-3 sm:px-4">
                        <ul aria-label="What would change our mind" className="flex flex-col gap-2.5">
                          {ready.changers.map((item, index) => (
                            <li key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1.5 text-[14px] leading-5 text-oa-fg">
                              <span aria-hidden="true" className="oa-mono text-[12px] leading-5 text-oa-muted-fg">
                                ↯
                              </span>
                              <span className="max-w-[60ch] text-pretty">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* After the reasons, which are open on every stock: only the full report is behind this. */}
                {!data.gate.levels ? (
                  <div id="call" className="scroll-mt-16 border-t border-oa-border p-3 lg:scroll-mt-4">
                    <LevelsLock ticker={stock.ticker} instrumentId={stock.instrument_id} tracked={data.isTracked} gate={data.gate} market={market} />
                  </div>
                ) : null}
              </div>
            ) : readState === "locked" ? (
              <ProLock ticker={stock.ticker} market={market} what={`The written brief on ${stock.ticker}, with the reasons behind the call and what would change it, is part of Pro.`} />
            ) : readState === "held" ? (
              <Missing>
                We are holding back the last brief on {stock.ticker}. The article it was written from never loaded properly, so what it says is not about the company. A fresh brief is being prepared and will appear here.
              </Missing>
            ) : readState === "stale" ? (
              <Missing>
                The last brief was written before a large price change, so we are not showing it. A fresh brief is being prepared and will appear here.
              </Missing>
            ) : (
              <div className="px-3.5 py-3.5 sm:px-4">{data.briefFallback ?? <p className="text-[14px] leading-5 text-oa-muted-fg">We have not written a brief on {stock.ticker} yet.</p>}</div>
            )}
          </Panel>
          </div>

          {stats ? (
            <div data-phone-section="facts" className="md:hidden">
              <Panel label="Key facts">{stats}</Panel>
            </div>
          ) : null}
        </div>

        {/* ── what changed, then the sections: streamed in under the rest (below.tsx) ── */}
        <div className="order-4 flex min-w-0 flex-col gap-4">
          {below}

          {/* Signed out, the full-report box is the one lock and it names the long report; with no box (an open stock),
              the link is the way in. */}
          {market === "US" && (data.gate.plan !== "anon" || data.gate.levels) ? <LongReportLink ticker={stock.ticker} /> : null}

          <p className="px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-0">
            {/* The one legal line, at the foot of the page, linked to how calls are made. */}
            <Link prefetch={false} href="/docs/methodology" className="hover:underline focus-visible:underline focus-visible:outline-none">
              Our view, not investment advice.
            </Link>{" "}
            Prices can be delayed.
          </p>
        </div>
      </div>
    </div>
  );
}
