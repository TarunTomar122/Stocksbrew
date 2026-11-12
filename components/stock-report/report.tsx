import { Suspense, type ReactNode } from "react";
import { todayET } from "@/lib/calendar-shared";

import { MarketStatusInline } from "@/components/market-status";
import { RangeBar } from "@/components/oa/kit";
import { CALL_PLAIN, countWord, plainAction, wholeSentences } from "@/lib/plain-copy";
import { CoverButton, LockCard } from "@/components/oa/gate";
import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StockLogo } from "@/components/stock-logo";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import { TrackButton } from "@/components/track-button";
import { TrackView } from "@/components/track-view";
import { AskPageHint } from "@/components/ask/ask-page-hint";
import { capitalize, dayPossessive } from "@/lib/day-words";
import { sessionLabel } from "@/lib/session-label";
import { packChartRanges, type CallWord, type ChartRange, type PackedChartRanges } from "@/lib/stock-chart";

import { AlertControls, type SuggestedAlert } from "./alert-controls";
import { callLine, callMeaning } from "./call-line";
import { briefFacts, briefLeadOf, capTier, compactMoney, daysBetween, fin, fmtDate, fmtStamp, levelFormatter, moneyFormatter, priceStamp, relativeDays, shortFact, signedPct } from "./format";import { ChangeChecks } from "./change-checks";
import { FactCards } from "./fact-cards";
import { PricePanel, type PanelZone } from "./price-panel";
import { LockIcon, Missing, MoreLink, NUM, Panel, StatGrid, Tag, TONE_COLOR, type Tone } from "./primitives";
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

/** Words in a "news behind our call" row at most: one concise line (judges, ship 85). */
const NEWS_FACT_WORDS = 12;

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
        {/* One line, no muted second sentence (owner rule 8). */}
        <span className="font-medium">Read a long, sourced report on {ticker}</span>
      </span>
    </Link>
  );
}

/**
 * What the full report adds on this stock, in one short line, from what the plan really holds back on the page
 * (components/stock-page-stream.tsx strips each of them for a stock this viewer does not cover): the call's own price
 * when it has one, the whole written brief, the scorecard and how the call has moved. lib/entitlements.ts `stock_zones`.
 */
function fullReportAdds(hidden: ReportData["gate"]["hiddenLevel"], priceNamed: boolean): string {
  if (priceNamed) return "It also has the whole brief, the scorecard and how the call has moved.";
  const price = hidden ? (hidden.label === "We'd sell some above" ? "our sell price, " : "our buy price, ") : "";
  return `The full report adds ${price}the whole brief, the scorecard and how the call has moved.`;
}

/**
 * The page's one lock (owner rule 1: one named lock, not a blurb beside a second button), in the stock header beside
 * the call's level line. Its title is what it holds ("The price we'd buy JPM at comes with a free account."), then one
 * short line on what the full report adds (judges, ship 44: make the lock tangible), then how to get it.
 */
function LevelsLock({ ticker, instrumentId, tracked, gate, market, named }: { ticker: string; instrumentId: string; tracked: boolean; gate: ReportData["gate"]; market: "US" | "IN"; named: string | null }) {
  // "Covering" is our word; readers get "the full report on five (three on PAYWALL_V2) stocks you pick".
  const left = `${gate.slotsLeft} of your ${FREE_COVERED_WORD} free full reports ${gate.slotsLeft === 1 ? "is" : "are"} left`;
  const title = named ? named.replace(/\.$/, "") : gate.plan === "anon" ? `Read the full report on ${ticker} with a free account` : `Get the full report on ${ticker}`;
  const longReports = market === "US" && LONG_REPORTS_FREE > 0 ? `, plus ${countWord(LONG_REPORTS_FREE).toLowerCase()} long research ${LONG_REPORTS_FREE === 1 ? "report" : "reports"} a month` : "";
  const how =
    gate.plan === "anon"
      ? // The long research report needs an account too, so it is said here instead of in a second box (owner, Nov 12).
        `A free account gets it on ${FREE_COVERED_WORD} stocks you pick${longReports}.`
      : !tracked
        ? gate.slotsLeft > 0
          ? `Add ${ticker} to your portfolio to use one of your free full reports. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Add ${ticker} and swap it in (one swap a week on Free), or go Pro for every stock.`
        : gate.slotsLeft > 0
          ? `You follow ${ticker}. Turn on its full report to see it. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Swap one out in Portfolio to make room for ${ticker}, or go Pro for every stock.`;
  const body = (
    <>
      <span className="block font-medium text-oa-fg">{fullReportAdds(gate.hiddenLevel ?? null, Boolean(named))}</span>
      <span className="mt-1 block">{how}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <LockCard feature="stock_zones" plan={gate.plan} trialEligible={gate.trialEligible} ticker={ticker} title={title} body={body} stacked />
      {gate.plan === "free" && tracked ? (
        gate.slotsLeft > 0 ? (
          <CoverButton instrumentId={instrumentId} ticker={ticker} />
        ) : (
          <Link prefetch={false} href="/portfolio" className="self-start text-[13px] font-medium text-oa-primary hover:underline">
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

/**
 * The call's next step (a question for Ask, or an agent to watch it), one link per line. Each opens prefilled;
 * nothing runs or saves on its own. No trailing arrow (owner rule 1): the line itself is the control.
 */
function CallNextSteps({ ticker, steps }: { ticker: string; steps: CallSteps }) {
  const link = "rounded font-medium text-oa-primary hover:underline";
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

/** The chart's ranges as one shared series when they pack (a quarter of the bytes), else as they are. */
function packedOrRanges(ranges: ChartRange[]): { packed: PackedChartRanges } | { ranges: ChartRange[] } {
  const packed = packChartRanges(ranges);
  return packed ? { packed } : { ranges };
}

export function StockReport({
  data,
  related,
  below,
  signals,
  priceNote,
}: {
  data: ReportData;
  /** A quiet note beside the price time, streamed in (components/priority-stock-modal.tsx: a price updated only after the close). */
  priceNote?: ReactNode;
  /** The good and watch tally (./signal-ui.tsx `SignalStrip`), streamed in once every section it counts has loaded. */
  signals?: ReactNode;
  /** Links to the stock's sector, rivals, insiders and earnings pages, streamed in under the head. */
  related?: ReactNode;
  /** What changed and the deeper report (below.tsx), streamed in after the top. */
  below?: ReactNode;
}) {
  const { stock, market, currency, nowIso, read, readState, facts, fundamentals } = data;
  const today = todayET(Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now());
  const money = moneyFormatter(currency);
  const level = levelFormatter(currency);
  // The session the quote is from: the call line says "today's" price only when it is today's.
  const priceSession = market === "US" ? sessionLabel(stock.captured_at ?? null, Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now()) : null;

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
  // The evidence under the call (each line with its source and date) and the measurable conditions that would change
  // it (lib/call-evidence.ts). Both are open on every stock, for every reader, like the call itself.
  const evidence = ready ? data.callEvidence?.evidence ?? [] : [];
  // The conditions as separate checks, each with its threshold and source; only these are shown (as cards).
  const checks = ready ? data.callEvidence?.checks ?? [] : [];
  // The brief leads with its own first sentence (what is happening to the company, in plain facts), not the
  // engine's title ("AI growth remains powerful as scrutiny raises the proof required"); the title is the fallback.
  // The lead goes through plainBriefLead (./format.ts): a sentence that only describes the coverage ("Recent coverage is
  // thin for AA.") is dropped and the next one leads; "X's fresh news centers on a partnership..." says what happened.
  const { lead: briefLead } = briefLeadOf(ready);
  // "The news behind our call" as rows: the lead and the reasons, one specific fact each, with the story behind it.
  // One concise line each, at most 12 words (judges, ship 85), and the sourced ones only when there are any: a row is
  // stock-specific evidence with its story behind it, not another unsourced sentence.
  const cutFacts = briefFacts(ready, briefLead, { ticker: stock.ticker, companyName: stock.name ?? "" })
    .map((fact) => ({ ...fact, text: shortFact(fact.text, NEWS_FACT_WORDS) }))
    .filter((fact) => fact.text);
  const sourcedFacts = cutFacts.filter((fact) => fact.source);
  const shortFacts = sourcedFacts.length ? sourcedFacts : cutFacts;
  // A brief with no clause short enough still says its lead's first sentence, rather than leave the panel empty.
  const leadSentence = shortFacts.length ? "" : wholeSentences(briefLead, 1);
  const newsFacts = leadSentence ? [{ text: leadSentence, source: null }] : shortFacts;
  const changeReason = shortFact(ready?.changed?.reason);
  const callWord = ready?.call ? (CALL_PLAIN[ready.call as keyof typeof CALL_PLAIN] ?? ready.call) : null;
  const callAction = ready ? plainAction(ready.actionLabel, ready.call) : null;
  // The heading is the call word alone (Buy more, Keep, Sell some); the line under it is the call's own price against
  // today's, in plain words, or, where the plan does not show the price, what the call waits for (./call-line.ts).
  // `meaning` is the heading when there is no call word.
  const meaning = callMeaning(callWord, callAction);
  const callUnder = ready
    ? callLine({
        callWord,
        callAction,
        level: own,
        hidden: data.gate.levels ? null : data.gate.hiddenLevel ?? null,
        price: hasPrice ? stock.price : null,
        money: level,
        plan: data.gate.plan,
        ticker: stock.ticker,
        // Whose price it is: today's only when the quote is from today's session (lib/session-label.ts).
        priceDay: priceSession ? dayPossessive(priceSession.day, today) : null,
      })
    : null;
  // The page's one lock, beside the call it unlocks: only the full report is behind it (the call, its reasons and
  // what would change it are open on every stock).
  const showLock = Boolean(ready) && !data.gate.levels;
  // What would change it as grouped condition cards (./change-checks.tsx): one group per call it could move to, the
  // shared report day said once, a short card per condition, and one Sources action for the section.
  // `wide`: across the strip under the header; otherwise capped at a reading width in the side column.
  // Defined before the blocks that use it: checksBlock runs while the page renders, before anything declared below it.
  const checksBlock = (list: NonNullable<typeof checks>, wide: boolean) => <ChangeChecks list={list} today={today} wide={wide} />;
  // Only measured checks, as cards. Without them the section is not shown: no prose fallback, neither the steady
  // call's sentence nor the conditions as sentences (council, Nov 12).
  const changeBox = checks.length ? checksBlock(checks, false) : null;

  // What the call rests on, under the header (no "Why:" label over it, owner rule 6): fact cards with a big figure,
  // a short label, one line and bars where two numbers compare (./fact-cards.tsx), each card's source in its hover
  // title. Only facts with structured figures become cards; without any the row is not shown, and the call's own line
  // above says what the call is (council, Nov 12: no text-only fact cards). Never a bulleted list (owner, Nov 12).
  const reasonsBlock = ready && evidence.some((line) => line.card) ? <FactCards lines={evidence} label={`Why we say ${callWord ?? "this"}`} /> : null;

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

  // What would change the call goes in the strip under the header, unless it is the side column's only content.
  const stripChange = showLock || callSteps ? (checks.length ? checksBlock(checks, true) : changeBox) : null;
  // The checks go across the strip under the reasons when there are enough cards to fill it (both ways, or three or
  // more); one or two cards sit in the column beside the reasons rather than alone across the strip (owner rule 4).
  const stripStacked = Boolean(stripChange) && (checks.length >= 3 || new Set(checks.map((item) => item.way)).size > 1);
  // Beside the lock, the side column is a little wider (it fills from 17rem up to 1/2.25 of the row) so the lock's
  // words wrap less and its card ends near the call's last line; the strip under it uses the same columns so the
  // checks line up under the lock (owner rule 4: no empty left side beside a tall lock).
  const sideCols = showLock ? "md:grid-cols-[minmax(0,1.25fr)_minmax(17rem,1fr)]" : "md:grid-cols-[minmax(0,1fr)_minmax(17rem,23rem)]";

  const stats = headerStats.length ? <StatGrid items={headerStats} /> : null;
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
              {/* One line on top (owner rule 6: no small label over a big heading): the call word large, the company
                  beside it at reading size, so the name never sits as a caption over the call. Without a call the
                  name leads alone. The exchange, sector and size line sits under the call's dates. No "Research ›
                  Technology" trail either; search engines still get the page's BreadcrumbList JSON-LD
                  (components/seo/stock-page-schema.tsx). */}
              <div className="flex min-w-0 items-center gap-3">
                <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={ready && callWord ? 40 : 36} eager />
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  {/* The stock leads; our call is a chip beside it (owner, Nov 12: "can I have the stock name in focus
                      instead of Buy more"). */}
                  <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-oa-fg sm:text-[32px] sm:leading-[38px]">
                    <span className="min-w-0">{stock.name}</span>
                    <span className="oa-mono text-[15px] font-semibold tracking-normal text-oa-muted-fg sm:text-[16px]">{stock.ticker}</span>
                  </h1>
                  {ready && callWord ? (
                    <span
                      className="inline-flex h-7 items-center self-center rounded-full border px-3 text-[14px] font-semibold"
                      style={{
                        color: callTone ? TONE_COLOR[callTone] : "var(--oa-fg)",
                        borderColor: callTone ? `color-mix(in srgb, ${TONE_COLOR[callTone]} 40%, transparent)` : "var(--oa-border)",
                        background: callTone ? `color-mix(in srgb, ${TONE_COLOR[callTone]} 10%, transparent)` : "transparent",
                      }}
                    >
                      {callWord}
                    </span>
                  ) : null}
                  {/* A showcase stock shows its whole report to everyone; say so, so nobody takes it for the free plan. */}
                  {ready && callWord && data.gate.example ? (
                    <Tag tone="primary" className="!font-sans !text-[12.5px] !normal-case !tracking-normal">
                      Example, open to everyone
                    </Tag>
                  ) : null}
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
              {/* Without a call there is no big word, so the exchange and sector line stays under the name. */}
              {!(ready && callWord) && subline ? <p className="mt-0.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">{subline}</p> : null}

              {/* The call is the page's heading (owner rules 8 and 10): the word large on the top line, one line under it
                  that says the same instruction with its level, and today's price as the figure under that. The page's
                  one lock sits beside the level line; the reasons and what would change the call are the strip under
                  the header. */}
              <div className={`mt-2 grid gap-x-6 gap-y-3 md:items-start ${!ready || showLock || callSteps || changeBox ? sideCols : ""}`}>
                {/* id "call": the briefing and the example check link here. */}
                <section
                  id={ready ? "call" : undefined}
                  aria-label={ready ? `Our call on ${stock.ticker}` : `${stock.ticker} price`}
                  className="min-w-0 scroll-mt-16 lg:scroll-mt-4"
                >
                  {ready && !callWord && meaning ? (
                    <h2 className="text-pretty text-[22px] font-semibold leading-7 tracking-tight text-oa-fg">{meaning}</h2>
                  ) : null}
                  {/* The one level line: the same instruction as the word, with its price, or without it where this plan
                      does not show it (the lock beside it names what it holds). */}
                  {/* Only when the chart has no line to say it: with the call's own level drawn on the chart ("Buy more
                      below $509"), the header does not repeat it (owner rule 1, judges ship 85). A level the chart does
                      not draw (a buy-more-above, or no chart) keeps its line here. */}
                  {ready && callWord && callUnder && !(data.chart && zones.length > 0) ? (
                    <p className="mt-1 max-w-[62ch] text-pretty text-[17px] font-medium leading-6 text-oa-fg">{callUnder.text}</p>
                  ) : null}
                  {/* The signals' tally by the call: counts and the top name each side, never a sentence (owner rule 7). */}
                  {ready && signals ? <div className="mt-2 empty:hidden">{signals}</div> : null}
                  {/* Today's price, the figure under the call. Without a call it is the heading's neighbour on its own. */}
                  <div className={ready ? "mt-3" : ""}>
                    <p className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className={`${NUM} font-semibold text-oa-fg ${ready ? "text-[26px] leading-8" : "text-[36px] leading-[44px] sm:text-[42px] sm:leading-[48px]"}`}>
                        {money(stock.price)}
                      </span>
                      {dayPct != null ? (
                        <span className={`${NUM} text-[16px] font-medium`} style={{ color: TONE_COLOR[dayTone ?? "flat"] }}>
                          {dayAbs != null ? `${dayAbs >= 0 ? "+" : "−"}${Math.abs(dayAbs).toFixed(2)} ` : ""}({signedPct(dayPct, 2)})
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/* Two clocks on one card read as a contradiction; each says what it is the time of. */}
                      {stock.captured_at ? <p className="text-[12px] leading-4 text-oa-muted-fg">{priceStamp(stock.captured_at)}</p> : null}
                      <MarketStatusInline nowIso={nowIso} surface="stock" />
                      {data.premarketQuote ? <StockPremarketQuote currency={currency} market={market} quote={data.premarketQuote} /> : null}
                      {priceNote}
                    </div>
                  </div>
                  {/* How long the call has stood and when we last looked at it again, quiet under the price. */}
                  {ready && callWord && subline ? <p className="mt-0.5 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{subline}</p> : null}
                  {/* With the lock beside the call, the call's next step sits under the price, so the call's side of the
                      header is not left short beside the taller lock. */}
                  {callSteps && showLock ? (
                    <div className="mt-2.5">
                      <CallNextSteps ticker={stock.ticker} steps={callSteps} />
                    </div>
                  ) : null}
                </section>

                {/* Beside the call: the page's one lock, or, where nothing is locked, the call's next step, or what would
                    change the call, so the side is never an empty column (owner rules 4 and 10). Without a call, why
                    there is none. */}
                {ready ? (
                  showLock ? (
                    <div className="min-w-0">
                      <LevelsLock
                        ticker={stock.ticker}
                        instrumentId={stock.instrument_id}
                        tracked={data.isTracked}
                        gate={data.gate}
                        market={market}
                        named={callUnder?.gate ?? null}
                      />
                    </div>
                  ) : callSteps ? (
                    <div className="min-w-0 md:pt-2">
                      <CallNextSteps ticker={stock.ticker} steps={callSteps} />
                    </div>
                  ) : changeBox ? (
                    <div className="min-w-0">{changeBox}</div>
                  ) : null
                ) : (
                  <div className="min-w-0 border-t border-oa-border pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="oa-caption">Our call</h2>
                      {readState === "locked" ? <Tag tone="primary">Pro</Tag> : null}
                    </div>
                    {readState === "locked" ? (
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
                  </div>
                )}
              </div>
            </header>

            {/* Under the header: what the call rests on (each fact with its source and date) and what would change it,
                side by side, so a level never reads as more certain than its reasons. Open on every stock. */}
            {ready && (reasonsBlock || stripChange) ? (
              <div
                className={`grid gap-x-6 gap-y-3 border-t border-oa-border px-3.5 py-3 sm:px-4 md:items-start ${
                  reasonsBlock && stripChange && !stripStacked ? sideCols : ""
                }`}
              >
                {/* Side by side, each column keeps its own height: a fact card is never padded out to the checks' height
                    (council, Nov 12). Two fact cards and one check group come out within a line of each other. */}
                {reasonsBlock ? <div className="min-w-0">{reasonsBlock}</div> : null}
                {stripChange ? <div className="flex min-w-0 flex-col gap-3">{stripChange}</div> : null}
              </div>
            ) : null}

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

          </Panel>
        </div>

        <PhoneSections sections={phoneSections} className="order-1" />

        {/* ── follow and alerts: in the page's one column, after the read. No side rail: a rail that ended halfway
            down the page left an empty column beside the rest (owner rule 4). Follow lives in the header from sm up,
            so on a phone it sits here, once; Compare is the panel at the foot of the page, once (owner rule 1). ── */}
        {/* Signed out there are no alerts to set and the one step is the report under the call (judges, ship 50), so no
            second Follow here: the aside only carries the Ask hint and takes no room. */}
        <aside data-phone-section={anon ? undefined : "alerts"} className={anon ? "hidden" : "order-3 flex min-w-0 flex-col gap-4"}>
          {anon ? null : (
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
          )}
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

        {/* ── the latest results, when there are any, then our brief ──── */}
        <div className="order-2 flex min-w-0 flex-col gap-4">
          <div data-phone-section="view" className="flex min-w-0 flex-col gap-4">
          {/* Results night: the latest report's figures, move and call for ten days after it (components/results). */}
          {market === "US" ? (
            <Suspense fallback={null}>
              <LatestResults ticker={stock.ticker} call={callWord} />
            </Suspense>
          ) : null}
          <Panel
            id="read"
            // The call card above is the one opinion on the page; this panel is the news and the reasons under it.
            label="The news behind our call"
            className="scroll-mt-16 lg:scroll-mt-4"
            meta={
              ready?.writtenAt ? (
                <>
                  {/* "written yesterday, 4:22 PM ET"; on a phone the stamp leads, so it starts with a capital. */}
                  <span className="max-sm:hidden">written {fmtStamp(ready.writtenAt)}</span>
                  <span className="sm:hidden">{capitalize(fmtStamp(ready.writtenAt))}</span>
                  {ready.articleCount ? ` · ${ready.articleCount} articles` : ""}
                  {ready.sourceCount ? ` · ${ready.sourceCount} sources` : ""}
                </>
              ) : undefined
            }
          >
            {ready ? (
              <div>
                {ready.changed ? (
                  <div className="flex flex-col gap-2 border-b border-oa-border px-3.5 py-3 sm:px-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <Tag tone="primary" className="!font-sans !text-[12.5px] !normal-case !tracking-normal">
                        {ready.changed.from && callWord
                          ? `We changed our call from ${CALL_PLAIN[ready.changed.from as keyof typeof CALL_PLAIN] ?? ready.changed.from} to ${callWord}`
                          : "We changed our call"}
                      </Tag>
                    </p>
                    {changeReason ? <p className="max-w-[66ch] text-pretty text-[14px] leading-5 text-oa-fg">{changeReason}</p> : null}
                  </div>
                ) : null}
                {/* No written "what would change our mind" list here, even without measured checks: what would change
                    the call is only ever the structured check cards (council, Nov 12: no prose fallback). */}
                {newsFacts.length ? (
                  <div>
                    {/* One specific fact per row, at most 15 words (owner rule 8); the story behind it is the row's link
                        and its title, never a source line under it (rule 4). */}
                    <ul aria-label={`Why we made the call on ${stock.ticker}`} className="flex flex-col">
                        {newsFacts.map((fact, index) => (
                          <li key={index} className="border-b border-oa-border last:border-b-0">
                            {fact.source ? (
                              <a
                                href={fact.source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={fact.source.source ? `${fact.source.source}: ${fact.source.title}` : fact.source.title}
                                className="block px-3.5 py-2.5 text-pretty text-[14.5px] leading-5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
                              >
                                {fact.text}
                              </a>
                            ) : (
                              <p className="px-3.5 py-2.5 text-pretty text-[14.5px] leading-5 text-oa-fg sm:px-4">{fact.text}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                  </div>
                ) : null}
                {/* Zero-size marker: `read_viewed` once the end of the brief is on screen. */}
                <TrackView event="read_viewed" properties={{ ticker: stock.ticker, full_read: data.gate.levels, call: ready.call ?? null }} />
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

        </div>

        {/* ── what changed, then the sections: streamed in under the rest (below.tsx) ── */}
        {/* What changed (order-1, below.tsx), then the key facts as one-line rows (order-2), then the report's tabs
            (order-3): the facts sit under the news on every screen, not as a grid of small labels over big numbers
            between the chart and the read (owner rule 6). No legal line here: the site footer carries it. */}
        <div className="order-4 flex min-w-0 flex-col gap-4">
          {below}

          {stats ? (
            <div data-phone-section="facts" className="order-2 min-w-0">
              <Panel label="Key facts">{stats}</Panel>
            </div>
          ) : null}

          {/* Signed out, the full-report box is the one lock and it names the long report; with no box (an open stock),
              the link is the way in. */}
          {market === "US" && (data.gate.plan !== "anon" || data.gate.levels) ? (
            <div className="order-4 min-w-0">
              <LongReportLink ticker={stock.ticker} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
