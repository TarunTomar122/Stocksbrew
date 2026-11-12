import Link from "next/link";
import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import type { ThreadCall, ThreadFigure, ThreadNote, ThreadPoint, ThreadStep } from "@/lib/thread/types";

/**
 * One note of the agent thread. No hooks, so the server draws the whole thread and the reply box adds its own notes
 * with the same pieces. Nothing is repeated on every note (owner rule 1): the agent's mark sits once at the head of a
 * day, a time shows only when it changes, and our call on a stock is said beside its first note of the day.
 */

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const TONE_TEXT = { up: "text-[var(--signal-bullish)]", down: "text-[var(--signal-bearish)]", flat: "text-oa-fg" } as const;
export const NOTE_CARD = "oa-surface min-w-0 rounded-2xl border border-oa-border bg-oa-card";

/** The agent's own mark, once at the head of each day: the brand mark on a quiet tile. */
export function AgentMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-oa-fg text-oa-page ${className}`}>
      <svg width="16" height="16" viewBox="0 0 56 56" fill="none">
        <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
        <path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Figure({ figure, size = "md" }: { figure: ThreadFigure; size?: "md" | "lg" }) {
  return (
    <span className="flex shrink-0 flex-col items-end text-right">
      <span className={`oa-mono font-semibold tabular-nums ${TONE_TEXT[figure.tone]} ${size === "lg" ? "text-[22px] leading-7" : "text-[17px] leading-6"}`}>{figure.value}</span>
      {figure.label ? <span className="max-w-[8rem] text-[11.5px] leading-4 text-oa-muted-fg">{figure.label}</span> : null}
    </span>
  );
}

/** A stock's logo and ticker, as one chip. */
export function StockChip({ ticker }: { ticker: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StockLogo ticker={ticker} size={22} />
      <span className="text-[13.5px] font-semibold leading-5 text-oa-fg">{ticker}</span>
    </span>
  );
}

function CallTag({ call }: { call: ThreadCall }) {
  const tone = call.word === "Buy more" ? "up" : call.word === "Sell some" ? "down" : "flat";
  const color = tone === "up" ? "var(--signal-bullish)" : tone === "down" ? "var(--signal-bearish)" : "var(--oa-muted-fg)";
  return (
    <span
      className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} ${tone === "flat" ? 10 : 12}%, transparent)` }}
    >
      Our call: {call.word}
      {call.level ? <span className="oa-mono font-normal tabular-nums">{call.level}</span> : null}
    </span>
  );
}

export function StepLink({ step, primary = false }: { step: ThreadStep; primary?: boolean }) {
  const className = `inline-flex min-h-8 items-center rounded-full px-3 text-[13px] font-medium transition-colors ${FOCUS} ${
    primary ? "bg-oa-primary text-oa-primary-fg hover:opacity-90" : "border border-oa-border bg-oa-bg text-oa-fg hover:bg-oa-accent"
  }`;
  if (step.external) {
    return (
      <a href={step.href} target="_blank" rel="noopener noreferrer" className={className}>
        {step.label}
      </a>
    );
  }
  return (
    <Link href={step.href} prefetch={false} className={className}>
      {step.label}
    </Link>
  );
}

function Point({ point }: { point: ThreadPoint }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {point.tickers.slice(0, 3).map((ticker) => (
            <StockLogo key={ticker} ticker={ticker} size={22} />
          ))}
          {point.leadName ? <span className="truncate text-[13px] font-medium text-oa-muted-fg">{point.leadName}</span> : null}
        </span>
        {point.figure ? <Figure figure={point.figure} /> : null}
      </span>
      <span className="mt-1.5 block text-pretty text-[14px] leading-5 text-oa-fg">{point.text}</span>
      {point.soWhat ? <span className="mt-1 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{point.soWhat}</span> : null}
    </>
  );
  const frame = "flex h-full min-w-0 flex-col rounded-xl border border-oa-border bg-oa-bg p-3";
  return point.href ? (
    <Link href={point.href} prefetch={false} className={`${frame} transition-colors hover:bg-oa-accent ${FOCUS}`}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

/** Grid columns for 1-3 equal cards: a lone card fills the row (owner rule 4). */
function pointGrid(count: number): string {
  if (count >= 3) return "sm:grid-cols-3";
  if (count === 2) return "sm:grid-cols-2";
  return "";
}

function Clock({ clock }: { clock: string | null }) {
  return clock ? <p className="oa-mono mt-1 px-1 text-[11.5px] tabular-nums leading-4 text-oa-muted-fg">{clock}</p> : null;
}

/** A check that found nothing: one quiet line, never a card. */
function QuietLine({ note, showClock }: { note: ThreadNote; showClock: boolean }) {
  return (
    <p className="flex items-baseline gap-2 px-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
      <span aria-hidden="true" className="relative top-[-2px] size-1.5 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--oa-muted-fg)_55%,transparent)]" />
      <span>
        {note.text}
        {showClock && note.clock ? <span className="oa-mono ml-1.5 text-[11.5px] tabular-nums">{note.clock}</span> : null}
      </span>
    </p>
  );
}

export function ThreadNoteView({ note, showClock }: { note: ThreadNote; showClock: boolean }) {
  if (note.kind === "quiet") return <QuietLine note={note} showClock={showClock} />;

  const lead = note.tickers.length > 0 && note.reports.length === 0 ? note.tickers : [];
  // The morning note reads as the day's headline; a session line is an ordinary note.
  const big = note.morning;
  return (
    <div className="min-w-0">
      <article className={`${NOTE_CARD} ${big ? "p-4" : "px-4 py-3"}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {lead.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {lead.slice(0, 6).map((ticker) => (
                  <StockChip key={ticker} ticker={ticker} />
                ))}
                {note.source ? <span className="text-[12.5px] text-oa-muted-fg">{note.source}</span> : null}
              </div>
            ) : note.source ? (
              <p className="mb-1 text-[12.5px] text-oa-muted-fg">{note.source}</p>
            ) : null}
            <p className={`text-pretty text-oa-fg ${big ? "text-[16.5px] font-semibold leading-6" : "text-[15px] leading-[22px]"}`}>{note.text}</p>
            {note.sub ? <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">{note.sub}</p> : null}
            {note.reason ? <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">{note.reason}</p> : null}
          </div>
          {note.figure ? <Figure figure={note.figure} size={big ? "lg" : "md"} /> : null}
        </div>

        {note.recent.length > 0 ? (
          <ul aria-label="How your stocks did the sessions before" className="mt-2.5 flex flex-wrap gap-1.5">
            {note.recent.map((session) => (
              <li key={session.day} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-oa-border bg-oa-bg px-2.5 text-[12.5px]">
                <span className="text-oa-muted-fg">{session.label}</span>
                <span className={`oa-mono font-medium tabular-nums ${TONE_TEXT[session.tone]}`}>{session.value}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {note.points.length > 0 ? (
          <div className={`mt-3 grid gap-2 ${pointGrid(note.points.length)}`}>
            {note.points.map((point) => (
              <Point key={point.id} point={point} />
            ))}
          </div>
        ) : null}

        {note.reports.length > 0 ? (
          <ul className="mt-2 divide-y divide-oa-border">
            {note.reports.map((report) => (
              <li key={`${report.ticker}:${report.date}`} className="relative -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-oa-accent">
                <StockLogo ticker={report.ticker} size={22} />
                <Link
                  href={`/stock/${encodeURIComponent(report.ticker)}`}
                  prefetch={false}
                  className={`min-w-0 flex-1 rounded text-pretty text-[14px] leading-5 text-oa-fg after:absolute after:inset-0 after:content-[''] hover:underline ${FOCUS}`}
                >
                  {report.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {note.call || note.step ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {note.call ? <CallTag call={note.call} /> : null}
            {note.step ? <StepLink step={note.step} /> : null}
          </div>
        ) : null}
      </article>
      {showClock ? <Clock clock={note.clock} /> : null}
    </div>
  );
}
