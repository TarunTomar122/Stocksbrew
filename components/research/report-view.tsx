import * as React from "react";

import { OwnHistory, PeerBars, PriceChart, ReactionBars, RevenueBars } from "@/components/research/charts";
import { Cited, teaser } from "@/components/research/cited";
import { ExpandAll } from "@/components/research/expand-all";
import { NUM, StatStrip } from "@/components/oa/kit";
import { day, shortHeadline } from "@/lib/research/format";
import type { ResearchPoint, ResearchReport, ResearchSource } from "@/lib/research/types";

/**
 * A finished research report. The read comes first (the headline and five
 * lines, then the numbers that matter), and every section below opens on tap
 * with its first sentence showing while closed. Charts sit inside the section
 * they support. Every figure links to its source.
 */

export type PublicReport = Omit<ResearchReport, "uid" | "usage">;

/** What may leave the server: no uid, no token counts. */
export function publicReport(report: ResearchReport): PublicReport {
  const { uid: _uid, usage: _usage, ...rest } = report;
  return rest;
}

type Section = {
  id: string;
  title: string;
  paragraphs?: string[];
  points?: ResearchPoint[];
  tone?: "up" | "down";
  chart?: React.ReactNode;
  empty: string;
};

function Paragraphs({ list, sources }: { list: string[]; sources: Map<string, ResearchSource> }) {
  return (
    <div className="flex flex-col gap-3">
      {list.map((text, index) => (
        <p key={index} className="text-pretty text-[15px] leading-[24px] text-oa-fg">
          <Cited text={text} sources={sources} />
        </p>
      ))}
    </div>
  );
}

function Points({ list, sources, tone }: { list: ResearchPoint[]; sources: Map<string, ResearchSource>; tone?: "up" | "down" }) {
  return (
    <ol className="flex flex-col gap-3">
      {list.map((point, index) => (
        <li key={index} className="flex gap-3">
          <span
            aria-hidden="true"
            className={`${NUM} mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[12px] font-medium ${
              tone === "up" ? "bg-[color-mix(in_srgb,var(--signal-bullish)_14%,transparent)] text-signal-bullish" : tone === "down" ? "bg-[color-mix(in_srgb,var(--signal-bearish)_14%,transparent)] text-signal-bearish" : "bg-oa-bg text-oa-fg"
            }`}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-[22px] text-oa-fg">{point.title}</p>
            <p className="mt-1 text-pretty text-[15px] leading-[24px] text-oa-fg">
              <Cited text={point.text} sources={sources} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SectionBlock({ section, sources }: { section: Section; sources: Map<string, ResearchSource> }) {
  const first = section.paragraphs?.[0] ?? (section.points?.[0] ? `${section.points[0].title}` : "");
  const hasContent = (section.paragraphs?.length ?? 0) + (section.points?.length ?? 0) > 0;
  return (
    <details data-section id={`r-${section.id}`} className="group border-b border-oa-border last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-6 text-oa-fg">{section.title}</span>
          <span className="mt-0.5 block text-pretty text-[14px] leading-5 text-oa-muted-fg group-open:hidden">{hasContent ? teaser(first) : section.empty}</span>
        </span>
        <span aria-hidden="true" className="mt-1 shrink-0 text-[18px] leading-none text-oa-muted-fg transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-5 sm:px-5">
        {hasContent ? (
          <>
            {section.paragraphs?.length ? <Paragraphs list={section.paragraphs} sources={sources} /> : null}
            {section.points?.length ? <Points list={section.points} sources={sources} tone={section.tone} /> : null}
          </>
        ) : (
          <p className="text-[15px] leading-6 text-oa-muted-fg">{section.empty}</p>
        )}
        {section.chart}
      </div>
    </details>
  );
}

export function ResearchReportView({ report, actions }: { report: PublicReport; actions?: React.ReactNode }) {
  const body = report.body;
  if (!body) return null;
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  const charts = report.charts;
  // "Next" looks ahead from the day the report was written; an older date keeps its line, not the date.
  const written = (report.finished_at ?? report.created_at).slice(0, 10);
  const watch = body.watch.map((item) => (item.date && item.date < written ? { ...item, date: null } : item));
  const dated = watch.some((item) => item.date);
  const sections: Section[] = [
    { id: "business", title: "The business", paragraphs: body.business, empty: "We found no description of the business." },
    {
      id: "drivers",
      title: "What is driving the stock now",
      paragraphs: body.drivers,
      chart: charts.reactions ? <ReactionBars chart={charts.reactions} /> : null,
      empty: "We found nothing recent that explains the stock's moves.",
    },
    { id: "bull", title: "The bull case", points: body.bull, tone: "up", empty: "We found nothing solid enough to make a bull case." },
    { id: "bear", title: "The bear case", points: body.bear, tone: "down", empty: "We found nothing solid enough to make a bear case." },
    {
      id: "valuation",
      title: "Valuation: against its own history and its peers",
      paragraphs: body.valuation,
      chart:
        charts.valuation || charts.peers ? (
          <div className="flex flex-col gap-4">
            {charts.valuation ? <OwnHistory chart={charts.valuation} /> : null}
            {charts.peers ? <PeerBars chart={charts.peers} /> : null}
          </div>
        ) : null,
      empty: "We hold no valuation history or peers for this stock.",
    },
    {
      id: "numbers",
      title: "What the numbers say: growth, margins, cash and debt",
      paragraphs: body.numbers,
      chart: charts.revenue ? <RevenueBars chart={charts.revenue} /> : null,
      empty: "We hold no financial statements for this company.",
    },
    { id: "ownership", title: "Who is buying and who is selling", paragraphs: body.ownership, empty: "We found no fund, insider or Congress trades in this stock." },
    { id: "risks", title: "The risks that matter", points: body.risks, empty: "We could not read the company's risk factors." },
    { id: "change", title: "What would change the picture", paragraphs: body.change, empty: "We found nothing specific that would clearly change the picture." },
  ];

  return (
    <div id="research-report" className="flex flex-col gap-3">
      <section aria-label="The short version" className="oa-surface border border-oa-border bg-oa-card px-4 pb-4 pt-3.5 sm:px-5">
        {actions ? <div className="flex justify-end">{actions}</div> : null}
        <h2 className="text-pretty text-[19px] font-semibold leading-[27px] tracking-[-0.01em] text-oa-fg sm:text-[21px] sm:leading-[29px]">
          {/* Reports saved before the one-idea rule get the same cut at read time. */}
          <Cited text={shortHeadline(body.headline)} sources={sources} />
        </h2>
        {body.summary.length > 0 ? (
          <ul className="mt-3 flex flex-col divide-y divide-oa-border border-t border-oa-border">
            {body.summary.map((line, index) => (
              <li key={index} className="flex gap-3 py-2.5 text-pretty text-[15px] leading-[23px] text-oa-fg">
                <span aria-hidden="true" className={`${NUM} mt-px w-4 shrink-0 text-[12.5px] text-oa-muted-fg`}>
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <Cited text={line} sources={sources} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {charts.stats.length > 0 ? (
        <StatStrip stats={charts.stats.map((stat) => ({ label: stat.label, value: stat.value, sub: stat.sub ?? undefined, tone: stat.tone ?? undefined }))} />
      ) : null}

      {charts.price ? (
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
          <p className="oa-label mb-2">The last year</p>
          <PriceChart chart={charts.price} ticker={report.ticker} />
        </section>
      ) : null}

      <section aria-label="The report" className="oa-surface border border-oa-border bg-oa-card">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2 sm:px-5">
          <h2 className="oa-label">The full report</h2>
          <ExpandAll target="research-report" />
        </div>
        {sections.map((section) => (
          <SectionBlock key={section.id} section={section} sources={sources} />
        ))}
        <details data-section id="r-watch" className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold leading-6 text-oa-fg">What to watch next</span>
              <span className="mt-0.5 block text-pretty text-[14px] leading-5 text-oa-muted-fg group-open:hidden">
                {watch.length > 0 ? teaser(watch.find((item) => item.date)?.text ?? watch[0]!.text) : "Nothing with a date yet."}
              </span>
            </span>
            <span aria-hidden="true" className="mt-1 shrink-0 text-[18px] leading-none text-oa-muted-fg transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>
          <ul className="flex flex-col divide-y divide-oa-border px-4 pb-3 sm:px-5">
            {watch.map((item, index) => (
              <li key={index} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-3">
                {/* A date column only when something on the list has a date; on phones the date sits above the line. */}
                {dated ? (
                  <span className={`${NUM} shrink-0 text-[12.5px] leading-6 sm:w-[6.5rem] ${item.date ? "text-oa-fg" : "text-oa-muted-fg"}`}>{item.date ? day(item.date) : "No date yet"}</span>
                ) : null}
                <span className="min-w-0 text-pretty text-[15px] leading-6 text-oa-fg">
                  <Cited text={item.text} sources={sources} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {report.missing.length > 0 ? (
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
          <p className="oa-label">What we could not find</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {report.missing.map((line) => (
              <li key={line} className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="oa-surface group border border-oa-border bg-oa-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="oa-label">Sources ({report.sources.length})</span>
          <span aria-hidden="true" className="text-[18px] leading-none text-oa-muted-fg transition-transform duration-200 group-open:rotate-45">
            +
          </span>
        </summary>
        {/* About eight rows tall, then it scrolls inside (owner rule for long lists). */}
        <ol className="flex max-h-[20rem] flex-col divide-y divide-oa-border overflow-y-auto border-t border-oa-border">
          {report.sources.map((source) => (
            <li key={source.id} id={`src-${source.id}`} className="flex gap-3 px-4 py-2 sm:px-5">
              <span className={`${NUM} w-7 shrink-0 text-[12.5px] leading-5 text-oa-muted-fg`}>{source.id.slice(1)}</span>
              <span className="min-w-0 text-[13.5px] leading-5">
                {source.url ? (
                  <a
                    href={source.url}
                    {...(/^https?:/.test(source.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="break-words text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg"
                  >
                    {source.label}
                  </a>
                ) : (
                  <span className="text-oa-fg">{source.label}</span>
                )}
                {source.as_of ? <span className="text-oa-muted-fg"> · {day(source.as_of)}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
