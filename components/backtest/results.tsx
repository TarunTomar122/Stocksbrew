import { PairBar, SignedBar, ToneGlyph, barDomain } from "@/components/oa/kit/tone";
import { TableBox } from "@/components/oa/kit/table-box";
import type { Caveat, CurveStats, YearRow } from "@/lib/backtest/types";
import { beatYearsSentence, swingSentence } from "@/lib/backtest-insights";
import { markFor } from "@/lib/tone";

import { SERIES_VARS, longDay, plainPct, signedPct, toneOf } from "./format";

/** The label every backtested number sits under. */
export function BacktestedBadge({ start, end, className = "" }: { start: string; end: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-oa-border bg-oa-bg px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-oa-fg ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-oa-primary" />
      Backtested, not traded
      <span className="oa-mono normal-case tracking-normal text-oa-muted-fg">
        {longDay(start)} to {longDay(end)}
      </span>
    </span>
  );
}

/**
 * The lead of a backtest: the return as the one hero number, the gap to the
 * comparison and the worst fall beside it, then the curve (children).
 */
export function ResultLead({
  perYear,
  years,
  ret,
  benchRet,
  benchmarkLabel,
  worstFall,
  start,
  end,
  aside,
  children,
}: {
  perYear: boolean;
  years: string;
  ret: number | null;
  benchRet: number | null;
  /** Short name of the comparison, e.g. "S&P 500" or "SPY". */
  benchmarkLabel: string;
  worstFall: number | null;
  start: string;
  end: string;
  /** Extra line under the period, e.g. a link back to the form on a phone. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const gap = ret != null && benchRet != null ? ret - benchRet : null;
  const gapText = gap === null ? "–" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${Math.abs(gap * 100).toFixed(1)} pts`;
  return (
    <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-3 pt-4 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)] sm:items-end sm:gap-x-10">
        <div className="max-sm:col-span-2">
          <p className="oa-caption">{perYear ? "Return per year" : `Return over ${years}`}</p>
          <p className={`oa-mono mt-1 text-[32px] font-medium leading-9 tabular-nums ${toneOf(ret)}`}>{signedPct(ret)}</p>
        </div>
        <div>
          <p className="oa-caption">vs {benchmarkLabel}</p>
          <p className={`oa-mono mt-1 text-[19px] font-medium leading-7 tabular-nums ${toneOf(gap)}`}>{gapText}</p>
        </div>
        <div>
          <p className="oa-caption">Worst fall</p>
          <p className="oa-mono mt-1 flex items-center gap-1.5 text-[19px] font-medium leading-7 tabular-nums text-oa-fg">
            {signedPct(worstFall)}
            <Mark tone={fallMark(worstFall)} />
          </p>
        </div>
        <div className="col-span-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:col-span-1 sm:pb-1 sm:text-right">
          <p>
            <span className="font-medium text-oa-fg">Backtested, not traded</span>
            <br />
            <span className="oa-mono tabular-nums">
              {longDay(start)} to {longDay(end)}
            </span>
          </p>
          {aside}
        </div>
        {/* Both returns, named and on one scale from zero, under the figures: the gap is seen and the index's own
            return is read too (owner VISUALS CHECK; council, Nov 12). */}
        <PairBar
          value={ret}
          versus={benchRet}
          labels={["Strategy", benchmarkLabel]}
          texts={[signedPct(ret), signedPct(benchRet)]}
          className="col-span-2 w-full max-w-sm sm:col-span-4"
        />
      </div>
      {children}
    </section>
  );
}

/** Good or bad beside a figure that is not a signed change. Neutral gets nothing: a gray mark beside a number reads as a minus. */
function Mark({ tone }: { tone: "up" | "down" | "flat" | null | undefined }) {
  return tone === "up" || tone === "down" ? <ToneGlyph tone={tone} /> : null;
}

/** The worst fall arrives as a fraction (−0.32); the shared thresholds are in percent and judge its size. */
function fallMark(fall: number | null | undefined) {
  return markFor("drawdown", fall == null ? null : fall * 100);
}

type Pair = { values: [number | null | undefined, number | null | undefined]; texts: [string, string] };

function Cell({
  label,
  value,
  sub,
  tone,
  mark,
  pair,
  names,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  mark?: "up" | "down" | "flat" | null;
  /** The figure and the benchmark's, as two named bars with their figures under the big one. */
  pair?: Pair;
  /** What the two bars are: the strategy, then the benchmark. */
  names: [string, string];
}) {
  return (
    <div className="min-w-0 bg-oa-card px-3.5 py-3">
      <p className="oa-caption text-pretty">{label}</p>
      <p className={`oa-mono mt-1 flex items-center gap-1.5 text-[17px] font-medium leading-6 tabular-nums ${tone ?? "text-oa-fg"}`}>
        <span className="min-w-0 truncate">{value}</span>
        <Mark tone={mark} />
      </p>
      {sub ? <p className="oa-mono mt-0.5 truncate text-[12.5px] tabular-nums text-oa-muted-fg">{sub}</p> : null}
      {pair ? <PairBar value={pair.values[0]} versus={pair.values[1]} labels={names} texts={pair.texts} className="mt-2 w-full" /> : null}
    </div>
  );
}

/** Headline figures, each drawn against the benchmark's as two named bars with their figures. */
export function StatGrid({
  strategy,
  benchmark,
  benchmarkLabel,
  worstYear,
  bestYear,
  hitRate,
  turnover,
  headline = true,
  strategyLabel = "Strategy",
  columns,
}: {
  /** The grid's column classes from `sm` up, when the default is too many for the column it sits in. */
  columns?: string;
  /** What the copper bars are ("Strategy", "Your mix"). */
  strategyLabel?: string;
  strategy: CurveStats;
  benchmark: CurveStats;
  benchmarkLabel: string;
  worstYear: YearRow | null;
  bestYear: YearRow | null;
  hitRate: { beat: number; years: number; complete_years_only: boolean };
  turnover: number | null;
  /** false when the page already shows return and worst fall as its lead numbers. */
  headline?: boolean;
}) {
  const names: [string, string] = [strategyLabel, benchmarkLabel];
  // One takeaway under the figures, at most 15 words (owner rule 8): the years it beat the index, else its return for
  // its swing, as a sentence rather than "0 of 4" or "0.35".
  const takeaway =
    [beatYearsSentence(hitRate, benchmarkLabel), swingSentence(strategy.sharpe, benchmark.sharpe, benchmarkLabel)].find(
      (line): line is string => Boolean(line) && line!.split(/\s+/).filter(Boolean).length <= 15,
    ) ?? null;
  const perYear = strategy.annualized_return !== null;
  const ret: [number | null | undefined, number | null | undefined] = perYear
    ? [strategy.annualized_return, benchmark.annualized_return ?? benchmark.total_return]
    : [strategy.total_return, benchmark.total_return];
  return (
    <div
      className={`oa-surface grid grid-cols-2 gap-px overflow-hidden border border-oa-border bg-oa-border ${
        columns ?? (headline ? "sm:grid-cols-3" : "lg:grid-cols-4")
      }`}
    >
      {headline ? (
        <>
          <Cell
            label="Return per year"
            value={signedPct(ret[0])}
            tone={toneOf(ret[0])}
            names={names}
            pair={{ values: ret, texts: [signedPct(ret[0]), signedPct(ret[1])] }}
          />
          <Cell
            label="Worst fall"
            value={signedPct(strategy.max_drawdown)}
            mark={fallMark(strategy.max_drawdown)}
            names={names}
            pair={{ values: [strategy.max_drawdown, benchmark.max_drawdown], texts: [signedPct(strategy.max_drawdown), signedPct(benchmark.max_drawdown)] }}
          />
        </>
      ) : null}
      {/* Plain words for volatility (owner rule 8): how far it typically swings in a year. */}
      <Cell
        label="Typical yearly swing"
        value={plainPct(strategy.volatility)}
        names={names}
        pair={{ values: [strategy.volatility, benchmark.volatility], texts: [plainPct(strategy.volatility), plainPct(benchmark.volatility)] }}
      />
      <Cell
        label="Worst year"
        value={worstYear ? signedPct(worstYear.strategy) : "–"}
        sub={worstYear ? String(worstYear.year) : undefined}
        tone={toneOf(worstYear?.strategy)}
        names={names}
        pair={worstYear ? { values: [worstYear.strategy, worstYear.benchmark], texts: [signedPct(worstYear.strategy), signedPct(worstYear.benchmark)] } : undefined}
      />
      <Cell
        label="Best year"
        value={bestYear ? signedPct(bestYear.strategy) : "–"}
        sub={bestYear ? String(bestYear.year) : undefined}
        tone={toneOf(bestYear?.strategy)}
        names={names}
        pair={bestYear ? { values: [bestYear.strategy, bestYear.benchmark], texts: [signedPct(bestYear.strategy), signedPct(bestYear.benchmark)] } : undefined}
      />
      <Cell
        label="Mix traded a year"
        value={turnover === null ? "–" : plainPct(turnover, 0)}
        sub={turnover === null ? "needs a full year" : "sold and rebought"}
        names={names}
      />
      {takeaway ? (
        <p className="col-span-full bg-oa-card px-3.5 py-3 text-pretty text-[14px] leading-5 text-oa-fg">{takeaway}</p>
      ) : null}
    </div>
  );
}

export function YearTable({
  years,
  benchmarkLabel,
  strategyLabel = "Strategy",
  gap = true,
}: {
  years: YearRow[];
  benchmarkLabel: string;
  strategyLabel?: string;
  /** The gap column; a narrow rail leaves it out, since the bars beside each year show it. */
  gap?: boolean;
}) {
  // Both years' returns as two bars on one scale, one zero line down the column (owner VISUALS CHECK): copper for the
  // mix, teal for what it is held against, as on the chart. The dots on the column names say which is which.
  const rows = [...years].reverse();
  const domain = barDomain(rows.flatMap((row) => [row.strategy, row.benchmark]));
  return (
    <TableBox rowRem={2.5}>
      <table className={`${SERIES_VARS} w-full min-w-[19rem] border-collapse text-[13px]`}>
        <thead>
          <tr className="border-b border-oa-border text-left">
            <th className="oa-caption px-3.5 py-2">Year</th>
            <th className="oa-caption px-2 py-2 text-right">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-[var(--series-a)]" />
                {strategyLabel}
              </span>
            </th>
            <th className="oa-caption px-2 py-2 text-right">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-[var(--series-b)]" />
                {benchmarkLabel}
              </span>
            </th>
            <th className="w-[34%] px-2 py-2">
              <span className="sr-only">Both on one scale</span>
            </th>
            {gap ? <th className="oa-caption px-3.5 py-2 text-right">Gap</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff = row.strategy - row.benchmark;
            return (
              <tr key={row.year} className="h-10 border-b border-oa-border last:border-0 hover:bg-oa-accent">
                <td className="oa-mono whitespace-nowrap px-3.5 tabular-nums text-oa-fg">
                  {row.year}
                  {row.complete ? null : <span className="ml-1.5 text-[11px] text-oa-muted-fg">part</span>}
                </td>
                <td className={`oa-mono px-2 text-right tabular-nums ${toneOf(row.strategy)}`}>{signedPct(row.strategy)}</td>
                <td className="oa-mono px-2 text-right tabular-nums text-oa-muted-fg">{signedPct(row.benchmark)}</td>
                <td className={`px-2 ${gap ? "" : "pr-3.5"}`}>
                  <span className="flex flex-col gap-1">
                    <SignedBar value={row.strategy} domain={domain} color="var(--series-a)" className="h-1.5" />
                    <SignedBar value={row.benchmark} domain={domain} color="var(--series-b)" className="h-1.5" />
                  </span>
                </td>
                {gap ? <td className={`oa-mono px-3.5 text-right tabular-nums ${toneOf(diff)}`}>{signedPct(diff)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableBox>
  );
}

/** The caveats, always open. Hiding them behind a click would defeat the point. */
export function CaveatList({ caveats }: { caveats: Caveat[] }) {
  if (caveats.length === 0) return null;
  return (
    <ol className="divide-y divide-oa-border">
      {caveats.map((caveat, index) => (
        <li key={caveat.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 px-3.5 py-3">
          <span className="oa-mono pt-0.5 text-[12px] tabular-nums text-oa-muted-fg">{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-5 text-oa-fg">{caveat.title}</p>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-oa-muted-fg">{caveat.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A plain bordered panel with a label strip, the building block of these pages. */
export function Panel({
  title,
  aside,
  children,
  className = "",
  bodyClassName = "",
  id,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`oa-surface min-w-0 scroll-mt-20 overflow-hidden border border-oa-border bg-oa-card ${className}`}>
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-oa-border px-3.5 py-2">
        <h2 className="oa-label">{title}</h2>
        {aside ? <div className="text-[12.5px] tabular-nums text-oa-muted-fg">{aside}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** The biases that flatter a result, in one short line. The order follows the caveat catalogue. */
const BIAS_ORDER = ["hindsight_picks", "survivorship", "partial_index", "estimated_size", "short_record", "late_start", "costs", "no_costs"];
const BIAS_IDS = new Set(BIAS_ORDER);

export function CaveatLine({ caveats, className = "" }: { caveats: Caveat[]; className?: string }) {
  const titles = caveats.filter((caveat) => BIAS_IDS.has(caveat.id)).map((caveat) => caveat.title.replace(/\.$/, ""));
  if (titles.length === 0) return null;
  const text = titles.map((title, index) => (index === 0 ? title : title.charAt(0).toLowerCase() + title.slice(1))).join("; ");
  return <p className={`text-[12.5px] leading-5 text-oa-muted-fg ${className}`}>Backtested, not traded. {text}.</p>;
}
