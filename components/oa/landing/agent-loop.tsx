import * as React from "react";

import { Bar } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { OUTCOME_SESSIONS, type AgentLoop, type LoopPoint } from "@/lib/agent-loop";
import { loadLandingAgent } from "@/lib/agent-sequence-server";
import { absoluteDay, capitalize, dayPossessive, dayWords, etDayOf, stampWords, weekdayName } from "@/lib/day-words";

import { SequenceStrip } from "./agent-sequence";
import { SectionHead, fmtPrice } from "./shared";

/**
 * The agent's loop on one real case, right under the hero: what the example portfolio asked its agent, the days it
 * checked, what it found, what it decided, and what the stock did next against the S&P 500 (lib/agent-loop.ts picks the
 * case by a fixed rule, never by how it turned out). Five connected steps in a row from lg, stacked on a phone; each is
 * an icon, a few words, and one figure or small visual. On a day with no stored case, the strongest proposal today
 * shows in its place (./agent-sequence.tsx), under the same heading.
 */

const HEAD_TITLE = "One request, followed all the way through.";
/** The fallback strip's own heading: it shows today's proposal, not one request through to its result. */
const STRIP_TITLE = "Our agent at work on real data.";
const HEAD_HREF = "/agent";
const HEAD_LINK = "Try it on your stocks";

const CARD = "oa-surface border border-oa-border bg-oa-card";
const STEP = "relative flex min-w-0 gap-3 px-4 py-3.5 sm:px-5 lg:flex-col lg:gap-3 lg:py-5 lg:pl-0 lg:pr-5";
const WORDS = "truncate text-[14.5px] font-medium leading-[21px] text-oa-fg";
const BODY = "mt-1.5 min-w-0 lg:mt-2";
const SMALL = "text-[12.5px] leading-[18px] text-oa-muted-fg";
const FIGURE = "oa-mono text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums";

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
      <span aria-hidden="true" className="absolute -bottom-3.5 left-[calc(1rem+15.5px)] top-12 w-px bg-oa-border sm:left-[calc(1.25rem+15.5px)] lg:hidden" />
      <span aria-hidden="true" className="absolute left-8 right-0 top-[2.25rem] hidden h-px bg-oa-border lg:block" />
    </>
  );
}

function Step({ icon, words, last = false, children }: { icon: NavIconName; words: string; last?: boolean; children: React.ReactNode }) {
  return (
    <li className={STEP}>
      {last ? null : <Connector />}
      <StepIcon name={icon} />
      <div className="min-w-0 flex-1">
        <div className={WORDS}>{words}</div>
        <div className={BODY}>{children}</div>
      </div>
    </li>
  );
}

function signed(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

function toneOf(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-fg";
  return value < 0 ? "text-signal-bearish" : "text-signal-bullish";
}

const ET_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: false });

/** "before Wednesday's open", "after Wednesday's close", or "on Wednesday": when the agent told you, in market words. */
function toldWords(at: string, day: string, today: string): string {
  const date = new Date(at);
  const on = dayPossessive(day, today);
  // Open and close words only when the clock is on the run's own day (a backfilled run is said by its day alone).
  if (Number.isNaN(date.getTime()) || !on || etDayOf(at) !== day) return dayWords(day, today);
  const [hour, minute] = ET_CLOCK.format(date).split(":").map(Number) as [number, number];
  const minutes = (hour % 24) * 60 + minute;
  if (minutes < 9 * 60 + 30) return `before ${on} open`;
  if (minutes >= 16 * 60) return `after ${on} close`;
  return dayWords(day, today);
}

/* ── 1. You asked ─────────────────────────────────────────────────────── */

function AskedStep({ loop }: { loop: AgentLoop }) {
  const { text, tickers } = loop.asked;
  return (
    <Step icon="ask" words="You asked">
      {/* The agent's rule in a person's words, from its saved trigger: not quoted, since it is not the typed text. */}
      <p className="w-fit max-w-full text-pretty rounded-2xl rounded-bl-md bg-oa-primary/[.13] px-3 py-2 text-[14px] leading-5 text-oa-fg" title={`Saved as “${loop.asked.name}”`}>
        {text.replace(/\.$/, "")}
      </p>
      {tickers.length > 0 ? (
        <div className="mt-2.5 flex items-center gap-2" title={`Watching ${tickers.join(", ")}`}>
          <span aria-hidden="true" className="flex -space-x-1.5">
            {tickers.slice(0, 7).map((ticker) => (
              <StockLogo key={ticker} ticker={ticker} size={20} circle atOnce className="ring-2 ring-oa-card" />
            ))}
          </span>
          <span className={SMALL}>
            {tickers.length} {tickers.length === 1 ? "stock" : "stocks"}
            <span className="sr-only">: {tickers.join(", ")}</span>
          </span>
        </div>
      ) : null}
    </Step>
  );
}

/* ── 2. It watched ────────────────────────────────────────────────────── */

function WatchedStep({ loop }: { loop: AgentLoop }) {
  const { days, nextDay } = loop.watched;
  const marks = [...days.map((entry) => ({ ...entry, next: false })), ...(nextDay ? [{ day: nextDay, found: false, next: true }] : [])];
  const quiet = days.filter((entry) => !entry.found);
  const move = loop.watched.quiet;
  // The marks in words, so they need no legend: why a quiet day stayed quiet (no stock crossed the line; the move itself
  // is left out, since a close-to-close figure would sit beside the header's quote and read as a mismatch), else the
  // quiet days by name or count.
  const quietLine = move
    ? `${capitalize(dayWords(move.day, loop.today))}: nothing moved ${move.threshold}%, so it stayed quiet.`
    : quiet.length === 1
      ? `${capitalize(dayWords(quiet[0]!.day, loop.today))}: nothing needed you.`
      : quiet.length > 1
        ? `${quiet.length} checks found nothing to tell.`
        : null;
  return (
    <Step icon="calendar" words="It watched">
      <div className="relative w-fit">
        <span aria-hidden="true" className="absolute left-2 right-2 top-[7px] h-px bg-oa-border" />
        <ol aria-label="The agent's checks" className="relative flex items-start gap-4">
          {marks.map((entry) => (
            <li
              key={`${entry.day}:${entry.next ? "next" : "ran"}`}
              title={`${absoluteDay(entry.day, loop.today)}: ${entry.next ? "next check" : entry.found ? "told you" : "nothing needed you"}`}
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
                <span className="sr-only">{entry.next ? ": next check" : entry.found ? ": told you" : ": nothing needed you"}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {quietLine ? <p className={`mt-2 ${SMALL}`}>{quietLine}</p> : null}
    </Step>
  );
}

/* ── 3. It found ──────────────────────────────────────────────────────── */

/** The closes up to the finding, as one small line ending on a dot at the finding's own close. One SVG, no axis. */
function Spark({ points, tone }: { points: LoopPoint[]; tone: string }) {
  const W = 160;
  const H = 34;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min;
  // A flat run of closes draws across the middle, not along the bottom edge.
  const yOf = (close: number) => (span > 0 ? H - 3 - ((close - min) / span) * (H - 6) : H / 2);
  const xy = points.map((point, index) => [(index / Math.max(1, points.length - 1)) * (W - 4) + 2, yOf(point.close)] as const);
  const last = xy[xy.length - 1]!;
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} className={`mt-1.5 h-auto w-full max-w-[200px] ${tone}`}>
      <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="currentColor" />
    </svg>
  );
}

function FoundStep({ loop }: { loop: AgentLoop }) {
  const { found } = loop;
  const tone = toneOf(found.changePct);
  return (
    <Step icon="movers" words="It found">
      <div title={`${found.source}, ${absoluteDay(found.day, loop.today)}`}>
        <p className={`${FIGURE} ${tone}`}>{found.changePct !== null ? signed(found.changePct, 2) : fmtPrice(found.close)}</p>
        <p className={SMALL}>
          {capitalize(dayPossessive(found.day, loop.today))} close
          {found.changePct !== null ? (
            <>
              , <span className="oa-mono tabular-nums text-oa-fg">{fmtPrice(found.close)}</span>
            </>
          ) : null}
        </p>
      </div>
      {found.chart.length >= 2 ? <Spark points={found.chart} tone={tone} /> : null}
    </Step>
  );
}

/* ── 4. It decided ────────────────────────────────────────────────────── */

/**
 * What it decided, as stored with the run: to tell you, which rule fired, and when, as a small notification. The move's
 * figure is the step before and is not said again; nothing here is worked out again from today's data.
 */
function DecidedStep({ loop, last = false }: { loop: AgentLoop; last?: boolean }) {
  const { decided } = loop;
  return (
    <Step icon="agents" words="It decided" last={last}>
      <div className="flex w-fit max-w-full items-start gap-2 rounded-xl border border-oa-border bg-oa-bg px-2.5 py-2" title={stampWords(decided.toldAt)}>
        <NavIcon name="alerts" className="mt-0.5 size-[14px] shrink-0 text-oa-primary" />
        <span className="min-w-0">
          <span className="block text-pretty text-[13px] font-medium leading-[18px] text-oa-fg">
            {/* "Crossed your line" only when the stored move really reaches it (the job's line could change later). */}
            {decided.line !== null && loop.found.changePct !== null && Math.abs(loop.found.changePct) >= decided.line
              ? `${loop.ticker} crossed your ${decided.line}% line`
              : `${loop.ticker} met your rule`}
          </span>
          <span className="block text-[12px] leading-4 text-oa-muted-fg">Told you {toldWords(decided.toldAt, decided.toldDay, loop.today)}</span>
        </span>
      </div>
    </Step>
  );
}

/* ── 5. What happened next ────────────────────────────────────────────── */

/**
 * The stock and the S&P 500 over the same closes, as bars from a zero line on one scale (owner rule 4: a comparison gets
 * a bar): a fall reaches left, a rise right, so the direction reads without the colour.
 */
function OutcomeBars({ rows }: { rows: Array<{ label: string; pct: number; ticker: string | null; title?: string }> }) {
  const scale = Math.max(...rows.map((row) => Math.abs(row.pct)), 0.5);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const width = Math.abs(row.pct) < 0.05 ? 0 : Math.max(4, (Math.abs(row.pct) / scale) * 50);
        return (
          <li key={row.label} className="min-w-0" title={row.title}>
            {/* The name and the figure on one line, the bar under them at the step's full width. */}
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {row.ticker ? (
                  <StockLogo ticker={row.ticker} size={18} circle atOnce />
                ) : (
                  <span aria-hidden="true" className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-oa-border bg-oa-bg text-oa-primary">
                    <NavIcon name="markets" className="size-[11px]" />
                  </span>
                )}
                <span className="oa-mono truncate text-[12px] font-semibold leading-4 text-oa-fg">{row.label}</span>
              </span>
              <span className={`oa-mono text-[13px] font-semibold tabular-nums ${toneOf(row.pct)}`}>{signed(row.pct)}</span>
            </span>
            <span aria-hidden="true" className="relative mt-1 block h-1.5 rounded-full bg-oa-accent">
              <span className="absolute -inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-oa-muted-fg/60" />
              <span
                className={`absolute inset-y-0 ${row.pct < 0 ? "right-1/2 rounded-l-full bg-signal-bearish" : "left-1/2 rounded-r-full bg-signal-bullish"}`}
                style={{ width: `${width}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OutcomeStep({ loop }: { loop: AgentLoop }) {
  const outcome = loop.outcome!;
  const from = dayPossessive(outcome.fromDay, loop.today);
  const rows = [
    { label: loop.ticker, pct: outcome.pct, ticker: loop.ticker },
    ...(outcome.benchPct !== null ? [{ label: "S&P 500", pct: outcome.benchPct, ticker: null, title: "The S&P 500, measured by SPY, the fund that tracks it" }] : []),
  ];
  // "2 of 5 trading days so far" while the window fills, so it reads as a running record.
  const span = outcome.full ? `${outcome.sessions} trading days later` : `${outcome.sessions} of ${OUTCOME_SESSIONS} trading days so far`;
  return (
    <Step icon="markets" words="What happened next" last>
      <p
        className={`${SMALL} mb-2`}
        title={`From the ${absoluteDay(outcome.fromDay, loop.today)} close (${fmtPrice(outcome.fromClose)}), the last before it told you, to the ${absoluteDay(outcome.toDay, loop.today)} close (${fmtPrice(outcome.toClose)}), daily closing prices`}
      >
        From {from} close: {span}
      </p>
      <OutcomeBars rows={rows} />
    </Step>
  );
}

/* ── the card ─────────────────────────────────────────────────────────── */

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

function Header({ loop }: { loop: AgentLoop }) {
  const now = loop.now;
  const day = now?.at ? etDayOf(now.at) : null;
  const time = now?.at && !/^\d{4}-\d{2}-\d{2}$/.test(now.at) ? `${ET_TIME.format(new Date(now.at))} ET` : null;
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-oa-border px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={loop.ticker} size={28} eager />
        <span className="oa-mono text-[15px] font-semibold text-oa-fg">{loop.ticker}</span>
        {now ? (
          <span className="oa-mono flex min-w-0 items-baseline gap-2 text-[14px] tabular-nums" title={now.at ? `Price as of ${stampWords(now.at)}` : undefined}>
            <span className="text-oa-fg">{fmtPrice(now.price)}</span>
            {now.dayPct !== null ? <span className={toneOf(now.dayPct)}>{signed(now.dayPct)}</span> : null}
            {day ? (
              <span className="truncate text-[12.5px] text-oa-muted-fg">
                {dayWords(day, loop.today)}
                {time ? <span className="hidden sm:inline">, {time}</span> : null}
              </span>
            ) : null}
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

function Loop({ loop }: { loop: AgentLoop }) {
  const steps = loop.outcome ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <div className={CARD}>
      <Header loop={loop} />
      <ol className={`grid grid-cols-1 lg:px-5 ${steps}`} aria-label={`What the agent did with: ${loop.asked.text.replace(/\.$/, "")}`}>
        <AskedStep loop={loop} />
        <WatchedStep loop={loop} />
        <FoundStep loop={loop} />
        <DecidedStep loop={loop} last={!loop.outcome} />
        {loop.outcome ? <OutcomeStep loop={loop} /> : null}
      </ol>
    </div>
  );
}

const SECTION = "scroll-mt-24";

/** The section: the loop under its heading; the strongest proposal today when there is no case; nothing with neither. */
export async function AgentLoopSection({ className = "" }: { className?: string }) {
  const { loop, sequence } = await loadLandingAgent();
  if (!loop && !sequence) return null;
  return (
    <section id="what-it-does" className={`${SECTION} ${className}`}>
      <SectionHead title={loop ? HEAD_TITLE : STRIP_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <Reveal delay={60}>{loop ? <Loop loop={loop} /> : <SequenceStrip sequence={sequence!} />}</Reveal>
    </section>
  );
}

/** The section's place while it loads: the heading and the card's frame at the five-step loop's measured height (Nov 13: 775px on a 390px phone, 285px from lg). */
export function AgentLoopGhost({ className = "" }: { className?: string }) {
  return (
    <section className={`${SECTION} ${className}`}>
      <SectionHead title={HEAD_TITLE} href={HEAD_HREF} hrefLabel={HEAD_LINK} />
      <div aria-hidden="true" className={`${CARD} h-[775px] lg:h-[285px]`}>
        <div className="flex h-14 items-center justify-between gap-3 border-b border-oa-border px-4 sm:px-5">
          <Bar className="h-5 w-40" />
          <ExampleLabel />
        </div>
      </div>
    </section>
  );
}
