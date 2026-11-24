import * as React from "react";

import { SurprisePct, earningsHref, resultWord } from "@/components/calendar/calendar-view";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { Delta, Empty, NUM, Panel, SourceLine, StatStrip, StreamRow, Tag, ToneGlyph, Verdict, VsBar, fmtCompact, fmtDay, fmtMoney, type StatItem } from "@/components/oa/kit";
import type { EarningsDetail } from "@/lib/calendar";
import {
  SESSION_LABEL,
  dayDiff,
  fmtEps,
  reactionBasisLabel,
  relativeDay,
  summarizeReports,
  surprisePctOf,
  weekdayName,
  type EarningsItem,
} from "@/lib/calendar-shared";
import { fmtUsd } from "@/lib/earnings-day-shared";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { lastQuarterHasData } from "@/lib/seo/earnings-pages";
import { cleanEarningsProse, EPS_OUTCOME_LINES, STOCK_OUTCOME_LINES, type PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { sentenceOutcome, type ToneWord } from "@/lib/tone";
import { etTime, type WireItem } from "@/lib/wire-shared";
import Link from "next/link";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";

const COLUMNS: DataColumn[] = [
  { id: "date", label: "Report date" },
  { id: "period", label: "Quarter ending", hideOnMobile: true },
  { id: "when", label: "When", hideOnMobile: true },
  { id: "est", label: "EPS est", align: "right" },
  { id: "actual", label: "EPS actual", align: "right" },
  { id: "surprise", label: "Surprise", align: "right", hideOnMobile: true },
  { id: "move", label: "Stock move", align: "right", hint: "Close to close around the report. Two sessions when the report time was not given." },
];

function historyRows(events: EarningsItem[], today: string): DataRow[] {
  return [...events]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((item) => {
      const result = resultWord(item);
      return {
        key: item.id,
        sort: [item.date, item.fiscalEnding, item.session, item.epsEstimate, item.epsActual, item.surprisePct, item.reaction?.pct ?? null],
        cells: [
          <span key="d" className="flex items-center gap-2">
            <span className={`${NUM} text-oa-fg`}>{fmtDay(item.date, true)}</span>
            {item.epsActual === null && item.date >= today ? (
              item.estimated ? (
                <Tag className="inline-flex" caps={false}>
                  <span title={ESTIMATE_TITLE}>Estimated</span>
                </Tag>
              ) : (
                <Tag tone="primary" className="hidden sm:inline-flex">Upcoming</Tag>
              )
            ) : null}
          </span>,
          <span key="p" className={`${NUM} text-oa-muted-fg`}>
            {fmtDay(item.fiscalEnding, true)}
          </span>,
          <span key="w" className="text-[12.5px] text-oa-muted-fg">
            {item.session === "unknown" && item.date < today ? "Time not given" : SESSION_LABEL[item.session]}
          </span>,
          <span key="e" className={`${NUM} ${item.epsEstimate === null ? "text-oa-muted-fg" : "text-oa-fg"}`}>{fmtEps(item.epsEstimate) || "n/a"}</span>,
          item.epsActual !== null ? (
            <span key="a" className={`${NUM} inline-flex items-center justify-end gap-1.5 text-oa-fg`}>
              {/* The surprise column is hidden on phones, so the mark rides beside the figure there. */}
              {result && result.tone !== "flat" ? (
                <span className="inline-flex sm:hidden">
                  <span aria-hidden="true" className="inline-flex">
                    <ToneGlyph tone={result.tone} />
                  </span>
                  <span className="sr-only">{result.word}</span>
                </span>
              ) : null}
              {fmtEps(item.epsActual)}
            </span>
          ) : (
            <span key="a" className="text-[12.5px] text-oa-muted-fg">
              {item.date >= today ? "not yet" : "not recorded"}
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
            <span key="m" />
          ),
        ],
      };
    });
}

/** The hover title on an estimated date: where it comes from, kept off the page itself (owner rule 4). */
const ESTIMATE_TITLE = "Not announced yet. Our estimate from the days the company reported in past years.";

/** "after the market closes", or nothing when the time is not known. */
function sessionPhrase(item: EarningsItem): string {
  if (item.session === "unknown") return item.estimated ? "" : SESSION_LABEL.unknown.toLowerCase();
  return SESSION_LABEL[item.session].toLowerCase();
}

/** True when the last-quarter panel will show, so the strip does not say its figures again. */
function showsLastQuarter(detail: EarningsDetail): boolean {
  return lastQuarterHasData(detail.lastQuarter);
}

export function EarningsStats({ detail, today }: { detail: EarningsDetail; today: string }) {
  const summary = summarizeReports(detail.events, today);
  const stats: StatItem[] = [];
  const next = summary.next;
  stats.push(
    next
      ? {
          label: "Next report",
          value: (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {fmtDay(next.date)}
              {/* Said plainly on the date itself: announced by the company, or our estimate. */}
              {next.estimated ? (
                <Tag caps={false}>
                  <span title={ESTIMATE_TITLE}>Estimated</span>
                </Tag>
              ) : (
                <Tag tone="primary" caps={false}>
                  Confirmed
                </Tag>
              )}
            </span>
          ),
          sub: [`${weekdayName(next.date, true)}, ${relativeDay(next.date, today).toLowerCase()}`, sessionPhrase(next)].filter(Boolean).join(" · "),
        }
      : { label: "Next report", value: "No date yet", sub: "not announced yet", tone: "flat" },
  );
  if (next && next.epsEstimate !== null) {
    stats.push({ label: "EPS expected", value: fmtEps(next.epsEstimate), sub: `quarter ending ${fmtDay(next.fiscalEnding, true) || "not given"}` });
  }
  // The last report's figures live in the last-quarter panel when it shows; only an older one stays up here.
  if (summary.last && !showsLastQuarter(detail)) {
    const result = resultWord(summary.last);
    stats.push({
      label: "Last result",
      value: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {fmtEps(summary.last.epsActual)}
          {result ? <Verdict tone={result.tone}>{result.word}</Verdict> : null}
        </span>
      ),
      sub:
        summary.last.epsEstimate !== null
          ? // A non-breaking space keeps "Nov 2" together on phones.
            `vs ${fmtEps(summary.last.epsEstimate)} expected on ${fmtDay(summary.last.date).replace(" ", "\u00a0")}`
          : `reported ${fmtDay(summary.last.date).replace(" ", "\u00a0")}`,
    });
    if (summary.last.reaction) {
      stats.push({
        label: "Stock move on it",
        value: <Delta value={summary.last.reaction.pct} />,
        sub: summary.last.reaction.basis === "2d" ? "two sessions around the report" : "one session",
      });
    }
  }
  if (summary.avgAbsMove !== null && summary.moves >= 2) {
    stats.push({
      label: "Typical move",
      value: `±${summary.avgAbsMove.toFixed(1)}%`,
      sub: `average over ${summary.moves} reports`,
    });
  }
  if (detail.quote?.price != null) {
    stats.push({
      label: "Price",
      value: fmtMoney(detail.quote.price),
      sub: (
        <>
          <Delta value={detail.quote.dayPct} /> today{detail.quote.marketCap ? ` · ${fmtCompact(detail.quote.marketCap, "$")} cap` : ""}
        </>
      ),
    });
  }
  return <StatStrip stats={stats} className="mb-5" />;
}

/** "next session", "on the report day", "over two sessions": which close-to-close window the move covers. */
function moveWindow(item: EarningsItem): string {
  const reaction = item.reaction;
  if (!reaction) return "";
  if (reaction.basis === "2d") return "over two sessions";
  const session = item.session === "unknown" ? reaction.session ?? "unknown" : item.session;
  return session === "amc" ? "the next session" : "on the report day";
}

/**
 * What the last report said, from figures we hold: EPS against the estimate (with both on one scale), revenue when the
 * release was read, how the stock moved after it, and our call going in. The release itself is one link in the header.
 * Shown only when at least one figure is there (lib/seo/earnings-pages.ts lastQuarterHasData).
 */
export function LastQuarterPanel({ detail, today }: { detail: EarningsDetail; today: string }) {
  const last = detail.lastQuarter;
  if (!lastQuarterHasData(last)) return null;
  const item = last.item;
  const result = resultWord(item);
  const surprise = surprisePctOf(item);
  // Recent days in words, older ones as a date (owner rule 4).
  const ago = dayDiff(item.date, today) ?? 99;
  const when = ago === 0 ? "today" : ago === 1 ? "yesterday" : ago <= 6 ? `on ${weekdayName(item.date, true)}` : fmtDay(item.date);
  const cells: Array<{ label: string; value: React.ReactNode; line?: React.ReactNode }> = [];
  if (item.epsActual !== null) {
    cells.push({
      label: "EPS",
      value: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {result ? <Verdict tone={result.tone}>{result.word}</Verdict> : fmtEps(item.epsActual)}
          {result && surprise !== null && result.tone !== "flat" ? <span>{`${Math.abs(surprise).toFixed(1)}%`}</span> : null}
        </span>
      ),
      line:
        item.epsEstimate !== null ? (
          <VsBar value={item.epsActual} versus={item.epsEstimate} labels={["Reported", "Expected"]} format={(n) => fmtEps(n)} className="mt-1 max-w-[16rem]" />
        ) : (
          "no estimate to compare"
        ),
    });
  }
  if (last.revenue) {
    cells.push({
      label: "Revenue",
      value: fmtUsd(last.revenue.value).replace(" billion", "B").replace(" million", "M"),
      line: last.revenue.yoyPct !== null ? (
        <span>
          <Delta value={last.revenue.yoyPct} digits={1} /> from a year ago
        </span>
      ) : undefined,
    });
  }
  if (item.reaction) {
    cells.push({ label: "Stock after it", value: <Delta value={item.reaction.pct} />, line: <span title={`${reactionBasisLabel(item.reaction, item.session)}.`}>{moveWindow(item)}</span> });
  }
  if (detail.callAtReport) {
    cells.push({ label: "Our call going in", value: detail.callAtReport.word });
  }
  return (
    <Panel
      label="Last quarter"
      // When it was reported sits with the one link to the release, so the short label never gets cut on a phone.
      right={
        detail.releaseFiling ? (
          <a href={detail.releaseFiling.url} target="_blank" rel="noopener noreferrer" className="font-medium text-oa-primary hover:underline">
            {ago === 0 ? "Today's" : ago === 1 ? "Yesterday's" : ago <= 6 ? `${weekdayName(item.date, true)}'s` : fmtDay(item.date)} release on SEC
          </a>
        ) : (
          <span>Reported {when}</span>
        )
      }
      flush
      className="mb-5"
    >
      <dl className={`grid ${cells.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${cells.length >= 4 ? "lg:grid-cols-4" : cells.length === 3 ? "lg:grid-cols-3" : ""}`}>
        {cells.map((cell, index) => (
          // A third cell spans the row on a phone, so no tile sits beside an empty slot.
          <div
            key={cell.label}
            className={`-mb-px -mr-px min-w-0 border-b border-r border-oa-border px-4 py-3 ${cells.length === 3 && index === 2 ? "col-span-2 lg:col-span-1" : ""}`}
          >
            <dt className="oa-caption">{cell.label}</dt>
            <dd className={`${NUM} mt-1 text-[17px] font-medium leading-6 text-oa-fg`}>{cell.value}</dd>
            {cell.line ? <dd className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{cell.line}</dd> : null}
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function ReportHistory({ detail, today }: { detail: EarningsDetail; today: string }) {
  return (
    <Panel label="Past and upcoming reports" right={<span className={NUM}>{detail.events.length}</span>} flush>
      {detail.events.length ? (
        <DataTable columns={COLUMNS} rows={historyRows(detail.events, today)} initialSort={{ id: "date", dir: "desc" }} stickyHeader={false} pageSize={12} />
      ) : (
        <Empty title="No earnings dates yet">No report dates for {detail.ticker}, past or scheduled.</Empty>
      )}
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

export function PostEarningsRead({ read, latestReportDate }: { read: EarningsIntelDoc; latestReportDate: string | null }) {
  const report = read.report;
  const scenarios = (report.scenarios_30_90d ?? []).filter((scenario) => scenario?.thesis);
  const covered = read.event_date.slice(0, 10);
  const older = Boolean(latestReportDate && latestReportDate > covered);
  return (
    <Panel label="After the report" right={<span className="oa-mono text-[11.5px]">{fmtDay(read.event_date, true)} report</span>}>
      <div className="flex flex-col gap-4">
        {older ? (
          <p className="oa-surface border border-oa-border bg-oa-bg px-3 py-2 text-[13.5px] leading-5 text-oa-fg">
            This covers the {fmtDay(covered, true)} report. The {fmtDay(latestReportDate, true)} numbers are in the table above.
          </p>
        ) : null}
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
          <Prose label="How the stock reacted">{text(report.facts?.price_reaction)}</Prose>
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

export function TickerHeadlines({ ticker, items }: { ticker: string; items: WireItem[] }) {
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
      {items.length ? (
        items.map((item) => (
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
        ))
      ) : (
        <Empty className="!py-5">No headline in the last 14 days names {ticker}.</Empty>
      )}
    </Panel>
  );
}

export { earningsHref };
