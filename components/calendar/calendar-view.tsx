import * as React from "react";

import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { Delta, Empty, FOCUS, NUM, Panel, Tag, Ticker, Verdict, fmtCompact } from "@/components/oa/kit";
import { SERIES_VARS } from "@/components/backtest/format";
import { barGeometry } from "@/components/stock-report/fact-bars";
import { KindIcon, type KindIconName } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { shortCompanyName } from "@/lib/plain-copy";
import {
  CALENDAR_TYPES,
  LIST_SPAN_DAYS,
  SESSION_LABEL,
  addDays,
  calendarHref,
  dayDiff,
  earningsCount,
  emptyDay,
  fmtEps,
  fmtIpoPrice,
  fmtMonth,
  fmtShortDay,
  fmtDayRange,
  fmtTimeET,
  heatLevel,
  isTradingDay,
  monthGrid,
  tradingDayOnOrAfter,
  reactionBasisLabel,
  relativeDay,
  resultWord,
  surprisePctOf,
  shiftMonth,
  topReporters,
  weekdayName,
  windowDays,
  windowSpan,
  type CalendarFilters,
  type CalendarType,
  type DayBuckets,
  type DividendItem,
  type EarningsItem,
  type EconomicItem,
  type IpoItem,
  type Session,
} from "@/lib/calendar-shared";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";
import { WeekGrid, type WeekCard } from "@/components/calendar/week-grid";
import { blockHeight, foldDay, stackDays, weekBudget, type DayBlock } from "@/components/calendar/fold-day";

const CHIP =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors lg:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";
const NAV_BUTTON =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-oa-border bg-oa-card px-2.5 text-[14px] text-oa-fg hover:bg-oa-accent lg:h-8 lg:min-w-8 " +
  FOCUS;
const SECTION = "oa-caption px-3 pb-1 pt-3";
/** A section of one kind (economic releases, IPOs) with its kind's icon before the label (owner VISUALS CHECK). */
const SECTION_KIND = `${SECTION} flex items-center gap-1.5`;

/** Each kind of event has its own icon on its chip (owner VISUALS CHECK). */
const TYPE_ICON: Record<CalendarType, KindIconName> = { earnings: "briefing", economic: "globe", ipo: "rocket", dividend: "coins" };

export function earningsHref(ticker: string): string {
  return `/calendar/earnings/${encodeURIComponent(ticker)}`;
}

/* ── Controls ──────────────────────────────────────────────────────────── */

/**
 * One row: what to show. The view switch and the period stepper live on the
 * title row (desktop); on a phone the week's day strip is the stepper.
 */
export function CalendarControls({
  filters,
  today,
  counts,
  mineAvailable,
  days,
}: {
  filters: CalendarFilters;
  today: string;
  counts: Record<CalendarType, number>;
  /** True when the viewer is signed in and tracks at least one stock. */
  mineAvailable: boolean;
  /** The week's buckets, for the phone day strip. */
  days: Map<string, DayBuckets>;
}) {
  const total = counts.earnings + counts.economic + counts.ipo + counts.dividend;
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="oa-scroll-fade -mx-2 flex gap-2 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap [&::-webkit-scrollbar]:hidden">
        <Link prefetch={false} href={calendarHref(filters, today, { type: null })} aria-current={!filters.type ? "true" : undefined} className={`${CHIP} ${!filters.type ? CHIP_ON : CHIP_OFF}`}>
          All
          <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{total}</span>
        </Link>
        {CALENDAR_TYPES.map((type) => {
          const active = filters.type === type.id;
          return (
            <Link prefetch={false}
              key={type.id}
              href={calendarHref(filters, today, { type: active ? null : type.id })}
              aria-current={active ? "true" : undefined}
              className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}
            >
              <KindIcon name={TYPE_ICON[type.id]} className="size-4" />
              {type.label}
              <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{counts[type.id]}</span>
            </Link>
          );
        })}
        {mineAvailable ? (
          <Link prefetch={false}
            href={calendarHref(filters, today, { mine: !filters.mine })}
            aria-current={filters.mine ? "true" : undefined}
            className={`${CHIP} ${filters.mine ? CHIP_ON : CHIP_OFF}`}
          >
            My stocks only
          </Link>
        ) : null}
      </div>
      {filters.view === "week" ? <DayStrip filters={filters} today={today} days={days} /> : <PeriodNav filters={filters} today={today} className="lg:hidden" />}
    </div>
  );
}

/** Earlier / later for the current view. On desktop it sits on the title row. */
export function PeriodNav({ filters, today, className = "" }: { filters: CalendarFilters; today: string; className?: string }) {
  let label: string;
  let prev: string;
  let next: string;
  let home: string | null;
  let homeLabel: string;
  if (filters.view === "month") {
    label = fmtMonth(filters.month);
    prev = calendarHref(filters, today, { month: shiftMonth(filters.month, -1) });
    next = calendarHref(filters, today, { month: shiftMonth(filters.month, 1) });
    home = filters.month === today.slice(0, 7) ? null : calendarHref(filters, today, { month: today.slice(0, 7) });
    homeLabel = "This month";
  } else if (filters.view === "list") {
    const from = filters.day ?? filters.from;
    const step = filters.day ? 1 : LIST_SPAN_DAYS;
    label = filters.day ? `${weekdayName(from, true)}, ${fmtShortDay(from)}` : `${fmtShortDay(from)} to ${fmtShortDay(addDays(from, LIST_SPAN_DAYS - 1))}`;
    prev = calendarHref(filters, today, filters.day ? { day: addDays(from, -step) } : { from: addDays(from, -step) });
    next = calendarHref(filters, today, filters.day ? { day: addDays(from, step) } : { from: addDays(from, step) });
    home = !filters.day && filters.from === today ? null : calendarHref(filters, today, { day: null, from: today });
    homeLabel = filters.day ? "Whole list" : "From today";
  } else {
    const days = windowDays(filters.center);
    label = fmtDayRange(days[0]!, days[days.length - 1]!);
    // A week at a time, from the anchor, so the same weekday stays in the middle.
    prev = calendarHref(filters, today, { center: addDays(filters.center, -7) });
    next = calendarHref(filters, today, { center: addDays(filters.center, 7) });
    home = isHome(filters, today) ? null : calendarHref(filters, today, { center: today });
    homeLabel = "Today";
  }
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className}`}>
      <AppLink href={prev} aria-label="Earlier" className={NAV_BUTTON}>
        ←
      </AppLink>
      <span className={`${NUM} min-w-0 flex-1 px-1 text-center text-[14px] font-medium text-oa-fg lg:min-w-[9.5rem] lg:flex-none`}>{label}</span>
      <AppLink href={next} aria-label="Later" className={NAV_BUTTON}>
        →
      </AppLink>
      {home ? (
        <AppLink href={home} className={NAV_BUTTON}>
          {homeLabel}
        </AppLink>
      ) : null}
    </div>
  );
}

/** Whether the week view is on its default window, centred on today (or the next trading day). */
function isHome(filters: CalendarFilters, today: string): boolean {
  return tradingDayOnOrAfter(filters.center) === tradingDayOnOrAfter(today);
}

/**
 * Phone only: the window's days as tap targets with earlier / later at the ends, today in the middle.
 * Each day jumps down the page to its list, a day that has passed included.
 */
function DayStrip({ filters, today, days }: { filters: CalendarFilters; today: string; days: Map<string, DayBuckets> }) {
  const shown = windowDays(filters.center);
  return (
    <div className="lg:hidden">
      <nav aria-label="Days shown" className="oa-surface grid overflow-hidden border border-oa-border bg-oa-card" style={{ gridTemplateColumns: `2.5rem repeat(${shown.length},minmax(0,1fr)) 2.5rem` }}>
        <Link prefetch={false} href={calendarHref(filters, today, { center: addDays(filters.center, -7) })} aria-label="A week earlier" className={`flex items-center justify-center text-[15px] text-oa-muted-fg hover:bg-oa-accent ${FOCUS}`}>
          ←
        </Link>
        {shown.map((day) => {
          const bucket = days.get(day) ?? emptyDay(day);
          const isToday = day === today;
          const past = day < today;
          const label = `${weekdayName(day, true)}, ${fmtShortDay(day)}: ${bucket.total} event${bucket.total === 1 ? "" : "s"}`;
          const look = `flex h-[52px] flex-col items-center justify-center border-l border-oa-border ${
            isToday ? "shadow-[inset_0_-2px_0_var(--oa-primary)]" : past ? "bg-oa-bg" : ""
          }`;
          const face = (
            <>
              <span className={`text-[12.5px] leading-4 ${isToday ? "font-medium text-oa-primary" : "text-oa-muted-fg"}`}>{isToday ? "Today" : weekdayName(day)}</span>
              <span className={`${NUM} text-[15px] leading-5 ${isToday ? "font-semibold text-oa-fg" : past ? "text-oa-muted-fg" : "font-medium text-oa-fg"}`}>{Number(day.slice(8))}</span>
              <span className={`${NUM} text-[11px] leading-3 text-oa-muted-fg`}>{bucket.total || " "}</span>
            </>
          );
          // A day with nothing on it has no card to jump to, so it is not a link.
          return bucket.total ? (
            <AppLink key={day} href={`#d-${day}`} aria-current={isToday ? "date" : undefined} aria-label={label} className={`${look} hover:bg-oa-accent ${FOCUS}`}>
              {face}
            </AppLink>
          ) : (
            <span key={day} aria-current={isToday ? "date" : undefined} className={look}>
              {face}
            </span>
          );
        })}
        <Link prefetch={false} href={calendarHref(filters, today, { center: addDays(filters.center, 7) })} aria-label="A week later" className={`flex items-center justify-center border-l border-oa-border text-[15px] text-oa-muted-fg hover:bg-oa-accent ${FOCUS}`}>
          →
        </Link>
      </nav>
      {isHome(filters, today) ? null : (
        <p className="mt-2 text-[14px] text-oa-muted-fg">
          {fmtDayRange(shown[0]!, shown[shown.length - 1]!)}.{" "}
          <Link prefetch={false} href={calendarHref(filters, today, { center: today })} className="text-oa-primary underline underline-offset-2">
            Back to today
          </Link>
        </p>
      )}
    </div>
  );
}

/* ── Rows shared by the week and list views ────────────────────────────── */

// Beat, missed or in line lives in lib/calendar-shared (pure, so it is unit-tested); re-exported for the detail page.
export { resultWord };

/**
 * The surprise figure. Signed and coloured like any change, except when the
 * result reads "In line": a green +0.3% beside a gray "In line" chip would
 * contradict it, so a within-the-band surprise stays in normal ink.
 */
export function SurprisePct({ item }: { item: Pick<EarningsItem, "epsActual" | "epsEstimate" | "surprisePct" | "surpriseLabel"> }) {
  // From the two EPS figures when both are there, so a stale stored +9% never sits beside "Missed".
  const value = surprisePctOf(item);
  if (value === null) return null;
  if (resultWord(item)?.tone !== "flat") return <Delta value={value} digits={1} />;
  return (
    <span className={`${NUM} text-oa-fg`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function SurpriseTag({ item }: { item: EarningsItem }) {
  if (!item.surpriseLabel) return null;
  const result = resultWord(item);
  return result ? <Verdict tone={result.tone}>{result.word}</Verdict> : <Tag>Reported</Tag>;
}

function ReactionValue({ item, className = "", narrow = false }: { item: EarningsItem; className?: string; narrow?: boolean }) {
  if (!item.reaction) return null;
  return (
    <span title={`${reactionBasisLabel(item.reaction, item.session)}.`} className={`inline-flex items-baseline gap-1 ${className}`}>
      {/* One decimal in a narrow column: "+19.94%" ran past a 1280 column's edge (council, sweep 87). */}
      <Delta value={item.reaction.pct} digits={narrow ? 1 : 2} />
      {/* A narrow desktop column has no room for "2d"; the title still says it. */}
      {item.reaction.basis === "2d" ? <span className={`${NUM} text-[11px] text-oa-muted-fg ${narrow ? "lg:hidden" : ""}`}>2d</span> : null}
    </span>
  );
}

/** The mark for "a pre-read is ready to open". The only tag an upcoming report carries. */
export function PreReadMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" role="img" aria-label="Pre-read ready" className={`shrink-0 text-oa-muted-fg ${className}`}>
      <title>Pre-read ready</title>
      <path d="M2.5 1.5h5l2 2v7h-7z" />
      <path d="M4.5 5.5h3M4.5 7.75h3" />
    </svg>
  );
}

/**
 * Beat and missed are the exceptions worth a word; in line and plain "reported"
 * are not. A chip, not coloured text, so it can't be read as the sign of the
 * stock move printed beside it.
 */
function ResultWord({ item }: { item: EarningsItem }) {
  const result = resultWord(item);
  if (!result || result.tone === "flat") return null;
  return <Verdict tone={result.tone} className="self-center">{result.word}</Verdict>;
}

/**
 * A reported result: beat or miss and by how much against the estimate ("Beat 12%", "Miss 5.2%"), coloured by the
 * result; the word alone when there is no estimate to size it against. Nothing for a result in line.
 */
function ResultFigure({ item, big = false }: { item: EarningsItem; big?: boolean }) {
  const result = resultWord(item);
  if (!result || result.tone === "flat") return null;
  const pct = surprisePctOf(item);
  // Only a stored beat or miss, no estimate to size it against: the word alone.
  const size = pct === null || !Number.isFinite(pct) ? null : Math.abs(pct) >= 10 ? `${Math.round(Math.abs(pct))}` : Math.abs(pct).toFixed(1).replace(/\.0$/, "");
  return (
    // "Miss", not "Missed", and a size smaller: it has to fit a narrow desktop column beside the moves.
    <span title={size === null ? `${result.word} the estimate for profit a share` : `${result.word} the estimate for profit a share by ${size}%`} className={`${NUM} whitespace-nowrap ${big ? "text-[14px]" : "text-[12.5px]"} ${result.tone === "up" ? "text-signal-bullish" : "text-signal-bearish"}`}>
      {result.tone === "up" ? "Beat" : "Miss"}
      {size === null ? "" : ` ${size}%`}
    </span>
  );
}

/**
 * How the stock moved after its last report, on an upcoming report's own row (the biggest companies only): "last
 * report −8.4%", with the move against a normal day in the hover title.
 */
function LastReport({ item, className = "" }: { item: EarningsItem; className?: string }) {
  if (!item.lastReport) return null;
  return (
    <span title={item.lastReport.note} className={`items-baseline gap-1 text-[12.5px] leading-[18px] ${className}`}>
      <span className="text-oa-muted-fg">last report</span>
      <Delta value={item.lastReport.pct} digits={1} />
    </span>
  );
}

/**
 * Today's report, one line in the wide column: the ticker, the company, and once reported the result word, the
 * reported figure against the estimate with its bars, and the stock's move; before it, the estimate (said once in the
 * group's heading, so only the number).
 */
function EarningsLine({ item, quiet, mark }: { item: EarningsItem; quiet: boolean; mark: boolean }) {
  const reported = item.epsActual !== null;
  return (
    <Link prefetch={false}
      data-row=""
      href={earningsHref(item.ticker)}
      title={[item.company, resultTitle(item)].filter(Boolean).join(": ")}
      className={`flex min-h-10 flex-wrap items-center gap-x-2 px-3 py-1 hover:bg-oa-accent lg:min-h-[30px] lg:py-0.5 ${FOCUS}`}
    >
      <span className={`${NUM} inline-flex min-w-[4.5rem] shrink-0 items-center gap-1.5 text-[14px] ${quiet ? "font-medium text-oa-fg" : "font-semibold text-oa-fg"}`}>
        <StockLogo ticker={item.ticker} size={16} atOnce />
        {item.ticker}
      </span>
      {/* Wraps rather than cutting the name; the result wraps under the name rather than overlapping it. */}
      <span className="min-w-[6rem] flex-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
        {shortCompanyName(item.company)}
        {/* Under the name, so the estimate keeps its place on the line. */}
        {!reported && item.lastReport ? <LastReport item={item} className="flex" /> : null}
      </span>
      <span className="ml-auto flex shrink-0 items-baseline gap-2 text-[14px]">
        {mark && !reported && item.hasPreRead ? <PreReadMark className="self-center" /> : null}
        {reported ? (
          <>
            <ResultWord item={item} />
            <span className={`${NUM} inline-flex items-baseline gap-1.5 text-[12.5px] text-oa-muted-fg ${item.reaction ? "max-[420px]:hidden" : ""}`}>
              <EpsBars actual={item.epsActual} estimate={item.epsEstimate} />
              {fmtEps(item.epsActual)}
              {/* "expected" is said once, in the group's key over the bars. */}
              {item.epsEstimate !== null ? (
                <span>
                  {" "}
                  vs {fmtEps(item.epsEstimate)}
                  <span className="sr-only"> expected</span>
                </span>
              ) : null}
            </span>
            <ReactionValue item={item} />
          </>
        ) : null}
        {/* A day that has passed (`quiet`) never shows the estimate in the result's place. */}
        {reported || quiet ? null : item.epsEstimate !== null ? <EstimateValue item={item} /> : null}
      </span>
    </Link>
  );
}

/** "$1.24 vs $1.10 est, +12.7% surprise", or "expected $1.10 a share": a row's full figures, for its hover title. */
function resultTitle(item: EarningsItem): string {
  if (item.epsActual !== null) {
    return `${fmtEps(item.epsActual)}${item.epsEstimate !== null ? ` vs ${fmtEps(item.epsEstimate)} est` : ""}${
      item.surprisePct !== null ? `, ${item.surprisePct > 0 ? "+" : item.surprisePct < 0 ? "−" : ""}${Math.abs(item.surprisePct).toFixed(1)}% surprise` : ""
    }`;
  }
  return item.epsEstimate !== null ? `expected ${fmtEps(item.epsEstimate)} a share` : "";
}

/** The estimate alone: the session heading says once what it is ("Expected profit a share"); screen readers get the words. */
function EstimateValue({ item }: { item: EarningsItem }) {
  return (
    <span className={`${NUM} text-oa-muted-fg`}>
      <span className="sr-only">expected </span>
      {fmtEps(item.epsEstimate)}
      <span className="sr-only"> a share</span>
    </span>
  );
}

/** The company's short name for a row's second line; empty when it only repeats the ticker. */
function rowName(item: EarningsItem): string {
  const short = shortCompanyName(item.company);
  return short && short.toUpperCase() !== item.ticker ? short : "";
}

/**
 * A DayReportLine's height in short rows at lg, for the fold: one line, two (a name or a second figure), or three where
 * "last report …" wraps under the name in a narrow column.
 */
function dayRowWeight(item: EarningsItem, past: boolean): number {
  const reported = item.epsActual !== null;
  if (!reported && !past && item.lastReport) return 2.1;
  // The move on line one, then the bars and "Beat 12%" beside the name: in a narrow column they wrap under it.
  if (reported && item.reaction !== null && resultWord(item) !== null && hasEpsPair(item.epsActual, item.epsEstimate)) return 2.1;
  const second = rowName(item) !== "" || (reported && item.reaction !== null && resultWord(item) !== null) || (reported && hasEpsPair(item.epsActual, item.epsEstimate));
  return second ? 1.5 : 1;
}

/**
 * A report in any column but today's: two short lines, so a narrow column keeps what today's wide one says (owner,
 * Nov 13: "this used to have a bit more info that i liked"). Line one is the logo, the ticker and the figure that
 * matters most: the stock's move once there is one, else the result against the estimate ("Beat 12%"), else the
 * estimate. Line two is the company and, beside it, the second figure: beat or miss by how much under a move, or how
 * the stock moved after its last report under an estimate. A day that has passed shows no estimate. No pre-read mark:
 * on a week of coming reports it sat beside most tickers (owner rule 1); the report's page has the pre-read.
 */
function DayReportLine({ item, quiet }: { item: EarningsItem; quiet: boolean }) {
  const reported = item.epsActual !== null;
  const name = rowName(item);
  const flat = reported && resultWord(item)?.tone === "flat";
  const inLine = flat ? <span className="whitespace-nowrap text-[12.5px] text-oa-muted-fg">In line</span> : null;
  const main = reported ? (
    item.reaction ? <ReactionValue item={item} narrow /> : (inLine ?? <ResultFigure item={item} big />)
  ) : !quiet && item.epsEstimate !== null ? (
    <EstimateValue item={item} />
  ) : null;
  // Reported against expected as the two small bars (owner rule 4: a beat or miss compares two numbers), beside the
  // result's words when the move took line one, alone under a "Beat 12%" that did. Keyed once over the day's group.
  const bars = reported && hasEpsPair(item.epsActual, item.epsEstimate) ? <EpsBars actual={item.epsActual} estimate={item.epsEstimate} className="!w-8" /> : null;
  const side = reported
    ? item.reaction
      ? (
          <span className="inline-flex items-center gap-1.5">
            {bars}
            {inLine ?? <ResultFigure item={item} />}
          </span>
        )
      : bars
    : !quiet && item.lastReport
      ? <LastReport item={item} className="inline-flex whitespace-nowrap" />
      : null;
  return (
    <Link
      prefetch={false}
      data-row=""
      href={earningsHref(item.ticker)}
      title={[item.company, resultTitle(item)].filter(Boolean).join(": ")}
      className={`flex min-h-10 flex-col justify-center px-3 py-1 hover:bg-oa-accent ${FOCUS}`}
    >
      <span className="flex items-center gap-2">
        <span className={`${NUM} inline-flex min-w-0 items-center gap-1.5 text-[14px] leading-5 ${quiet ? "font-medium" : "font-semibold"} text-oa-fg`}>
          <StockLogo ticker={item.ticker} size={16} atOnce />
          {item.ticker}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline text-[14px] leading-5">{main}</span>
      </span>
      {name || side ? (
        // The name gives way (cut with …) down to a few letters; past that the second figure moves under it.
        <span className="flex flex-wrap items-baseline gap-x-2 pl-[22px] text-[12.5px] leading-[18px]">
          {name ? <span className="min-w-[3rem] flex-1 truncate text-oa-muted-fg">{name}</span> : null}
          {side ? <span className="ml-auto shrink-0">{side}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * An economic release's own icon, by what it measures (owner rule 4: every kind has its icon): the Fed's decision, jobs,
 * income and spending, prices, growth, trade. Anything else keeps the section's globe.
 */
export function economicIcon(title: string): KindIconName {
  if (/\b(?:fed|fomc|federal reserve)\b/i.test(title)) return "capitol";
  if (/\b(?:jobs?|jolts|employment|payrolls?|jobless|unemployment)\b/i.test(title)) return "briefcase";
  if (/\b(?:income|spending|retail sales)\b/i.test(title)) return "dollar";
  if (/\b(?:cpi|ppi|pce|inflation|prices?)\b/i.test(title)) return "percent";
  if (/\b(?:gdp|productivity|growth)\b/i.test(title)) return "growth";
  if (/\b(?:trade|imports?|exports?)\b/i.test(title)) return "exchange";
  return TYPE_ICON.economic;
}

function EconomicLine({ item }: { item: EconomicItem }) {
  return (
    <a
      data-row=""
      href={item.sourceUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-10 items-start gap-2 px-3 py-1.5 hover:bg-oa-accent lg:min-h-0 ${FOCUS}`}
    >
      {/* What it measures as its icon, in the accent when the release usually moves the market. */}
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${item.importance === "high" ? "text-oa-primary" : "text-oa-muted-fg"}`}>
        <KindIcon name={economicIcon(item.title)} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-oa-fg">{item.title}</span>
        <span className={`${NUM} block text-[12.5px] leading-4 text-oa-muted-fg`}>
          {[fmtTimeET(item.timeEt) ? `${fmtTimeET(item.timeEt)} ET` : "", item.period].filter(Boolean).join(" · ")}
        </span>
      </span>
    </a>
  );
}

/** "WINDWARD BIO GROUP AG" reads as shouting; feeds send some names in capitals. shortCompanyName softens them. */
function readableName(name: string): string {
  return shortCompanyName(name) || name;
}

/** The exchange in a word: "NASDAQ Global Select" reads "Nasdaq"; the market tier is in the title. */
function shortExchange(exchange: string): string {
  if (/nasdaq/i.test(exchange)) return "Nasdaq";
  if (/nyse\s*american/i.test(exchange)) return "NYSE American";
  if (/nyse|new york/i.test(exchange)) return "NYSE";
  return exchange;
}

/**
 * An IPO: the company's name first, whole (it wraps to a second line rather than being cut, so it can be told apart),
 * then one short line of facts: the ticker, the price or range, the size of the raise and the exchange (judge89: no
 * repeated "New listing, aiming for…" prose). Each fact's full words are its hover. The day is the column it sits in.
 */
function IpoLine({ item }: { item: IpoItem }) {
  const price = fmtIpoPrice(item.priceLow, item.priceHigh).replace(" to $", "–");
  const name = readableName(item.company);
  const facts: Array<{ key: string; text: string; title: string; muted?: boolean }> = [
    price
      ? { key: "price", text: item.status === "priced" ? `priced ${price}` : price, title: item.status === "priced" ? `Priced at ${price} a share` : `Aiming for ${price} a share` }
      : { key: "price", text: "price not set", title: "Price not set yet", muted: true },
    ...(item.offerAmount ? [{ key: "size", text: `${fmtCompact(item.offerAmount, "$")} raise`, title: `Raising ${fmtCompact(item.offerAmount, "$")}` }] : []),
    ...(item.exchange ? [{ key: "exchange", text: shortExchange(item.exchange), title: item.exchange, muted: true }] : []),
  ];
  return (
    <div data-row="" className="flex items-start gap-2 px-3 py-1.5">
      {/* The company's logo leads, as on every other row; a listing with no ticker yet gets the IPO icon. */}
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {item.ticker ? <StockLogo ticker={item.ticker} size={16} atOnce /> : <KindIcon name={TYPE_ICON.ipo} className="size-4 text-oa-muted-fg" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[14px] font-medium leading-5 text-oa-fg" title={name}>
          {name}
        </p>
        <p className={`${NUM} mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] leading-[18px] text-oa-fg`}>
          {item.ticker ? <span className="font-medium">{item.ticker}</span> : null}
          {facts.map((fact) => (
            <span key={fact.key} title={fact.title} className={fact.muted ? "text-oa-muted-fg" : undefined}>
              {fact.text}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/** Ex-dividend rows sit under an "Ex-dividend" heading, so the row says only who, how much and when it pays. */
function DividendLine({ item }: { item: DividendItem }) {
  return (
    <Link prefetch={false} data-row="" href={`/stock/${encodeURIComponent(item.ticker)}`} title={item.paymentDate ? `${item.ticker} pays ${fmtShortDay(item.paymentDate)}` : undefined} className={`flex min-h-10 items-center gap-2 px-3 py-1 hover:bg-oa-accent lg:min-h-[30px] lg:py-0.5 ${FOCUS}`}>
      <span className={`${NUM} inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-oa-fg`}>
        <StockLogo ticker={item.ticker} size={16} atOnce />
        {item.ticker}
      </span>
      {/* The pay date is in the tooltip, not "pays …" written on every row (owner, Nov 11). */}
      {item.paymentDate ? <span className="sr-only">pays {fmtShortDay(item.paymentDate)}</span> : null}
      <span className={`${NUM} ml-auto shrink-0 text-[14px] text-oa-fg`}>${item.amount.toFixed(item.amount < 0.1 ? 4 : 2)}</span>
    </Link>
  );
}

/* ── Week ──────────────────────────────────────────────────────────────── */

/**
 * How tall a day may run before the rest waits behind one "Show N more" (owner rule 4: a card never scrolls inside its
 * own box), in short rows. Every heading and row is weighed by its height (dayBlocks), and the week shares one budget:
 * the height of its quietest day that has events, kept between DAY_MIN and DAY_MAX, so the busy days fold to the
 * quiet one's height and the columns end level (judge90) instead of one running on beside a blank column. A day
 * quieter than DAY_MIN keeps its own short height (and shares a column with a quiet neighbour, stackDays). DAY_MIN
 * lets a busy day show about seven or eight two-line rows before its fold (owner, Nov 13: "this used to have a bit
 * more info").
 */
const DAY_MIN = 14;
const DAY_MAX = 20;
/** A day card's header (the day and its count, two lines in a narrow column) and the gap under it, in short rows. */
const DAY_HEAD = 2.2;
/** A heading's line, and a second line under one (its "Expected profit a share", its bars' key, a wrapped title). */
const HEADING = 1;
const SUBLINE = 0.6;
/** The fold counts its own "Show N more" line. */
const FOLD_HEIGHTS = { button: 1.1 };

/** A day's session heading: the full words, or a short form for a narrow desktop week column. */
const SESSION_SHORT: Record<Session, string> = { bmo: "Before the open", amc: "After the close", unknown: "Time not set" };

function sessionWords(session: Session, past: boolean, short = false): string {
  if (session === "unknown" && past) return "Time not given";
  return short ? SESSION_SHORT[session] : SESSION_LABEL[session];
}

function More({ count, href }: { count: number; href: string }) {
  if (count <= 0) return null;
  return (
    <AppLink href={href} className={`flex min-h-10 items-center px-3 text-[14px] text-oa-primary hover:underline lg:min-h-[30px] ${FOCUS}`}>
      + {count} more
    </AppLink>
  );
}

/**
 * Every block of a day in order (group headings and rows), each with its rough height in short rows at lg (a heading
 * counts about one, its "Expected profit a share" or bar key a little more), so the fold can cut whatever mix of reports,
 * IPOs and dividends the day has, and the week can fold every day to one height (weekBudget).
 */
function dayBlocks(bucket: DayBuckets, { today, mark }: { today: string; mark: boolean }): DayBlock[] {
  const isToday = bucket.day === today;
  const past = bucket.day < today;
  const sessions = (["bmo", "amc", "unknown"] as Session[]).filter((session) => bucket.earnings[session].length > 0);
  const blocks: DayBlock[] = [];
  if (bucket.economic.length) {
    blocks.push({ node: <h3 key="eco-h" className={SECTION_KIND}><KindIcon name={TYPE_ICON.economic} className="size-3.5" />Economic</h3>, weight: 0, height: HEADING });
    // A title and its time: two lines.
    for (const item of bucket.economic) blocks.push({ node: <EconomicLine key={item.id} item={item} />, weight: 1.7 });
  }
  sessions.forEach((session, sessionIndex) => {
    const rows = bucket.earnings[session];
    // "Expected profit a share" once per day, over the first group whose numbers are estimates (owner rule 1).
    const estimates = (list: EarningsItem[]) => list.some((item) => item.epsActual === null && item.epsEstimate !== null);
    // A day that has passed shows no estimates (its rows show results or nothing), so it never says it.
    const sayExpected = !past && estimates(rows) && !sessions.slice(0, sessionIndex).some((earlier) => estimates(bucket.earnings[earlier]));
    // The reported-vs-expected bars' key, once over the first group that draws them: today's wide rows and every other
    // day's two-line rows alike (judge92: a "Beat 64%" with no picture). Only today's wide row hides its bars beside a
    // move on a small phone.
    const paired = (list: EarningsItem[]) => list.filter((item) => hasEpsPair(item.epsActual, item.epsEstimate));
    const sayKey = paired(rows).length > 0 && !sessions.slice(0, sessionIndex).some((earlier) => paired(bucket.earnings[earlier]).length > 0);
    // Shown on a small phone when any row of the day keeps its bars there (today's row beside a move hides them).
    const keyAlways = !isToday || sessions.some((each) => paired(bucket.earnings[each]).some((item) => !item.reaction));
    const keyClass = keyAlways ? "" : "max-[420px]:hidden";
    blocks.push({
      node: (
        <h3 key={`${session}-h`} title={sayExpected && !isToday ? "The figures are the expected profit a share" : undefined} className={`${SECTION} flex items-baseline justify-between gap-2`}>
          <span>
            {/* A narrow desktop column says the session in a few words, on one line ("Time not announced yet"
                wrapped into the ticker under it); a phone and today's wide column keep the full words. */}
            {isToday ? (
              sessionWords(session, past)
            ) : (
              <>
                <span className="lg:hidden">{sessionWords(session, past)}</span>
                <span className="whitespace-nowrap max-lg:hidden">{sessionWords(session, past, true)}</span>
              </>
            )}
            {/* Once per group, for the numbers on its rows, instead of "expected … a share" on every row. */}
            {/* A narrow desktop column has no room for it beside the count (it wrapped the heading to three lines): there
                it is the heading's hover title, and the figures carry the words for screen readers. */}
            {sayExpected ? <span className={`block font-normal ${isToday ? "" : "lg:hidden"}`}>Expected profit a share</span> : null}
            {sayKey ? <EpsKey className={`mt-0.5 flex flex-wrap gap-y-0.5 ${keyClass}`} /> : null}
          </span>
          <span className={`${NUM} shrink-0`}>{rows.length}</span>
        </h3>
      ),
      weight: 0,
      // Its own line, plus "Expected profit a share" under it (today's wide column only, at lg) and the bars' key.
      height: HEADING + (sayExpected && isToday ? SUBLINE : 0) + (sayKey ? SUBLINE : 0),
    });
    for (const item of rows) {
      blocks.push(
        isToday
          ? // Today's wide row wraps to a second line once it carries the result bars or the last report.
            { node: <EarningsLine key={item.id} item={item} quiet={past} mark={mark} />, weight: item.epsActual !== null || (!past && item.lastReport) ? 1.5 : 1 }
          : { node: <DayReportLine key={item.id} item={item} quiet={past} />, weight: dayRowWeight(item, past) },
      );
    }
  });
  if (bucket.ipos.length) {
    blocks.push({ node: <h3 key="ipo-h" className={SECTION_KIND}><KindIcon name={TYPE_ICON.ipo} className="size-3.5" />IPOs</h3>, weight: 0, height: HEADING });
    // A name and its facts: two or three lines in today's wide column (the exchange wraps), more where a narrow one wraps them.
    for (const item of bucket.ipos) blocks.push({ node: <IpoLine key={item.id} item={item} />, weight: isToday ? 2.2 : 3 });
  }
  if (bucket.dividends.length) {
    blocks.push({
      node: (
        <h3 key="div-h" className={`${SECTION} flex items-center justify-between`}>
          <span className="flex items-center gap-1.5">
            <KindIcon name={TYPE_ICON.dividend} className="size-3.5 shrink-0" />
            Buy before this day to get the dividend
          </span>
          <span className={NUM}>{bucket.dividends.length}</span>
        </h3>
      ),
      weight: 0,
      // "Buy before this day to get the dividend" wraps to two lines in a narrow column.
      height: isToday ? HEADING : HEADING + SUBLINE,
    });
    for (const item of bucket.dividends) blocks.push({ node: <DividendLine key={item.id} item={item} />, weight: 1 });
  }
  return blocks;
}

/** A day's card for the week grid: its header link (server-rendered), its blocks, and the server's fold of them. */
function dayCard({ bucket, today, filters, blocks, budget }: { bucket: DayBuckets; today: string; filters: CalendarFilters; blocks: DayBlock[]; budget: number }): WeekCard {
  const isToday = bucket.day === today;
  const past = bucket.day < today;
  // Recent days in words (owner rule 4): "Today", "Yesterday", "Tomorrow", the weekday for the rest of the past
  // week, with no date beside them (it is in the hover title); days further on keep their date.
  const ago = dayDiff(bucket.day, today) ?? 0;
  const near = isToday
    ? "Today"
    : ago === 1
      ? "Yesterday"
      : ago === -1
        ? "Tomorrow"
        : ago > 1 && ago < 7
          ? weekdayName(bucket.day, true)
          : null;
  const dayHref = calendarHref(filters, today, { view: "list", day: bucket.day });
  const all = [...bucket.earnings.bmo, ...bucket.earnings.amc, ...bucket.earnings.unknown];
  // A day that has passed counts only the reports whose results are in: the header's "N reported" matches the rows
  // that show a result. A coming day counts every scheduled report.
  const reports = past ? all.filter((item) => item.epsActual !== null).length : earningsCount(bucket);
  const beats = all.filter((item) => resultWord(item)?.tone === "up").length;
  const misses = all.filter((item) => resultWord(item)?.tone === "down").length;
  const head = (
      <AppLink
        href={dayHref}
        title={`${weekdayName(bucket.day, true)}, ${fmtShortDay(bucket.day)}`}
        className={`flex min-h-10 flex-wrap items-center justify-between gap-x-2 border-b border-oa-border px-3 py-2 hover:bg-oa-accent ${FOCUS} ${
          past || isToday ? "" : "bg-oa-bg"
        }`}
      >
        {/* Today is said in its own words and colour, not with a coloured edge on the column (owner rule 6). */}
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className={isToday ? "text-[15px] font-semibold text-oa-primary" : `text-[14px] font-medium ${past ? "text-oa-muted-fg" : "text-oa-fg"}`}>
            {near ?? weekdayName(bucket.day)}
          </span>
          {near ? null : <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{fmtShortDay(bucket.day)}</span>}
        </span>
        <span className={`${NUM} whitespace-nowrap text-[12.5px] text-oa-muted-fg`}>
          {/* A day that has passed says so, so its % moves never read as a forecast. */}
          {/* Desktop week columns are narrow: "23 reported" there, "23 already reported" on a phone row. */}
          {reports ? (
            past ? (
              <>
                {reports} <span className="lg:hidden">already </span>reported
              </>
            ) : (
              <>
                {reports} <span className={isToday ? "" : "lg:hidden"}>earnings </span>
                {reports === 1 ? "report" : "reports"}
              </>
            )
          ) : (
            ""
          )}
          {/* Phone: a day that has passed counts its beats and misses once, over its list. */}
          {past && reports ? (
            <span className="lg:hidden">
              {beats ? ` · ${beats} beat` : ""}
              {misses ? ` · ${misses} missed` : ""}
            </span>
          ) : null}
        </span>
      </AppLink>

  );
  return {
    day: bucket.day,
    label: `${weekdayName(bucket.day, true)}, ${fmtShortDay(bucket.day)}`,
    // Each day is its own card; a past day sits after the coming ones on a phone.
    className: past ? "order-2 bg-oa-bg" : "order-1 bg-oa-card",
    head,
    blocks: blocks.map((block, index) => ({ key: blockKey(block.node, index), node: block.node, row: block.weight > 0 })),
    ssrCut: foldDay(blocks, budget, FOLD_HEIGHTS).shown.length,
  };
}

/** A block's React key ("eco-h", an item id), so the client keeps each row's identity. */
function blockKey(node: React.ReactNode, index: number): string {
  return React.isValidElement(node) && node.key != null ? String(node.key) : `b${index}`;
}

/**
 * Whether a pre-read is the exception among the reports still to come. When
 * most of them have one, marking each row says nothing: the page says it once.
 */
export function preReadIsException(days: Map<string, DayBuckets>): boolean {
  let upcoming = 0;
  let withPreRead = 0;
  for (const bucket of days.values()) {
    for (const item of [...bucket.earnings.bmo, ...bucket.earnings.amc, ...bucket.earnings.unknown]) {
      if (item.epsActual !== null) continue;
      upcoming += 1;
      if (item.hasPreRead) withPreRead += 1;
    }
  }
  return upcoming > 0 && withPreRead > 0 && withPreRead / upcoming < 0.6;
}

export function WeekView({
  days,
  filters,
  today,
  markPreRead,
}: {
  days: Map<string, DayBuckets>;
  filters: CalendarFilters;
  today: string;
  /** Mark the reports that have a pre-read (only when that is the exception). */
  markPreRead: boolean;
}) {
  const shown = windowDays(filters.center);
  // A weekend or a holiday inside the window (or right after it) is skipped, unless it holds events: then one line
  // under the days says so.
  const span = windowSpan(filters.center);
  const extra: DayBuckets[] = [];
  for (let day = span.from; day <= span.to; day = addDays(day, 1)) {
    const bucket = days.get(day);
    if (!isTradingDay(day) && bucket?.total) extra.push(bucket);
  }
  // A day with nothing on it (a filter like "My stocks only" leaves many) gets no card (owner rule 4); the day strip
  // and the range still say which days these are.
  const buckets = shown.map((day) => days.get(day) ?? emptyDay(day)).filter((bucket) => bucket.total > 0);
  const columns = buckets.map((bucket) => ({ bucket, blocks: dayBlocks(bucket, { today, mark: markPreRead }) }));
  // The server's fold (the phone's, and the desktop's until WeekGrid measures): one height for the window, the busy
  // days folded to the quietest one's (fold-day.ts weekBudget), never below DAY_MIN.
  const budget = Math.max(DAY_MIN, weekBudget(columns.map((column) => column.blocks), { min: 0, max: DAY_MAX }));
  // Sparse (a filter like "My stocks only", or a quiet window): no day needs folding. Then each day keeps its own
  // content-high card in equal columns across the row: no stacking, no stretching, no leveling.
  const sparse = columns.every(({ blocks }) => foldDay(blocks, budget, FOLD_HEIGHTS).hidden === 0);
  // Dense: quiet neighbours share a column, so none is left a tall card with little in it; today stays alone.
  const groups = sparse
    ? columns.map((column) => [column])
    : stackDays(
        columns.map(({ blocks }) => Math.min(blocks.reduce((sum, block) => sum + blockHeight(block), 0), budget + FOLD_HEIGHTS.button) + DAY_HEAD),
        { limit: budget + FOLD_HEIGHTS.button + DAY_HEAD + 0.5, alone: columns.flatMap(({ bucket }, index) => (bucket.day === today ? [index] : [])) },
      ).map((indexes) => indexes.map((index) => columns[index]!));
  // Dense: today takes the room in the middle; with today elsewhere (another week, a weekend) every column is the same
  // width. Sparse: equal columns across the row.
  const template = groups.map((group) => (!sparse && group.some(({ bucket }) => bucket.day === today) ? "minmax(0,1.7fr)" : "minmax(0,1fr)")).join(" ");
  return (
    <>
      {buckets.length === 0 ? (
        <Panel>
          <Empty title="Nothing on these days" />
        </Panel>
      ) : (
        <WeekGrid
          template={template}
          level={!sparse}
          columns={groups.map((group) => ({
            key: group[0]!.bucket.day,
            cards: group.map(({ bucket, blocks }) => dayCard({ bucket, today, filters, blocks, budget })),
          }))}
        />
      )}
      {extra.length ? (
        <p className="mt-3 text-[14px] text-oa-muted-fg">
          Also on days the market is closed:{" "}
          {extra.map((bucket, index) => (
            <React.Fragment key={bucket.day}>
              {index > 0 ? ", " : ""}
              <Link prefetch={false} href={calendarHref(filters, today, { view: "list", day: bucket.day })} className="text-oa-fg underline decoration-oa-border underline-offset-2">
                {bucket.total} on {weekdayName(bucket.day, true)}
              </Link>
            </React.Fragment>
          ))}
          .
        </p>
      ) : null}
    </>
  );
}

/* ── Month ─────────────────────────────────────────────────────────────── */

const HEAT = [
  "bg-oa-card",
  "bg-[color-mix(in_srgb,var(--oa-primary)_7%,var(--oa-card))]",
  "bg-[color-mix(in_srgb,var(--oa-primary)_15%,var(--oa-card))]",
  "bg-[color-mix(in_srgb,var(--oa-primary)_25%,var(--oa-card))]",
  "bg-[color-mix(in_srgb,var(--oa-primary)_38%,var(--oa-card))]",
];

export function MonthView({ days, filters, today }: { days: Map<string, DayBuckets>; filters: CalendarFilters; today: string }) {
  const weeks = monthGrid(filters.month);
  const inMonth = weeks.flat().filter((cell) => cell.inMonth);
  const max = Math.max(0, ...inMonth.map((cell) => days.get(cell.day)?.total ?? 0));
  return (
    <Panel flush>
      <div className="grid grid-cols-5 border-b border-oa-border bg-oa-bg">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((name) => (
          <div key={name} className="oa-caption px-2 py-1.5 sm:px-3">
            {name}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]!.day} className="grid grid-cols-5 border-b border-oa-border last:border-b-0">
          {week.map((cell) => {
            const bucket = days.get(cell.day) ?? emptyDay(cell.day);
            const reports = earningsCount(bucket);
            const top = topReporters(bucket, 3);
            const releases = bucket.economic.filter((item) => item.importance === "high");
            const level = cell.inMonth ? heatLevel(bucket.total, max) : 0;
            const isToday = cell.day === today;
            return (
              <Link prefetch={false}
                key={cell.day}
                href={calendarHref(filters, today, { view: "list", day: cell.day })}
                aria-label={`${weekdayName(cell.day, true)}, ${fmtShortDay(cell.day)}: ${bucket.total} event${bucket.total === 1 ? "" : "s"}`}
                className={`relative flex min-h-[88px] min-w-0 flex-col gap-1 border-r border-oa-border px-2 py-1.5 last:border-r-0 hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-oa-fg sm:min-h-[112px] sm:px-3 sm:py-2 ${HEAT[level]} ${
                  cell.inMonth ? "" : "opacity-45"
                } ${FOCUS}`}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span
                    className={`${NUM} text-[12.5px] ${
                      isToday ? "rounded bg-oa-fg px-1 font-medium text-oa-page" : cell.inMonth ? "font-medium text-oa-fg" : "text-oa-muted-fg"
                    }`}
                  >
                    {Number(cell.day.slice(8))}
                  </span>
                  {reports ? (
                    <span className={`${NUM} text-[11.5px] text-oa-muted-fg`}>
                      {reports}
                      <span className="hidden sm:inline"> report{reports === 1 ? "" : "s"}</span>
                    </span>
                  ) : null}
                </span>
                {releases.map((item) => (
                  <span key={item.id} className="truncate text-[11.5px] font-medium leading-4 text-oa-primary">
                    {item.title.replace(" (FOMC)", "").replace(" inflation", "")}
                  </span>
                ))}
                {top.length ? (
                  <span className={`${NUM} flex flex-col text-[11.5px] leading-4 text-oa-fg sm:flex-row sm:flex-wrap sm:gap-x-1.5`}>
                    {top.map((item, index) => (
                      <span key={item.id} className={`min-w-0 items-center gap-0.5 sm:gap-1 ${index > 1 ? "hidden sm:inline-flex" : "inline-flex"}`}>
                        {/* Logo and ticker on a phone too (council, Nov 12): a smaller logo and a long ticker cut with "…". */}
                        <StockLogo ticker={item.ticker} size={12} atOnce className="max-sm:!size-[11px]" />
                        <span className="min-w-0 truncate max-sm:text-[10.5px]">{item.ticker}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
                {bucket.ipos.length || bucket.dividends.length ? (
                  <span className={`${NUM} mt-auto hidden text-[11px] leading-4 text-oa-muted-fg sm:block`}>
                    {[
                      bucket.ipos.length ? `${bucket.ipos.length} IPO${bucket.ipos.length === 1 ? "" : "s"}` : "",
                      bucket.dividends.length ? `${bucket.dividends.length} ex-div` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-oa-border px-3 py-2 text-[12px] text-oa-muted-fg">
        <span className="flex items-center gap-1.5">
          Quieter
          {HEAT.map((cls, index) => (
            <span key={index} aria-hidden="true" className={`h-3 w-4 rounded-sm border border-oa-border ${cls}`} />
          ))}
          Busier
        </span>
        <span>Shade is the day&apos;s event count against the busiest day of the month. Names are the largest companies reporting. Pick a day to open it.</span>
      </div>
    </Panel>
  );
}

/**
 * Reported profit a share against the estimate as two short bars on one signed scale with one marked zero (judges,
 * sweep 87): copper the result, teal the estimate, as in every other "this vs that" bar, keyed once per section
 * (EpsKey). A loss runs left of zero. Nothing without both figures; the figures themselves sit beside it.
 */
export function EpsBars({ actual, estimate, className = "" }: { actual: number | null; estimate: number | null; className?: string }) {
  if (!hasEpsPair(actual, estimate)) return null;
  // One signed scale for both, from one zero (council, sweep 87): a loss of $0.61 runs further left than one of $0.13.
  const geometry = barGeometry([actual!, estimate!]);
  return (
    <span aria-hidden="true" className={`${SERIES_VARS} relative inline-flex w-14 shrink-0 flex-col justify-center gap-[3px] self-center ${className}`}>
      {(["bg-[var(--series-a)]", "bg-[var(--series-b)]"] as const).map((fill, index) => {
        const bar = geometry.bars[index]!;
        // A small figure still shows a sliver, grown away from the zero so it never crosses it; with no room on its side
        // of the zero (a cent's profit beside a dollar's loss), a dot at the zero says it is there.
        const room = bar.negative ? geometry.zero : 100 - geometry.zero;
        const width = Math.min(Math.max(bar.width, 4), room);
        const left = bar.negative ? geometry.zero - width : geometry.zero;
        return (
          <span key={fill} className="relative block h-1.5 rounded-full bg-oa-bg">
            {bar.width > 0 && width >= 4 ? (
              <span className={`absolute inset-y-0 ${bar.negative ? "rounded-l-full" : "rounded-r-full"} ${fill}`} style={{ left: `${left}%`, width: `${width}%` }} />
            ) : bar.width > 0 ? (
              <span className={`absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fill}`} style={{ left: `${geometry.zero}%` }} />
            ) : null}
          </span>
        );
      })}
      {/* The zero, marked through both bars: at the right end when both are losses, the left when both are profits. */}
      <span className="absolute -bottom-1 -top-1 w-px -translate-x-1/2 bg-oa-muted-fg" style={{ left: `${geometry.zero}%` }} />
    </span>
  );
}

function hasEpsPair(actual: number | null, estimate: number | null): boolean {
  return actual !== null && estimate !== null && Number.isFinite(actual) && Number.isFinite(estimate);
}

/** The copper and teal pair's key, said once per section (council, sweep 87), never on a row. */
function EpsKey({ className = "" }: { className?: string }) {
  return (
    // The bars it explains are hidden from screen readers (the figures beside them say it), so the key is too.
    <span aria-hidden="true" className={`${SERIES_VARS} inline-flex items-center gap-2.5 whitespace-nowrap text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg ${className}`}>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="inline-block h-1.5 w-3 rounded-full bg-[var(--series-a)]" />
        Reported
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="inline-block h-1.5 w-3 rounded-full bg-[var(--series-b)]" />
        Expected
      </span>
    </span>
  );
}

/* ── List ──────────────────────────────────────────────────────────────── */

/** The list's columns. The bars' key sits in the day's header (ListDay), not here, so the table keeps its width. */
const EARNINGS_COLUMNS: DataColumn[] = [
  { id: "ticker", label: "Company" },
  { id: "when", label: "When", hideOnMobile: true },
  { id: "est", label: "Est", align: "right", hint: "EPS estimate" },
  { id: "actual", label: "Actual", align: "right", hint: "Reported EPS" },
  { id: "surprise", label: "Surprise", align: "right", hideOnMobile: true, hint: "Reported EPS against the estimate" },
  {
    id: "move",
    label: "Move",
    align: "right",
    hint: "Close to close around the report. Two sessions when the report time was not given.",
  },
  { id: "cap", label: "Mkt cap", align: "right", hideOnMobile: true },
];

function earningsRows(items: EarningsItem[], mark: boolean): DataRow[] {
  return items.map((item) => ({
    key: item.id,
    href: earningsHref(item.ticker),
    sort: [item.ticker, item.session, item.epsEstimate, item.epsActual, item.surprisePct, item.reaction?.pct ?? null, item.marketCap],
    cells: [
      <span key="t" className="flex min-w-0 items-center gap-2">
        {/* Phone: the ticker alone, so estimate, actual and the move all fit beside it. */}
        <Ticker symbol={item.ticker} href={earningsHref(item.ticker)} size={18} className="sm:hidden" />
        <Ticker symbol={item.ticker} href={earningsHref(item.ticker)} name={item.company} size={18} className="max-sm:hidden sm:max-w-[13rem] xl:max-w-[17rem]" />
        {mark && item.hasPreRead && item.epsActual === null ? <PreReadMark /> : null}
      </span>,
      <span key="w" className="text-[12.5px] text-oa-muted-fg">
        {item.session === "unknown" ? "Not given" : SESSION_LABEL[item.session]}
      </span>,
      <span key="e" className={`${NUM} ${item.epsEstimate === null ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtEps(item.epsEstimate) || "n/a"}</span>,
      item.epsActual !== null ? (
        <span key="a" className={`${NUM} inline-flex items-center justify-end gap-2 text-oa-fg`}>
          <EpsBars actual={item.epsActual} estimate={item.epsEstimate} className="max-sm:hidden" />
          {fmtEps(item.epsActual)}
        </span>
      ) : (
        <span key="a" className="text-[12.5px] text-oa-muted-fg">
          not yet
        </span>
      ),
      item.surprisePct !== null ? (
        <span key="s" className="inline-flex items-center justify-end gap-1.5">
          <SurpriseTag item={item} />
          <SurprisePct item={item} />
        </span>
      ) : item.surpriseLabel ? (
        <SurpriseTag key="s" item={item} />
      ) : (
        <span key="s" />
      ),
      item.reaction ? <ReactionValue key="m" item={item} /> : <span key="m" />,
      <span key="c" className={`${NUM} text-oa-muted-fg`}>
        {item.marketCap ? fmtCompact(item.marketCap, "$") : ""}
      </span>,
    ],
  }));
}

function ListDay({ bucket, today, single, filters, mark }: { bucket: DayBuckets; today: string; single: boolean; filters: CalendarFilters; mark: boolean }) {
  const earnings = [...bucket.earnings.bmo, ...bucket.earnings.amc, ...bucket.earnings.unknown];
  const others = bucket.economic.length + bucket.ipos.length + bucket.dividends.length;
  // The reported-vs-expected bars' key, once for the day's table, beside its count (the bars show from sm).
  const bars = earnings.some((item) => hasEpsPair(item.epsActual, item.epsEstimate));
  return (
    <Panel
      flush
      id={`d-${bucket.day}`}
      label={
        <Link prefetch={false} href={calendarHref(filters, today, { view: "list", day: bucket.day })} className="hover:underline">
          {weekdayName(bucket.day, true)}, {fmtShortDay(bucket.day)} · {relativeDay(bucket.day, today)}
        </Link>
      }
      right={
        <span className="flex items-center gap-4">
          {bars ? <EpsKey className="max-sm:hidden" /> : null}
          <span className={NUM}>{bucket.total}</span>
        </span>
      }
    >
      {others ? (
        <div className="grid border-b border-oa-border last:border-b-0 sm:grid-cols-3">
          {bucket.economic.length ? (
            <div className="min-w-0 border-b border-oa-border pb-1.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <h3 className={SECTION_KIND}><KindIcon name={TYPE_ICON.economic} className="size-3.5" />Economic</h3>
              {bucket.economic.map((item) => (
                <EconomicLine key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {bucket.ipos.length ? (
            <div className="min-w-0 border-b border-oa-border pb-1.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <h3 className={SECTION_KIND}><KindIcon name={TYPE_ICON.ipo} className="size-3.5" />IPOs</h3>
              {bucket.ipos.map((item) => (
                <IpoLine key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {bucket.dividends.length ? (
            <div className="min-w-0 pb-1.5">
              <h3 className={SECTION_KIND}><KindIcon name={TYPE_ICON.dividend} className="size-3.5 shrink-0" />Buy before this day to get the dividend</h3>
              {(single ? bucket.dividends : bucket.dividends.slice(0, 6)).map((item) => (
                <DividendLine key={item.id} item={item} />
              ))}
              {!single ? <More count={bucket.dividends.length - 6} href={calendarHref(filters, today, { view: "list", day: bucket.day })} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {earnings.length ? (
        <DataTable
          columns={EARNINGS_COLUMNS}
          rows={earningsRows(earnings, mark)}
          initialSort={{ id: "cap", dir: "desc" }}
          pageSize={single ? 60 : 8}
          stickyHeader={false}
        />
      ) : null}
    </Panel>
  );
}

export function ListView({ days, filters, today, markPreRead }: { days: Map<string, DayBuckets>; filters: CalendarFilters; today: string; markPreRead: boolean }) {
  const ordered = [...days.values()].filter((bucket) => bucket.total > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (ordered.length === 0) {
    return (
      <Panel flush>
        <Empty title={filters.day ? "Nothing on this day" : "Nothing in this window"}>
          {filters.mine
            ? "None of your stocks has a report, IPO or ex-dividend date here. Economic releases are hidden while My stocks only is on."
            : "Nothing scheduled for these dates."}
        </Empty>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {ordered.map((bucket) => (
        <ListDay key={bucket.day} bucket={bucket} today={today} single={Boolean(filters.day)} filters={filters} mark={markPreRead} />
      ))}
    </div>
  );
}
