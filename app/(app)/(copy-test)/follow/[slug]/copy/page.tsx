import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyChart } from "@/components/copy-trades/copy-chart";
import { PositionBars, YearTable } from "@/components/copy-trades/parts";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, CardGrid, Empty, Panel, ShowMore, StatStrip, type StatItem } from "@/components/oa/kit";
import {
  COPY_BIASES,
  COPY_HUB_PATH,
  COPY_LIMITS,
  copyHref,
  fmtDollars,
  copyVerdict,
  getCopyRecord,
  holdSentence,
  holdShortLabel,
  isFullRecord,
  stoppedMonth,
  whoLine,
  type CopyRecord,
  type CopyRecordFull,
} from "@/lib/copy-trades";
import { CHAMBER_SOURCE, chamberOf, fmtDate, fmtFrac, isValidSourceSlug } from "@/lib/follow-shared";
import { copyRecordMetadata } from "@/lib/seo/copy-seo";

/**
 * "What if you had copied them?" for one fund or member of Congress: a $10,000 copy
 * portfolio replayed from the public disclosure dates (backend/agentdata/copy_trades.py),
 * against the S&P 500 and against not trading at all. Free for everyone.
 */

export const revalidate = 3600;

type Props = { params: { slug: string } };

async function load(slug: string): Promise<CopyRecord | null> {
  if (!isValidSourceSlug(slug)) return null;
  // A failed read throws (a 500, retried) instead of caching a 404 for an hour.
  return getCopyRecord(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await load(params.slug);
  // This page sits in its own route group, outside follow/loading.tsx, so nothing has streamed yet
  // and a missing record is a real 404 rather than a 200 with a not-found body.
  if (!record) notFound();
  return copyRecordMetadata(record);
}

function Head({ record }: { record: CopyRecord }) {
  const who = whoLine(record);
  return (
    <header className="mb-3 px-2 sm:mb-4 sm:px-0">
      <nav aria-label="You are here" className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-oa-muted-fg [&_a:hover]:text-oa-fg [&_a]:underline [&_a]:decoration-oa-border [&_a]:underline-offset-2">
        <Link href="/follow" prefetch={false}>Follow</Link>
        <span aria-hidden="true">/</span>
        <Link href={COPY_HUB_PATH} prefetch={false}>Worth copying?</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/follow/${encodeURIComponent(record.slug)}`} prefetch={false}>{record.name}</Link>
      </nav>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
          What if you had copied {record.name}?
        </h1>
        {who && who !== record.name ? <p className="text-[15px] leading-6 text-oa-muted-fg">{who}</p> : null}
      </div>
      {isFullRecord(record) && stoppedMonth(record) ? (
        <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-fg">
          This record ended in {stoppedMonth(record)}, when {endReason(record)}. It is shown here but not ranked.
        </p>
      ) : null}
    </header>
  );
}

/** Why a record stopped, as the end of a sentence. */
function endReason(record: CopyRecordFull): string {
  if (record.kind === "fund") return "the fund stopped filing";
  return record.active === false ? `they left the ${chamberOf(record) === "senate" ? "Senate" : "House"}` : "everything copied had been sold";
}

/** The rule in one sentence, the caveat and the biases in a line each. */
function RuleText({ record, extra }: { record: CopyRecord; extra?: string }) {
  return (
    <>
      <p className="text-pretty text-oa-fg">
        <span className="font-medium">The rule: </span>
        {record.rule}
      </p>
      <p className="mt-1 text-pretty text-oa-muted-fg">{record.caveat}</p>
      <p className="mt-1 text-pretty text-oa-muted-fg">{COPY_BIASES[record.kind]}</p>
      {extra ? <p className="mt-1 text-pretty text-oa-muted-fg">{extra}</p> : null}
    </>
  );
}

/** The rule on a page with nothing to test: shown in full, there is nothing else to read. */
function RuleBox({ record }: { record: CopyRecord }) {
  return (
    <div className="oa-surface border border-oa-border bg-oa-card px-4 py-3 text-[14px] leading-[21px]">
      <RuleText record={record} />
    </div>
  );
}

/** The limits in one line, always on show, and the full method one tap away. */
function HowTested({ record, coverage }: { record: CopyRecordFull; coverage: string }) {
  return (
    <div className="oa-surface border border-oa-border bg-oa-card px-4 pt-3 text-[14px] leading-[21px]">
      <p className="text-pretty text-oa-muted-fg">{COPY_LIMITS[record.kind]}</p>
      <ShowMore always label="How we tested this" less="Hide how we tested this" className="[&>button]:mt-1.5">
        <div className="mt-2 border-t border-oa-border pb-3 pt-2">
          <RuleText record={record} extra={coverage} />
        </div>
      </ShowMore>
    </div>
  );
}

/** The verdict before anything else: the result, its yearly pace and its worst fall side by side, and the dates. */
function Verdict({ record }: { record: CopyRecordFull }) {
  const verdict = copyVerdict(record);
  if (!verdict) return null;
  return (
    <section aria-label="The verdict" className="oa-surface border border-oa-border bg-oa-card px-4 pb-3 pt-3.5 sm:px-5 sm:pb-3.5 sm:pt-4">
      <p className="oa-label">The verdict</p>
      <h2 className="mt-1 max-w-[46rem] text-pretty text-[17px] font-semibold leading-[24px] tracking-[-0.01em] text-oa-fg sm:text-[19px] sm:leading-[26px]">{verdict.headline}</h2>
      {verdict.detail ? <p className="mt-1.5 max-w-[46rem] text-pretty text-[15px] leading-[22px] text-oa-fg">{verdict.detail}</p> : null}
      <p className="mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
        {verdict.span} · {record.kind === "fund" ? "SEC 13F filings" : CHAMBER_SOURCE[chamberOf(record)].reports} and daily closes
      </p>
    </section>
  );
}

function stats(record: CopyRecordFull): StatItem[] {
  const { copy, spy, hold, trades } = record;
  const items: StatItem[] = [
    {
      label: "$10,000 copied",
      value: fmtDollars(copy.end_value),
      sub: `${fmtFrac(copy.total)}${copy.annualized != null ? `, ${fmtFrac(copy.annualized)} a year` : ""}`,
    },
    {
      label: "In the S&P 500",
      value: fmtDollars(spy.end_value),
      sub: `${fmtFrac(spy.total)}${spy.annualized != null ? `, ${fmtFrac(spy.annualized)} a year` : ""}`,
    },
  ];
  // A member's line already says "Kept every buy"; its sub says the other half.
  if (hold) items.push({ label: holdShortLabel(record), value: fmtDollars(hold.end_value), sub: record.kind === "fund" ? record.hold_label : "Their sales ignored" });
  items.push({
    label: "Worst fall",
    value: fmtFrac(copy.max_drawdown),
    sub: copy.drawdown_peak && copy.drawdown_trough ? `${fmtDate(copy.drawdown_peak)} to ${fmtDate(copy.drawdown_trough)}` : undefined,
  });
  const turnover = trades.turnover_per_year;
  items.push({
    label: "Trades",
    value: (trades.buys + trades.sells).toLocaleString("en-US"),
    sub:
      record.kind === "fund"
        ? `${trades.buys} buys, ${trades.sells} sales over ${trades.rebalances} filings${turnover != null ? `; about ${Math.round(turnover * 100)}% of the copy traded a year` : ""}`
        : `${trades.buys} buys, ${trades.sells} sales`,
  });
  return items;
}

/** How much of what they disclosed the copy could actually buy, said once and plainly. */
function coverageLine(record: CopyRecordFull): string {
  const { coverage, trades } = record;
  const parts: string[] = [];
  if (record.kind === "fund") {
    parts.push(`The copy bought ${coverage.priced.toLocaleString("en-US")} different stocks over ${record.filings ?? trades.rebalances} filings.`);
    if (coverage.weight_avg != null) parts.push(`On average that was ${Math.round(coverage.weight_avg * 100)}% of the fund's reported stock portfolio; the rest had no ticker or price history, or sat outside its 50 largest positions.`);
  } else {
    parts.push(`The copy bought ${coverage.priced.toLocaleString("en-US")} different stocks from ${trades.buys} reported buys.`);
    if (trades.skipped_trades > 0) parts.push(`${trades.skipped_trades} ${trades.skipped_trades === 1 ? "buy was" : "buys were"} left out because the stock has no price history with us.`);
    if (trades.ignored_sales > 0) parts.push(`${trades.ignored_sales} reported ${trades.ignored_sales === 1 ? "sale was" : "sales were"} of stock bought before the reports we hold begin, so there was nothing to sell.`);
    if (coverage.cash_share != null && coverage.cash_share >= 0.01) parts.push(`It sat in cash on ${Math.round(coverage.cash_share * 100)}% of trading days, waiting for a buy.`);
  }
  if (record.kind === "fund" && coverage.skipped > 0) {
    parts.push(`${coverage.skipped} disclosed ${coverage.skipped === 1 ? "stock" : "stocks"} had no price history and ${coverage.skipped === 1 ? "was" : "were"} left out.`);
  }
  return parts.join(" ");
}

function FullView({ record }: { record: CopyRecordFull }) {
  const hold = holdSentence(record);
  const scale = Math.max(...record.best.map((item) => Math.abs(item.pnl)), ...record.worst.map((item) => Math.abs(item.pnl)), 0);
  const noun = record.kind === "fund" ? "filings" : "reports";
  return (
    <>
      <Verdict record={record} />

      <div className="mt-3">
        <Panel label="What $10,000 became" right={<span>Closes to {fmtDate(record.end_date)}</span>}>
          <CopyChart curve={record.curve} name={record.name} holdLabel={record.hold ? record.hold_label : null} />
          {hold || record.ended ? (
            <p className="mt-3 border-t border-oa-border pt-3 text-pretty text-[14px] leading-[21px] text-oa-muted-fg">
              {hold}
              {record.ended
                ? ` The test stops on ${fmtDate(record.end_date)}, when ${endReason(record)}, so there was nothing left to follow.`
                : ""}
            </p>
          ) : null}
        </Panel>
      </div>

      <StatStrip stats={stats(record)} className="mt-3" />

      <CardGrid className="mt-3">
        <Panel label="The moves that made the most" flush fill>
          <PositionBars positions={record.best} scale={scale} tone="up" stoppedAt={record.stopped ? record.end_date : null} />
        </Panel>
        <Panel label="The moves that cost the most" flush fill>
          <PositionBars positions={record.worst} scale={scale} tone="down" stoppedAt={record.stopped ? record.end_date : null} />
        </Panel>
      </CardGrid>

      <div className="mt-3">
        <Panel label="Year by year" flush>
          <YearTable record={record} />
        </Panel>
      </div>

      <div className="mt-3">
        <HowTested record={record} coverage={coverageLine(record)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-2 text-[14px] sm:px-0">
        <Link href={`/follow/${encodeURIComponent(record.slug)}`} prefetch={false} className="font-medium text-oa-primary hover:underline">
          See {record.name}&apos;s latest {noun} →
        </Link>
        <Link href={COPY_HUB_PATH} prefetch={false} className="font-medium text-oa-primary hover:underline">
          Whose moves were worth copying? →
        </Link>
      </div>
    </>
  );
}

export default async function CopyPage({ params }: Props) {
  const record = await load(params.slug);
  if (!record) notFound();
  const path = copyHref(record.slug);
  return (
    <AppPage>
      <JsonLd
        data={breadcrumbLd([
          { name: "Follow", path: "/follow" },
          { name: "Whose moves were worth copying?", path: COPY_HUB_PATH },
          { name: record.name, path: `/follow/${record.slug}` },
          { name: "Copy test", path },
        ])}
      />
      <Head record={record} />
      {isFullRecord(record) ? (
        <FullView record={record} />
      ) : (
        <>
          <RuleBox record={record} />
          <div className="oa-surface mt-3 border border-oa-border bg-oa-card">
            <Empty title="Nothing to test yet">
              We could not build a copy of {record.name}: {record.not_ranked_because ?? "there is no record"}.
            </Empty>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-2 text-[14px] sm:px-0">
            <Link href={`/follow/${encodeURIComponent(record.slug)}`} prefetch={false} className="font-medium text-oa-primary hover:underline">
              See {record.name}&apos;s profile →
            </Link>
            <Link href={COPY_HUB_PATH} prefetch={false} className="font-medium text-oa-primary hover:underline">
              Whose moves were worth copying? →
            </Link>
          </div>
        </>
      )}
    </AppPage>
  );
}
