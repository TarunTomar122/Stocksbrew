import Link from "next/link";
import * as React from "react";

import { CARD_HOVER } from "@/components/briefing/stock-card";
import { SignedBar } from "@/components/oa/kit/tone";
import { VsBar } from "@/components/oa/kit/vs-bar";
import { StockLogo } from "@/components/stock-logo";
import {
  KIND_WORDS,
  VERDICT_SHORT,
  type BasketChange,
  type BasketRun,
  type ReplaySummary,
  type StatusVerdict,
} from "@/lib/basket-agent/model";
import { capitalize, dayWords } from "@/lib/day-words";
import { shortCompanyName } from "@/lib/plain-copy";
import type { ThesisKind } from "@/lib/thesis";

/**
 * The pieces the basket pages share, with no hooks (server pages and the editor both render them): a company card
 * (logo, ticker, price and today's move, one line, the figure the basket compares on as a bar), the verdict chip
 * (only where a reason is not holding: "holds" is said once, above the cards), the dated run record and the replay.
 */

export const NUM = "oa-mono tabular-nums";

export function price(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function signedPct(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function toneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

const VERDICT_CHIP: Record<StatusVerdict, string> = {
  holds: "border-oa-border bg-oa-bg text-oa-muted-fg",
  weaker:
    "border-[color-mix(in_srgb,var(--oa-fg)_30%,transparent)] bg-oa-card text-oa-fg",
  broken:
    "border-[color-mix(in_srgb,var(--signal-bearish)_45%,transparent)] bg-[color-mix(in_srgb,var(--signal-bearish)_10%,transparent)] text-signal-bearish",
  played_out:
    "border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary",
  unknown: "border-dashed border-oa-border bg-transparent text-oa-muted-fg",
};

export function VerdictChip({
  verdict,
  className = "",
}: {
  verdict: StatusVerdict;
  className?: string;
}) {
  return (
    <span
      className={`oa-mono inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded border px-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] ${VERDICT_CHIP[verdict]} ${className}`}
    >
      {VERDICT_SHORT[verdict]}
    </span>
  );
}

export type CardQuote = { price: number; dayPct: number | null } | null;

/**
 * One company. The card is a link or a button when `href` or `onSelect` is given (the whole card, with a hover), and
 * says only what differs from its neighbours: the verdict chip when the reason is not holding, the kind when it is not
 * the basket's own, one line, and its figure as a bar on the basket's shared scale.
 */
export function CompanyCard({
  ticker,
  company,
  quote,
  line,
  verdict = null,
  kind = null,
  bar = null,
  href,
  onSelect,
  selected = false,
  eager = false,
  title,
  className = "",
  children,
}: {
  ticker: string;
  company: string | null;
  quote: CardQuote;
  line: string;
  verdict?: StatusVerdict | null;
  /** Shown only when it differs from the basket's main kind. */
  kind?: ThesisKind | null;
  bar?: { value: number; text: string; domain: [number, number] } | null;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  eager?: boolean;
  title?: string;
  /** Where it shows: the fold's classes (CardRows `foldClass`). */
  className?: string;
  /** Inline fields, above the card's own link (the editor's reason for a company that has none). */
  children?: React.ReactNode;
}) {
  const name = shortCompanyName(company ?? "") || null;
  const showName = name && name.toUpperCase() !== ticker;
  const interactive = Boolean(href || onSelect);
  const cover = href ? (
    <Link
      prefetch={false}
      href={href}
      aria-label={`${ticker}${name ? `, ${name}` : ""}`}
      className="absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
    />
  ) : onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Edit ${ticker}`}
      className="absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
    />
  ) : null;
  return (
    <li
      title={title}
      className={`oa-surface relative flex h-full min-w-0 flex-col border bg-oa-card px-3.5 pb-3 pt-3 ${interactive ? CARD_HOVER : ""} ${selected ? "border-[color-mix(in_srgb,var(--oa-fg)_40%,transparent)]" : "border-oa-border"} ${className}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={ticker} size={28} eager={eager} />
          <div className="min-w-0 leading-5">
            <p className="oa-mono text-[14px] font-semibold text-oa-fg">
              {ticker}
            </p>
            {showName || kind ? (
              <p
                className="truncate text-[12.5px] leading-4 text-oa-muted-fg"
                title={company ?? undefined}
              >
                {[showName ? name : null, kind ? KIND_WORDS[kind] : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        {quote ? (
          <div className={`${NUM} shrink-0 text-right leading-5`}>
            <p className="text-[14px] font-semibold text-oa-fg">
              {price(quote.price)}
            </p>
            {quote.dayPct !== null ? (
              <p
                className={`text-[12.5px] leading-4 ${toneClass(quote.dayPct)}`}
              >
                {signedPct(quote.dayPct)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {verdict && verdict !== "holds" ? (
        <VerdictChip verdict={verdict} className="mt-2.5 self-start" />
      ) : null}
      {/* One line on every card (owner rules 3 and 8); the whole reason is in the title. */}
      {line ? (
        <p
          className="mt-2 truncate text-[13.5px] leading-5 text-oa-fg"
          title={line}
        >
          {line}
        </p>
      ) : null}
      {children ? (
        <div className="relative z-[2] mt-2 flex min-w-0 flex-col gap-2">
          {children}
        </div>
      ) : null}
      {bar ? (
        <div className="mt-auto flex items-center gap-2.5 pt-3">
          <SignedBar
            value={bar.value}
            domain={bar.domain}
            color="var(--oa-primary)"
            className="min-w-0 flex-1"
          />
          <span
            className={`${NUM} w-14 shrink-0 text-right text-[12.5px] text-oa-fg`}
          >
            {bar.text}
          </span>
        </div>
      ) : null}
      {cover}
    </li>
  );
}

/** A panel like the kit's, safe in client components (the kit's index brings the site header with it). */
export function Box({
  label,
  right,
  children,
  flush = false,
  className = "",
}: {
  label?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card ${className}`}
    >
      {label || right ? (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
          {label ? (
            <h2 className="oa-label min-w-0 truncate">{label}</h2>
          ) : (
            <span />
          )}
          {right ? (
            <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-oa-muted-fg">
              {right}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/**
 * Cards side by side, one width, rows of equal height: 1 on a phone, 2 from 34rem, 3 from 52rem of the column (`cols`
 * 2 keeps two, for two or four cards, so no row ends with an empty column).
 */
export function CardRows({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div className="[container-type:inline-size]">
      <ul
        className={`grid grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2 ${cols === 3 ? "[@container(min-width:52rem)]:grid-cols-3" : ""}`}
      >
        {children}
      </ul>
    </div>
  );
}

/** How many cards show before the fold at each width: one column, two, three. */
export type Fold = {
  one: number;
  two: number;
  three: number;
  total: number;
  cols: 2 | 3;
};

/**
 * How many cards to show at each width so every row ends full: the ones needing attention always show, about eight at
 * most, and the count rounds down to whole rows (two or four cards keep two columns).
 */
export function foldOf(total: number, attention: number): Fold {
  const cols: 2 | 3 = total === 2 || total === 4 ? 2 : 3;
  const desired = total > 8 ? Math.max(6, attention) : total;
  const at = (c: number) => {
    let shown = Math.floor(desired / c) * c;
    if (shown < attention) shown = Math.ceil(attention / c) * c;
    if (shown === 0) shown = total;
    return Math.min(total, shown);
  };
  return {
    one: Math.min(total, Math.max(desired, attention)),
    two: at(2),
    three: cols === 3 ? at(3) : at(2),
    total,
    cols,
  };
}

/** The classes that hide card `index` past the fold at each width; the open fold shows them all. */
export function foldClass(fold: Fold, index: number): string {
  return [
    index >= fold.one ? "hidden" : "",
    index >= fold.two
      ? "[@container(min-width:34rem)]:hidden"
      : "[@container(min-width:34rem)]:flex",
    fold.cols === 3
      ? index >= fold.three
        ? "[@container(min-width:52rem)]:hidden"
        : "[@container(min-width:52rem)]:flex"
      : "",
    "group-data-[open=true]/fold:!flex",
  ].join(" ");
}

/* ── the record ─────────────────────────────────────────────────────────── */

type RecordRow = {
  key: string;
  days: string[];
  decision: BasketRun["decision"];
  summary: string;
  tickers: string[];
  changes: BasketChange[];
};

/**
 * The run record, newest first. Runs in a row that decided the same "nothing to change" fold into one line with their
 * dates, so the same sentence is never repeated down the list (owner rule 1); every run keeps its date.
 */
export function recordRows(
  runs: readonly Pick<BasketRun, "day" | "decision" | "summary" | "changes">[],
): RecordRow[] {
  const rows: RecordRow[] = [];
  for (const run of runs) {
    const last = rows[rows.length - 1];
    if (
      last &&
      run.decision !== "propose" &&
      last.decision === run.decision &&
      last.summary === run.summary
    ) {
      last.days.push(run.day);
      continue;
    }
    rows.push({
      key: run.day,
      days: [run.day],
      decision: run.decision,
      summary: run.summary,
      tickers: run.changes.map((change) => change.ticker),
      changes: run.changes,
    });
  }
  return rows;
}

function daysLabel(days: string[], today: string): string {
  const newest = capitalize(dayWords(days[0]!, today));
  if (days.length === 1) return newest;
  return `${capitalize(dayWords(days[days.length - 1]!, today))} to ${dayWords(days[0]!, today)}`;
}

/**
 * The newest run's proposals are shown in full in their row (the company, its price, the fact, and for an add its
 * figure against the weakest company as two bars); older rows keep their one line.
 */
export function RunRecord({
  runs,
  today,
  quotes = {},
  size,
}: {
  runs: readonly BasketRun[];
  today: string;
  quotes?: Record<string, CardQuote>;
  /** How many companies the basket holds now: what accepting a change leaves. */
  size: number;
}) {
  const rows = recordRows(runs);
  return (
    <ol className="scrollbar-hide max-h-[22rem] divide-y divide-oa-border overflow-y-auto">
      {rows.map((row, index) => (
        <li
          key={row.key}
          className="grid grid-cols-1 items-start gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <span className="pt-0.5 text-[12.5px] leading-5 text-oa-muted-fg">
            {daysLabel(row.days, today)}
            {row.days.length > 1 ? (
              <span className={`${NUM} block text-[11.5px]`}>
                {row.days.length} checks
              </span>
            ) : null}
          </span>
          {index === 0 &&
          row.decision === "propose" &&
          row.changes.length > 0 ? (
            <ul className="flex min-w-0 flex-col gap-2">
              {row.changes.map((change) => (
                <ChangeCard
                  key={`${change.op}-${change.ticker}`}
                  change={change}
                  quote={quotes[change.ticker] ?? null}
                  size={size}
                />
              ))}
            </ul>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {row.tickers.length > 0 ? (
                <span className="flex -space-x-1.5">
                  {row.tickers.slice(0, 3).map((ticker) => (
                    <StockLogo key={ticker} ticker={ticker} size={20} />
                  ))}
                </span>
              ) : null}
              <span
                className={`text-pretty text-[13.5px] leading-5 ${row.decision === "propose" ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}
              >
                {row.summary}
              </span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ── the replay ─────────────────────────────────────────────────────────── */

/**
 * What the replay would have proposed and when: one row per change, its line, and a bar across the four weeks marking
 * the days it would have waited for an answer. The window is said once, under the rows.
 */
export function ReplayView({
  replay,
  today,
  kind,
  earlier = false,
}: {
  replay: Pick<
    ReplaySummary,
    "from" | "to" | "sessions" | "days" | "proposals" | "counts" | "notes"
  >;
  today: string;
  /** "page": the replay kept with a saved basket; `earlier` when the basket has changed since it ran. */
  kind?: "editor" | "page";
  earlier?: boolean;
}) {
  const days = replay.days ?? [];
  const at = (day: string) => Math.max(0, days.indexOf(day));
  const span = Math.max(1, days.length);
  const window = `${capitalize(dayWords(replay.from, today))} to ${dayWords(replay.to, today)}`;
  return (
    <div className="flex min-w-0 flex-col">
      {/* The four weeks as one line of history, said once. */}
      <div className="border-b border-oa-border px-4 py-3">
        <p className="text-[14.5px] font-medium leading-5 text-oa-fg">
          <span className={NUM}>{replay.sessions}</span> days checked:{" "}
          <span className={NUM}>{replay.proposals.length}</span>{" "}
          {replay.proposals.length === 1 ? "change" : "changes"},{" "}
          <span className={NUM}>{replay.counts.nothing}</span> quiet.
        </p>
        <p
          className="text-[12.5px] leading-5 text-oa-muted-fg"
          title={replay.notes.join(" ")}
        >
          This is history, not a forecast of what comes next.
        </p>
      </div>
      {replay.proposals.length > 0 ? (
        <ul className="divide-y divide-oa-border">
          {replay.proposals.map((proposal) => (
            <li
              key={`${proposal.op}-${proposal.ticker}-${proposal.first}`}
              className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <StockLogo ticker={proposal.ticker} size={28} />
                <div className="min-w-0 leading-5">
                  <p className="text-[14px] font-medium text-oa-fg">
                    {proposal.op === "drop" ? "Drop" : "Add"}{" "}
                    <span className="oa-mono font-semibold">
                      {proposal.ticker}
                    </span>
                    <span className="text-oa-muted-fg">
                      {" "}
                      · {dayWords(proposal.first, today)}
                    </span>
                  </p>
                  <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg">
                    {proposal.line}
                  </p>
                </div>
              </div>
              {days.length > 0 ? (
                <div className="min-w-0">
                  <span className="relative block h-2 rounded-full bg-oa-bg">
                    <span
                      className={`absolute inset-y-0 rounded-full ${proposal.op === "drop" ? "bg-signal-bearish" : "bg-oa-primary"}`}
                      style={{
                        left: `${(at(proposal.first) / span) * 100}%`,
                        width: `${Math.max(4, (proposal.days / span) * 100)}%`,
                      }}
                    />
                  </span>
                  <span
                    className={`${NUM} mt-1 block text-[11.5px] text-oa-muted-fg`}
                  >
                    Would have waited {proposal.days}{" "}
                    {proposal.days === 1 ? "day" : "days"} for an answer
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-fg">
          It would have changed nothing.
        </p>
      )}
      <p
        className="mt-auto border-t border-oa-border px-4 py-2.5 text-[12.5px] leading-5 text-oa-muted-fg"
        title={replay.notes.join(" ")}
      >
        {kind !== "page"
          ? "Replay"
          : earlier
            ? "Replayed on an earlier version of this basket"
            : "Replayed when you saved it"}
        , {window}.
      </p>
    </div>
  );
}

/**
 * A change the latest check proposes: the company, "Drop" or "Add", the one fact that decides it, and for an add its
 * figure against the weakest company as two bars on one scale.
 */
/** What accepting a change does, in words: each proposal changes one company and keeps the rest. */
export function changeTitle(
  change: Pick<BasketChange, "op" | "ticker">,
  size: number,
): string {
  return change.op === "drop"
    ? `Drop ${change.ticker}, keep the other ${Math.max(0, size - 1)}`
    : `Add ${change.ticker}, keep all ${size}`;
}

export function ChangeCard({
  change,
  quote,
  size,
}: {
  change: BasketChange;
  quote: CardQuote;
  size: number;
}) {
  const name = shortCompanyName(change.company ?? "") || null;
  return (
    <li className="oa-surface grid min-w-0 gap-x-5 gap-y-2 border border-oa-border bg-oa-card px-3.5 py-3 md:grid-cols-[17rem_minmax(0,1fr)_13rem] md:items-center">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={change.ticker} size={28} />
          <div className="min-w-0 leading-5">
            <p className="text-[14px] font-semibold text-oa-fg">
              {changeTitle(change, size)}
            </p>
            {name ? (
              <p className="truncate text-[12.5px] leading-4 text-oa-muted-fg">
                {name}
              </p>
            ) : null}
          </div>
        </div>
        {quote ? (
          <div className={`${NUM} shrink-0 text-right leading-5`}>
            <p className="text-[14px] font-semibold text-oa-fg">
              {price(quote.price)}
            </p>
            {quote.dayPct !== null ? (
              <p
                className={`text-[12.5px] leading-4 ${toneClass(quote.dayPct)}`}
              >
                {signedPct(quote.dayPct)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-pretty text-[13.5px] leading-5 text-oa-fg">
        {change.line}
      </p>
      {change.op === "add" && change.fact?.versus ? (
        <VsBar
          className="min-w-0"
          value={change.fact.value}
          versus={change.fact.versus.value}
          labels={[change.ticker, change.fact.versus.ticker]}
          suffix="%"
          signed={change.kind !== "value" && change.kind !== "dividend"}
          format={(n) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1))}
        />
      ) : null}
    </li>
  );
}
