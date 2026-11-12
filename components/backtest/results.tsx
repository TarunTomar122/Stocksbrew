import { ToneGlyph } from "@/components/oa/kit/tone";
import type { Caveat, CurveStats, YearRow } from "@/lib/backtest/types";
import { beatShare, markFor } from "@/lib/tone";

import { longDay, plainPct, ratio, signedPct, toneOf } from "./format";

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

function Cell({ label, value, sub, tone, mark }: { label: string; value: string; sub?: string; tone?: string; mark?: "up" | "down" | "flat" | null }) {
  return (
    <div className="min-w-0 bg-oa-card px-3.5 py-3">
      <p className="oa-caption truncate">{label}</p>
      <p className={`oa-mono mt-1 flex items-center gap-1.5 text-[17px] font-medium leading-6 tabular-nums ${tone ?? "text-oa-fg"}`}>
        <span className="min-w-0 truncate">{value}</span>
        <Mark tone={mark} />
      </p>
      {sub ? <p className="oa-mono mt-0.5 truncate text-[12.5px] tabular-nums text-oa-muted-fg">{sub}</p> : null}
    </div>
  );
}

/** Headline figures with the benchmark's figure under each one. */
export function StatGrid({
  strategy,
  benchmark,
  benchmarkLabel,
  worstYear,
  bestYear,
  hitRate,
  turnover,
  headline = true,
}: {
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
  const vs = (text: string) => `${benchmarkLabel} ${text}`;
  return (
    <div
      className={`oa-surface grid grid-cols-2 gap-px overflow-hidden border border-oa-border bg-oa-border ${
        headline ? "sm:grid-cols-4" : "sm:grid-cols-3 2xl:grid-cols-6"
      }`}
    >
      {headline ? (
        <>
          <Cell
            label="Return per year"
            value={strategy.annualized_return === null ? signedPct(strategy.total_return) : signedPct(strategy.annualized_return)}
            sub={vs(benchmark.annualized_return === null ? signedPct(benchmark.total_return) : signedPct(benchmark.annualized_return))}
            tone={toneOf(strategy.annualized_return ?? strategy.total_return)}
          />
          <Cell label="Worst fall" value={signedPct(strategy.max_drawdown)} sub={vs(signedPct(benchmark.max_drawdown))} mark={fallMark(strategy.max_drawdown)} />
        </>
      ) : null}
      <Cell label="Sharpe" value={ratio(strategy.sharpe)} sub={vs(ratio(benchmark.sharpe))} mark={markFor("sharpe", strategy.sharpe)} />
      <Cell label="Volatility" value={plainPct(strategy.volatility)} sub={vs(plainPct(benchmark.volatility))} />
      <Cell
        label="Worst year"
        value={worstYear ? signedPct(worstYear.strategy) : "–"}
        sub={worstYear ? `${worstYear.year}, ${vs(signedPct(worstYear.benchmark))}` : undefined}
        tone={toneOf(worstYear?.strategy)}
      />
      <Cell
        label="Best year"
        value={bestYear ? signedPct(bestYear.strategy) : "–"}
        sub={bestYear ? `${bestYear.year}, ${vs(signedPct(bestYear.benchmark))}` : undefined}
        tone={toneOf(bestYear?.strategy)}
      />
      <Cell
        label={`Beat ${benchmarkLabel}`}
        value={hitRate.years > 0 ? `${hitRate.beat} of ${hitRate.years}` : "–"}
        sub={hitRate.complete_years_only ? "full years" : "part years only"}
        mark={beatShare(hitRate.beat, hitRate.years)}
      />
      <Cell
        label="Turnover a year"
        value={turnover === null ? "–" : plainPct(turnover, 0)}
        sub={turnover === null ? "needs a full year" : "of holdings replaced"}
      />
    </div>
  );
}

export function YearTable({
  years,
  benchmarkLabel,
  strategyLabel = "Strategy",
  bars = true,
}: {
  years: YearRow[];
  benchmarkLabel: string;
  strategyLabel?: string;
  /** false drops the bar column, which only repeats the numbers beside it. */
  bars?: boolean;
}) {
  const rows = [...years].reverse();
  const scale = Math.max(0.05, ...years.map((row) => Math.max(Math.abs(row.strategy), Math.abs(row.benchmark))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-oa-border text-left">
            <th className="oa-caption px-3.5 py-2">Year</th>
            <th className="oa-caption px-2 py-2 text-right">{strategyLabel}</th>
            <th className="oa-caption px-2 py-2 text-right">{benchmarkLabel}</th>
            <th className="oa-caption px-3.5 py-2 text-right">Gap</th>
            {bars ? <th className="hidden w-[28%] min-w-[6rem] px-3.5 py-2 sm:table-cell" aria-hidden="true" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const gap = row.strategy - row.benchmark;
            const size = Math.min(100, (Math.abs(row.strategy) / scale) * 100);
            return (
              <tr key={row.year} className="h-9 border-b border-oa-border last:border-0 hover:bg-oa-accent">
                <td className="oa-mono px-3.5 tabular-nums text-oa-fg">
                  {row.year}
                  {row.complete ? null : <span className="ml-1.5 text-[11px] text-oa-muted-fg">part</span>}
                </td>
                <td className={`oa-mono px-2 text-right tabular-nums ${toneOf(row.strategy)}`}>{signedPct(row.strategy)}</td>
                <td className="oa-mono px-2 text-right tabular-nums text-oa-muted-fg">{signedPct(row.benchmark)}</td>
                <td className={`oa-mono px-3.5 text-right tabular-nums ${toneOf(gap)}`}>{signedPct(gap)}</td>
                {bars ? (
                <td className="hidden px-3.5 sm:table-cell" aria-hidden="true">
                  <div className="relative h-2">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-oa-border" />
                    <div
                      className={`absolute inset-y-0 rounded-[2px] ${row.strategy >= 0 ? "left-1/2 bg-signal-bullish" : "right-1/2 bg-signal-bearish"}`}
                      style={{ width: `${size / 2}%`, opacity: 0.75 }}
                    />
                  </div>
                </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
