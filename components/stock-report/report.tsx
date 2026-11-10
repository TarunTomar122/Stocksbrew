import type { ReactNode } from "react";

import { MarketStatusInline } from "@/components/market-status";
import { RangeBar } from "@/components/oa/kit";
import { callMetaLine, plainAction } from "@/lib/plain-copy";
import { CoverButton, LockCard } from "@/components/oa/gate";
import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StockLogo } from "@/components/stock-logo";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import { TrackButton } from "@/components/track-button";
import { TrackView } from "@/components/track-view";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import { TheRead } from "@/components/oa/insight";
import type { CallWord } from "@/lib/stock-chart";
import type { StockTimelineItem, StockTimelineKind } from "@/lib/stock-timeline";

import { AlertControls, type SuggestedAlert } from "./alert-controls";
import { capTier, compactMoney, daysBetween, fin, fmtDate, fmtStamp, levelFormatter, moneyFormatter, relativeDays, signedPct } from "./format";
import { PricePanel, type PanelZone } from "./price-panel";
import { Details, LockIcon, Missing, MoreLink, NUM, Panel, PROSE, SECTION_LABELS, Tag, TONE_COLOR, ToneGlyph, type SectionId, type Tone } from "./primitives";
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

const CALL_TONE: Record<CallWord, Tone | null> = { Add: "up", Hold: null, Trim: "down" };

const KIND_LABEL: Record<StockTimelineKind, string> = {
  move: "Move",
  earnings: "Earnings",
  analyst: "Analysts",
  news: "News",
  congress: "Congress",
  discussion: "Reddit",
  dividend: "Dividend",
  call: "Our call",
};

function timelineDate(item: Pick<StockTimelineItem, "at" | "precision">, nowIso: string): string {
  if (item.precision === "month") {
    const text = fmtDate(item.at, true);
    return text.replace(/ \d+,/, "");
  }
  const sameYear = item.at.slice(0, 4) === nowIso.slice(0, 4);
  if (item.precision === "day") return fmtDate(item.at, !sameYear);
  const day = new Date(item.at).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return day;
}

function TimelineRow({ item, nowIso }: { item: StockTimelineItem; nowIso: string }) {
  const tone = item.tone && item.tone !== "flat" ? item.tone : undefined;
  // Only a headline keeps its publisher; the other rows speak for themselves.
  const meta = [item.kind === "news" ? item.source : "", item.precision === "time" ? fmtStamp(item.at) : ""].filter(Boolean);
  return (
    <li className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-oa-border px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:px-4">
      <div className="pt-0.5">
        <p className={`${NUM} text-[12px] leading-4 text-oa-fg`}>{timelineDate(item, nowIso)}</p>
        <p className="oa-mono mt-0.5 text-[10px] uppercase leading-4 tracking-[0.08em]" style={{ color: item.kind === "call" ? "var(--oa-primary)" : "var(--oa-muted-fg)" }}>
          {KIND_LABEL[item.kind]}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-5 text-oa-fg">
          {tone ? (
            <ToneGlyph tone={tone} className="mr-1.5 -translate-y-px align-middle" />
          ) : null}
          {item.href && !item.sourceUrl ? (
            <a href={item.href} className="hover:underline">
              {item.title}
            </a>
          ) : item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {item.locked ? (
            <span className="ml-1.5 inline-flex -translate-y-px align-middle">
              <Tag tone="primary">Pro</Tag>
            </span>
          ) : null}
        </p>
        {item.detail ? <p className="mt-0.5 line-clamp-3 text-[13px] leading-5 text-oa-muted-fg">{item.detail}</p> : null}
        {meta.length || (item.href && item.sourceUrl) ? (
          <p className="oa-mono mt-0.5 text-[11px] leading-4 text-oa-muted-fg">
            {meta.join(" · ")}
            {item.href && item.sourceUrl ? (
              <>
                {meta.length ? " · " : ""}
                <a href={item.href} className="text-oa-primary hover:underline">
                  open
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Shown where the price zones would be, on a stock the viewer's agent does not cover. */
function LevelsLock({ ticker, instrumentId, tracked, gate }: { ticker: string; instrumentId: string; tracked: boolean; gate: ReportData["gate"] }) {
  const title = gate.plan === "anon" ? `Sign in to see the full read on ${ticker}` : `Cover ${ticker} to see the full read`;
  const body =
    gate.plan === "anon"
      ? "The call is free to read. The reasons behind it, the price zones and what would change it come with covering a stock. A free account tracks as many stocks as you like and covers five in full."
      : !tracked
        ? gate.slotsLeft > 0
          ? `Add ${ticker} to your portfolio and it takes one of your covered slots (${gate.slotsLeft} open): the reasons, zones, alerts and the read before earnings.`
          : `Your five covered slots are in use. Add ${ticker} to your portfolio, then swap it in (Free swaps one a week, uncovering is free), or go Pro and cover every stock.`
        : gate.slotsLeft > 0
          ? `You track ${ticker}. Cover it to get the reasons, zones, alerts and the read before earnings. ${gate.slotsLeft} of your covered slots ${gate.slotsLeft === 1 ? "is" : "are"} open.`
          : `Your five covered slots are in use. Uncover one in Portfolio (free any time) and swap ${ticker} in, or go Pro and cover every stock.`;
  return (
    <div className="flex flex-col gap-2">
      <LockCard feature="stock_zones" plan={gate.plan} trialEligible={gate.trialEligible} ticker={ticker} title={title} body={body} stacked />
      {gate.plan === "free" && tracked ? (
        gate.slotsLeft > 0 ? (
          <CoverButton instrumentId={instrumentId} ticker={ticker} />
        ) : (
          <a href="/watchlist" className="self-start text-[13px] font-medium text-oa-primary hover:underline">
            Choose covered stocks in Portfolio
          </a>
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
 * Where the price sits between the two levels of the call: the add zone on the
 * left, the trim zone on the right, the price as a dot. One look says whether
 * the stock is near a level, which two percentages never did.
 */
function CallTrack({ price, add, trim, level }: { price: number; add: number; trim: number; level: (value: number) => string }) {
  const ZONE = 14; // percent of the track each zone takes
  const t = (price - add) / (trim - add);
  const pos = Math.min(97, Math.max(3, ZONE + t * (100 - 2 * ZONE)));
  const aboveAdd = ((price - add) / add) * 100;
  const toTrim = ((trim - price) / price) * 100;
  const where =
    price <= add
      ? { text: "At a price where we'd buy more", color: TONE_COLOR.up }
      : price >= trim
        ? { text: "At a price where we'd sell some", color: TONE_COLOR.down }
        : aboveAdd < 0.5
          ? { text: "Right at our buy-more price", color: TONE_COLOR.up }
          : { text: `${aboveAdd.toFixed(aboveAdd < 10 ? 1 : 0)}% above our buy-more price, ${toTrim.toFixed(toTrim < 10 ? 1 : 0)}% below our sell-some price`, color: undefined };
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-oa-bg" role="img" aria-label={`${where.text}. We would buy more below ${level(add)} and sell some above ${level(trim)}.`}>
        <span className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${ZONE}%`, background: `color-mix(in srgb, ${TONE_COLOR.up} 35%, transparent)` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: `${ZONE}%`, background: `color-mix(in srgb, ${TONE_COLOR.down} 35%, transparent)` }} />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card bg-oa-fg shadow-sm"
          style={{ left: `${pos}%` }}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4">
        <div className="min-w-0">
          <dt className="text-[13px] leading-[18px] text-oa-muted-fg">Buy more below</dt>
          <dd className={`${NUM} text-[15px] font-medium leading-[22px] text-oa-fg`}>{level(add)}</dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-[13px] leading-[18px] text-oa-muted-fg">Sell some above</dt>
          <dd className={`${NUM} text-[15px] font-medium leading-[22px] text-oa-fg`}>{level(trim)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[14px] leading-5 text-oa-fg">{where.text}</p>
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

export function StockReport({ data, related }: { data: ReportData; /** Links to the stock's sector, rivals, insiders and earnings pages, streamed in under the head. */ related?: ReactNode }) {
  const { stock, market, currency, nowIso, read, readState, facts, fundamentals } = data;
  const today = nowIso.slice(0, 10);
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
    const { addBelow, addAbove, trimAbove } = read.zones;
    if (addBelow) {
      zones.push({ key: "add", price: addBelow, side: "below", tone: "up", label: `Add below ${level(addBelow)}` });
      suggested.push({ id: "add", label: "Add zone", condition: "below", price: addBelow, note: `Add below ${level(addBelow)}` });
    } else if (addAbove) {
      suggested.push({ id: "add", label: "Add on a break", condition: "above", price: addAbove, note: `Add above ${level(addAbove)}` });
    }
    if (trimAbove && (!addBelow || trimAbove > addBelow)) {
      zones.push({ key: "trim", price: trimAbove, side: "above", tone: "down", label: `Trim above ${level(trimAbove)}` });
      suggested.push({ id: "trim", label: "Trim zone", condition: "above", price: trimAbove, note: `Trim above ${level(trimAbove)}` });
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
    fin(fundamentals?.dividend_yield) && fundamentals.dividend_yield > 0
      ? { label: "Dividend a year", value: `${fundamentals.dividend_yield.toFixed(2)}%` }
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
  const callLevels = ready
    ? [
        ready.zones.addBelow
          ? { label: "Buy more below", price: ready.zones.addBelow, tone: "up" as const }
          : ready.zones.addAbove
            ? { label: "Buy more above", price: ready.zones.addAbove, tone: "up" as const }
            : null,
        ready.zones.trimAbove ? { label: "Sell some above", price: ready.zones.trimAbove, tone: "down" as const } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const callMeta = ready ? callMetaLine(ready.confidence, ready.horizon) : "";

  const stats = headerStats.length ? <KeyStats items={headerStats} /> : null;

  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pb-[72px] pt-3 sm:px-6 sm:pt-6 lg:pb-10">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-x-6">
        {/* ── the lead: price and call, then the chart, across the full width ── */}
        <div className="order-1 min-w-0 xl:col-span-2 xl:row-start-1">
          <Panel>
            <header className="px-3.5 pt-3.5 sm:px-4 sm:pt-4">
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

              <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className={`${NUM} text-[36px] font-semibold leading-[44px] text-oa-fg sm:text-[42px] sm:leading-[48px]`}>{money(stock.price)}</span>
                    {dayPct != null ? (
                      <span className={`${NUM} text-[17px] font-medium`} style={{ color: TONE_COLOR[dayTone ?? "flat"] }}>
                        {dayAbs != null ? `${dayAbs >= 0 ? "+" : "−"}${Math.abs(dayAbs).toFixed(2)} ` : ""}({signedPct(dayPct, 2)})
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-col md:items-start">
                    {stock.captured_at ? <p className="oa-mono text-[11px] leading-4 text-oa-muted-fg">{fmtStamp(stock.captured_at)}</p> : null}
                    <MarketStatusInline nowIso={nowIso} surface="stock" />
                    {data.premarketQuote ? <StockPremarketQuote currency={currency} market={market} quote={data.premarketQuote} /> : null}
                  </div>
                </div>

                {/* The call sits beside the price on a wide screen and right under it on a phone. */}
                <section aria-label={`Our call on ${stock.ticker}`} className="min-w-0 border-t border-oa-border pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="oa-caption">Our call</h2>
                    {ready?.writtenAt ? (
                      <p className="oa-mono text-[11px] leading-4 text-oa-muted-fg">{fmtStamp(ready.writtenAt)}</p>
                    ) : readState === "locked" ? (
                      <Tag tone="primary">Pro</Tag>
                    ) : null}
                  </div>
                  {ready ? (
                    <>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        {ready.call ? (
                          <span
                            className="oa-mono inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
                            style={{
                              color: callTone ? TONE_COLOR[callTone] : "var(--oa-fg)",
                              background: `color-mix(in srgb, ${callTone ? TONE_COLOR[callTone] : "var(--oa-fg)"} 12%, transparent)`,
                            }}
                          >
                            {ready.call}
                          </span>
                        ) : null}
                        {/* The call word, then what it means in plain words ("TRIM" then "We'd sell some, not buy more"). */}
                        {plainAction(ready.actionLabel, ready.call) ? (
                          <span className="text-[17px] font-medium leading-6 tracking-tight text-oa-fg">{plainAction(ready.actionLabel, ready.call)}</span>
                        ) : null}
                      </p>
                      {ready.actionSummary ? <p className="mt-2 max-w-[62ch] text-pretty text-[15px] leading-[22px] text-oa-fg">{ready.actionSummary}</p> : null}
                      {hasPrice && ready.zones.addBelow && ready.zones.addBelow > 0 && ready.zones.trimAbove && ready.zones.trimAbove > ready.zones.addBelow ? (
                        <CallTrack price={stock.price} add={ready.zones.addBelow} trim={ready.zones.trimAbove} level={level} />
                      ) : callLevels.length ? (
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 border-t border-oa-border pt-2.5">
                          {callLevels.map((item) => (
                            <div key={item.label} className="min-w-0">
                              <dt className="text-[12.5px] leading-4 text-oa-muted-fg">{item.label}</dt>
                              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                                <span className={`${NUM} text-[15px] font-medium leading-[22px] text-oa-fg`}>{level(item.price)}</span>
                                {fromHere(item.price) ? (
                                  <span className="text-[12.5px] leading-4 text-oa-muted-fg">
                                    <span className={NUM}>{fromHere(item.price)}</span> from here
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {!data.gate.levels ? (
                        <p className="mt-2.5 flex items-start gap-2 border-t border-oa-border pt-2.5 text-[13.5px] leading-5 text-oa-muted-fg">
                          <span className="mt-0.5 text-oa-primary">
                            <LockIcon />
                          </span>
                          <span>
                            The prices where we&apos;d buy more or sell some show once {stock.ticker} is one of your covered stocks.{" "}
                            <a href="#call" className="font-medium text-oa-primary hover:underline">
                              See how
                            </a>
                          </span>
                        </p>
                      ) : null}
                      <p className="mt-2 text-[13px] leading-[18px] text-oa-muted-fg">
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
              </div>
            </header>

            {related}

            {data.chart ? (
              <PricePanel
                ticker={stock.ticker}
                ranges={data.chart.ranges}
                events={data.chart.events}
                zones={zones}
                currency={currency}
                defaultRange={data.chart.ranges.some((range) => range.key === "1Y") ? "1Y" : "6M"}
              />
            ) : (
              <Missing className="mt-3 border-t border-oa-border">We do not have enough price history for {stock.ticker} to draw a chart yet.</Missing>
            )}

            {/* On a phone the read comes before the key facts, so they are printed again below it. */}
            {stats ? <div className="hidden border-t border-oa-border md:block">{stats}</div> : null}
          </Panel>
        </div>

        {/* ── follow, alerts and tools: secondary, one primary action ──────── */}
        <aside className="order-3 min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-2">
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
              <a
                href={`/backtest?t=${encodeURIComponent(stock.ticker)}`}
                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3.5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              >
                <span>Backtest {stock.ticker}</span>
                <span className="oa-mono shrink-0 text-[12px] text-oa-muted-fg">vs S&amp;P 500 →</span>
              </a>
              <WatchlistAiPromptButton
                ticker={stock.ticker}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3.5 text-left text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              />
              <a
                href={`/compare?symbols=${encodeURIComponent(stock.ticker)}`}
                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3.5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
              >
                <span>Compare with another stock</span>
                <span className="oa-mono text-[12px] text-oa-muted-fg">→</span>
              </a>
            </nav>
          </div>
        </aside>

        {/* ── the read: what today means, what is coming, then our brief ──── */}
        <div className="order-2 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-2">
          <TheRead read={data.insightRead} label={`The read on ${stock.ticker}`} />
          <Panel
            id="read"
            label="Our brief"
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
                      <Tag tone="primary">Call changed</Tag>
                    </p>
                  ) : null}
                  {ready.headline ? (
                    <h2 className="max-w-[27em] text-balance text-[21px] font-medium leading-7 tracking-tight text-oa-fg sm:text-[24px] sm:leading-8">{ready.headline}</h2>
                  ) : null}
                  {ready.body ? <p className={`mt-2.5 max-w-[66ch] ${PROSE}`}>{ready.body}</p> : null}
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
                        <h3 className="oa-label">What would change the call</h3>
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

          {stats ? <Panel label="Key facts" className="md:hidden">{stats}</Panel> : null}
        </div>

        {/* ── what changed, then the sections ─────────────────────────────── */}
        <div className="order-4 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-3">
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
                {restItems.length ? (
                  <Details className="border-t border-oa-border" track={{ section: "timeline", ticker: stock.ticker }} summary={`${restItems.length} earlier ${restItems.length === 1 ? "entry" : "entries"}`}>
                    <ol>
                      {restItems.map((item) => (
                        <TimelineRow key={item.id} item={item} nowIso={nowIso} />
                      ))}
                    </ol>
                  </Details>
                ) : null}
              </>
            ) : (
              <Missing>Nothing new on {stock.ticker} yet.</Missing>
            )}
          </Panel>

          {/* The deeper report, one part at a time: the order matches SECTION_LABELS, which is the order of railSections. */}
          {railSections.length ? (
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
          ) : null}

          <p className="px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-0">
            Research, not investment advice. Prices can be delayed.
          </p>
        </div>
      </div>
    </div>
  );
}
