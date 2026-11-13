import Link from "next/link";
import * as React from "react";

import { NUM, price, signedPct, type CardQuote } from "@/components/basket-agent/parts";
import { CARD_HOVER } from "@/components/briefing/stock-card";
import { StockLogo } from "@/components/stock-logo";
import { ConditionBar } from "@/components/thesis/conditions-picker";
import { absoluteDay, capitalize, dayWords } from "@/lib/day-words";
import { shortCompanyName } from "@/lib/plain-copy";
import { STATUS_WORDS, type ThesisCounts, type ThesisEvent, type ThesisStatus } from "@/lib/thesis-monitor/model";
import { waitingFor, type CompanyView, type HistoryStretch, type LineView, type Scale } from "@/lib/thesis-monitor/view";

/**
 * The thesis page's pieces, with no hooks: the status block, a company card with its lines (now against the line on
 * the conditions picker's honest scale), the dated events and the history of checks.
 */

export const STATUS_TEXT: Record<ThesisStatus, string> = {
  holds: "text-signal-bullish",
  strain: "text-oa-primary",
  broken: "text-signal-bearish",
  waiting: "text-oa-muted-fg",
};

const STATUS_FILL: Record<ThesisStatus, string> = {
  holds: "bg-signal-bullish",
  strain: "bg-oa-primary",
  broken: "bg-signal-bearish",
  waiting: "bg-[color-mix(in_srgb,var(--oa-muted-fg)_45%,transparent)]",
};

function toneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

/* ── the thesis and its status ──────────────────────────────────────────── */

/** Lines that hold, broke and wait, as one bar: the widths are the counts. */
export function CountBar({ counts, className = "" }: { counts: ThesisCounts; className?: string }) {
  const total = Math.max(1, counts.lines);
  const parts: Array<[number, string]> = [
    [counts.holds, "bg-signal-bullish"],
    [counts.broke, "bg-signal-bearish"],
    [counts.waiting, "bg-[color-mix(in_srgb,var(--oa-muted-fg)_35%,transparent)]"],
  ];
  return (
    <span aria-hidden="true" className={`flex h-2 overflow-hidden rounded-full bg-oa-bg ${className}`}>
      {parts.map(([count, fill], index) => (count > 0 ? <span key={index} className={`${fill} h-full [&+span]:ml-px`} style={{ width: `${(count / total) * 100}%` }} /> : null))}
    </span>
  );
}

export function ThesisSummary({
  statement,
  showStatement,
  status,
  counts,
  affected,
  since,
  today,
}: {
  statement: string;
  showStatement: boolean;
  status: ThesisStatus | null;
  counts: ThesisCounts | null;
  affected: string[];
  since: string | null;
  today: string;
}) {
  const judged = counts ? counts.holds + counts.broke : 0;
  return (
    <section aria-label="Your thesis" className="oa-surface grid min-w-0 gap-4 border border-oa-border bg-oa-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] sm:gap-6">
      <div className="flex min-w-0 flex-col justify-center gap-1">
        {showStatement ? <p className="text-pretty text-[17px] font-medium leading-6 text-oa-fg">“{statement}”</p> : null}
        {/* Before the first check the header says when it comes; nothing is said twice. */}
        {status && since ? (
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">
            <span className={`font-semibold ${STATUS_TEXT[status]}`}>{STATUS_WORDS[status]}</span> since {dayWords(since, today)}
          </p>
        ) : null}
      </div>
      {counts ? (
        <div className="flex min-w-0 flex-col justify-center gap-2 border-t border-oa-border pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="flex items-baseline justify-between gap-3">
            <span className={`${NUM} text-[22px] font-semibold leading-7 text-oa-fg`}>
              {counts.holds}
              <span className="text-[15px] font-medium text-oa-muted-fg"> of {counts.lines}</span>
            </span>
            <span className="text-[13px] text-oa-muted-fg">{judged === counts.lines ? "lines hold" : `hold, ${counts.waiting} waiting`}</span>
          </p>
          <CountBar counts={counts} />
          {affected.length > 0 ? (
            <p className="flex min-w-0 items-center gap-2 text-[13px] text-oa-muted-fg">
              <span>Affected</span>
              <span className="flex min-w-0 items-center gap-1.5">
                {affected.slice(0, 5).map((ticker) => (
                  <span key={ticker} className="inline-flex items-center gap-1">
                    <StockLogo ticker={ticker} size={18} />
                    <span className="oa-mono text-[12.5px] font-medium text-oa-fg">{ticker}</span>
                  </span>
                ))}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ── a company and its lines ────────────────────────────────────────────── */

function LineRow({ line, scale }: { line: LineView; scale: Scale | null }) {
  const judged = line.status !== "unknown" && line.now !== null;
  const awaited = waitingFor(line.text);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex min-w-0 items-baseline justify-between gap-3 text-[13.5px] leading-5">
        <span className="min-w-0 truncate text-oa-fg">{line.label}</span>
        {judged ? (
          <span className={`${NUM} shrink-0 font-semibold ${line.status === "broken" ? "text-signal-bearish" : "text-signal-bullish"}`}>
            {line.status === "broken" ? <span className="mr-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em]">Broke</span> : <span className="sr-only">Holds, now </span>}
            {line.nowText}
          </span>
        ) : (
          <span className="shrink-0 text-[12.5px] text-oa-muted-fg">{line.fresh ? "Not checked yet" : awaited ? `Waiting for ${awaited}` : "Can't check yet"}</span>
        )}
      </p>
      {judged ? (
        // A figure shared across cards is on the page's one scale for it, labelled once above the cards.
        <ConditionBar metric={line.condition.metric} now={line.now!} line={line.condition.value} holds={line.status !== "broken"} domain={scale} ends={!scale} />
      ) : awaited ? null : (
        <p className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{line.text}</p>
      )}
    </div>
  );
}

/** "Q2 report, Aug 27 · next Dec 1": what the verdicts stand on and when the next report comes, one quiet line. */
function basisWords(company: CompanyView, next: string | null, today: string): string | null {
  const basis = company.basis;
  const on = basis ? (basis.report ? `${basis.quarter ? `${basis.quarter} report` : "Report"}, ${dayWords(basis.day, today)}` : `Figures from ${dayWords(basis.day, today)}`) : null;
  const ahead = next ? `next report ${dayWords(next, today)}` : null;
  const words = [on, ahead].filter(Boolean).join(" · ");
  return words ? capitalize(words) : null;
}

/** Each line's finding with its dated source, and a new risk in the company's words, for the card's hover. */
function hoverOf(company: CompanyView): string {
  return [
    ...company.lines.map((line) => [line.label, line.text, line.source].filter(Boolean).join(": ")),
    ...(company.risk?.first ? [`New risk: ${company.risk.first}`] : []),
  ].join("\n");
}

export function LinesCard({
  company,
  name,
  quote,
  scales,
  next = null,
  today,
  eager = false,
}: {
  company: CompanyView;
  name: string | null;
  quote: CardQuote;
  scales: Partial<Record<string, Scale>>;
  next?: string | null;
  today: string;
  eager?: boolean;
}) {
  const short = shortCompanyName(name ?? "") || null;
  const basis = basisWords(company, next, today);
  return (
    <li className={`oa-surface relative mb-3 flex min-w-0 break-inside-avoid flex-col gap-3 border bg-oa-card px-3.5 pb-3 pt-3 ${CARD_HOVER} ${company.broken > 0 ? "border-[color-mix(in_srgb,var(--signal-bearish)_40%,var(--oa-border))]" : "border-oa-border"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={company.ticker} size={28} eager={eager} />
          <div className="min-w-0 leading-5">
            <p className="oa-mono text-[14px] font-semibold text-oa-fg">{company.ticker}</p>
            {short && short.toUpperCase() !== company.ticker ? (
              <p className="truncate text-[12.5px] leading-4 text-oa-muted-fg" title={name ?? undefined}>
                {short}
              </p>
            ) : null}
          </div>
        </div>
        {quote ? (
          <div className={`${NUM} shrink-0 text-right leading-5`}>
            <p className="text-[14px] font-semibold text-oa-fg">{price(quote.price)}</p>
            {quote.dayPct !== null ? <p className={`text-[12.5px] leading-4 ${toneClass(quote.dayPct)}`}>{signedPct(quote.dayPct)}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {company.lines.map((line) => (
          <LineRow key={line.key} line={line} scale={scales[line.condition.metric] ?? null} />
        ))}
      </div>
      {company.risk || basis ? (
        <div className="flex min-w-0 flex-col gap-0.5 border-t border-oa-border pt-2 text-[12.5px] leading-4">
          {company.risk ? (
            <p className="truncate text-oa-primary">
              {company.risk.form} {absoluteDay(company.risk.filed, today)} adds {company.risk.added} {company.risk.added === 1 ? "risk" : "risks"}
            </p>
          ) : null}
          {basis ? <p className="truncate text-oa-muted-fg">{basis}</p> : null}
        </div>
      ) : null}
      <Link
        prefetch={false}
        href={`/stock/${encodeURIComponent(company.ticker)}`}
        aria-label={`${company.ticker}${short ? `, ${short}` : ""}`}
        // The whole card is the link, so the sources live in its hover (owner rule: sources in a hover, not a line).
        title={hoverOf(company) || undefined}
        className="absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
    </li>
  );
}

/**
 * The company cards in columns that keep each card's own height (one-line cards never stretch beside two-line ones),
 * filled top to bottom so the ones that need a look, first in order, lead the first column.
 */
export function LinesColumns({ children }: { children: React.ReactNode }) {
  return (
    <div className="[container-type:inline-size]">
      <ul className="-mb-3 [column-gap:0.75rem] [@container(min-width:34rem)]:columns-2 [@container(min-width:52rem)]:columns-3">{children}</ul>
    </div>
  );
}

/* ── what moved it ──────────────────────────────────────────────────────── */

function EventRow({ event, today }: { event: ThesisEvent; today: string }) {
  const body = (
    <>
      <span className="flex w-8 shrink-0 justify-center pt-0.5">
        {event.ticker ? <StockLogo ticker={event.ticker} size={22} /> : <span aria-hidden="true" className={`mt-1.5 size-2.5 rounded-full ${STATUS_FILL[event.status ?? "waiting"]}`} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-pretty text-[14px] leading-5 text-oa-fg">
          {event.verdict === "broken" ? <span className="mr-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-signal-bearish">Broke</span> : null}
          {event.text}
        </span>
        {event.detail ? <span className="mt-0.5 block truncate text-[13px] leading-5 text-oa-muted-fg">{event.detail}</span> : null}
      </span>
      <span className={`${NUM} w-20 shrink-0 text-right text-[12.5px] leading-5 text-oa-muted-fg`}>{capitalize(dayWords(event.at, today))}</span>
    </>
  );
  const row = "relative flex min-w-0 items-start gap-2.5 px-4 py-2.5";
  return (
    <li className="border-b border-oa-border last:border-b-0" title={event.source || undefined}>
      {event.href ? (
        <a
          href={event.href}
          {...(/^https?:/.test(event.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={`${row} transition-colors hover:bg-oa-accent`}
        >
          {body}
        </a>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

/** The events, newest first; what was on file when the thesis started comes last, under its own quiet heading. */
export function EventList({ events, today }: { events: ThesisEvent[]; today: string }) {
  const news = events.filter((event) => !event.baseline);
  const before = events.filter((event) => event.baseline);
  return (
    <div className="max-h-[26rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {news.length > 0 ? (
        <ul>
          {news.map((event) => (
            <EventRow key={event.key} event={event} today={today} />
          ))}
        </ul>
      ) : null}
      {before.length > 0 ? (
        <>
          {news.length > 0 ? <p className="oa-caption border-y border-oa-border bg-oa-bg px-4 py-1.5">On file when it started</p> : null}
          <ul>
            {before.map((event) => (
              <EventRow key={event.key} event={event} today={today} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/* ── history ────────────────────────────────────────────────────────────── */

/** One cell per check, oldest to newest, coloured by the status that day. */
export function StatusStrip({ days, today }: { days: Array<{ day: string; status: ThesisStatus }>; today: string }) {
  if (days.length === 0) return null;
  const shown = days.slice(-60);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-5 gap-[2px]" role="img" aria-label={`Status on each of the last ${shown.length} checks`}>
        {shown.map((entry) => (
          <span key={entry.day} title={`${absoluteDay(entry.day, today)}: ${STATUS_WORDS[entry.status]}`} className={`h-full min-w-[3px] max-w-[28px] flex-1 rounded-[2px] ${STATUS_FILL[entry.status]}`} />
        ))}
      </div>
      <p className={`${NUM} flex justify-between text-[11.5px] leading-4 text-oa-muted-fg`}>
        <span>{capitalize(dayWords(shown[0]!.day, today))}</span>
        {shown.length > 1 ? <span>{capitalize(dayWords(shown[shown.length - 1]!.day, today))}</span> : null}
      </p>
    </div>
  );
}

function rangeWords(stretch: HistoryStretch, today: string): string {
  if (stretch.from === stretch.to) return capitalize(dayWords(stretch.from, today));
  return `${absoluteDay(stretch.from, today)} – ${dayWords(stretch.to, today)}`;
}

export function HistoryList({ stretches, today }: { stretches: HistoryStretch[]; today: string }) {
  return (
    <ul className="max-h-[16rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {stretches.map((stretch) => (
        <li key={stretch.from} title={stretch.sources.length > 0 ? `Sources: ${stretch.sources.join("; ")}` : undefined} className="flex min-w-0 items-center gap-3 border-b border-oa-border px-4 py-2.5 last:border-b-0">
          <span className={`size-2.5 shrink-0 rounded-full ${STATUS_FILL[stretch.status]}`} aria-hidden="true" />
          <span className={`w-28 shrink-0 text-[14px] font-medium ${STATUS_TEXT[stretch.status]}`}>{STATUS_WORDS[stretch.status]}</span>
          <span className={`${NUM} min-w-0 flex-1 truncate text-[13px] text-oa-fg`}>
            {stretch.holds} of {stretch.holds + stretch.broke + stretch.waiting} hold
            {stretch.broke > 0 ? <span className="text-signal-bearish"> · {stretch.broke} broke</span> : null}
          </span>
          <span className={`${NUM} shrink-0 text-right text-[12.5px] text-oa-muted-fg`}>
            {rangeWords(stretch, today)}
            {stretch.checks > 1 ? ` · ${stretch.checks} checks` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
