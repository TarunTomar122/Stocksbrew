import type { ReactNode } from "react";
import { todayET } from "@/lib/calendar-shared";

import { MarketStatusInline } from "@/components/market-status";
import { RangeBar } from "@/components/oa/kit";
import { CALL_PLAIN, callMetaLine, plainAction, plainCallReason, wholeSentences } from "@/lib/plain-copy";
import { callBasis, factHasDate, lastReportOn } from "@/lib/call-basis";
import { CoverButton, LockCard } from "@/components/oa/gate";
import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StockLogo } from "@/components/stock-logo";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import { TrackButton } from "@/components/track-button";
import { TrackView } from "@/components/track-view";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import { TheRead } from "@/components/oa/insight";
import { PlaceTrail } from "@/components/oa/place-nav";
import { canonicalSectorSlug } from "@/lib/screener-shared";
import { packChartRanges, type CallWord, type ChartRange, type PackedChartRanges } from "@/lib/stock-chart";

import { AlertControls, type SuggestedAlert } from "./alert-controls";
import { callMeaning } from "./call-line";
import { capTier, compactMoney, daysBetween, fin, fmtDate, fmtStamp, levelFormatter, moneyFormatter, relativeDays, signedPct } from "./format";
import { EarlierTimeline } from "./earlier-timeline";
import { PricePanel, type PanelZone } from "./price-panel";
import { LockIcon, Missing, MoreLink, NUM, Panel, PROSE, SECTION_LABELS, Tag, TONE_COLOR, type SectionId, type Tone } from "./primitives";
import { PhoneSections } from "./phone-sections";
import { TimelineRow } from "./timeline-row";
import { SectionTabs } from "./section-tabs";
import {
  EarningsSection,
  FinancialsSection,
  NewsSection,
  OverviewSection,
  OwnershipSection,
  PeersSection,
  TechnicalsSection,
  ValuationSection,
  sectionAvailability,
} from "./sections";
import type { ReportData } from "./types";
import { stockCallSteps, type CallSteps } from "@/lib/next-steps";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";

const CALL_TONE: Record<CallWord, Tone | null> = { Add: "up", Hold: null, Trim: "down" };

/** Shown where the price zones would be, on a stock the viewer's agent does not cover. */
function LevelsLock({ ticker, instrumentId, tracked, gate }: { ticker: string; instrumentId: string; tracked: boolean; gate: ReportData["gate"] }) {
  // "Covering" is our word; readers get "the full report on five (three on PAYWALL_V2) stocks you pick".
  const left = `${gate.slotsLeft} of your ${FREE_COVERED_WORD} free full reports ${gate.slotsLeft === 1 ? "is" : "are"} left`;
  const title = gate.plan === "anon" ? `Sign in to read the full report on ${ticker}` : `Get the full report on ${ticker}`;
  const body =
    gate.plan === "anon"
      ? `Our call is free for everyone. A free account also gets the full report on ${FREE_COVERED_WORD} stocks you pick: why we made the call, the prices where we'd buy more or sell some, and what would change our mind. You can follow as many stocks as you like.`
      : !tracked
        ? gate.slotsLeft > 0
          ? `Add ${ticker} to your portfolio and it gets one of your free full reports: why we made the call, the prices where we'd act, alerts and a note before earnings. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Add ${ticker} to your portfolio and swap it in for one of them (one swap a week on Free), or go Pro for a full report on every stock.`
        : gate.slotsLeft > 0
          ? `You follow ${ticker}. Turn on its full report to see why we made the call, the prices where we'd act, alerts and a note before earnings. ${left}.`
          : `All ${FREE_COVERED_WORD} of your free full reports are in use. Swap one out in Portfolio (free any time) to make room for ${ticker}, or go Pro for a full report on every stock.`;
  return (
    <div className="flex flex-col gap-2">
      <LockCard feature="stock_zones" plan={gate.plan} trialEligible={gate.trialEligible} ticker={ticker} title={title} body={body} stacked />
      {gate.plan === "free" && tracked ? (
        gate.slotsLeft > 0 ? (
          <CoverButton instrumentId={instrumentId} ticker={ticker} />
        ) : (
          <Link prefetch={false} href="/watchlist" className="self-start text-[13px] font-medium text-oa-primary hover:underline">
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
              {/* The arrow never wraps onto a line of its own. */}
              {step.label}{"\u00a0"}→
            </AppLink>
          </li>
        ))}
        {steps.watch ? (
          <li>
            <AppLink href={steps.watch.href} data-track-target="watch" className={link}>
              {steps.watch.label}{"\u00a0"}→
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
            {step.label} →
          </AppLink>
        ))}
      </p>
      {steps.watch ? (
        <p className="mt-2 sm:mt-1.5">
          <AppLink href={steps.watch.href} data-track-target="watch" className={link}>
            {steps.watch.label} →
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

export function StockReport({ data, related }: { data: ReportData; /** Links to the stock's sector, rivals, insiders and earnings pages, streamed in under the head. */ related?: ReactNode }) {
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
  if (read && readState === "ready") {
    // Levels more than half the price away are left out everywhere on the page: header, chart, read and alert suggestions.
    const within = (value: number | null | undefined) =>
      value && fin(stock.price) && stock.price > 0 && Math.abs(value - stock.price) / stock.price <= 0.5 ? value : null;
    const addBelow = within(read.zones.addBelow);
    const addAbove = within(read.zones.addAbove);
    const trimAbove = within(read.zones.trimAbove);
    // The chart shows only the level that matches the call (owner, Nov 11): buy-more price on Buy more,
    // sell-some price on Sell some, neither on Keep. The alert suggestions keep both.
    const showAdd = read.call === "Add";
    const showTrim = read.call === "Trim";
    if (addBelow) {
      if (showAdd) zones.push({ key: "add", price: addBelow, side: "below", tone: "up", label: `Buy more below ${level(addBelow)}` });
      suggested.push({ id: "add", label: "Buy-more price", condition: "below", price: addBelow, note: `Buy more below ${level(addBelow)}` });
    } else if (addAbove) {
      suggested.push({ id: "add", label: "Buy if it breaks higher", condition: "above", price: addAbove, note: `Buy more above ${level(addAbove)}` });
    }
    if (trimAbove && (!addBelow || trimAbove > addBelow)) {
      if (showTrim) zones.push({ key: "trim", price: trimAbove, side: "above", tone: "down", label: `Sell some above ${level(trimAbove)}` });
      suggested.push({ id: "trim", label: "Sell-some price", condition: "above", price: trimAbove, note: `Sell some above ${level(trimAbove)}` });
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

  // ── sections that have something to show ──────────────────────────────────
  const available = sectionAvailability(data);
  const railSections = (Object.keys(SECTION_LABELS) as SectionId[])
    .filter((id) => available[id])
    .map((id) => ({
      id,
      label: SECTION_LABELS[id],
      count: id === "news" ? data.news.length : id === "peers" ? data.peers.length : null,
    }));

  const timelineItems = data.timeline.items;
  const firstItems = timelineItems.slice(0, 7);
  const restItems = timelineItems.slice(7, 40);
  const callTone = read?.call ? CALL_TONE[read.call] : null;

  const ready = readState === "ready" && read ? read : null;
  // A missing or zero quote must not turn into "Infinity% from here".
  const hasPrice = fin(stock.price) && stock.price > 0;
  const fromHere = (price: number) => (hasPrice ? signedPct(((price - stock.price) / stock.price) * 100) : null);
  // A call shows only the price that goes with it: where we'd buy more on Buy more, where we'd sell some on
  // Sell some, and none on Keep; the chart follows the same rule.
  const callLevels = ready
    ? [
        ready.call === "Add" && ready.zones.addBelow
          ? { label: "Buy more below", price: ready.zones.addBelow }
          : ready.call === "Add" && ready.zones.addAbove
            ? { label: "Buy more above", price: ready.zones.addAbove }
            : null,
        ready.call === "Trim" && ready.zones.trimAbove ? { label: "Sell some above", price: ready.zones.trimAbove } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  // A call written weeks ago keeps its date in view: its horizon ("the next few weeks") ran from then, and a reason
  // rewritten from newer numbers says so beside it.
  const writtenMs = ready?.writtenAt ? Date.parse(ready.writtenAt) : NaN;
  const callDay = Number.isFinite(writtenMs) ? todayET(writtenMs) : null;
  const callAge = callDay ? daysBetween(callDay, today) : null;
  const callIsOld = callAge != null && callAge > 14;
  const reasonIsNewer = Boolean(callDay && ready?.reasonAsOf && ready.reasonAsOf > callDay);
  const callMeta = ready ? callMetaLine(ready.confidence, ready.horizon, callIsOld && callDay ? fmtDate(callDay, false) : null) : "";
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
  // The chip carries the call word; the line says what it means, going on from the chip when the plain action starts
  // with the word ("[Buy more] on a dip, not here"), so the call is never said twice (./call-line.ts).
  const meaning = callMeaning(callWord, callAction);
  // What would change the call, set apart from the reasons so it reads as the condition to watch.
  const changeLine = (text: string) => (
    <p className="mt-2.5 max-w-[62ch] text-pretty rounded-lg border border-oa-border bg-oa-bg px-3 py-2 text-[14px] leading-5 text-oa-fg">
      <span className="font-medium">What would change it: </span>
      {text}
    </p>
  );

  // Under the call: two questions for Ask and one thing to watch (lib/next-steps.ts). Ask and agents cover US stocks.
  const callSteps =
    ready && market === "US"
      ? stockCallSteps({ ticker: stock.ticker, fullRead: data.gate.levels, dayPct, earningsInDays: earningsIn })
      : null;

  const stats = headerStats.length ? <KeyStats items={headerStats} /> : null;
  // On a phone the page below the chart is one part at a time (PhoneSections).
  const phoneSections = [
    // Short enough that all five fit across a phone, so none is cut at the edge.
    { id: "view", label: "Our view" },
    { id: "changed", label: "Changes" },
    ...(stats ? [{ id: "facts", label: "Facts" }] : []),
    ...(railSections.length ? [{ id: "report", label: "Report" }] : []),
    { id: "alerts", label: "Alerts" },
  ];

  return (
    <div data-phone-tab="view" className="mx-auto w-full max-w-[84rem] px-2 pb-[72px] pt-3 sm:px-6 sm:pt-6 lg:pb-10">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-x-6">
        {/* ── the lead: price and call, then the chart, across the full width ── */}
        <div className="order-1 min-w-0 xl:col-span-2 xl:row-start-1">
          <Panel>
            <header className="px-3.5 pb-3 pt-3 sm:px-4 sm:pt-3.5">
              {/* Where this stock sits: "Research › Technology", the same trail every deep page has. */}
              <PlaceTrail className="mb-2" tail={stock.sector ? [{ label: stock.sector, href: `/sectors/${canonicalSectorSlug(stock.sector)}` }] : []} />
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

              <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(15rem,auto)_minmax(0,1fr)] md:items-start">
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
                  <div className="flex items-baseline justify-between gap-3">
                    {/* How long the call has stood: a call that keeps its date is one you can hold us to. */}
                    <h2 className="oa-caption">
                      Our call{ready?.since ? ` since ${fmtDate(ready.since, ready.since.slice(0, 4) !== today.slice(0, 4))}` : ""}
                    </h2>
                    {/* When we last looked at the call again: the brief is rewritten, and the call decided, at this time. */}
                    {ready?.writtenAt ? (
                      <p className="text-[12px] leading-4 text-oa-muted-fg">
                        {reasonIsNewer ? "Call last reviewed" : callIsOld ? "Last reviewed" : "Reviewed"} {fmtStamp(ready.writtenAt)}
                      </p>
                    ) : readState === "locked" ? (
                      <Tag tone="primary">Pro</Tag>
                    ) : null}
                  </div>
                  {ready ? (
                    <>
                      {/* The call in a word ("Sell some"), then what it means ("Don't buy more at this price"). */}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        {callWord ? (
                          <span
                            className="inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-[15px] font-semibold"
                            style={{
                              color: callTone ? TONE_COLOR[callTone] : "var(--oa-fg)",
                              background: `color-mix(in srgb, ${callTone ? TONE_COLOR[callTone] : "var(--oa-fg)"} 12%, transparent)`,
                            }}
                          >
                            {callWord}
                          </span>
                        ) : null}
                        {callWord && meaning ? " " : null}
                        {meaning ? <span className="text-pretty text-[17px] font-medium leading-6 tracking-tight text-oa-fg">{meaning}</span> : null}
                      </p>
                      {/* What the call rests on (each fact with its date), then what would change it, then how sure we are.
                          All of it comes before any price, so a level never reads as more certain than its reasons. */}
                      {basis ? (
                        <div className="mt-2.5 max-w-[62ch] text-[15px] leading-[21px] text-oa-fg">
                          {/* One date for all the reasons when they share it, instead of "as of Nov 10" on every line. */}
                          <p className="font-medium">
                            Why{basisAsOf && basis.facts.every((fact) => !factHasDate(fact)) ? <span className="font-normal text-oa-muted-fg">, as of {basisAsOf.replace(" ", "\u00a0")}</span> : null}:
                          </p>
                          <ul role="list" className="mt-1 flex flex-col gap-1">
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
                          {/* The steady call's own rule wins: it is what would actually move the call. */}
                          {ready.whatWouldChange || basis.change ? changeLine(ready.whatWouldChange || basis.change || "") : null}
                        </div>
                      ) : callReason ? (
                        <p className="mt-2.5 max-w-[62ch] text-pretty text-[15px] leading-[21px] text-oa-fg">
                          <span className="font-medium">Why: </span>
                          {callReason}
                          {reasonIsNewer && ready.reasonAsOf ? (
                            <span className="text-[13px] text-oa-muted-fg"> This reason uses data to {fmtDate(ready.reasonAsOf, false)}.</span>
                          ) : null}
                        </p>
                      ) : null}
                      {!basis && ready.whatWouldChange ? changeLine(ready.whatWouldChange) : null}
                      {/* Honest about the day: the latest review pointed elsewhere, and the call held on purpose. */}
                      {ready.heldAgainst ? (
                        <p className="mt-2 max-w-[62ch] text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                          The latest data leans toward {CALL_PLAIN[ready.heldAgainst as keyof typeof CALL_PLAIN] ?? ready.heldAgainst}. One day isn&apos;t enough to change the call.
                        </p>
                      ) : null}
                      {/* How sure, in words, and honest about the record: we have no test showing these calls beat the market. */}
                      <p className="mt-2 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                        {callMeta ? `${callMeta} ` : null}Our view, not advice.{" "}
                        {data.gate.levels ? (
                          <a href="#read" className="text-oa-primary hover:underline">
                            Read the reasoning
                          </a>
                        ) : null}
                      </p>
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
                {ready ? (
                  <div className="flex min-w-0 flex-col gap-3 border-t border-oa-border pt-3 md:col-start-1 md:row-start-2 md:border-t-0 md:pt-0">
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
                  {!data.gate.levels ? (
                    <p className="flex items-start gap-2 text-[13.5px] leading-5 text-oa-muted-fg">
                      <span className="mt-0.5 text-oa-primary">
                        <LockIcon />
                      </span>
                      <span>
                        {/* Says the next step for this reader: sign in first, or pick the stock if signed in. */}
                        {/* One short pointer here; the one place that explains the free account is the full-report box below. */}
                        {ready.call === "Add"
                          ? "The price where we'd buy more is in the full report."
                          : ready.call === "Trim"
                            ? "The price where we'd sell some is in the full report."
                            : "The prices where we'd buy more or sell some are in the full report."}{" "}
                        <a href="#call" className="font-medium text-oa-primary hover:underline">
                          {data.gate.plan === "anon" ? "Get it free" : `Pick ${stock.ticker} for it`}
                        </a>
                      </span>
                    </p>
                  ) : null}
                  {callSteps ? <CallNextSteps ticker={stock.ticker} steps={callSteps} stacked /> : null}
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

        {/* ── follow, alerts and tools: secondary, one primary action ──────── */}
        <aside data-phone-section="alerts" className="order-3 min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-2">
          <div className="flex flex-col gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-width:none] [&>*]:shrink-0 xl:[&::-webkit-scrollbar]:hidden">
            <Panel label={`Follow ${stock.ticker}`}>
              {/* On a phone the header has no room for the button, so it lives here; from sm it sits beside the name. */}
              <div className="oa-track-outline flex flex-col gap-2 px-3.5 py-3 sm:hidden sm:px-4 [&_button]:w-full">
                <TrackButton
                  ticker={stock.ticker}
                  instrumentId={stock.instrument_id}
                  tier={data.tier}
                  isSubscribed={data.subscribed}
                  isTracked={data.isTracked}
                  untrackedLabel="Add to watchlist or holdings"
                  signedOutLabel="Add to watchlist or holdings"
                />
                <p className="text-[12.5px] leading-4 text-oa-muted-fg">
                  Stocks you follow show up in your briefing.
                </p>
              </div>
              <div className="border-t border-oa-border">
                <p className="oa-caption px-3.5 pb-1 pt-2.5 sm:px-4">Alerts by email</p>
                <AlertControls
                  ticker={stock.ticker}
                  instrumentId={stock.instrument_id}
                  currency={currency}
                  currentPrice={stock.price}
                  suggested={suggested}
                  earnings={nextEarnings && earningsLabel && earningsIn != null && earningsIn >= 0 ? { eventDate: nextEarnings.event_date, label: earningsLabel, shortLabel: fmtDate(nextEarnings.event_date, false) } : null}
                />
              </div>
            </Panel>

            <nav aria-label={`More on ${stock.ticker}`} className="flex flex-col text-[13.5px] leading-5">
              <Link prefetch={false}
                href={`/backtest?t=${encodeURIComponent(stock.ticker)}`}
                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3.5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              >
                <span>Backtest {stock.ticker}</span>
                <span className="oa-mono shrink-0 text-[12px] text-oa-muted-fg">vs S&amp;P 500 →</span>
              </Link>
              <WatchlistAiPromptButton
                ticker={stock.ticker}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3.5 text-left text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              />
              <Link prefetch={false}
                href={`/compare?symbols=${encodeURIComponent(stock.ticker)}`}
                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3.5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              >
                <span>Compare with another stock</span>
                <span className="oa-mono text-[12px] text-oa-muted-fg">→</span>
              </Link>
            </nav>
          </div>
        </aside>

        {/* ── the read: what today means, what is coming, then our brief ──── */}
        <div className="order-2 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-2">
          <div data-phone-section="view" className="flex min-w-0 flex-col gap-4">
          <TheRead read={data.insightRead} label={`The read on ${stock.ticker}`} fold="phone" foldLabel={`Show more on ${stock.ticker} today`} />
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
                {!data.gate.levels ? (
                  <div id="call" className="scroll-mt-16 border-t border-oa-border p-3 lg:scroll-mt-4">
                    <LevelsLock ticker={stock.ticker} instrumentId={stock.instrument_id} tracked={data.isTracked} gate={data.gate} />
                  </div>
                ) : null}
                {ready.reasons.length || ready.changers.length ? (
                  <div className="grid border-t border-oa-border md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                    {ready.reasons.length ? (
                      <div className="border-b border-oa-border px-3.5 py-3 sm:px-4 md:border-b-0 md:border-r">
                        <h3 className="oa-label">{ready.reasons.length === 1 ? "The reason" : `The ${["", "", "two", "three"][ready.reasons.length] ?? ready.reasons.length} reasons`}</h3>
                        <ol className="mt-2 flex flex-col gap-2.5">
                          {ready.reasons.map((reason, index) => (
                            <li key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1.5 text-[14px] leading-5 text-oa-fg">
                              <span className="oa-mono text-[12px] leading-5 text-oa-muted-fg">{index + 1}</span>
                              <span className="max-w-[60ch] text-pretty">{reason}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {ready.changers.length ? (
                      <div className="px-3.5 py-3 sm:px-4">
                        <h3 className="oa-label">What would change our mind</h3>
                        <ul className="mt-2 flex flex-col gap-2.5">
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

        {/* ── what changed, then the sections ─────────────────────────────── */}
        <div className="order-4 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-3">
          <div data-phone-section="changed" className="min-w-0">
          <Panel
            id="changed"
            label="What changed"
            className="scroll-mt-16 lg:scroll-mt-4"
          >
            {data.timeline.upcoming.length ? (
              <div className="border-b border-oa-border bg-oa-bg">
                {data.timeline.upcoming.map((item) => {
                  const days = daysBetween(today, item.date);
                  return (
                    <div key={item.id} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-oa-border px-3.5 py-2 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:px-4">
                      <div>
                        <p className={`${NUM} text-[12px] leading-4 text-oa-fg`}>{fmtDate(item.date, false)}</p>
                        <p className="oa-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-oa-label">{days != null ? relativeDays(days) : "next"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium leading-5 text-oa-fg">{item.title}</p>
                        {item.detail ? <p className="text-[13px] leading-5 text-oa-muted-fg">{item.detail}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {firstItems.length ? (
              <>
                <ol>
                  {firstItems.map((item) => (
                    <TimelineRow key={item.id} item={item} nowIso={nowIso} />
                  ))}
                </ol>
                {/* The older entries are drawn in the browser, so their markup is not in every page (earlier-timeline.tsx). */}
                {restItems.length ? <EarlierTimeline items={restItems} nowIso={nowIso} ticker={stock.ticker} /> : null}
              </>
            ) : (
              <Missing>Nothing new on {stock.ticker} yet.</Missing>
            )}
          </Panel>

          </div>

          {/* The deeper report, one part at a time: the order matches SECTION_LABELS, which is the order of railSections. */}
          {railSections.length ? (
            <div data-phone-section="report" className="min-w-0">
            <SectionTabs sections={railSections}>
              {available.overview ? <OverviewSection data={data} /> : null}
              {available.financials ? <FinancialsSection data={data} /> : null}
              {available.valuation ? <ValuationSection data={data} /> : null}
              {available.earnings ? <EarningsSection data={data} /> : null}
              {available.ownership ? <OwnershipSection data={data} /> : null}
              {available.news ? <NewsSection data={data} /> : null}
              {available.technicals ? <TechnicalsSection data={data} /> : null}
              {available.peers ? <PeersSection data={data} /> : null}
            </SectionTabs>
            </div>
          ) : null}

          <p className="px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-0">
            Research, not investment advice. Prices can be delayed.
          </p>
        </div>
      </div>
    </div>
  );
}
