import * as React from "react";

import { SurprisePct, earningsHref, resultWord } from "@/components/calendar/calendar-view";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { Delta, Empty, NUM, Panel, SourceLine, StatStrip, StreamRow, Tag, ToneGlyph, Verdict, fmtCompact, fmtDay, fmtMoney, type StatItem } from "@/components/oa/kit";
import type { EarningsDetail } from "@/lib/calendar";
import {
  SESSION_LABEL,
  fmtEps,
  reactionBasisLabel,
  relativeDay,
  summarizeReports,
  weekdayName,
  type EarningsItem,
} from "@/lib/calendar-shared";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { cleanEarningsProse, EPS_OUTCOME_LINES, STOCK_OUTCOME_LINES, type PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { sentenceOutcome, type ToneWord } from "@/lib/tone";
import { etTime, type WireItem } from "@/lib/wire-shared";

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
            {item.epsActual === null && item.date >= today ? <Tag tone="primary" className="hidden sm:inline-flex">Upcoming</Tag> : null}
          </span>,
          <span key="p" className={`${NUM} text-oa-muted-fg`}>
            {fmtDay(item.fiscalEnding, true)}
          </span>,
          <span key="w" className="text-[12.5px] text-oa-muted-fg">
            {SESSION_LABEL[item.session]}
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

export function EarningsStats({ detail, today }: { detail: EarningsDetail; today: string }) {
  const summary = summarizeReports(detail.events, today);
  const stats: StatItem[] = [];
  stats.push(
    summary.next
      ? {
          label: "Next report",
          value: fmtDay(summary.next.date),
          sub: `${weekdayName(summary.next.date, true)}, ${relativeDay(summary.next.date, today).toLowerCase()} · ${SESSION_LABEL[summary.next.session].toLowerCase()}`,
        }
      : { label: "Next report", value: "No date yet", sub: "none in the next 8 weeks", tone: "flat" },
  );
  if (summary.next && summary.next.epsEstimate !== null) {
    stats.push({ label: "EPS expected", value: fmtEps(summary.next.epsEstimate), sub: `quarter ending ${fmtDay(summary.next.fiscalEnding, true) || "not given"}` });
  }
  if (summary.last) {
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
          A read is on file for the {fmtDay(forDate, true)} report: what we expect for EPS, how the stock may react and what to watch. It
          comes with covering the stock: a free account tracks as many stocks as you like and covers five in full, Pro covers everything.{" "}
          <a href="/pricing" className="font-medium text-oa-primary hover:underline">
            See both plans
          </a>
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
        <a href={`/news?ticker=${encodeURIComponent(ticker)}`} className="text-oa-primary hover:underline">
          All on the wire
        </a>
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
