import * as React from "react";
import Link from "next/link";

import { NUM, ShowMore, Sparkline } from "@/components/oa/kit";
import { COPY_BIASES, copyHref, fmtPointsWord, rankRows, spanLabel, whoLine, type CopyHub, type CopyHubRow, type CopyKind } from "@/lib/copy-trades-shared";
import { congressNoun, fmtFrac, fmtMonthYear } from "@/lib/follow-shared";

/**
 * The hub's first screen, built around one question: would copying them have
 * beaten simply owning the S&P 500? A dot per fund or member answers it at a
 * glance (green beat it, grey did not), the best of each kind follows as a
 * card with its own line, and the method waits behind one tap.
 */

type KindTally = { kind: CopyKind; label: string; ranked: CopyHubRow[]; beat: number; median: number | null };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function kindTally(hub: CopyHub, kind: CopyKind): KindTally {
  const { ranked } = rankRows(hub.rows, kind);
  return {
    kind,
    label: kind === "fund" ? `Funds, copied since ${hub.fund_start.slice(0, 4)}` : `${capitalize(congressNoun(hub.rows))}, copied from their first reported buy`,
    ranked,
    beat: ranked.filter((row) => (row.excess_per_year ?? 0) > 0).length,
    median: median(ranked.map((row) => row.excess_per_year as number)),
  };
}

/** "Most of them would not have beaten..." from both kinds' counts together. */
export function answerHeadline(tallies: KindTally[]): string {
  const total = tallies.reduce((sum, t) => sum + t.ranked.length, 0);
  const beat = tallies.reduce((sum, t) => sum + t.beat, 0);
  if (total === 0) return "";
  if (beat * 2 === total) return "Copying them was a coin toss: half beat simply owning the S&P 500.";
  if (beat * 2 < total) return "Copying most of them would not have beaten simply owning the S&P 500.";
  return "Copying most of them would have beaten simply owning the S&P 500.";
}

/** "1.9 points a year less" for a gap between two yearly returns: a difference in percentage points, not a percent of the S&P 500's. */
export function gapWords(gap: number): string {
  return `${fmtPointsWord(gap)} a year ${gap >= 0 ? "more" : "less"}`;
}

/** One dot per fund or member, best first: filled green beat the S&P 500, hollow did not. */
function DotStrip({ tally }: { tally: KindTally }) {
  return (
    <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${tally.beat} of ${tally.ranked.length} beat the S&P 500`}>
      {tally.ranked.map((row) => {
        const won = (row.excess_per_year ?? 0) > 0;
        return (
          <span
            key={row.slug}
            title={`${row.name}: ${won ? "beat" : "did not beat"} the S&P 500`}
            className={`block h-2.5 w-2.5 rounded-full ${won ? "bg-signal-bullish" : "border border-oa-muted-fg/70 bg-transparent"}`}
          />
        );
      })}
    </div>
  );
}

function Method({ hub }: { hub: CopyHub }) {
  return (
    <ShowMore always label="How the test works, and what it leaves out" less="Hide how the test works" className="[&>button]:mt-0">
      <div className="mb-3 space-y-3 text-[14px] leading-[21px]">
        <div>
          <p className="font-medium text-oa-fg">Funds</p>
          <p className="mt-0.5 text-pretty text-oa-fg">{hub.fund_rule}</p>
          <p className="mt-1 text-pretty text-oa-muted-fg">{hub.fund_caveat}</p>
          <p className="mt-1 text-pretty text-oa-muted-fg">{COPY_BIASES.fund}</p>
        </div>
        <div>
          <p className="font-medium text-oa-fg">{capitalize(congressNoun(hub.rows))}</p>
          <p className="mt-0.5 text-pretty text-oa-fg">{hub.congress_rule}</p>
          <p className="mt-1 text-pretty text-oa-muted-fg">{hub.congress_caveat}</p>
          <p className="mt-1 text-pretty text-oa-muted-fg">{COPY_BIASES.congress}</p>
        </div>
      </div>
    </ShowMore>
  );
}

/** The focal card: the answer, a dot strip per kind, the typical result, and the method one tap away. */
export function HubAnswer({ hub, tallies }: { hub: CopyHub; tallies: KindTally[] }) {
  const shown = tallies.filter((t) => t.ranked.length > 0);
  if (shown.length === 0) return null;
  const funds = shown.find((t) => t.kind === "fund");
  return (
    <section className="oa-surface border border-oa-border bg-oa-card px-4 pb-4 pt-4 sm:px-5">
      <p className="oa-label">The short answer</p>
      <h2 className="mt-1.5 max-w-3xl text-balance text-[20px] font-semibold leading-[27px] tracking-[-0.01em] text-oa-fg sm:text-[24px] sm:leading-8">{answerHeadline(shown)}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-6">
        {shown.map((tally) => (
          <div key={tally.kind} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium leading-5 text-oa-fg">{tally.label}</p>
            </div>
            <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
              <span className={`${NUM} font-medium text-oa-fg`}>{tally.beat}</span> of the <span className={NUM}>{tally.ranked.length}</span> we could rank beat the S&amp;P 500
            </p>
            <div className="mt-2">
              <DotStrip tally={tally} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] leading-[18px] text-oa-muted-fg">
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-2.5 w-2.5 rounded-full bg-signal-bullish" aria-hidden="true" /> Beat the S&amp;P 500
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-2.5 w-2.5 rounded-full border border-oa-muted-fg/70" aria-hidden="true" /> Did not
        </span>
      </div>
      {funds && funds.median != null && funds.ranked.length >= 5 ? (
        <p className="mt-3 text-pretty text-[15px] leading-[22px] text-oa-fg">
          The typical fund&apos;s copy made {gapWords(funds.median)} than the S&amp;P 500.
        </p>
      ) : null}
      <div className="mt-4 border-t border-oa-border pt-3">
        <Method hub={hub} />
      </div>
    </section>
  );
}

/** The copy's yearly return against the S&P 500's, as two bars on one scale. */
function PairBars({ row, scale }: { row: CopyHubRow; scale: number }) {
  const bars: Array<{ label: string; value: number | null; strong: boolean }> = [
    { label: "The copy", value: row.copy_annualized, strong: true },
    { label: "S&P 500", value: row.spy_annualized, strong: false },
  ];
  return (
    <div className="space-y-1.5">
      {bars.map((bar) => {
        // Length is the size of the return; a loss is drawn red so it never reads as a small gain.
        const width = bar.value != null && scale > 0 ? Math.max(2, (Math.abs(bar.value) / scale) * 100) : 0;
        const fill = bar.value != null && bar.value < 0 ? "bg-signal-bearish opacity-70" : bar.strong ? "bg-oa-primary" : "bg-oa-muted-fg/45";
        return (
          <div key={bar.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[13px] leading-5">
            <span className="text-oa-muted-fg">{bar.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-oa-bg" aria-hidden="true">
              <span className={`block h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
            </span>
            <span className={`${NUM} text-right ${bar.strong ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>{fmtFrac(bar.value)} a year</span>
          </div>
        );
      })}
    </div>
  );
}

/** The best of one kind: who, the copy's line, its yearly return against the S&P 500's, and the way in. */
export function BestCard({ title, row }: { title: string; row: CopyHubRow }) {
  const scale = Math.max(Math.abs(row.copy_annualized ?? 0), Math.abs(row.spy_annualized ?? 0), 0.01);
  const gap = row.excess_per_year ?? 0;
  return (
    <article className="oa-surface relative flex h-full flex-col border border-oa-border bg-oa-card p-4 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]">
      <p className="oa-label">{title}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-6 text-oa-fg">
        <Link href={copyHref(row.slug)} prefetch={false} className="after:absolute after:inset-0 after:content-[''] hover:underline">
          {row.name}
        </Link>
      </h3>
      <p className="text-[13px] leading-5 text-oa-muted-fg">{whoLine(row)}</p>
      {row.spark.length > 1 ? (
        <div className="mt-3">
          <Sparkline values={row.spark} width={320} height={48} className="h-12 w-full" />
          <p className="mt-0.5 text-[12px] leading-4 text-oa-muted-fg">$10,000 copied, {spanLabel(row)}</p>
        </div>
      ) : null}
      <div className="mt-3">
        <PairBars row={row} scale={scale} />
      </div>
      <p className="mt-3 text-pretty text-[14px] leading-5 text-oa-fg">
        Copying {row.kind === "fund" ? "it" : "them"} made {gapWords(gap)} than the S&amp;P 500
        {row.max_drawdown != null ? `, with a worst drop of ${fmtFrac(Math.abs(row.max_drawdown), 0, false)} on the way` : ""}.
      </p>
    </article>
  );
}

const TH = "oa-mono whitespace-nowrap px-3 py-2 text-[11px] font-normal uppercase tracking-[0.08em] text-oa-muted-fg";
const TD = "px-3 py-2.5 align-middle";

/** A bar from the middle: right and green for ahead of the S&P 500, left and red for behind. */
function GapBar({ value, scale }: { value: number; scale: number }) {
  const width = scale > 0 ? Math.min(50, (Math.abs(value) / scale) * 50) : 0;
  return (
    <span aria-hidden="true" className="relative block h-1.5 w-full overflow-hidden rounded-full bg-oa-bg">
      <span className="absolute inset-y-0 left-1/2 w-px bg-oa-fg/30" />
      <span
        className={`absolute inset-y-0 rounded-full ${value >= 0 ? "bg-signal-bullish opacity-70" : "bg-signal-bearish opacity-70"}`}
        style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </span>
  );
}

/**
 * The ranking in plain columns: the copy's yearly return with the S&P 500's
 * under it, a bar for how far ahead or behind, and on wider screens the worst
 * drop and the period. Every row opens its own test.
 */
export function PlainRankTable({
  rows,
  offset = 0,
  scaleRows = rows,
  numbered = true,
  head = true,
  who,
}: {
  rows: CopyHubRow[];
  offset?: number;
  scaleRows?: CopyHubRow[];
  numbered?: boolean;
  /** false under a fold that continues a table above: the row still sets the column widths, so the columns line up. */
  head?: boolean;
  /** The first column's heading: "Fund" or "Member". */
  who: string;
}) {
  const scale = scaleRows.reduce((max, row) => Math.max(max, Math.abs(row.excess_per_year ?? 0)), 0);
  return (
    <table className="w-full table-fixed border-collapse text-[14px]">
      <thead aria-hidden={head ? undefined : true} className={head ? "bg-oa-bg" : "invisible [&_th]:h-0 [&_th]:py-0 [&_th]:text-[0px] [&_th]:leading-[0]"}>
        <tr>
          <th className={`${TH} w-9 text-left max-sm:pr-0`}>#</th>
          <th className={`${TH} text-left`}>{who}</th>
          <th className={`${TH} w-[8.5rem] text-right sm:w-44`}>Yearly return</th>
          <th className={`${TH} hidden w-32 text-right lg:table-cell`}>Worst drop</th>
          <th className={`${TH} hidden w-44 text-right md:table-cell`}>Copied</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const gap = row.excess_per_year ?? 0;
          return (
            <tr key={row.slug} className="relative border-t border-oa-border hover:bg-oa-bg/60">
              <td className={`${TD} ${NUM} text-[12px] text-oa-muted-fg max-sm:pr-0`}>{numbered ? offset + index + 1 : ""}</td>
              <td className={`${TD} min-w-0`}>
                <Link href={copyHref(row.slug)} prefetch={false} className="font-medium text-oa-fg after:absolute after:inset-0 after:content-[''] hover:underline">
                  {row.name}
                </Link>
                <span className="block text-[12.5px] leading-[18px] text-oa-muted-fg">
                  {whoLine(row)}
                  {row.stopped && row.end_date ? <span className="whitespace-nowrap">, until {fmtMonthYear(row.end_date)}</span> : null}
                </span>
              </td>
              <td className={`${TD} text-right`}>
                {row.copy_annualized != null && row.excess_per_year != null ? (
                  <>
                    {/* No red or green arrow here: a lagging copy can still be up, and red reads as a loss. The bar says ahead or behind. */}
                    <span className={`${NUM} block font-medium text-oa-fg`}>{fmtFrac(row.copy_annualized)}</span>
                    <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg`}>S&amp;P 500 {fmtFrac(row.spy_annualized)}</span>
                    <span className="mt-1.5 block">
                      <GapBar value={gap} scale={scale} />
                    </span>
                  </>
                ) : row.copy_total != null ? (
                  // Under a year there is no yearly figure: the totals over the record instead.
                  <>
                    <span className={`${NUM} block font-medium text-oa-fg`}>{fmtFrac(row.copy_total)} in all</span>
                    {row.spy_total != null ? <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg`}>S&amp;P 500 {fmtFrac(row.spy_total)}</span> : null}
                  </>
                ) : (
                  <span className="text-[12.5px] text-oa-muted-fg">Too short to say</span>
                )}
                {/* Below the widths that show the worst-drop and dates columns, both stay under the return. */}
                {row.max_drawdown != null ? (
                  <span className={`${NUM} mt-1 block text-[12px] leading-4 text-oa-muted-fg lg:hidden`}>Worst drop {fmtFrac(row.max_drawdown, 0)}</span>
                ) : null}
                {spanLabel(row) ? <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg md:hidden`}>{spanLabel(row)}</span> : null}
              </td>
              <td className={`${TD} ${NUM} hidden text-right text-oa-muted-fg lg:table-cell`}>{fmtFrac(row.max_drawdown, 0)}</td>
              <td className={`${TD} ${NUM} hidden whitespace-nowrap text-right text-[12.5px] text-oa-muted-fg md:table-cell`}>{spanLabel(row)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
