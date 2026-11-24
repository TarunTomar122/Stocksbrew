import * as React from "react";

import { SurprisePct, earningsHref, resultWord } from "@/components/calendar/calendar-view";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { Delta, Empty, NUM, Panel, SourceLine, StreamRow, Tag, Verdict, fmtCompact, fmtDay, fmtMoney, toneText } from "@/components/oa/kit";
import type { EarningsDetail } from "@/lib/calendar";
import {
  SESSION_LABEL,
  dayDiff,
  fmtEps,
  reactionBasisLabel,
  relativeDay,
  summarizeReports,
  weekdayName,
  type EarningsItem,
} from "@/lib/calendar-shared";
import { fmtUsd } from "@/lib/earnings-day-shared";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { cleanEarningsProse, EPS_OUTCOME_LINES, STOCK_OUTCOME_LINES, type PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { sentenceOutcome, type ToneWord } from "@/lib/tone";
import { etTime, type WireItem } from "@/lib/wire-shared";
import Link from "next/link";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";

const COLUMNS: DataColumn[] = [
  { id: "date", label: "Report date" },
  { id: "period", label: "Quarter ending", hideOnMobile: true },
  { id: "when", label: "When", hideOnMobile: true },
  // Phones keep the date, the result and the move; the estimate rides in the result's mark and the hover title.
  { id: "est", label: "EPS est", align: "right", hideOnMobile: true },
  { id: "actual", label: "EPS actual", align: "right" },
  { id: "surprise", label: "Surprise", align: "right", hideOnMobile: true },
  {
    id: "move",
    label: "Day-one move",
    align: "right",
    hint: "Close to close over the first session that could react to the report. Marked 2d when the report time was not given and the move covers two sessions.",
  },
];

/** The report time in a few words, so the table fits its panel (the strip above says it in full). */
const SHORT_SESSION = { bmo: "Before the open", amc: "After the close" } as const;

/** The hover title on an estimated date: where it comes from, kept off the page itself (owner rule 4). */
const ESTIMATE_TITLE = "Not announced yet. Our estimate from the days the company reported in past years.";

/** The one word set for a report date still ahead, everywhere on the page and on phones too. */
export function DateStatus({ estimated }: { estimated: boolean }) {
  return estimated ? (
    <Tag caps={false}>
      <span title={ESTIMATE_TITLE}>Estimated</span>
    </Tag>
  ) : (
    <Tag tone="primary" caps={false}>
      Confirmed
    </Tag>
  );
}

function historyRows(events: EarningsItem[], today: string): DataRow[] {
  return [...events]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((item) => {
      const result = resultWord(item);
      const ahead = item.epsActual === null && item.date >= today;
      return {
        key: item.id,
        sort: [item.date, item.fiscalEnding, item.session, item.epsEstimate, item.epsActual, item.surprisePct, item.reaction?.pct ?? null],
        cells: [
          <span key="d" className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className={`${NUM} whitespace-nowrap ${item.estimated ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtDay(item.date, true)}</span>
            {ahead ? <DateStatus estimated={item.estimated === true} /> : null}
          </span>,
          <span key="p" className={`${NUM} text-oa-muted-fg`}>
            {fmtDay(item.fiscalEnding, true)}
          </span>,
          // An estimated day has no announced time: nothing is said about one.
          <span key="w" className="text-[12.5px] text-oa-muted-fg">
            {item.estimated ? "" : item.session === "unknown" ? (item.date < today ? "Not given" : "Not announced") : SHORT_SESSION[item.session]}
          </span>,
          <span key="e" className={`${NUM} ${item.epsEstimate === null ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtEps(item.epsEstimate) || "n/a"}</span>,
          item.epsActual !== null ? (
            <span
              key="a"
              title={item.epsEstimate !== null ? `${fmtEps(item.epsActual)} against ${fmtEps(item.epsEstimate)} expected` : undefined}
              className={`${NUM} inline-flex flex-col items-end gap-0.5 text-oa-fg sm:flex-row sm:items-center`}
            >
              {fmtEps(item.epsActual)}
              {/* The estimate and surprise columns are hidden on phones, so the estimate and the result ride under the figure there. */}
              {item.epsEstimate !== null ? (
                <span className="whitespace-nowrap text-[11.5px] text-oa-muted-fg sm:hidden">vs {fmtEps(item.epsEstimate)}</span>
              ) : null}
              {result ? (
                // The chip alone: with both figures above it the size is plain, and a percentage beside it pushed the move off a phone.
                <span className="inline-flex sm:hidden">
                  <Verdict tone={result.tone}>{result.word}</Verdict>
                </span>
              ) : null}
            </span>
          ) : (
            <span key="a" className="text-[12.5px] text-oa-muted-fg">
              {ahead ? "" : "not recorded"}
            </span>
          ),
          result || item.surprisePct !== null ? (
            <span key="s" className="inline-flex items-center justify-end gap-1.5">
              {result ? <Verdict tone={result.tone}>{result.word}</Verdict> : null}
              <SurprisePct item={item} />
            </span>
          ) : (
            <span key="s" />
          ),
          item.reaction ? (
            <span key="m" title={`${reactionBasisLabel(item.reaction, item.session)}.`} className="inline-flex items-baseline gap-1">
              <Delta value={item.reaction.pct} />
              {item.reaction.basis === "2d" ? <span className={`${NUM} text-[10.5px] text-oa-muted-fg`}>2d</span> : null}
            </span>
          ) : (
            <span key="m" className="text-[12.5px] text-oa-muted-fg">
              {ahead ? "" : "not measured"}
            </span>
          ),
        ],
      };
    });
}

type Figure = { label: string; value: React.ReactNode; line?: React.ReactNode };

const WIDE_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * Figures side by side, divided by hairlines: two to a row on a phone, all in one row from lg. An odd last figure spans
 * its phone row, so no tile sits beside an empty slot.
 */
function FigureGrid({ figures }: { figures: Figure[] }) {
  if (!figures.length) return null;
  const single = figures.length === 1;
  return (
    <dl className={`grid ${single ? "grid-cols-1" : "grid-cols-2"} ${WIDE_COLS[Math.min(figures.length, 5)]}`}>
      {figures.map((figure, index) => (
        <div
          key={figure.label}
          className={`-mb-px -mr-px min-w-0 border-b border-r border-oa-border px-4 py-3 ${!single && figures.length % 2 === 1 && index === figures.length - 1 ? "col-span-2 lg:col-span-1" : ""}`}
        >
          <dt className="oa-caption">{figure.label}</dt>
          <dd className={`${NUM} mt-1 text-[17px] font-medium leading-6 text-oa-fg`}>{figure.value}</dd>
          {figure.line ? <dd className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{figure.line}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** "in 92 days", "tomorrow", "today". */
function inDays(day: string, today: string): string {
  return relativeDay(day, today).toLowerCase();
}

/**
 * The head of the page: the next report first, said as Confirmed or Estimated. An announced date carries its weekday
 * and time; an estimate only how far off it is. Then the estimate for that report, the usual move and the price.
 * Past results live in the table below, never here.
 */
export function EarningsStats({ detail, today }: { detail: EarningsDetail; today: string }) {
  const summary = summarizeReports(detail.events, today);
  const next = summary.next;
  const figures: Figure[] = [];
  if (next) {
    const when = next.estimated
      ? inDays(next.date, today)
      : [`${weekdayName(next.date, true)}, ${inDays(next.date, today)}`, next.session === "unknown" ? "" : SESSION_LABEL[next.session].toLowerCase()]
          .filter(Boolean)
          .join(" · ");
    figures.push({
      label: "Next report",
      value: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {fmtDay(next.date)}
          <DateStatus estimated={next.estimated === true} />
        </span>
      ),
      line: when,
    });
  } else {
    figures.push({ label: "Next report", value: <span className="text-oa-muted-fg">Not announced</span> });
  }
  if (next && next.epsEstimate !== null) {
    figures.push({ label: "EPS expected", value: fmtEps(next.epsEstimate), line: next.fiscalEnding ? `quarter ending ${fmtDay(next.fiscalEnding, true)}` : undefined });
  }
  if (summary.avgAbsMove !== null && summary.moves >= 2) {
    figures.push({ label: "Typical day-one move", value: `±${summary.avgAbsMove.toFixed(1)}%`, line: `average over ${summary.moves} reports` });
  }
  if (detail.quote?.price != null) {
    figures.push({
      label: "Price",
      value: fmtMoney(detail.quote.price),
      line: (
        <>
          <Delta value={detail.quote.dayPct} /> today{detail.quote.marketCap ? ` · ${fmtCompact(detail.quote.marketCap, "$")} cap` : ""}
        </>
      ),
    });
  }
  return (
    <div className="oa-surface mb-5 overflow-hidden border border-oa-border bg-oa-card">
      <FigureGrid figures={figures} />
    </div>
  );
}

/** "today", "yesterday", "on Monday" within the week, else "Nov 17" (owner rule 4). */
function dayWords(day: string, today: string): string {
  const ago = dayDiff(day, today) ?? 99;
  return ago === 0 ? "today" : ago === 1 ? "yesterday" : ago <= 6 ? `on ${weekdayName(day, true)}` : fmtDay(day);
}

/** "Nov 17 release on SEC", "Monday's release on SEC". */
function releaseWords(day: string, today: string): string {
  const ago = dayDiff(day, today) ?? 99;
  const when = ago === 0 ? "Today's" : ago === 1 ? "Yesterday's" : ago <= 6 ? `${weekdayName(day, true)}'s` : fmtDay(day);
  return `${when} release on SEC`;
}

function SecLink({ day, url, today }: { day: string; url: string; today: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-oa-primary hover:underline">
      {/* A phone keeps the panel title whole: the short form there, the day from sm up. */}
      <span className="sm:hidden">8-K on SEC</span>
      <span className="max-sm:hidden">{releaseWords(day, today)}</span>
    </a>
  );
}

/**
 * What the latest report adds to the table: its revenue, when the release was read, and our call going in. EPS and the
 * move are in the table, so they are not said again here. When the table missed the report (we only have the 8-K), the
 * panel says so and links it. Not shown when it would hold nothing.
 */
export function LastQuarterPanel({ detail, today }: { detail: EarningsDetail; today: string }) {
  const latest = detail.latestReport;
  if (!latest) return null;
  const figures: Figure[] = [];
  if (detail.latestRevenue) {
    figures.push({
      label: "Revenue",
      value: fmtUsd(detail.latestRevenue.value).replace(" billion", "B").replace(" million", "M"),
      line:
        detail.latestRevenue.yoyPct !== null ? (
          <span>
            <Delta value={detail.latestRevenue.yoyPct} digits={1} /> from a year ago
          </span>
        ) : undefined,
    });
  }
  if (detail.callAtReport) figures.push({ label: "Our call going in", value: detail.callAtReport.word });
  if (latest.inTable && !figures.length) return null;
  return (
    <Panel
      label={latest.inTable ? `Last quarter, reported ${dayWords(latest.date, today)}` : "Last quarter"}
      right={!latest.inTable && latest.filingUrl ? <SecLink day={latest.date} url={latest.filingUrl} today={today} /> : null}
      flush
      className="mb-5"
    >
      {!latest.inTable ? (
        <p className="border-b border-oa-border px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">
          We have the filing but not its EPS or the stock&apos;s move.
        </p>
      ) : null}
      <FigureGrid figures={figures} />
    </Panel>
  );
}

export function ReportHistory({ detail, today }: { detail: EarningsDetail; today: string }) {
  const latest = detail.latestReport;
  // The release of the newest report the table holds, linked once in the header.
  const filing = latest?.inTable && latest.filingUrl ? { date: latest.date, url: latest.filingUrl } : detail.tableReportFiling;
  return (
    <Panel label="Past and upcoming reports" right={filing ? <SecLink day={filing.date} url={filing.url} today={today} /> : null} flush>
      <DataTable columns={COLUMNS} rows={historyRows(detail.events, today)} initialSort={{ id: "date", dir: "desc" }} stickyHeader={false} pageSize={12} />
    </Panel>
  );
}

function Prose({ label, verdict = null, children }: { label: string; verdict?: ToneWord | null; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="oa-caption">{label}</h3>
        {/* Which way the sentence below points, so a reader knows before reading it. */}
        {verdict ? <Verdict tone={verdict.tone}>{verdict.word}</Verdict> : null}
      </div>
      <div className="text-pretty text-[14.5px] leading-6 text-oa-fg">{children}</div>
    </div>
  );
}

function Bullets({ items }: { items: string[] | undefined }) {
  const clean = (items ?? []).map((item) => cleanEarningsProse(String(item))).filter(Boolean);
  if (!clean.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {clean.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-oa-muted-fg" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function text(value: string | undefined): string {
  return value ? cleanEarningsProse(value) : "";
}

/**
 * The read we wrote before a report. `read` is null for people without access
 * (the page never receives the text for them); `exists` says one is stored.
 */
export function PreEarningsRead({
  read,
  exists,
  forDate,
}: {
  read: PreEarningsIntelDoc | null;
  exists: boolean;
  forDate: string | null;
}) {
  const label = "Pre-earnings read";
  if (!exists) {
    return (
      <Panel label="Pre-earnings read">
        <Empty title="No pre-earnings read for this report" className="!py-4">
          None for this company right now.
        </Empty>
      </Panel>
    );
  }
  if (!read) {
    return (
      <Panel label={label}>
        {/* The pre-earnings read comes with covering a stock. The text is not sent to this viewer. */}
        <p className="text-[14.5px] leading-6 text-oa-fg">
          We have a note ready for the {fmtDay(forDate, true)} report: what we expect it to earn per share, how the stock may react and what to
          watch. It is part of the full report, which a free account gets on {FREE_COVERED_WORD} stocks you pick and Pro gets on every stock.{" "}
          <Link prefetch={false} href="/pricing" className="font-medium text-oa-primary hover:underline">
            See both plans
          </Link>
        </p>
      </Panel>
    );
  }
  const report = read.report;
  const eps = report.call?.eps_outlook;
  const move = report.call?.post_print_move;
  return (
    <Panel label={label} right={<span className="oa-mono text-[11.5px]">for {fmtDay(read.event_date, true)}</span>}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-balance text-[18px] font-medium leading-6 text-oa-fg">{text(report.headline)}</p>
          <p className="mt-1.5 text-pretty text-[14.5px] leading-6 text-oa-muted-fg">{text(report.summary)}</p>
        </div>
        {eps || move ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {eps ? (
              <div className="oa-surface border border-oa-border bg-oa-bg px-3 py-2.5">
                <p className="oa-caption">Earnings</p>
                <p className="mt-0.5 text-[14.5px] text-oa-fg">{EPS_OUTCOME_LINES[eps]}</p>
              </div>
            ) : null}
            {move ? (
              <div className="oa-surface border border-oa-border bg-oa-bg px-3 py-2.5">
                <p className="oa-caption">Stock after the report</p>
                <p className="mt-0.5 text-[14.5px] text-oa-fg">{STOCK_OUTCOME_LINES[move]}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <Prose label="What the estimates assume">{text(report.setup?.consensus_context)}</Prose>
        <Prose label="How the stock is set up">{text(report.setup?.pre_earnings_positioning)}</Prose>
        <div className="grid gap-4 sm:grid-cols-2">
          <Prose label="What would go right">{report.setup?.key_bull_case?.length ? <Bullets items={report.setup.key_bull_case} /> : null}</Prose>
          <Prose label="What would go wrong">{report.setup?.key_bear_case?.length ? <Bullets items={report.setup.key_bear_case} /> : null}</Prose>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Prose label="If you hold it">{text(report.decision_guide?.for_holders)}</Prose>
          <Prose label="If you are watching">{text(report.decision_guide?.for_watchers)}</Prose>
        </div>
        <Prose label="What to watch in the report">
          {report.decision_guide?.key_monitor_list?.length ? <Bullets items={report.decision_guide.key_monitor_list} /> : null}
        </Prose>
        <Prose label="What would prove this wrong">{report.invalidators?.length ? <Bullets items={report.invalidators} /> : null}</Prose>
        <SourceLine
          note={
            typeof report.confidence?.score_0_100 === "number"
              ? `Confidence ${Math.round(report.confidence.score_0_100)} of 100. An opinion, not a forecast.`
              : "An opinion, not a forecast."
          }
        />
      </div>
    </Panel>
  );
}

const CASE_LABEL = { bull: "Better case", base: "Base case", bear: "Worse case" } as const;

/** The write-up of the latest report. The page shows it only when it is about that report (no "this covers an older one" note). */
export function PostEarningsRead({ read }: { read: EarningsIntelDoc }) {
  const report = read.report;
  const scenarios = (report.scenarios_30_90d ?? []).filter((scenario) => scenario?.thesis);
  return (
    <Panel label="After the report" right={<span className="oa-mono text-[11.5px]">{fmtDay(read.event_date, true)} report</span>}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-balance text-[18px] font-medium leading-6 text-oa-fg">{text(report.headline)}</p>
          <p className="mt-1.5 text-pretty text-[14.5px] leading-6 text-oa-muted-fg">{text(report.summary)}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Prose label="Reported against expected" verdict={sentenceOutcome(text(report.facts?.reported_vs_expected), "results")}>
            {text(report.facts?.reported_vs_expected)}
          </Prose>
          <Prose label="Guidance" verdict={sentenceOutcome(text(report.facts?.guidance_signal), "guidance")}>
            {text(report.facts?.guidance_signal)}
          </Prose>
          <Prose label="What changed">{text(report.interpretation?.what_changed)}</Prose>
          <Prose label="What the price now assumes">{text(report.interpretation?.what_market_is_pricing)}</Prose>
          <Prose label="What it means for the business">{text(report.interpretation?.fundamental_implication)}</Prose>
        </div>
        {scenarios.length ? (
          <div>
            <h3 className="oa-caption mb-1.5">The next one to three months, as we saw it then</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {scenarios.map((scenario) => (
                <div key={scenario.case} className="oa-surface border border-oa-border bg-oa-bg px-3 py-2.5">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-medium text-oa-fg">{CASE_LABEL[scenario.case] ?? scenario.case}</span>
                    {Number.isFinite(scenario.probability_pct) ? (
                      <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{Math.round(scenario.probability_pct)}%</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">{text(scenario.thesis)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Prose label="If you hold it">{text(report.decision_guide?.for_holders)}</Prose>
          <Prose label="If you are watching">{text(report.decision_guide?.for_watchers)}</Prose>
        </div>
        {scenarios.length ? <SourceLine note="Scenario odds are a judgement, not measured." /> : null}
      </div>
    </Panel>
  );
}

/**
 * The stock's latest headlines across the page's width (two columns from lg), under the write-up rather than in a rail
 * that ended far above it. Not shown at all when none names the stock.
 */
export function TickerHeadlines({ ticker, items }: { ticker: string; items: WireItem[] }) {
  if (!items.length) return null;
  // An even count, so the two columns end level.
  const shown = items.length > 1 && items.length % 2 === 1 ? items.slice(0, -1) : items;
  return (
    <Panel
      label="Latest headlines"
      right={
        <Link prefetch={false} href={`/news?ticker=${encodeURIComponent(ticker)}`} className="text-oa-primary hover:underline">
          All on the wire
        </Link>
      }
      flush
    >
      <div className="grid lg:grid-cols-2">
        {shown.map((item) => (
          <StreamRow
            key={item.id}
            time={
              <span className="flex flex-col leading-4">
                <span>{fmtDay(item.publishedAt.slice(0, 10))}</span>
                <span>{etTime(item.publishedAt)}</span>
              </span>
            }
            title={item.title}
            href={item.url}
            external
            meta={<span className="oa-mono">{item.source}</span>}
          />
        ))}
      </div>
    </Panel>
  );
}

export { earningsHref };
