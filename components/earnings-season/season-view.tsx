import Link from "next/link";
import * as React from "react";

import { NUM, Panel, Ticker, fmtDay } from "@/components/oa/kit";
import { watchEarningsHref } from "@/lib/agents-plain/ask-links";
import { dayDiff, fmtEps, type Session } from "@/lib/calendar-shared";
import {
  oneToWatch,
  sessionWords,
  vsDayShort,
  weekName,
  weekWords,
  type PastReport,
  type Season,
  type SeasonStock,
  type SeasonWeek,
} from "@/lib/earnings-season";
import type { ResultSummary } from "@/lib/results/types";
import { ResultLine } from "@/components/results/result-line";
import { isNum, signedPct, weekdayOf } from "@/lib/read-format";

/**
 * /portfolio/earnings: the six weeks as a strip with
 * each stock on its report day (sized by its share of the portfolio), then
 * every report week by week, each row with its last result in view; the row
 * opens the stock's earnings page with every past report.
 */

const HOLDING_FILL = "bg-[color-mix(in_srgb,var(--oa-primary)_78%,transparent)]";
const TODAY_FILL = "bg-[color-mix(in_srgb,var(--oa-primary)_9%,transparent)]";

function capFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "This week", "Next week", or null for later weeks, whose dates say it all. */
function weekLabel(week: SeasonWeek, today: string): string | null {
  const name = weekName(week.start, today);
  return name.startsWith("the week of") ? null : capFirst(name);
}

/** The heading for a week: its name and dates, or just the dates. */
function weekTitle(week: SeasonWeek, today: string): string {
  const label = weekLabel(week, today);
  return label ? `${label}, ${weekWords(week.start, week.end)}` : weekWords(week.start, week.end);
}

/** "Tue, Nov 17" ("Today" for today). */
function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  return `${weekdayOf(day).slice(0, 3)}, ${fmtDay(day)}`;
}

const TIME_SHORT: Record<Session, string> = { bmo: "before the open", amc: "after the close", unknown: "time not given yet" };

function pctOf(weight: number): string {
  return weight >= 10 ? `${Math.round(weight)}%` : `${weight.toFixed(1).replace(/\.0$/, "")}%`;
}

/* ── The six weeks ─────────────────────────────────────────────────────── */

function dotSize(stock: SeasonStock, maxWeight: number): number {
  if (stock.kind === "watching") return 10;
  if (stock.weight === null || !(maxWeight > 0)) return 14;
  return Math.round(10 + 18 * Math.sqrt(stock.weight / maxWeight));
}

function dotTitle(stock: SeasonStock): string {
  const next = stock.next!;
  const parts = [`${stock.name}, ${weekdayOf(next.date)} ${fmtDay(next.date)}`];
  if (next.session !== "unknown") parts.push(sessionWords(next.session));
  parts.push(stock.kind === "watching" ? "on your watchlist" : stock.weight !== null ? `${pctOf(stock.weight)} of the portfolio` : "a holding");
  return parts.join(", ");
}

function WeekCell({ week, today, maxWeight, weighted }: { week: SeasonWeek; today: string; maxWeight: number; weighted: boolean }) {
  const days = [0, 1, 2, 3, 4].map((offset) => {
    const date = new Date(Date.parse(`${week.start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    return { date, stocks: week.stocks.filter((stock) => stock.next!.date === date) };
  });
  // A report dated on a weekend still belongs to the week; show it on the Friday lane.
  const weekend = week.stocks.filter((stock) => stock.next!.date > week.end);
  if (weekend.length) days[4]!.stocks.push(...weekend);
  const holdings = week.stocks.filter((stock) => stock.kind === "holding").length;
  return (
    <li className="min-w-0">
      <p className="text-[13px] font-medium leading-5 text-oa-fg">{weekLabel(week, today) ?? weekWords(week.start, week.end)}</p>
      <p className={`${NUM} min-h-4 text-[12px] leading-4 text-oa-muted-fg`}>{weekLabel(week, today) ? weekWords(week.start, week.end) : ""}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-oa-bg" aria-hidden="true">
        {week.weight ? <div className={`h-full rounded-full ${HOLDING_FILL}`} style={{ width: `${Math.min(100, Math.max(3, week.weight))}%` }} /> : null}
      </div>
      <p className="mt-1 min-h-4 text-[12px] leading-4 text-oa-muted-fg">
        {week.stocks.length === 0
          ? "No reports"
          : weighted && week.weight !== null && week.weight > 0
            ? `${pctOf(week.weight)} of the portfolio`
            : holdings > 0
              ? `${holdings} ${holdings === 1 ? "holding" : "holdings"}`
              : "Watchlist only"}
      </p>
      <ol className="mt-2 grid grid-cols-5 border-t border-oa-border">
        {days.map(({ date, stocks }) => {
          const past = date < today;
          const isToday = date === today;
          return (
            <li key={date} className={`flex min-w-0 flex-col items-center gap-1.5 pb-1 pt-1 ${week.stocks.length ? "min-h-[64px]" : "min-h-[28px] lg:min-h-[64px]"} ${isToday ? TODAY_FILL : ""}`}>
              <span className={`${NUM} text-[11px] leading-4 ${isToday ? "font-medium text-oa-primary" : past ? "text-oa-muted-fg opacity-50" : "text-oa-muted-fg"}`}>
                {Number(date.slice(8, 10))}
              </span>
              {stocks.map((stock) => {
                const size = dotSize(stock, maxWeight);
                return (
                  <a
                    key={stock.ticker}
                    href={`#report-${stock.ticker}`}
                    title={dotTitle(stock)}
                    className="group flex min-w-0 flex-col items-center gap-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-oa-ring"
                  >
                    <span
                      aria-hidden="true"
                      className={`block shrink-0 rounded-full ${stock.kind === "watching" ? "border-[1.5px] border-oa-primary" : HOLDING_FILL}`}
                      style={{ width: size, height: size }}
                    />
                    <span className={`${NUM} whitespace-nowrap text-[10.5px] font-medium leading-3 text-oa-fg group-hover:underline`}>{stock.ticker}</span>
                  </a>
                );
              })}
            </li>
          );
        })}
      </ol>
    </li>
  );
}

function Timeline({ season }: { season: Season }) {
  const maxWeight = Math.max(0, ...season.reporting.map((stock) => stock.weight ?? 0));
  const watching = season.reporting.some((stock) => stock.kind === "watching");
  return (
    <Panel
      label="The next six weeks"
      right={
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${HOLDING_FILL}`} />
            {season.weighted ? "Sized by share of the portfolio" : "Holding"}
          </span>
          {watching ? (
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-full border-[1.5px] border-oa-primary" />
              Watching
            </span>
          ) : null}
        </span>
      }
    >
      <ol className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-4">
        {season.weeks.map((week) => (
          <WeekCell key={week.start} week={week} today={season.today} maxWeight={maxWeight} weighted={season.weighted} />
        ))}
      </ol>
    </Panel>
  );
}

/* ── Report by report ──────────────────────────────────────────────────── */

const RESULT_WORD: Record<NonNullable<PastReport["result"]>, { text: string; tone: string }> = {
  beat: { text: "Beat", tone: "text-signal-bullish" },
  miss: { text: "Missed", tone: "text-signal-bearish" },
  "in-line": { text: "In line", tone: "text-oa-fg" },
};

/**
 * The last report's result against the estimate, in words: "Beat estimates by 6.1%". Nothing when we do not hold
 * its figures (an older report's result would read as the latest one).
 */
function LastResult({ stock }: { stock: SeasonStock }) {
  const last = stock.past[0];
  if (!last?.result) return null;
  const word = RESULT_WORD[last.result];
  const by = last.result !== "in-line" && isNum(last.surprisePct) ? ` by ${Math.abs(last.surprisePct).toFixed(1)}%` : "";
  return (
    <span className={`block text-[12.5px] leading-5 ${word.tone}`}>
      {last.result === "in-line" ? "In line with estimates" : `${word.text} estimates${by}`}
    </span>
  );
}

/**
 * The moves after the last four reports as plain numbers, newest first and in bold (owner, Nov 11: the dot strip was
 * unreadable). When the newest is the last report's, it is dated so it reads as that report's result.
 */
function LastMoves({ stock, today }: { stock: SeasonStock; today: string }) {
  const moves = stock.past.filter((report): report is PastReport & { move: number } => isNum(report.move)).slice(0, 4);
  if (moves.length === 0) return <span className="block text-[12.5px] leading-5 text-oa-muted-fg">No past moves on record</span>;
  return (
    <span
      role="img"
      aria-label={`After its last ${moves.length === 1 ? "report" : `${moves.length} reports`}: ${moves.map((report) => `${signedPct(report.move)} after the ${fmtDay(report.date, true)} report`).join(", ")}`}
      className={`${NUM} flex flex-wrap gap-x-3 text-[13.5px] leading-5`}
    >
      {moves.map((report, index) => (
        <span
          key={report.date}
          aria-hidden="true"
          title={`${signedPct(report.move)} after the ${fmtDay(report.date, true)} report`}
          className={`${report.move > 0 ? "text-signal-bullish" : report.move < 0 ? "text-signal-bearish" : "text-oa-muted-fg"} ${index === 0 ? "font-semibold" : "opacity-80"}`}
        >
          {index === 0 && report === stock.past[0] ? <span className="mr-1.5 font-normal text-oa-muted-fg">{fmtDay(report.date, report.date.slice(0, 4) !== today.slice(0, 4))}</span> : null}
          {signedPct(report.move)}
        </span>
      ))}
    </span>
  );
}

function usualText(stock: SeasonStock): { main: string; sub: string[] } {
  const { stats } = stock;
  if (stats.usual === null) return { main: "No history yet", sub: [] };
  const only = stats.usualKind === "single" ? stock.past.find((report) => isNum(report.move))! : null;
  // The size of the sample stays with the number: "moved 5.3% on average" from two reports is not a habit.
  const main = only
    ? `${signedPct(only.move!)} ${only === stock.past[0] ? "last time" : `on ${fmtDay(only.date, true)}`}`
    : stats.usualKind === "median"
      ? `Usually moves ${stats.usual.toFixed(1)}%`
      : `Moved ${stats.usual.toFixed(1)}% on average`;
  const vs = stats.usualKind === "single" ? null : vsDayShort(stats.vsNormalDay);
  const over = stats.count > 1 ? `over ${stats.count} reports` : null;
  // One line each, so "1.6× a normal day" never breaks in the middle.
  const sub = [over, vs].filter((line): line is string => Boolean(line));
  return { main, sub };
}

/**
 * One report coming up, all in view: the day, the share, the estimate, the last result and the moves after past
 * reports. The row opens the stock's earnings page, which has every past report in full.
 */
function StockRow({ stock, today, result }: { stock: SeasonStock; today: string; result?: ResultSummary }) {
  const next = stock.next!;
  const usual = usualText(stock);
  const eps = fmtEps(next.epsEstimate);
  return (
    <li
      id={`report-${stock.ticker}`}
      className={`relative grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-oa-bg target:bg-oa-bg ${REPORT_COLS}`}
    >
      <span className="min-w-0 max-sm:order-1">
        <Ticker symbol={stock.ticker} name={stock.name} href={`/calendar/earnings/${encodeURIComponent(stock.ticker)}`} stretch size={20} />
      </span>
      {/* On a phone these three read as one line; from sm up they are columns. */}
      <span className="col-span-2 flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-5 text-oa-muted-fg max-sm:order-3 sm:contents">
        <span className="sm:block">
          <span className={`${NUM} font-medium text-oa-fg sm:block sm:text-[13.5px]`}>{dayLabel(next.date, today)}</span>
          <span className="sm:block sm:text-[12px] sm:leading-4"> {TIME_SHORT[next.session]}</span>
        </span>
        <span className={`${NUM} sm:text-right sm:text-[13.5px] ${stock.kind === "watching" ? "" : "sm:text-oa-fg"}`}>
          <span aria-hidden="true" className="sm:hidden">· </span>
          {stock.kind === "watching" ? "Watching" : stock.weight !== null ? <>{pctOf(stock.weight)}<span className="sm:hidden"> of portfolio</span></> : "Holding"}
        </span>
        <span className={`${NUM} sm:text-right sm:text-[13.5px] ${eps ? "sm:text-oa-fg" : ""}`}>
          <span aria-hidden="true" className="sm:hidden">· </span>
          {next.reported ? (next.result ? `Reported: ${RESULT_WORD[next.result].text.toLowerCase()}` : "Reported") : eps ? <><span className="sm:hidden">EPS est. </span>{eps}</> : <span className="text-oa-muted-fg">no estimate</span>}
        </span>
      </span>
      <span className="min-w-0 max-sm:order-4">
        <LastMoves stock={stock} today={today} />
        {result ? <ResultLine result={result} today={today} /> : <LastResult stock={stock} />}
      </span>
      <span className="text-right max-sm:order-5">
        <span className={`${NUM} block text-[13px] leading-4 ${usual.sub.length ? "text-oa-fg" : "text-oa-muted-fg"}`}>{usual.main}</span>
        {usual.sub.map((line) => (
          <span key={line} className="block whitespace-nowrap text-[11.5px] leading-4 text-oa-muted-fg">
            {line}
          </span>
        ))}
      </span>
    </li>
  );
}

const REPORT_COLS = "sm:grid-cols-[minmax(0,1.2fr)_7.5rem_5.5rem_5rem_minmax(10rem,1.4fr)_7.5rem] sm:gap-x-4";

function Reports({ season, results }: { season: Season; results: Readonly<Record<string, ResultSummary>> }) {
  const weeks = season.weeks.filter((week) => week.stocks.length > 0);
  return (
    <Panel
      label="Report by report"
      flush
    >
      <div className={`hidden border-b border-oa-border px-4 py-1.5 sm:grid ${REPORT_COLS}`}>
        <span className="oa-caption">Stock</span>
        <span className="oa-caption">Reports</span>
        <span className="oa-caption text-right">Share</span>
        <span className="oa-caption text-right">EPS est.</span>
        <span className="oa-caption">After the last 4 reports</span>
        <span className="oa-caption text-right">Usual move</span>
      </div>
      {weeks.map((week) => (
        <section key={week.start} aria-label={weekTitle(week, season.today)}>
          <div className="flex items-baseline justify-between gap-3 border-b border-oa-border bg-oa-bg px-4 py-1.5">
            <h3 className="text-[13px] font-medium leading-5 text-oa-fg">
              {weekLabel(week, season.today) ? (
                <>
                  {weekLabel(week, season.today)} <span className={`${NUM} font-normal text-oa-muted-fg`}>{weekWords(week.start, week.end)}</span>
                </>
              ) : (
                weekWords(week.start, week.end)
              )}
            </h3>
            {week.weight ? (
              <span className="shrink-0 text-[12.5px] text-oa-muted-fg">
                {pctOf(week.weight)} of the portfolio<span className="max-sm:hidden"> reports</span>
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-oa-border border-b border-oa-border last:border-b-0">
            {week.stocks.map((stock) => (
              <StockRow key={stock.ticker} stock={stock} today={season.today} result={results[stock.ticker]} />
            ))}
          </ul>
        </section>
      ))}
    </Panel>
  );
}

/* ── Everything else ───────────────────────────────────────────────────── */

function laterWords(stock: SeasonStock, to: string, allFunds: boolean): string | null {
  // A word, not a sentence repeated on each fund row; none at all when the heading already says "Funds" (owner rule 1).
  if (stock.fund) return allFunds ? null : "Fund";
  // No date yet: the heading says it once ("No report date yet", or "N without a date yet" beside a mixed list),
  // so the row shows only what differs, its weight (owner rule 1).
  if (!stock.next) return null;
  return `Reports ${fmtDay(stock.next.date, stock.next.date.slice(0, 4) !== to.slice(0, 4))}${stock.next.session !== "unknown" ? `, ${sessionWords(stock.next.session)}` : ""}`;
}

function Later({ season, results }: { season: Season; results: Readonly<Record<string, ResultSummary>> }) {
  if (season.later.length === 0) return null;
  const undated = season.later.filter((stock) => !stock.fund && !stock.next).length;
  const companies = season.later.filter((stock) => !stock.fund).length;
  const dated = companies - undated;
  // Say what the list is: reports after the window, stocks with no date yet, or both.
  const label =
    companies === 0 ? "Funds" : undated === 0 ? `Reporting after ${fmtDay(season.to)}` : dated === 0 ? "No report date yet" : `After ${fmtDay(season.to)}, or no date yet`;
  return (
    <Panel
      label={label}
      right={undated > 0 && dated > 0 ? `${undated} without a date yet` : null}
      flush
    >
      <ul className="grid grid-cols-1 md:grid-cols-2">
        {season.later.map((stock) => {
          const words = laterWords(stock, season.to, companies === 0);
          const share = stock.kind === "watching" ? "Watching" : stock.weight !== null ? `${pctOf(stock.weight)} of portfolio` : null;
          // A stock that just reported says what it reported (lib/results) under its name.
          const result = results[stock.ticker];
          return (
            <li key={stock.ticker} className="relative -mb-px flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2 md:odd:border-r">
              <span className="min-w-0">
                <Ticker symbol={stock.ticker} name={stock.name} size={18} stretch wrap className="min-w-0" />
                {result ? <ResultLine result={result} today={season.today} className="mt-0.5" /> : null}
              </span>
              <span className="shrink-0 text-right text-[12.5px] leading-4 text-oa-muted-fg">
                {words ? <span className="block">{words}</span> : null}
                {share ? <span className={`${NUM} block`}>{share}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The next step at the top: an agent that says when the one to watch is about to report. Opens the agent
 * box with the request filled in; nothing is saved until the person says so.
 */
function WatchNext({ season }: { season: Season }) {
  const watch = oneToWatch(season.reporting);
  const gap = watch?.next ? dayDiff(season.today, watch.next.date) : null;
  if (!watch || gap === null || gap < 2) return null;
  const days = Math.min(3, gap);
  const href = watchEarningsHref(watch.ticker, days);
  if (!href) return null;
  return (
    <p className="-mt-1 px-2 text-[13.5px] leading-5 sm:px-0">
      <Link href={href} className="font-medium text-oa-primary underline-offset-2 hover:underline">
        Tell me {days} days before {watch.name} reports →
      </Link>
    </p>
  );
}

export function SeasonView({
  season,
  source,
  missing,
  results = {},
}: {
  season: Season;
  /** The calendar's time and what the shares are of, said once in a quiet line under the reports. */
  source: string;
  missing: string[];
  /** Stocks that reported in the last ten days, by ticker (lib/results). */
  results?: Readonly<Record<string, ResultSummary>>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <WatchNext season={season} />
      {missing.length > 0 ? (
        <p className="px-2 text-[13px] leading-5 text-signal-bearish sm:px-0">
          We could not read the reports for {missing.slice(0, 5).join(", ")}
          {missing.length > 5 ? ` and ${missing.length - 5} more` : ""} just now. Try again in a minute.
        </p>
      ) : null}
      <Timeline season={season} />
      {season.reporting.length > 0 ? <Reports season={season} results={results} /> : null}
      <Later season={season} results={results} />
      {source ? <p className="px-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-0">{source}</p> : null}
    </div>
  );
}
