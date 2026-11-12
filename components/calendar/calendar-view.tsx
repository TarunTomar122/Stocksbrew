import * as React from "react";

import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { Delta, Empty, FOCUS, NUM, Panel, Tag, Ticker, ToneGlyph, Verdict, fmtCompact } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { shortCompanyName } from "@/lib/plain-copy";
import {
  CALENDAR_TYPES,
  LIST_SPAN_DAYS,
  SESSION_LABEL,
  addDays,
  calendarHref,
  defaultWeekStart,
  earningsCount,
  emptyDay,
  fmtEps,
  fmtIpoPrice,
  fmtMonth,
  fmtShortDay,
  fmtTimeET,
  fmtWeekRange,
  heatLevel,
  monthGrid,
  reactionBasisLabel,
  relativeDay,
  resultWord,
  surprisePctOf,
  shiftMonth,
  topReporters,
  weekDays,
  weekdayName,
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
import { WholeRows } from "@/components/wire/whole-rows";

const CHIP =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors lg:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";
const NAV_BUTTON =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-oa-border bg-oa-card px-2.5 text-[14px] text-oa-fg hover:bg-oa-accent lg:h-8 lg:min-w-8 " +
  FOCUS;
const SECTION = "oa-caption px-3 pb-1 pt-3";

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
    label = fmtWeekRange(filters.week);
    prev = calendarHref(filters, today, { week: addDays(filters.week, -7) });
    next = calendarHref(filters, today, { week: addDays(filters.week, 7) });
    home = filters.week === defaultWeekStart(today) ? null : calendarHref(filters, today, { week: defaultWeekStart(today) });
    homeLabel = "This week";
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

/**
 * Phone only: the week as five tap targets with earlier / later at the ends.
 * Each day jumps down the page to its list, a day that has passed included.
 */
function DayStrip({ filters, today, days }: { filters: CalendarFilters; today: string; days: Map<string, DayBuckets> }) {
  const thisWeek = filters.week === defaultWeekStart(today);
  return (
    <div className="lg:hidden">
      <nav aria-label="Days of this week" className="oa-surface grid grid-cols-[2.5rem_repeat(5,minmax(0,1fr))_2.5rem] overflow-hidden border border-oa-border bg-oa-card">
        <Link prefetch={false} href={calendarHref(filters, today, { week: addDays(filters.week, -7) })} aria-label="Earlier week" className={`flex items-center justify-center text-[15px] text-oa-muted-fg hover:bg-oa-accent ${FOCUS}`}>
          ←
        </Link>
        {weekDays(filters.week).map((day) => {
          const bucket = days.get(day) ?? emptyDay(day);
          const isToday = day === today;
          const past = day < today;
          return (
            <AppLink
              key={day}
              href={`#d-${day}`}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${weekdayName(day, true)}, ${fmtShortDay(day)}: ${bucket.total} event${bucket.total === 1 ? "" : "s"}`}
              className={`flex h-[52px] flex-col items-center justify-center border-l border-oa-border hover:bg-oa-accent ${FOCUS} ${
                isToday ? "shadow-[inset_0_-2px_0_var(--oa-primary)]" : past ? "bg-oa-bg" : ""
              }`}
            >
              <span className={`text-[12.5px] leading-4 ${isToday ? "font-medium text-oa-primary" : "text-oa-muted-fg"}`}>{isToday ? "Today" : weekdayName(day)}</span>
              <span className={`${NUM} text-[15px] leading-5 ${isToday ? "font-semibold text-oa-fg" : past ? "text-oa-muted-fg" : "font-medium text-oa-fg"}`}>{Number(day.slice(8))}</span>
              <span className={`${NUM} text-[11px] leading-3 text-oa-muted-fg`}>{bucket.total || " "}</span>
            </AppLink>
          );
        })}
        <Link prefetch={false} href={calendarHref(filters, today, { week: addDays(filters.week, 7) })} aria-label="Later week" className={`flex items-center justify-center border-l border-oa-border text-[15px] text-oa-muted-fg hover:bg-oa-accent ${FOCUS}`}>
          →
        </Link>
      </nav>
      {thisWeek ? null : (
        <p className="mt-2 text-[14px] text-oa-muted-fg">
          {fmtWeekRange(filters.week)}.{" "}
          <Link prefetch={false} href={calendarHref(filters, today, { week: defaultWeekStart(today) })} className="text-oa-primary underline underline-offset-2">
            Back to this week
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
      <Delta value={item.reaction.pct} />
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
function ResultWord({ item, compact = false }: { item: EarningsItem; compact?: boolean }) {
  const result = resultWord(item);
  if (!result || result.tone === "flat") return null;
  return <Verdict tone={result.tone} className={`self-center ${compact ? "lg:hidden" : ""}`}>{result.word}</Verdict>;
}

/**
 * The narrow desktop columns have no room for the chip, so the mark sits on the
 * ticker instead, away from the stock move, with the word for screen readers.
 */
function ResultMark({ item }: { item: EarningsItem }) {
  const result = resultWord(item);
  if (!result || result.tone === "flat") return null;
  return (
    <span className="-ml-1 hidden shrink-0 items-center lg:inline-flex">
      <span aria-hidden="true" className="inline-flex">
        <ToneGlyph tone={result.tone} className="size-2" />
      </span>
      <span className="sr-only">{result.word}</span>
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
 * One report, one line. `compact` (the narrow columns beside today's lead)
 * keeps the ticker and the one number; the lead column and the phone add the
 * company and, once reported, actual against estimate. `narrow` (every desktop
 * column but today's, so all five in a past or future week) swaps the result
 * chip for a mark on the ticker and drops what does not fit on a reported row:
 * the estimate, the company and the "2d" note.
 */
function EarningsLine({
  item,
  compact,
  narrow = compact,
  quiet,
  mark,
  desktopOnly = false,
}: {
  item: EarningsItem;
  compact: boolean;
  /** A desktop week column too narrow for the chip: every day but today's lead. */
  narrow?: boolean;
  quiet: boolean;
  mark: boolean;
  /**
   * A day that has passed, in a narrow column: the row is only the ticker, the result and the move, without the name
   * and figures that made the page heavy (owner rule 11). The result is a mark on the desktop column and its word on a
   * phone, where the row has the room.
   */
  desktopOnly?: boolean;
}) {
  const reported = item.epsActual !== null;
  const detail = compact ? "lg:hidden" : "";
  const result = reported
    ? `${fmtEps(item.epsActual)}${item.epsEstimate !== null ? ` vs ${fmtEps(item.epsEstimate)} est` : ""}${
        item.surprisePct !== null ? `, ${item.surprisePct > 0 ? "+" : item.surprisePct < 0 ? "−" : ""}${Math.abs(item.surprisePct).toFixed(1)}% surprise` : ""
      }`
    : item.epsEstimate !== null
      ? `expected ${fmtEps(item.epsEstimate)} a share`
      : "";
  if (desktopOnly && narrow) {
    return (
      <Link prefetch={false} data-row="" href={earningsHref(item.ticker)} title={[item.company, result].filter(Boolean).join(": ")} className={`flex min-h-10 items-center gap-x-2 px-3 py-0.5 hover:bg-oa-accent lg:min-h-[30px] ${FOCUS}`}>
        <span className={`${NUM} inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-oa-fg`}>
          <StockLogo ticker={item.ticker} size={16} atOnce />
          {item.ticker}
        </span>
        {reported ? <ResultMark item={item} /> : null}
        <span className="ml-auto flex shrink-0 items-baseline gap-2 text-[14px]">
          {reported ? <ResultWord item={item} compact /> : null}
          {reported ? (
            <ReactionValue item={item} narrow />
          ) : item.epsEstimate !== null ? (
            <span className={`${NUM} text-oa-muted-fg`}>{fmtEps(item.epsEstimate)}</span>
          ) : null}
        </span>
      </Link>
    );
  }
  return (
    <Link prefetch={false}
      data-row=""
      href={earningsHref(item.ticker)}
      title={[item.company, result].filter(Boolean).join(": ")}
      className={`flex min-h-10 items-center gap-x-2 px-3 py-1 hover:bg-oa-accent lg:min-h-[30px] lg:py-0.5 ${narrow ? "" : "flex-wrap"} ${FOCUS}`}
    >
      <span className={`${NUM} inline-flex shrink-0 items-center gap-1.5 text-[14px] ${quiet ? "font-medium text-oa-fg" : "font-semibold text-oa-fg"} ${compact ? "" : narrow ? "min-w-[4.5rem] lg:min-w-0" : "min-w-[4.5rem]"}`}>
        <StockLogo ticker={item.ticker} size={16} atOnce />
        {item.ticker}
      </span>
      {narrow && reported ? <ResultMark item={item} /> : null}
      {/* Wraps on a phone rather than cutting the name; the narrow desktop columns still clip. */}
      {/* Wide rows wrap the result under the name rather than letting the two overlap. */}
      <span className={`min-w-0 flex-1 text-pretty text-[14px] leading-5 text-oa-muted-fg ${narrow ? "lg:truncate" : "min-w-[6rem]"} ${detail} ${narrow && reported ? "lg:hidden" : ""}`}>
        {shortCompanyName(item.company)}
        {/* Under the name, so the estimate keeps its place on the line (the narrow desktop columns have no room). */}
        {!reported && item.lastReport ? <LastReport item={item} className={`flex ${narrow ? "lg:hidden" : ""}`} /> : null}
      </span>
      <span className="ml-auto flex shrink-0 items-baseline gap-2 text-[14px]">
        {mark && !reported && item.hasPreRead ? <PreReadMark className="self-center" /> : null}
        {reported ? (
          <>
            <ResultWord item={item} compact={narrow} />
            <span className={`${NUM} text-[12.5px] text-oa-muted-fg ${detail} ${item.reaction ? "max-[420px]:hidden" : ""}`}>
              {fmtEps(item.epsActual)}
              {item.epsEstimate !== null ? <span className={narrow ? "lg:hidden" : ""}> vs {fmtEps(item.epsEstimate)} expected</span> : null}
            </span>
            <ReactionValue item={item} narrow={narrow} />
          </>
        ) : null}
        {reported ? null : item.epsEstimate !== null ? (
          <span className={`${NUM} text-oa-muted-fg`}>
            {/* The number alone: the session heading says once what it is ("Expected profit a share"), so the words
                are not repeated on every row (owner, Nov 11). Screen readers still get them. */}
            <span className="sr-only">expected </span>
            {fmtEps(item.epsEstimate)}
            <span className="sr-only"> a share</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
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
      <span
        aria-hidden="true"
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${item.importance === "high" ? "bg-oa-primary" : "bg-oa-border"}`}
      />
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

function IpoLine({ item }: { item: IpoItem }) {
  const price = fmtIpoPrice(item.priceLow, item.priceHigh);
  return (
    <div data-row="" className="px-3 py-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-pretty text-[14px] font-medium leading-5 text-oa-fg">{readableName(item.company)}</span>
        {item.ticker ? (
          <span className={`${NUM} inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-oa-muted-fg`}>
            <StockLogo ticker={item.ticker} size={16} atOnce />
            {item.ticker}
          </span>
        ) : null}
      </span>
      <span className={`${NUM} mt-0.5 block text-pretty text-[12.5px] leading-4 text-oa-muted-fg`}>
        {[
          item.status === "priced" ? (price ? `New listing, priced at ${price}` : "New listing, priced") : price ? `New listing, aiming for ${price} a share` : "New listing, price not set",
          item.offerAmount ? `to raise ${fmtCompact(item.offerAmount, "$")}` : "",
          item.exchange,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
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
 * A day's column scrolls inside a box of about this height, ending on a whole row, with every event in it (owner
 * rule 5: all of them, not the first few and a "+ 8 more" link under each group). Short enough that a busy day and a
 * quiet one end close to level instead of one running on beside a blank column (owner rule 4).
 */
const DAY_REM = 30;
/** A phone day shows about 12 reports, then scrolls inside and hands the scroll back to the page at its end. */
const PHONE_DAY_REM = 36;

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

function DayColumn({ bucket, today, filters, hasLead, mark }: { bucket: DayBuckets; today: string; filters: CalendarFilters; hasLead: boolean; mark: boolean }) {
  const isToday = bucket.day === today;
  const past = bucket.day < today;
  // With today on screen it leads and the other days run narrow; any other week is five equal days.
  const compact = hasLead && !isToday;
  const dayHref = calendarHref(filters, today, { view: "list", day: bucket.day });
  const reports = earningsCount(bucket);
  const sessions = (["bmo", "amc", "unknown"] as Session[]).filter((session) => bucket.earnings[session].length > 0);
  const all = [...bucket.earnings.bmo, ...bucket.earnings.amc, ...bucket.earnings.unknown];
  const beats = all.filter((item) => resultWord(item)?.tone === "up").length;
  const misses = all.filter((item) => resultWord(item)?.tone === "down").length;
  return (
    <section
      id={`d-${bucket.day}`}
      aria-label={`${weekdayName(bucket.day, true)}, ${fmtShortDay(bucket.day)}`}
      // Each day is its own card, as tall as what it holds (owner rule 4): a quiet day ends where its events end
      // instead of leaving a hollow cell beside a busy one.
      className={`oa-surface min-w-0 scroll-mt-16 overflow-hidden border border-oa-border lg:order-none ${past ? "order-2 bg-oa-bg" : "order-1 bg-oa-card"}`}
    >
      <AppLink
        href={dayHref}
        className={`flex min-h-10 flex-wrap items-center justify-between gap-x-2 border-b border-oa-border px-3 py-2 hover:bg-oa-accent ${FOCUS} ${
          past || isToday ? "" : "bg-oa-bg"
        }`}
      >
        {/* Today is said in its own words and colour, not with a coloured edge on the column (owner rule 6). */}
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className={isToday ? "text-[15px] font-semibold text-oa-primary" : `text-[14px] font-medium ${past ? "text-oa-muted-fg" : "text-oa-fg"}`}>
            {isToday ? "Today" : weekdayName(bucket.day)}
          </span>
          <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
            {isToday ? `${weekdayName(bucket.day)} ` : ""}
            {fmtShortDay(bucket.day)}
          </span>
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

      <DayBody>
        {bucket.total === 0 ? <p className="px-3 py-4 text-[14px] text-oa-muted-fg">Nothing scheduled.</p> : null}

        {bucket.economic.length ? (
          <div>
            <h3 className={SECTION}>Economic</h3>
            {bucket.economic.map((item) => (
              <EconomicLine key={item.id} item={item} />
            ))}
          </div>
        ) : null}

        {sessions.map((session, sessionIndex) => {
          const rows = bucket.earnings[session];
          // "Expected profit a share" once per day, over the first group whose numbers are estimates (owner rule 1).
          const estimates = (list: EarningsItem[]) => list.some((item) => item.epsActual === null && item.epsEstimate !== null);
          const sayExpected = estimates(rows) && !sessions.slice(0, sessionIndex).some((earlier) => estimates(bucket.earnings[earlier]));
          return (
            <div key={session}>
              <h3 className={`${SECTION} flex items-baseline justify-between gap-2`}>
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
                  {sayExpected ? <span className="block font-normal">Expected profit a share</span> : null}
                </span>
                <span className={`${NUM} shrink-0`}>{rows.length}</span>
              </h3>
              {rows.map((item) => (
                <EarningsLine key={item.id} item={item} compact={compact} narrow={!isToday} quiet={past} mark={mark} desktopOnly={past && compact} />
              ))}
            </div>
          );
        })}

        {bucket.ipos.length ? (
          <div>
            <h3 className={SECTION}>IPOs</h3>
            {bucket.ipos.map((item) => (
              <IpoLine key={item.id} item={item} />
            ))}
          </div>
        ) : null}

        {bucket.dividends.length ? (
          <div>
            <h3 className={`${SECTION} flex items-center justify-between`}>
              <span>Buy before this day to get the dividend</span>
              <span className={NUM}>{bucket.dividends.length}</span>
            </h3>
            {bucket.dividends.map((item) => (
              <DividendLine key={item.id} item={item} />
            ))}
          </div>
        ) : null}
        <div className="h-2" />
      </DayBody>
    </section>
  );
}

/**
 * A day's events, every one, in a box that ends on a whole row and scrolls inside (owner rule 5): a desktop column, or
 * about 12 reports on a phone, so a busy Thursday does not run the page. No overscroll-contain, so the page moves on
 * once the list ends. A day that has passed shows its reports too, on a phone as well (owner rule 2: no tapping a day
 * open to read it).
 */
function DayBody({ children }: { children: React.ReactNode }) {
  return (
    <WholeRows rem={PHONE_DAY_REM} wideRem={DAY_REM} wideFrom={1024} cue className="scrollbar-hide max-h-[36rem] overflow-y-auto lg:max-h-[30rem]">
      {children}
    </WholeRows>
  );
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
  const weekdays = weekDays(filters.week);
  const weekend = [addDays(filters.week, 5), addDays(filters.week, 6)].map((day) => days.get(day)).filter((bucket): bucket is DayBuckets => Boolean(bucket?.total));
  const hasLead = weekdays.includes(today);
  // Today takes the room; days that have passed give some up.
  const template = weekdays.map((day) => (!hasLead ? "minmax(0,1fr)" : day === today ? "minmax(0,1.8fr)" : day < today ? "minmax(0,0.9fr)" : "minmax(0,1fr)")).join(" ");
  return (
    <>
      {/* The days size to their own events, side by side from lg, so no day is padded to match a busier one. */}
      <div className="flex flex-col gap-2 lg:grid lg:items-start lg:[grid-template-columns:var(--cal-cols)]" style={{ "--cal-cols": template } as React.CSSProperties}>
        {weekdays.map((day) => (
          <DayColumn key={day} bucket={days.get(day) ?? emptyDay(day)} today={today} filters={filters} hasLead={hasLead} mark={markPreRead} />
        ))}
      </div>
      {weekend.length ? (
        <p className="mt-3 text-[14px] text-oa-muted-fg">
          Also that weekend:{" "}
          {weekend.map((bucket, index) => (
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
                      <span key={item.id} className={index > 1 ? "hidden sm:inline" : ""}>
                        {item.ticker}
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

/* ── List ──────────────────────────────────────────────────────────────── */

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
        <span key="a" className={`${NUM} text-oa-fg`}>
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
  return (
    <Panel
      flush
      id={`d-${bucket.day}`}
      label={
        <Link prefetch={false} href={calendarHref(filters, today, { view: "list", day: bucket.day })} className="hover:underline">
          {weekdayName(bucket.day, true)}, {fmtShortDay(bucket.day)} · {relativeDay(bucket.day, today)}
        </Link>
      }
      right={<span className={NUM}>{bucket.total}</span>}
    >
      {others ? (
        <div className="grid border-b border-oa-border last:border-b-0 sm:grid-cols-3">
          {bucket.economic.length ? (
            <div className="min-w-0 border-b border-oa-border pb-1.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <h3 className={SECTION}>Economic</h3>
              {bucket.economic.map((item) => (
                <EconomicLine key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {bucket.ipos.length ? (
            <div className="min-w-0 border-b border-oa-border pb-1.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <h3 className={SECTION}>IPOs</h3>
              {bucket.ipos.map((item) => (
                <IpoLine key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {bucket.dividends.length ? (
            <div className="min-w-0 pb-1.5">
              <h3 className={SECTION}>Buy before this day to get the dividend</h3>
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
