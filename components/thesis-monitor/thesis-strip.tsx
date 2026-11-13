import Link from "next/link";

import { CARD_HOVER } from "@/components/briefing/stock-card";
import { StockLogo } from "@/components/stock-logo";
import { ConditionBar } from "@/components/thesis/conditions-picker";
import { capitalize, dayWords } from "@/lib/day-words";
import { STATUS_WORDS } from "@/lib/thesis-monitor/model";
import type { ThesisStripData } from "@/lib/thesis-monitor/strip";

import { CountBar, STATUS_TEXT } from "./parts";

/**
 * The thesis in one strip (lib/thesis-monitor/strip.ts), on the briefing, My stocks and the first look: its name and
 * where it stands with the lines-that-hold bar; the one line that changed most recently, its figure against the line
 * as a bar, and the report it came from with its day (the full source is the hover); the next report that tests it.
 * The whole strip opens the thesis. One row from 48rem of its own width; stacked below that.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const NUM = "oa-mono tabular-nums";
/** The strip's three parts: stacked on a narrow strip, side by side with hairlines between them on a wide one. */
const PART = "flex min-w-0 flex-col justify-center gap-1.5 px-3.5 py-3 [@container(min-width:48rem)]:py-2.5";

/** "Q3 report, Oct 29" or "Price, yesterday": what the figure stands on, in a few words. */
function basisWords(line: NonNullable<ThesisStripData["line"]>, today: string): string {
  const when = dayWords(line.day, today);
  const what = line.report ? (line.quarter ? `${line.quarter} report` : "Report") : "Figure";
  return when ? `${what}, ${when}` : what;
}

/**
 * The strip as one line, under the briefing's market read (council, Nov 13): the thesis and where it stands with its
 * bar, the changed line with its figure and report, and the next report. It wraps onto a second line on a phone.
 */
function CompactStrip({ strip, today, className }: { strip: ThesisStripData; today: string; className: string }) {
  const line = strip.line;
  return (
    <Link
      href={strip.href}
      prefetch={false}
      // One line from lg: nothing is cut; the report's day moves to the hover instead.
      className={`oa-surface flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5 border border-oa-border bg-oa-card px-3.5 py-2 text-[13px] leading-5 lg:flex-nowrap lg:gap-x-4 ${CARD_HOVER} ${FOCUS} ${className}`}
    >
      <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 lg:shrink-0 lg:flex-nowrap">
        <span className="min-w-0 font-semibold text-oa-fg lg:max-w-[13rem] lg:truncate">{strip.name}</span>
        <span className={`shrink-0 font-semibold ${STATUS_TEXT[strip.status]}`}>{STATUS_WORDS[strip.status]}</span>
        {/* The lines that hold, as the bar; the count is its hover and the link's label. */}
        <span title={`${strip.counts.holds} of ${strip.counts.lines} lines hold`} className="flex shrink-0">
          <CountBar counts={strip.counts} className="w-16" />
          {/* The bar is drawn only; its count is read out. */}
          <span className="sr-only">
            {strip.counts.holds} of {strip.counts.lines} lines hold
          </span>
        </span>
      </span>
      {line ? (
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 lg:flex-1 lg:flex-nowrap" title={[basisWords(line, today), line.source].filter(Boolean).join(" · ")}>
          <StockLogo ticker={line.ticker} size={18} eager />
          <span className="oa-mono shrink-0 font-semibold text-oa-fg">{line.ticker}</span>
          {/* The line's words hold the threshold ("> 35%"), so they stay whole; the report's day gives way first. */}
          <span className="min-w-0 text-oa-fg lg:shrink-0">{line.label}</span>
          {/* The figure against its line on one small scale (owner rule 4): fill to the figure, tick at the line. */}
          <ConditionBar metric={line.condition.metric} now={line.now} line={line.condition.value} holds={line.status !== "broken"} ends={false} className="w-14 shrink-0" />
          <span className={`${NUM} shrink-0 font-semibold ${line.status === "broken" ? "text-signal-bearish" : "text-signal-bullish"}`}>{line.nowText}</span>
          {/* Never cut: on a phone (wrapping) the report and its day; on one line from xl only the report, whole; between,
              nothing. The day is always in the hover. */}
          <span className="min-w-0 text-[12.5px] text-oa-muted-fg lg:hidden">{basisWords(line, today)}</span>
          {line.report ? (
            <span className="hidden shrink-0 whitespace-nowrap text-[12.5px] text-oa-muted-fg xl:inline">{line.quarter ? `${line.quarter} report` : "Report"}</span>
          ) : null}
        </span>
      ) : null}
      {strip.next ? (
        <span className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <StockLogo ticker={strip.next.ticker} size={18} eager />
          <span className="text-oa-fg">
            <span className="oa-mono font-semibold">{strip.next.ticker}</span> reports {dayWords(strip.next.day, today)}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export function ThesisStrip({ strip, today, className = "", compact = false }: { strip: ThesisStripData; today: string; className?: string; compact?: boolean }) {
  if (compact) return <CompactStrip strip={strip} today={today} className={className} />;
  const line = strip.line;
  // Only the parts it has, so a wide strip never keeps an empty column (owner rule 4). Literal strings for Tailwind.
  const cols = line && strip.next
    ? "[@container(min-width:48rem)]:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,14rem)]"
    : line
      ? "[@container(min-width:48rem)]:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
      : strip.next
        ? "[@container(min-width:48rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        : "";
  return (
    <div className={`[container-type:inline-size] ${className}`}>
      <Link
        href={strip.href}
        prefetch={false}
          className={`oa-surface grid min-w-0 grid-cols-1 divide-y divide-oa-border border border-oa-border bg-oa-card ${CARD_HOVER} ${FOCUS} ${cols} [@container(min-width:48rem)]:divide-x [@container(min-width:48rem)]:divide-y-0`}
      >
        <span className={PART}>
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="min-w-0 text-pretty text-[14px] font-semibold leading-5 text-oa-fg [overflow-wrap:anywhere]">{strip.name}</span>
            <span className={`shrink-0 text-[13px] font-semibold leading-5 ${STATUS_TEXT[strip.status]}`}>{STATUS_WORDS[strip.status]}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <CountBar counts={strip.counts} className="min-w-0 flex-1" />
            <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>
              {strip.counts.holds} of {strip.counts.lines} hold
            </span>
          </span>
        </span>

        {line ? (
          <span className={PART} title={[line.source, capitalize(dayWords(line.day, today))].filter(Boolean).join(", ")}>
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <StockLogo ticker={line.ticker} size={20} eager />
                <span className="oa-mono shrink-0 text-[13px] font-semibold text-oa-fg">{line.ticker}</span>
                <span className="min-w-0 truncate text-[13px] text-oa-fg">{line.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className={`${NUM} text-[16px] font-semibold leading-5 ${line.status === "broken" ? "text-signal-bearish" : "text-signal-bullish"}`}>{line.nowText}</span>
                <span className="text-[12px] text-oa-muted-fg">{line.status === "broken" ? "broke" : "holds"}</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-3">
              <ConditionBar metric={line.condition.metric} now={line.now} line={line.condition.value} holds={line.status !== "broken"} ends={false} className="min-w-0 flex-1" />
              <span className="shrink-0 text-[12px] leading-4 text-oa-muted-fg">{basisWords(line, today)}</span>
            </span>
          </span>
        ) : null}

        {strip.next ? (
          <span className={PART}>
            <span className="flex min-w-0 items-center gap-2">
              <StockLogo ticker={strip.next.ticker} size={20} eager />
              <span className="min-w-0 truncate text-[13px] leading-5 text-oa-fg">
                <span className="oa-mono font-semibold">{strip.next.ticker}</span> {capitalize(dayWords(strip.next.day, today))}
              </span>
            </span>
            <span className="text-[12px] leading-4 text-oa-muted-fg">Next report</span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}
