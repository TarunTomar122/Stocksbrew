import Link from "next/link";

import { CARD, Dash, EmptyNote, NUM, Pct, SectionTitle, Stat, TD, TH } from "@/components/portfolio/parts";
import { MarkSlot } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { markFor, toneFor } from "@/lib/tone";
import type { HealthProps } from "@/lib/radar-next-data";
import {
  FUNDS_SECTOR,
  fmtDay,
  fmtSignedPct,
  type AllocationSlice,
  type Portfolio,
  type PortfolioPosition,
} from "@/lib/portfolio-shared";

/* ── allocation: one hue, ordered, labelled on the row ───────────────────── */

function AllocationBars({ slices, max = 12 }: { slices: AllocationSlice[]; max?: number }) {
  const shown = slices.slice(0, max);
  const rest = slices.slice(max);
  const restWeight = rest.reduce((sum, slice) => sum + slice.weight, 0);
  const top = Math.max(...shown.map((slice) => slice.weight), restWeight, 1);
  const rows = restWeight > 0 ? [...shown, { label: `${rest.length} more`, weight: restWeight, value: null, count: rest.length }] : shown;
  return (
    <ul className="flex flex-col px-3 py-2">
      {rows.map((slice, index) => (
        <li key={slice.label} className="grid h-7 grid-cols-[minmax(4.5rem,9.5rem)_minmax(0,1fr)_3.25rem] items-center gap-2.5">
          <span className="truncate text-[12.5px] text-oa-fg" title={slice.label}>
            {slice.label}
          </span>
          <svg role="img" aria-label={`${slice.label} ${slice.weight.toFixed(1)}%`} width="100%" height="10" preserveAspectRatio="none">
            <rect x="0" y="0" width="100%" height="10" rx="2" fill="var(--oa-bg)" />
            <rect
              x="0"
              y="0"
              width={`${Math.max(1, (slice.weight / top) * 100)}%`}
              height="10"
              rx="2"
              fill="var(--oa-primary)"
              opacity={index >= shown.length ? 0.35 : Math.max(0.45, 1 - index * 0.07)}
            />
          </svg>
          <span className={`${NUM} text-right text-[12px] text-oa-fg`}>{slice.weight.toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

/** The whole book as one strip, so the split is visible at a glance. */
function SplitStrip({ slices }: { slices: AllocationSlice[] }) {
  let x = 0;
  return (
    <svg role="img" aria-label="Allocation split" viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-2.5 w-full">
      {slices.map((slice, index) => {
        const rect = (
          <rect
            key={slice.label}
            x={x + 0.15}
            y="0"
            width={Math.max(0, slice.weight - 0.3)}
            height="6"
            fill="var(--oa-primary)"
            opacity={Math.max(0.2, 1 - index * 0.13)}
          >
            <title>{`${slice.label} ${slice.weight.toFixed(1)}%`}</title>
          </rect>
        );
        x += slice.weight;
        return rect;
      })}
    </svg>
  );
}

/* ── since saved: stock vs the index over the same dates ─────────────────── */

function DiffBar({ value, scale }: { value: number; scale: number }) {
  const half = Math.min(50, (Math.abs(value) / scale) * 50);
  return (
    <svg role="img" aria-label={`${fmtSignedPct(value, 1)} against the S&P 500`} viewBox="0 0 100 10" preserveAspectRatio="none" className="block h-2.5 w-full min-w-[5rem]">
      <rect x="0" y="4.5" width="100" height="1" fill="var(--oa-border)" />
      <rect
        x={value >= 0 ? 50 : 50 - half}
        y="1"
        width={Math.max(0.8, half)}
        height="8"
        rx="1"
        fill={value >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)"}
      />
      <rect x="49.7" y="0" width="0.6" height="10" fill="var(--oa-muted-fg)" />
    </svg>
  );
}

/** "6 sectors", or "5 sectors and funds" when index funds are held (they are not a sector). */
function sectorNote(slices: Array<{ label: string }>): string {
  const sectors = slices.filter((slice) => slice.label !== FUNDS_SECTOR).length;
  if (sectors === 0 && slices.length > 0) return "funds only";
  const funds = sectors < slices.length;
  return `${sectors} sector${sectors === 1 ? "" : "s"}${funds ? " and funds" : ""}`;
}

function SinceSavedTable({ positions }: { positions: PortfolioPosition[] }) {
  const rows = positions
    .filter((position) => position.sinceSaved !== null)
    .map((position) => {
      const since = position.sinceSaved!;
      return { position, since, diff: since.benchmarkPct === null ? null : since.pct - since.benchmarkPct };
    })
    .sort((a, b) => (b.diff ?? -Infinity) - (a.diff ?? -Infinity));
  if (rows.length === 0) {
    return (
      <EmptyNote title="No dated positions yet">
        We date a position from the day you last saved its shares. Enter shares for a holding and this starts
        tracking it against the S&amp;P 500 from that day.
      </EmptyNote>
    );
  }
  const scale = Math.max(5, ...rows.map((row) => Math.abs(row.diff ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-oa-border text-left">
            <th className={`${TH} pl-3`}>Stock</th>
            <th className={TH}>Saved</th>
            <th className={`${TH} text-right`}>Stock</th>
            <th className={`${TH} text-right`}>S&amp;P 500</th>
            <th className={`${TH} text-right`}>Difference</th>
            <th className={`${TH} w-[28%] pr-3`} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ position, since, diff }) => (
            <tr key={position.instrument_id} className="h-9 border-b border-oa-border last:border-b-0">
              <td className={`${TD} pl-3`}>
                <Link href={`/stock/${position.ticker}`} className="oa-mono inline-flex items-center gap-1.5 align-middle font-medium text-oa-fg hover:underline">
                  <StockLogo ticker={position.ticker} size={16} />
                  {position.ticker}
                </Link>
              </td>
              <td className={`${TD} ${NUM} text-[12px] text-oa-muted-fg`}>{fmtDay(since.fromDate)}</td>
              <td className={`${TD} text-right`}>
                <Pct value={since.pct} digits={1} />
              </td>
              <td className={`${TD} text-right`}>
                <Pct value={since.benchmarkPct} digits={1} />
              </td>
              <td className={`${TD} text-right`}>
                <Pct value={diff} digits={1} className="font-medium" />
              </td>
              <td className={`${TD} pr-3`}>{diff === null ? null : <DiffBar value={diff} scale={scale} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── the read on the holdings' scores (existing diagnosis) ───────────────── */

/** The figure as it is printed, so the mark judges the number the reader sees (7 equal weights give 6.9999…). */
function shown(value: number, digits?: number): number;
function shown(value: number | null, digits?: number): number | null;
function shown(value: number | null, digits = 1): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}


function HealthRead({ health }: { health: HealthProps }) {
  // No graded holdings yet ("-"): no number and no colour, not a red zero.
  const graded = health.grade !== "-";
  const score = Math.max(0, Math.min(100, health.gradePct));
  // Same thresholds as the pillar marks below and the headline, so the ring, the triangles and the words agree.
  const tone = graded ? toneFor("score", Math.round(score)) : null;
  const ring = tone === "up" ? "var(--signal-bullish)" : tone === "down" ? "var(--signal-bearish)" : tone === "flat" ? "var(--signal-neutral)" : "var(--oa-border)";
  return (
    <section className={CARD} aria-label="Score read">
      <SectionTitle aside="average score">What the holdings lean toward</SectionTitle>
      <div className="grid gap-4 px-3 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex items-start gap-3">
          <span
            className={`${NUM} flex size-12 shrink-0 items-center justify-center rounded-full border-2 text-[17px] font-medium text-oa-fg`}
            style={{ borderColor: ring }}
            title="Average score across your holdings, out of 100"
          >
            {graded ? Math.round(score) : <span className="text-oa-muted-fg">–</span>}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium leading-5 text-oa-fg">{health.headline}</p>
            <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">{health.body}</p>
          </div>
        </div>
        {health.pillars.length > 0 ? (
          <ul className="flex flex-col justify-center gap-1.5">
            {health.pillars.map((pillar) => (
              <li key={pillar.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-2.5">
                <span className="text-[12.5px] capitalize text-oa-muted-fg">{pillar.label}</span>
                <svg role="img" aria-label={`${pillar.label} ${Math.round(pillar.score)} of 100`} width="100%" height="8" preserveAspectRatio="none">
                  <rect width="100%" height="8" rx="2" fill="var(--oa-bg)" />
                  <rect width={`${Math.max(0, Math.min(100, pillar.score))}%`} height="8" rx="2" fill="var(--oa-primary)" />
                </svg>
                <span className={`${NUM} inline-flex items-center justify-end gap-1 text-[12px] text-oa-fg`}>
                  {Math.round(pillar.score)}
                  <MarkSlot tone={markFor("score", Math.round(pillar.score))} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {health.fixes.length > 0 ? (
        <ol className="grid gap-x-6 gap-y-1.5 border-t border-oa-border px-3 py-3 sm:grid-cols-2">
          {health.fixes.slice(0, 4).map((fix, index) => (
            <li key={`${index}-${fix}`} className="flex gap-2 text-[13px] leading-5 text-oa-muted-fg">
              <span className={`${NUM} shrink-0 text-oa-primary`}>{index + 1}</span>
              {fix}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function AnalyticsTab({
  portfolio,
  health,
  example,
}: {
  portfolio: Portfolio;
  health?: HealthProps | null;
  example: boolean;
}) {
  const { analytics, totals, positions } = portfolio;
  if (totals.holdings === 0 || analytics.basis === null) {
    return (
      <div className={CARD}>
        <EmptyNote title="Analytics need at least one holding">
          Mark the stocks you own as holdings and enter the shares. Allocation, concentration, beta and volatility are
          worked out from those.
        </EmptyNote>
      </div>
    );
  }

  const byCount = analytics.basis === "count";
  const partial = !byCount && totals.valued < totals.holdings;
  const asOf = analytics.pricesAsOf ? `closes to ${fmtDay(analytics.pricesAsOf)}` : null;
  // Equal or partial weights are made up, so they get no concentration mark.
  const realWeights = !byCount && !partial;

  return (
    <div className="flex flex-col gap-3">
      {/* Equal weights are said once, in the read's source line above. A partial set still needs saying here. */}
      {partial ? (
        <p className="border border-dashed border-oa-border px-3 py-2 text-[12.5px] leading-5 text-oa-muted-fg">
          {`${totals.holdings - totals.valued} of ${totals.holdings} holdings have no shares entered and are left out of the weights below.`}
        </p>
      ) : null}

      <section className={`${CARD} grid grid-cols-2 gap-px !bg-oa-border sm:grid-cols-3 lg:grid-cols-6`}>
        <Stat label="Holdings" value={totals.holdings} note={sectorNote(analytics.bySector)} />
        <Stat
          label="Largest"
          value={analytics.top1 !== null ? `${analytics.top1.toFixed(1)}%` : <Dash />}
          mark={realWeights ? markFor("topWeight", shown(analytics.top1)) : undefined}
          note={analytics.byPosition[0]?.label}
        />
        <Stat
          label="Top three"
          value={analytics.top3 !== null ? `${analytics.top3.toFixed(1)}%` : <Dash />}
          note="of the portfolio"
        />
        <Stat
          label="Spread"
          value={analytics.effectivePositions !== null ? analytics.effectivePositions.toFixed(1) : <Dash />}
          mark={realWeights ? markFor("effectivePositions", shown(analytics.effectivePositions)) : undefined}
          note="equal-sized positions it behaves like"
          title="1 divided by the sum of squared weights"
        />
        <Stat
          label="Beta"
          value={analytics.beta !== null ? analytics.beta.toFixed(2) : <Dash />}
          mark={markFor("beta", shown(analytics.beta, 2))}
          note={analytics.beta !== null ? `vs S&P 500, ${analytics.betaCoverage} of ${totals.holdings} holdings` : "not enough price history"}
          title="Weighted average of each holding's one-year beta against SPY"
        />
        <Stat
          label="Volatility"
          value={analytics.volatility !== null ? `${analytics.volatility.toFixed(1)}%` : <Dash />}
          mark={
            analytics.volatility !== null && analytics.benchmarkVolatility
              ? markFor("relativeVolatility", shown(analytics.volatility) / shown(analytics.benchmarkVolatility))
              : undefined
          }
          note={
            analytics.benchmarkVolatility !== null
              ? `a year, at today's weights. S&P 500: ${analytics.benchmarkVolatility.toFixed(1)}%`
              : "a year, at today's weights"
          }
          title="Standard deviation of daily returns over the last year, annualised"
        />
      </section>

      {/* By sector only: each position's share is already a column of the holdings table above. */}
      <section id="by-sector" className={`${CARD} scroll-mt-20`} aria-label="Allocation by sector">
        <SectionTitle aside={byCount ? "equal weight" : "by value"}>By sector</SectionTitle>
        <div className="px-3 pt-3">
          <SplitStrip slices={analytics.bySector} />
        </div>
        <AllocationBars slices={analytics.bySector} />
      </section>

      {/* Only when a position has a date to measure from: no card that can only say it has nothing (owner rule 4). */}
      {positions.some((position) => position.sinceSaved !== null) ? (
        <section id="since-saved" className={`${CARD} scroll-mt-20`} aria-label="Performance since saved">
          <SectionTitle aside={asOf}>{example ? "Since each position was added" : "Since you saved each position"}, against the S&amp;P 500</SectionTitle>
          <SinceSavedTable positions={positions} />
        </section>
      ) : null}

      {health && health.headline ? <HealthRead health={health} /> : null}

      {!example ? (
        <p className="text-[12.5px] leading-5 text-oa-muted-fg">
          More ways to look at it:{" "}
          <Link href="/portfolio/ideas" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            rebalancing ideas
          </Link>
          {" · "}
          <Link href="/portfolio/xray" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            what you really own
          </Link>
        </p>
      ) : null}
    </div>
  );
}
