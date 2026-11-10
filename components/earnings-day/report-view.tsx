import * as React from "react";

import { EpsBars, ReactionStrip } from "@/components/earnings-day/charts";
import { TheRead } from "@/components/oa/insight";
import {
  CardGrid,
  NUM,
  Panel,
  Tag,
  fmtDay,
  fmtStampET,
} from "@/components/oa/kit";
import {
  fmtEps,
  fmtRange,
  fmtSignedPct,
  fmtUsd,
  guidanceWord,
  reactionWhen,
  toneOfGuidance,
  toneOfVerdict,
  verdictWord,
  type EarningsDayReport,
} from "@/lib/earnings-day-shared";
import type { TheRead as TheReadData } from "@/lib/insights";

/**
 * The earnings day report: the read on top (what happened against what was
 * expected, the outlook, the stock's move), then the evidence: the numbers
 * next to their source, the outlook table, what management said, what to
 * watch. Every missing piece says so in a sentence instead of showing a zero.
 */

function SourceLink({
  href,
  children,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
}) {
  if (!href) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg"
    >
      {children}
    </a>
  );
}

function tagTone(tone: "up" | "down" | "flat"): "up" | "down" | "neutral" {
  return tone === "flat" ? "neutral" : tone;
}

function Missing({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-pretty text-[14px] leading-5 text-oa-muted-fg ${className}`}>
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "up" | "down" | "flat";
}) {
  const color =
    tone === "up"
      ? "text-signal-bullish"
      : tone === "down"
        ? "text-signal-bearish"
        : "text-oa-fg";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-oa-border py-2 last:border-b-0">
      <dt className="min-w-0 text-[14px] leading-5 text-oa-fg">{label}</dt>
      <dd className="shrink-0 text-right">
        <span className={`${NUM} text-[15px] font-medium ${color}`}>
          {value}
        </span>
        {sub ? (
          <span className={`${NUM} ml-2 text-[12.5px] text-oa-muted-fg`}>
            {sub}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function reportRead(report: EarningsDayReport): TheReadData {
  const read = report.read;
  return {
    headline: read?.headline ?? "",
    insights: (read?.insights ?? []).slice(0, 4).map((insight) => ({
      id: insight.id,
      tone: insight.tone,
      text: insight.text,
      soWhat: insight.so_what ?? undefined,
    })),
    source: report.filing
      ? `From the ${report.filing.form} ${report.company} filed with the SEC`
      : "From the earnings calendar; the release is not on SEC EDGAR yet",
    asOf: report.updated_at ?? null,
  };
}

function ExpectationsPanel({ report }: { report: EarningsDayReport }) {
  const eps = report.eps;
  const revenue = report.revenue;
  const verdict = eps?.verdict;
  const releaseUrl = report.filing?.url;
  const lines = [revenue?.quote, eps?.gaap?.quote, eps?.adjusted?.quote].filter(
    (line, index, all): line is string =>
      Boolean(line) && all.indexOf(line) === index,
  );
  return (
    <Panel
      fill
      label="Against expectations"
      right={
        verdict && verdict !== "no_estimate" ? (
          <Tag tone={tagTone(toneOfVerdict(verdict))}>
            {verdictWord(verdict)}
          </Tag>
        ) : null
      }
    >
      {eps && eps.estimate != null && eps.actual != null ? (
        <>
          <p className="mb-3 text-pretty text-[14.5px] leading-[22px] text-oa-fg">
            EPS came in at <span className={NUM}>{fmtEps(eps.actual)}</span>{" "}
            against <span className={NUM}>{fmtEps(eps.estimate)}</span> expected
            {eps.surprise_pct != null ? (
              <>
                ,{" "}
                <span
                  className={`${NUM} ${verdict === "beat" ? "text-signal-bullish" : verdict === "miss" ? "text-signal-bearish" : ""}`}
                >
                  {fmtSignedPct(eps.surprise_pct)}
                </span>
              </>
            ) : eps.surprise != null ? (
              <>
                ,{" "}
                <span className={NUM}>
                  {eps.surprise >= 0 ? "+" : "−"}$
                  {Math.abs(eps.surprise).toFixed(2)}
                </span>{" "}
                a share
              </>
            ) : null}
            .
          </p>
          <EpsBars
            estimate={eps.estimate}
            actual={eps.actual}
            tone={toneOfVerdict(verdict)}
          />
          <p className="mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
            Estimate and actual:{" "}
            <SourceLink href={eps.source_url}>
              {eps.actual_source ?? eps.estimate_source}
            </SourceLink>
          </p>
        </>
      ) : eps && eps.estimate != null ? (
        <Missing>
          Analysts expected <span className={NUM}>{fmtEps(eps.estimate)}</span>{" "}
          a share (
          <SourceLink href={eps.source_url}>{eps.estimate_source}</SourceLink>).
          Their comparable figure is not posted yet; this page updates when it
          is.
        </Missing>
      ) : (
        <Missing>We have no analyst EPS estimate for this quarter.</Missing>
      )}

      <dl className="mt-4 border-t border-oa-border">
        {revenue ? (
          <Row
            label={<SourceLink href={releaseUrl}>Revenue</SourceLink>}
            value={fmtUsd(revenue.value)}
            sub={
              revenue.yoy_pct != null
                ? `${fmtSignedPct(revenue.yoy_pct)} vs ${fmtUsd(revenue.prior)}`
                : undefined
            }
            tone={
              revenue.yoy_pct != null
                ? revenue.yoy_pct > 0
                  ? "up"
                  : revenue.yoy_pct < 0
                    ? "down"
                    : "flat"
                : undefined
            }
          />
        ) : null}
        {eps?.gaap ? (
          <Row
            label={
              <SourceLink href={releaseUrl}>GAAP EPS, as reported</SourceLink>
            }
            value={fmtEps(eps.gaap.value)}
            sub={
              eps.gaap.prior != null
                ? `${fmtEps(eps.gaap.prior)} a year ago`
                : undefined
            }
          />
        ) : null}
        {eps?.adjusted ? (
          <Row
            label={
              <SourceLink href={releaseUrl}>
                Adjusted EPS, the company&apos;s own
              </SourceLink>
            }
            value={fmtEps(eps.adjusted.value)}
            sub={
              eps.adjusted.prior != null
                ? `${fmtEps(eps.adjusted.prior)} a year ago`
                : undefined
            }
          />
        ) : null}
      </dl>
      {!revenue && report.filing ? (
        <Missing className="mt-3">
          We could not find total revenue for the quarter in the release.
        </Missing>
      ) : null}
      {lines.length ? (
        <details className="group mt-3 border-t border-oa-border pt-2">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-oa-primary hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show the lines from the release
            </span>
            <span className="hidden group-open:inline">
              Hide the lines from the release
            </span>
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {lines.map((line) => (
              <li
                key={line}
                className={`${NUM} break-words rounded border border-oa-border bg-oa-bg px-2.5 py-1.5 text-[12.5px] leading-[18px] text-oa-fg`}
              >
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

function ReactionPanel({ report }: { report: EarningsDayReport }) {
  const reaction = report.reaction;
  const yahoo = report.sources?.find((source) =>
    source.label.includes("Yahoo"),
  )?.url;
  return (
    <Panel
      fill
      label="How the stock reacted"
      right={
        reaction && !reaction.final ? <Tag tone="warn">Not final</Tag> : null
      }
    >
      {reaction ? (
        <>
          <p className="mb-3 text-pretty text-[14.5px] leading-[22px] text-oa-fg">
            {reaction.pct > 0 ? "Rose" : reaction.pct < 0 ? "Fell" : "Flat"}{" "}
            <span
              className={`${NUM} ${reaction.pct > 0 ? "text-signal-bullish" : reaction.pct < 0 ? "text-signal-bearish" : ""}`}
            >
              {Math.abs(reaction.pct).toFixed(1)}%
            </span>{" "}
            {reactionWhen(reaction.basis)}
            {reaction.from_close != null && reaction.price != null ? (
              <span className="text-oa-muted-fg">
                , from{" "}
                <span className={NUM}>${reaction.from_close.toFixed(2)}</span>{" "}
                {reaction.from_date
                  ? `(${fmtDay(reaction.from_date)} close)`
                  : ""}{" "}
                to <span className={NUM}>${reaction.price.toFixed(2)}</span>
                {reaction.to_date
                  ? ` (${fmtDay(reaction.to_date)} close)`
                  : reaction.price_at
                    ? ` (${fmtStampET(reaction.price_at)})`
                    : ""}
              </span>
            ) : null}
            .
          </p>
          <ReactionStrip
            pct={reaction.pct}
            typical={reaction.typical_abs_pct}
            history={reaction.history ?? []}
            final={reaction.final}
          />
          <p className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-fg">
            {reaction.typical_abs_pct
              ? `Its usual move on earnings is ${reaction.typical_abs_pct.toFixed(1)}% either way, the middle of its last ${reaction.typical_n ?? reaction.history?.length ?? 0} reports (grey ticks).`
              : "We have too few past reports with prices to say what its usual move is."}
          </p>
          <p className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">
            Prices: <SourceLink href={yahoo}>Yahoo Finance</SourceLink>
          </p>
        </>
      ) : (
        <Missing>
          {report.filing
            ? "The stock has not traded since the release, or we do not have its prices yet."
            : "We will measure the move once the release is filed."}
        </Missing>
      )}
    </Panel>
  );
}

function OutlookPanel({ report }: { report: EarningsDayReport }) {
  const guidance = report.guidance;
  const items = guidance?.items ?? [];
  return (
    <Panel
      flush
      label="The outlook"
      right={
        guidance && guidance.change !== "none" ? (
          <Tag tone={tagTone(toneOfGuidance(guidance.change))}>
            {guidanceWord(guidance.change)}
          </Tag>
        ) : null
      }
    >
      {items.length ? (
        <>
          {/* Phones: one block per item, so the change is never scrolled out of view. */}
          <ul className="divide-y divide-oa-border sm:hidden">
            {items.map((item) => (
              <li key={`${item.metric}-${item.period}`} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-medium text-oa-fg">
                    {item.label}{" "}
                    <span className="font-normal text-oa-muted-fg">
                      · {item.period || "n/a"}
                    </span>
                  </span>
                  <Tag tone={tagTone(toneOfGuidance(item.direction))}>
                    {guidanceWord(item.direction)}
                  </Tag>
                </div>
                <p className={`${NUM} mt-1 text-[14px] text-oa-fg`}>
                  {fmtRange(item)}
                </p>
                <p className={`${NUM} mt-0.5 text-[12.5px] text-oa-muted-fg`}>
                  Before:{" "}
                  {item.prev_low != null && item.prev_high != null
                    ? fmtRange({
                        low: item.prev_low,
                        high: item.prev_high,
                        unit: item.unit,
                      })
                    : "not stated"}
                </p>
              </li>
            ))}
          </ul>
          <div className="max-sm:hidden">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-oa-border text-oa-muted-fg">
                  <th className="oa-caption px-4 py-2 font-normal">What</th>
                  <th className="oa-caption px-3 py-2 font-normal">Period</th>
                  <th className="oa-caption px-3 py-2 text-right font-normal">
                    Now
                  </th>
                  <th className="oa-caption px-3 py-2 text-right font-normal">
                    Before
                  </th>
                  <th className="oa-caption px-4 py-2 text-right font-normal">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={`${item.metric}-${item.period}`}
                    className="border-b border-oa-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5 text-oa-fg">{item.label}</td>
                    <td className="px-3 py-2.5 text-oa-muted-fg">
                      {item.period || "n/a"}
                    </td>
                    <td className={`${NUM} px-3 py-2.5 text-right text-oa-fg`}>
                      {fmtRange(item)}
                    </td>
                    <td
                      className={`${NUM} px-3 py-2.5 text-right text-oa-muted-fg`}
                    >
                      {item.prev_low != null && item.prev_high != null
                        ? fmtRange({
                            low: item.prev_low,
                            high: item.prev_high,
                            unit: item.unit,
                          })
                        : "not stated"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Tag tone={tagTone(toneOfGuidance(item.direction))}>
                        {guidanceWord(item.direction)}
                      </Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-4">
          <Missing>
            {report.filing
              ? "The release gives no outlook we could read."
              : "No release yet, so no outlook yet."}
          </Missing>
        </div>
      )}
      {guidance?.headline_quote ? (
        <p className="border-t border-oa-border px-4 py-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          The release says:{" "}
          <span className="text-oa-fg">“{guidance.headline_quote}”</span>
        </p>
      ) : null}
    </Panel>
  );
}

function QuotesPanel({ report }: { report: EarningsDayReport }) {
  const quotes = report.quotes ?? [];
  return (
    <Panel fill label="What management said">
      {quotes.length ? (
        <ul className="flex flex-col gap-4">
          {quotes.map((quote) => (
            <li key={quote.text}>
              <blockquote className="border-l-2 border-oa-primary pl-3 text-pretty text-[14.5px] leading-[22px] text-oa-fg">
                “{quote.text}”
              </blockquote>
              <p className="mt-1 pl-3.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
                {quote.speaker}, in the{" "}
                <SourceLink href={report.filing?.url}>release</SourceLink>
              </p>
              {quote.why ? (
                <p className="mt-1 pl-3.5 text-pretty text-[13.5px] leading-5 text-oa-fg">
                  {quote.why}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Missing>
          {report.filing
            ? "The release has no comment from management we could quote."
            : "No release yet."}
        </Missing>
      )}
    </Panel>
  );
}

function WatchPanel({ report }: { report: EarningsDayReport }) {
  const watch = report.read?.watch ?? [];
  return (
    <Panel fill label="What to watch next">
      {watch.length ? (
        <ul className="flex flex-col gap-2">
          {watch.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-pretty text-[14px] leading-5 text-oa-fg"
            >
              <span aria-hidden="true" className="text-oa-primary">
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Missing>
          Nothing specific from this report. The next report date will show here
          once it is on the calendar.
        </Missing>
      )}
    </Panel>
  );
}

export function EarningsDayReportView({
  report,
}: {
  report: EarningsDayReport;
}) {
  return (
    <>
      <TheRead
        read={reportRead(report)}
        label={`${report.ticker} earnings, in short`}
        className="mb-4"
      />
      {!report.filing ? (
        <p className="oa-surface mb-4 border border-oa-border bg-oa-card px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">
          The company&apos;s earnings release is not on SEC EDGAR yet. The
          figures below come from the earnings calendar, and the rest of this
          report fills in once the release is filed.
        </p>
      ) : null}
      <CardGrid cols={2} className="mb-4">
        <ExpectationsPanel report={report} />
        <ReactionPanel report={report} />
      </CardGrid>
      <div className="mb-4">
        <OutlookPanel report={report} />
      </div>
      <CardGrid cols={2} className="mb-4">
        <QuotesPanel report={report} />
        <WatchPanel report={report} />
      </CardGrid>
      {report.sources?.length ? (
        <Panel flush label="Sources">
          <ul>
            {report.sources.map((source) => (
              <li
                key={source.url}
                className="border-b border-oa-border last:border-b-0"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
                >
                  <span className="min-w-0 break-words">{source.label}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-oa-muted-fg"
                  >
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {report.filing ? (
            <p className="border-t border-oa-border px-4 py-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
              Filed {fmtStampET(report.filing.filed_at)}
              {report.updated_at
                ? ` · updated ${fmtStampET(report.updated_at)}`
                : ""}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
