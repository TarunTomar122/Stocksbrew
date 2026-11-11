import Link from "next/link";
import * as React from "react";

import { NUM, Panel, Ticker, fmtDay } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { OpenOnHash } from "@/components/earnings-season/open-on-hash";
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
import type { TheRead as TheReadData } from "@/lib/insights";
import { isNum, signedPct, weekdayOf } from "@/lib/read-format";

/**
 * /portfolio/earnings: the read on top, then the six weeks as a strip with
 * each stock on its report day (sized by its share of the portfolio), then
 * every report week by week. A row opens to the stock's past reports.
 */

const HOLDING_FILL = "bg-[color-mix(in_srgb,var(--oa-primary)_78%,transparent)]";
const BAND_FILL = "bg-[color-mix(in_srgb,var(--oa-muted-fg)_18%,transparent)]";
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

/** A tidy, shared scale for the move strips, so a 4% move is the same width on every row. */
function stripScale(stocks: SeasonStock[]): number {
  let top = 0;
  for (const stock of stocks) {
    for (const report of stock.past) if (isNum(report.move)) top = Math.max(top, Math.abs(report.move));
    if (isNum(stock.typicalDayPct)) top = Math.max(top, stock.typicalDayPct);
  }
  const step = top > 20 ? 10 : top > 10 ? 5 : 2;
  return Math.max(4, Math.ceil(top / step) * step);
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

function dotTone(move: number): string {
  return move > 0 ? "bg-signal-bullish" : move < 0 ? "bg-signal-bearish" : "bg-oa-muted-fg";
}

/** The move after each past report as a dot around zero, over a band the size of a normal day. */
function MoveStrip({ stock, scale }: { stock: SeasonStock; scale: number }) {
  const moves = stock.past.filter((report): report is PastReport & { move: number } => isNum(report.move));
  if (moves.length === 0) return <span className="block text-[12.5px] leading-5 text-oa-muted-fg">No past moves on record</span>;
  const at = (value: number) => 50 + (Math.max(-scale, Math.min(scale, value)) / scale) * 50;
  const band = isNum(stock.typicalDayPct) && stock.typicalDayPct > 0 ? Math.min(50, (stock.typicalDayPct / scale) * 50) : null;
  const label = `Moves after past reports: ${moves.map((report) => `${signedPct(report.move)} on ${fmtDay(report.date, true)}`).join(", ")}${isNum(stock.typicalDayPct) ? `. A normal day is about ${stock.typicalDayPct.toFixed(1)}%.` : ""}`;
  return (
    <span role="img" aria-label={label} className="relative block h-5 w-full">
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-oa-border" />
      {band !== null ? <span aria-hidden="true" className={`absolute inset-y-[3px] rounded-[2px] ${BAND_FILL}`} style={{ left: `${50 - band}%`, width: `${band * 2}%` }} /> : null}
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-oa-muted-fg" />
      {/* Oldest first, so the latest report's dot is drawn on top. */}
      {[...moves].reverse().map((report, index) => (
        <span
          key={report.date}
          aria-hidden="true"
          title={`${signedPct(report.move)} after the ${fmtDay(report.date, true)} report`}
          className={`absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full ring-[1.5px] ring-oa-card ${dotTone(report.move)} ${index === moves.length - 1 ? "size-3" : "size-2.5 opacity-80"}`}
          style={{ left: `${at(report.move)}%` }}
        />
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

function moveCell(report: PastReport): React.ReactNode {
  if (!isNum(report.move)) return <span className="text-oa-muted-fg">n/a</span>;
  const tone = report.move > 0 ? "text-signal-bullish" : report.move < 0 ? "text-signal-bearish" : "text-oa-muted-fg";
  return (
    <span className={tone}>
      {signedPct(report.move)}
      {report.basis === "2d" ? <span className="block text-[11.5px] leading-4 text-oa-muted-fg">over two days</span> : null}
    </span>
  );
}

const RESULT_WORD: Record<NonNullable<PastReport["result"]>, { text: string; tone: string }> = {
  beat: { text: "Beat", tone: "text-signal-bullish" },
  miss: { text: "Missed", tone: "text-signal-bearish" },
  "in-line": { text: "In line", tone: "text-oa-fg" },
};

function PastTable({ stock, today }: { stock: SeasonStock; today: string }) {
  if (stock.past.length === 0) {
    return <p className="text-[14px] leading-5 text-oa-muted-fg">We have no past reports for {stock.name} on record yet, so there is nothing to compare this one with.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[19rem] border-collapse text-[13.5px]">
        <thead>
          <tr className="text-left">
            <th scope="col" className="oa-caption pb-1.5 pr-3 font-normal">Report</th>
            <th scope="col" className="oa-caption pb-1.5 pr-3 text-right font-normal">EPS est.</th>
            <th scope="col" className="oa-caption pb-1.5 pr-3 text-right font-normal">Actual</th>
            <th scope="col" className="oa-caption pb-1.5 pr-3 font-normal">Result</th>
            <th scope="col" className="oa-caption pb-1.5 text-right font-normal">Stock after</th>
          </tr>
        </thead>
        <tbody>
          {stock.past.map((report) => (
            <tr key={report.date} className="border-t border-oa-border align-top">
              <td className="py-1.5 pr-3">
                <span className={`${NUM} block whitespace-nowrap text-oa-fg`}>{fmtDay(report.date, report.date.slice(0, 4) !== today.slice(0, 4))}</span>
                <span className="block text-[11.5px] leading-4 text-oa-muted-fg">{report.session === "unknown" ? "time not on record" : TIME_SHORT[report.session]}</span>
              </td>
              <td className={`${NUM} py-1.5 pr-3 text-right ${report.epsEstimate === null ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtEps(report.epsEstimate) || "n/a"}</td>
              <td className={`${NUM} py-1.5 pr-3 text-right ${report.epsActual === null ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtEps(report.epsActual) || "n/a"}</td>
              <td className="py-1.5 pr-3">
                {report.result ? (
                  <span className={RESULT_WORD[report.result].tone}>
                    {RESULT_WORD[report.result].text}
                    {isNum(report.surprisePct) && report.result !== "in-line" ? <span className={`${NUM} ml-1 text-[12px] text-oa-muted-fg`}>{signedPct(report.surprisePct)}</span> : null}
                  </span>
                ) : (
                  <span className="text-oa-muted-fg">{report.from === "filing" ? "No figures on record" : "No result on record"}</span>
                )}
              </td>
              <td className={`${NUM} py-1.5 text-right`}>{moveCell(report)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockRow({ stock, scale, today }: { stock: SeasonStock; scale: number; today: string }) {
  const next = stock.next!;
  const usual = usualText(stock);
  const eps = fmtEps(next.epsEstimate);
  return (
    <li id={`report-${stock.ticker}`} className="scroll-mt-24">
      <details className="group/row">
        <summary
          className="relative grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-oa-bg focus-visible:bg-oa-bg focus-visible:outline-none sm:grid-cols-[minmax(0,1.2fr)_7.5rem_5.5rem_5rem_minmax(9rem,1.4fr)_7.5rem_1rem] sm:gap-x-4 [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 max-sm:order-1">
            <Ticker symbol={stock.ticker} name={stock.name} href={null} size={20} wrap />
          </span>
          <span aria-hidden="true" className="text-oa-muted-fg transition-transform group-open/row:rotate-90 max-sm:absolute max-sm:right-4 max-sm:top-3 sm:col-start-7 sm:row-start-1">
            ›
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
            <MoveStrip stock={stock} scale={scale} />
          </span>
          <span className="text-right max-sm:order-5">
            <span className={`${NUM} block text-[13px] leading-4 ${usual.sub.length ? "text-oa-fg" : "text-oa-muted-fg"}`}>{usual.main}</span>
            {usual.sub.map((line) => (
              <span key={line} className="block whitespace-nowrap text-[11.5px] leading-4 text-oa-muted-fg">
                {line}
              </span>
            ))}
          </span>
        </summary>
        <div className="border-t border-oa-border bg-oa-bg px-4 pb-3 pt-2.5">
          <PastTable stock={stock} today={today} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-5">
            {isNum(stock.typicalDayPct) ? (
              <span className="text-oa-muted-fg">
                A normal day for {stock.name} is a <span className={`${NUM} text-oa-fg`}>{stock.typicalDayPct.toFixed(1)}%</span> move.
              </span>
            ) : null}
            <Link href={`/calendar/earnings/${encodeURIComponent(stock.ticker)}`} prefetch={false} className="font-medium text-oa-primary hover:underline">
              All of {stock.name}&apos;s reports →
            </Link>
            <Link href={`/stock/${encodeURIComponent(stock.ticker)}`} prefetch={false} className="font-medium text-oa-primary hover:underline">
              {stock.ticker} stock page →
            </Link>
          </div>
        </div>
      </details>
    </li>
  );
}

function Reports({ season }: { season: Season }) {
  const scale = stripScale(season.reporting);
  const weeks = season.weeks.filter((week) => week.stocks.length > 0);
  return (
    <Panel
      label="Report by report"
      flush
      right={
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-signal-bullish" />
            <span aria-hidden="true" className="-ml-1 inline-block size-2 rounded-full bg-signal-bearish" />
            past moves
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-2.5 w-4 rounded-[2px] ${BAND_FILL}`} />
            normal day
          </span>
        </span>
      }
    >
      <div className="hidden grid-cols-[minmax(0,1.2fr)_7.5rem_5.5rem_5rem_minmax(9rem,1.4fr)_7.5rem_1rem] gap-x-4 border-b border-oa-border px-4 py-1.5 sm:grid">
        <span className="oa-caption">Stock</span>
        <span className="oa-caption">Reports</span>
        <span className="oa-caption text-right">Share</span>
        <span className="oa-caption text-right">EPS est.</span>
        <span className="oa-caption flex justify-between">
          <span>−{scale}%</span>
          <span>After past reports</span>
          <span>+{scale}%</span>
        </span>
        <span className="oa-caption text-right">Usual move</span>
        <span />
      </div>
      <p className="oa-caption border-b border-oa-border px-4 py-1.5 sm:hidden">
        Dots run from −{scale}% to +{scale}%. Tap a stock for its past reports.
      </p>
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
              <StockRow key={stock.ticker} stock={stock} scale={scale} today={season.today} />
            ))}
          </ul>
        </section>
      ))}
    </Panel>
  );
}

/* ── Everything else ───────────────────────────────────────────────────── */

function laterWords(stock: SeasonStock, to: string): string | null {
  if (stock.fund) return "Fund, no earnings of its own";
  // Unknown is not "not reporting": the company has not set a date we hold yet.
  if (!stock.next) return "No report date yet";
  return `Reports ${fmtDay(stock.next.date, stock.next.date.slice(0, 4) !== to.slice(0, 4))}${stock.next.session !== "unknown" ? `, ${sessionWords(stock.next.session)}` : ""}`;
}

function Later({ season }: { season: Season }) {
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
          const words = laterWords(stock, season.to);
          const share = stock.kind === "watching" ? "Watching" : stock.weight !== null ? `${pctOf(stock.weight)} of portfolio` : null;
          return (
            <li key={stock.ticker} className="relative -mb-px flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2 md:odd:border-r">
              <Ticker symbol={stock.ticker} name={stock.name} size={18} stretch wrap className="min-w-0" />
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
 * The next step beside the read: an agent that says when the one to watch is about to report. Opens the agent
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
  read,
  example,
  source,
  missing,
}: {
  season: Season;
  read: TheReadData | null;
  example: boolean;
  source: string;
  missing: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <TheRead read={read ? { ...read, source } : null} label={example ? "The example's earnings season" : "Your earnings season"} />
      <WatchNext season={season} />
      {missing.length > 0 ? (
        <p className="px-2 text-[13px] leading-5 text-signal-bearish sm:px-0">
          We could not read the reports for {missing.slice(0, 5).join(", ")}
          {missing.length > 5 ? ` and ${missing.length - 5} more` : ""} just now. Try again in a minute.
        </p>
      ) : null}
      <Timeline season={season} />
      {season.reporting.length > 0 ? <Reports season={season} /> : null}
      <OpenOnHash prefix="report-" />
      <Later season={season} />
    </div>
  );
}
