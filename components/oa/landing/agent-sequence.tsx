import * as React from "react";

import { Bar } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { LevelBar } from "@/components/proposals/level-bar";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { loadAgentSequence } from "@/lib/agent-sequence-server";
import type { AgentSequence, SequenceFigure } from "@/lib/agent-sequence";
import { absoluteDay, dayWords, daysFromToday, etDayOf, etToday, stampWords, weekdayName } from "@/lib/day-words";

import { AgentDoes } from "./agent-does";
import { SectionHead, fmtPrice } from "./shared";

/**
 * The agent at work, start to finish, on one real proposal: the proposal engine run over the example portfolio on
 * today's data (lib/agent-sequence-server.ts), told as five connected steps. What happened, the figures it checked,
 * what it drafted, your decision (the end of the card, not working buttons), and what comes next. A strip from lg,
 * stacked on a phone. Each step is an icon, a few words and one figure or small visual; every figure says when it is
 * from, and its source is the hover title. On a day the engine has nothing to show, the three example agents and what
 * they watch take its place, under their own heading.
 */

const HEAD_TITLE = "Our agent at work on real data.";
const HEAD_HREF = "/agent";
const HEAD_LINK = "Try it on your stocks";

/** Every step's parts have fixed heights, so the ghost holds exactly the strip's place while it loads. */
const STEP = "relative flex min-w-0 gap-3 px-4 py-3 sm:px-5 lg:flex-col lg:gap-2.5 lg:py-5 lg:pl-0 lg:pr-4";
/** A label of at most four words, on one line. */
const WORDS = "h-[21px] truncate text-[14.5px] font-medium leading-[21px] text-oa-fg";
const VISUAL = "mt-1.5 h-[58px] lg:mt-2 lg:flex lg:flex-col lg:justify-end";

function StepIcon({ name }: { name: NavIconName }) {
  return (
    <span aria-hidden="true" className="relative z-[1] inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-bg text-oa-primary">
      <NavIcon name={name} className="size-[17px]" />
    </span>
  );
}

/** The line to the next step: down the left on a phone, along the top from lg. */
function Connector() {
  return (
    <>
      <span aria-hidden="true" className="absolute -bottom-3 left-[calc(1rem+15.5px)] top-11 w-px bg-oa-border sm:left-[calc(1.25rem+15.5px)] lg:hidden" />
      <span aria-hidden="true" className="absolute left-8 right-0 top-[2.25rem] hidden h-px bg-oa-border lg:block" />
    </>
  );
}

function Step({ icon, words, last = false, children }: { icon: NavIconName; words: React.ReactNode; last?: boolean; children: React.ReactNode }) {
  return (
    <li className={STEP}>
      {last ? null : <Connector />}
      <StepIcon name={icon} />
      <div className="min-w-0 flex-1">
        <div className={WORDS}>{words}</div>
        <div className={VISUAL}>{children}</div>
      </div>
    </li>
  );
}

/** The quote's day in words: "today", "yesterday", "Wednesday" (lib/day-words.ts), against the New York day now. */
function quoteDay(at: string): string {
  const day = etDayOf(at);
  return day ? dayWords(day, etToday()) : "";
}

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** "3:59 PM ET". */
function quoteTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : `${ET_TIME.format(date)} ET`;
}

/** The same, short enough for a narrow step: "today", "Wed", "Nov 3". */
function asOfShort(at: string, today: string): string {
  const day = etDayOf(at);
  if (!day) return "";
  const gap = daysFromToday(day, today);
  if (gap === 0) return "today";
  return gap !== null && gap < 0 && gap >= -6 ? weekdayName(day).slice(0, 3) : absoluteDay(day, today);
}

/** The source and its full date, for the hover. */
function sourceTitle(figure: SequenceFigure, today: string): string {
  const day = etDayOf(figure.asOf);
  return [figure.source, day ? absoluteDay(day, today) : ""].filter(Boolean).join(", ");
}

function toneOf(tone: SequenceFigure["tone"] | null | undefined): string {
  return tone === "down" ? "text-signal-bearish" : tone === "up" ? "text-signal-bullish" : "text-oa-fg";
}

function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function EventStep({ sequence }: { sequence: AgentSequence }) {
  const figure = sequence.event.figure;
  return (
    <Step icon="movers" words={sequence.event.label}>
      {figure ? (
        <p title={sourceTitle(figure, sequence.today)} className={`oa-mono text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular-nums ${toneOf(figure.tone)}`}>
          {figure.value}
          <span className="sr-only"> ({figure.label.toLowerCase()})</span>
        </p>
      ) : null}
    </Step>
  );
}

function CheckedStep({ sequence }: { sequence: AgentSequence }) {
  return (
    <Step icon="research" words="What I checked">
      <ul className="flex flex-col gap-0.5">
        {sequence.checked.map((figure) => (
          <li key={figure.label} title={sourceTitle(figure, sequence.today)} className="flex min-w-0 items-baseline gap-2 text-[12.5px] leading-[18px]">
            <span className={`oa-mono shrink-0 text-[14px] font-semibold tabular-nums ${toneOf(figure.tone)}`}>{figure.value}</span>
            <span className="min-w-0 truncate text-oa-muted-fg">
              {figure.label}
              {/* Today's figures go with the header's "today"; an older one says its day. The date is in the hover. */}
              {asOfShort(figure.asOf, sequence.today) === "today" ? null : <span className="oa-mono tabular-nums"> · {asOfShort(figure.asOf, sequence.today)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Step>
  );
}

function ProposalStep({ sequence }: { sequence: AgentSequence }) {
  const { level, actionType } = sequence.proposal;
  return (
    <Step icon={actionType === "practice_ticket" ? "practice" : "alerts"} words={sequence.proposal.label}>
      <p className="oa-mono text-[18px] font-semibold leading-[22px] tabular-nums text-oa-fg">{sequence.proposal.value}</p>
      {level && sequence.next.price !== null ? <LevelBar now={sequence.next.price} level={level} /> : null}
    </Step>
  );
}

/**
 * Your answer: the end of the card, drawn small and outlined as the two choices the agent page offers. A drawing, not
 * controls: hidden from screen readers (the line before it says it), no pointer, no fill.
 */
function DecisionStep({ sequence }: { sequence: AgentSequence }) {
  return (
    <Step icon="agents" words="You decide">
      <p className="sr-only">On your agent page you accept or dismiss it; nothing happens until you accept. {sequence.does}</p>
      <span aria-hidden="true" className="pointer-events-none flex cursor-default select-none items-center gap-1.5">
        <span className="inline-flex h-6 items-center rounded-full border border-oa-fg/25 px-2.5 text-[12px] font-medium text-oa-fg">Accept</span>
        <span className="inline-flex h-6 items-center rounded-full border border-oa-border px-2.5 text-[12px] text-oa-muted-fg">Dismiss</span>
      </span>
    </Step>
  );
}

/** The agents' last few days as marks (filled: a run that found something), then the next check, dashed. */
function NextStep({ sequence }: { sequence: AgentSequence }) {
  const days = [...sequence.runs.map((run) => ({ ...run, next: false })), ...(sequence.nextDay ? [{ day: sequence.nextDay, found: false, next: true }] : [])];
  return (
    <Step icon="calendar" words={sequence.next.label} last>
      <p className="text-[14px] font-medium leading-5 text-oa-fg">{sequence.next.when}</p>
      {days.length > 0 ? (
        <div className="mt-1 flex items-start gap-3">
        <div className="relative w-fit">
          <span aria-hidden="true" className="absolute left-2 right-2 top-[7px] h-px bg-oa-border" />
          <ol aria-label="The example agents' daily checks" className="relative flex items-start gap-4">
            {days.map((entry) => (
              <li
                key={`${entry.day}:${entry.next ? "next" : "ran"}`}
                title={`${absoluteDay(entry.day, sequence.today)}: ${entry.next ? "next check" : entry.found ? "found something" : "nothing to report"}`}
                className="relative flex flex-col items-center gap-0.5"
              >
                <span
                  aria-hidden="true"
                  className={`block size-[15px] rounded-full border-2 ${
                    entry.next ? "border-dashed border-oa-muted-fg bg-oa-card" : entry.found ? "border-oa-primary bg-oa-primary" : "border-oa-border bg-oa-card"
                  }`}
                />
                <span className={`oa-mono text-[11px] leading-[14px] tabular-nums ${entry.next ? "text-oa-fg" : "text-oa-muted-fg"}`}>
                  {weekdayName(entry.day).slice(0, 3)}
                  <span className="sr-only">{entry.next ? ": next check" : entry.found ? ": found something" : ": nothing to report"}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {/* The marks' one label. */}
        <span aria-hidden="true" className="text-[11.5px] leading-4 text-oa-muted-fg">Daily checks</span>
        </div>
      ) : null}
    </Step>
  );
}

function Header({ sequence }: { sequence: AgentSequence }) {
  const { price, dayPct, at } = sequence.next;
  return (
    // On the narrowest phones the label wraps under the stock rather than over its price.
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-oa-border px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={sequence.ticker} size={28} eager />
        <span className="oa-mono text-[15px] font-semibold text-oa-fg">{sequence.ticker}</span>
        {price !== null ? (
          <span className="oa-mono flex min-w-0 items-baseline gap-2 text-[14px] tabular-nums" title={at ? `Price as of ${absoluteDay(etDayOf(at) ?? at, sequence.today)}, ${stampWords(at)}` : undefined}>
            <span className="text-oa-fg">{fmtPrice(price)}</span>
            {dayPct !== null ? <span className={toneOf(dayPct < 0 ? "down" : dayPct > 0 ? "up" : null)}>{signed(dayPct)}</span> : null}
            {/* The move's day beside it ("today"), so it reads apart from the event's move; the time from sm. */}
            {at ? <span className="truncate text-[12.5px] text-oa-muted-fg">{quoteDay(at)}<span className="hidden sm:inline">, {quoteTime(at)}</span></span> : null}
          </span>
        ) : null}
      </div>
      <ExampleLabel />
    </div>
  );
}

function ExampleLabel() {
  return (
    <span className="shrink-0 text-[13px] text-oa-muted-fg">
      <span className="sm:hidden">Example</span>
      <span className="hidden sm:inline">From the example portfolio</span>
    </span>
  );
}

const CARD = "oa-surface border border-oa-border bg-oa-card";
const STEPS = "grid grid-cols-1 lg:grid-cols-5 lg:px-5";

function Strip({ sequence }: { sequence: AgentSequence }) {
  return (
    <div className={CARD}>
      <Header sequence={sequence} />
      <ol className={STEPS} aria-label={`How the agent came to “${sequence.title}”`}>
        <EventStep sequence={sequence} />
        <CheckedStep sequence={sequence} />
        <ProposalStep sequence={sequence} />
        <DecisionStep sequence={sequence} />
        <NextStep sequence={sequence} />
      </ol>
    </div>
  );
}

const SECTION = "scroll-mt-24";

/** The section: the strip under its heading, or, on a day with nothing to show, the example agents and what they watch. */
export async function AgentSequenceSection({ className = "" }: { className?: string }) {
  const sequence = await loadAgentSequence();
  if (!sequence) {
    return (
      <section id="what-it-does" className={`${SECTION} ${className}`}>
        <SectionHead title="Three agents watch the example portfolio." href="/agents" hrefLabel="Set one up" />
        <AgentDoes />
      </section>
    );
  }
  return (
    <section id="what-it-does" className={`${SECTION} ${className}`}>
      <SectionHead title={HEAD_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <Reveal delay={60}>
        <Strip sequence={sequence} />
      </Reveal>
    </section>
  );
}

/**
 * The strip's exact place while it loads: the same heading and card, at the strip's own height, with no step markup
 * (it is sent in the page's first bytes, so it stays small). Keep in step with STEP, WORDS and VISUAL: from lg one row
 * of 40 + 32 + 10 + 21 + 8 + 58 = 169px under the 56px header, on a phone five rows of 24 + 21 + 6 + 58 = 109px; plus
 * the card's 2px border.
 */
export function AgentSequenceGhost({ className = "" }: { className?: string }) {
  return (
    <section className={`${SECTION} ${className}`}>
      <SectionHead title={HEAD_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <div aria-hidden="true" className={`${CARD} h-[603px] lg:h-[227px]`}>
        <div className="flex h-14 items-center justify-between gap-3 border-b border-oa-border px-4 sm:px-5">
          <Bar className="h-5 w-40" />
          <ExampleLabel />
        </div>
      </div>
    </section>
  );
}
