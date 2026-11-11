import * as React from "react";

import { EquityChart } from "@/components/backtest/equity-chart";
import { CaveatList, ResultLead, StatGrid, YearTable } from "@/components/backtest/results";
import { Delta, NUM, Panel, Ticker, fmtDay } from "@/components/oa/kit";
import { CallTag } from "@/components/screener/shared";
import type { BasketMember } from "@/lib/baskets-plain/match";
import type { BasketCannot } from "@/lib/baskets-plain/parse";
import type { BasketBacktest } from "@/lib/baskets-plain/server";
import { BASKET_EXAMPLES } from "@/lib/baskets-plain/examples";
import { moneyWords } from "@/lib/baskets-plain/spec";

/** Server-rendered pieces of the plain-English basket pages. */

export const EXAMPLES = BASKET_EXAMPLES;

export function exampleHref(text: string): string {
  return `/api/baskets/build?q=${encodeURIComponent(text)}`;
}

/** One input, sent as a plain GET so it works before any script loads. */
export function BasketForm({ value = "", autoFocus = false, compact = false }: { value?: string; autoFocus?: boolean; compact?: boolean }) {
  return (
    <form action="/api/baskets/build" method="get" className={`flex flex-col gap-2 sm:flex-row sm:items-center ${compact ? "" : "sm:gap-3"}`} role="search">
      <label htmlFor="basket-q" className="sr-only">
        Describe the stocks you want in your own words
      </label>
      <input
        id="basket-q"
        name="q"
        type="text"
        required
        maxLength={200}
        defaultValue={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Describe a theme in your own words"
        className="h-11 w-full min-w-0 rounded-lg sm:w-auto sm:flex-1 border border-oa-border bg-oa-bg px-3.5 text-[15px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
      />
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
      >
        {compact ? "Rebuild" : "Build the basket"}
      </button>
    </form>
  );
}

export function ExampleChips({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {EXAMPLES.map((text) => (
        // A plain link with nofollow: opening one stores a basket, which a crawler should not do.
        <a
          key={text}
          href={exampleHref(text)}
          rel="nofollow"
          className="inline-flex min-h-8 items-center rounded-full border border-oa-border bg-oa-card px-3 py-1 text-[13px] leading-5 text-oa-fg hover:border-oa-primary hover:text-oa-primary"
        >
          {text}
        </a>
      ))}
    </div>
  );
}

export function CannotList({ items, className = "" }: { items: BasketCannot[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {items.map((item, index) => (
        <li key={`${item.code}-${index}`} className="flex gap-2 text-[13.5px] leading-5 text-oa-muted-fg">
          <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-oa-label" />
          <span>{item.line}</span>
        </li>
      ))}
    </ul>
  );
}

/** The rule read back, then what we could not use. */
export function RuleCard({ sentence, rank, cannot, count, covered }: { sentence: string; rank: string; cannot: BasketCannot[]; count: number | null; covered: number }) {
  return (
    <Panel label="The rule" right={count === null ? undefined : <span className={NUM}>{count} of {covered} stocks we cover</span>}>
      <p className="max-w-[60rem] text-pretty text-[16px] font-medium leading-6 text-oa-fg">{sentence}</p>
      <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">{rank}</p>
      <CannotList items={cannot} className="mt-3 border-t border-oa-border pt-3" />
    </Panel>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 sm:text-right">
      <dt className="oa-caption">{label}</dt>
      <dd className={`${NUM} mt-0.5 text-[14px] text-oa-fg`}>{children}</dd>
    </div>
  );
}

/** The members, one row each: who, why it is in (full sentences), and three plain numbers. */
export function MemberList({ members, total }: { members: BasketMember[]; total: number }) {
  return (
    <>
      <ol>
        {members.map((member, index) => {
          const row = member.row;
          return (
            <li
              key={row.symbol}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 border-b border-oa-border px-3 py-3 last:border-0 sm:px-4 lg:grid-cols-[1.75rem_minmax(0,1fr)_minmax(15rem,auto)] lg:gap-x-5"
            >
              <span className={`${NUM} pt-0.5 text-[12px] text-oa-muted-fg`}>{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Ticker symbol={row.symbol} name={row.name} wrap />
                  <CallTag call={row.call} />
                </div>
                <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{member.why}</p>
              </div>
              <dl className="col-start-2 mt-2 grid grid-cols-3 gap-x-4 lg:col-start-3 lg:mt-0">
                <Figure label="Value">{row.market_cap ? moneyWords(row.market_cap).replace(" billion", "B").replace(" million", "M").replace(" trillion", "T") : "–"}</Figure>
                <Figure label="1 year">
                  <Delta value={row.ret_1y} digits={1} />
                </Figure>
                <Figure label="Today">
                  <Delta value={row.day_pct} digits={1} />
                </Figure>
              </dl>
            </li>
          );
        })}
      </ol>
      {total > members.length ? (
        <p className="border-t border-oa-border px-4 py-3 text-[13px] leading-5 text-oa-muted-fg">
          {total - members.length} more fit the rule. The list and the backtest use the first {members.length} in the ranking above.
        </p>
      ) : null}
    </>
  );
}

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function BacktestBlock({ test }: { test: BasketBacktest }) {
  const result = test.result;
  const strategy = result.summary.strategy;
  const bench = result.summary.benchmark;
  const perYear = strategy.annualized_return !== null;
  const late = test.pick.lateStart;
  return (
    <div id="backtest" className="flex scroll-mt-20 flex-col gap-3">
      <ResultLead
        perYear={perYear}
        years={`${result.period.years.toFixed(1)} years`}
        ret={perYear ? strategy.annualized_return : strategy.total_return}
        benchRet={perYear ? bench.annualized_return : bench.total_return}
        benchmarkLabel="S&P 500"
        worstFall={strategy.max_drawdown}
        start={result.period.start}
        end={result.period.end}
        aside={
          <span className="mt-1 block">
            {test.pick.included.length} stocks, equal amounts, reset monthly, {result.costs.bps} bp a trade
          </span>
        }
      >
        <div className="border-t border-oa-border px-1 pb-2 pt-1 sm:px-2">
          <EquityChart curve={result.curve} strategyLabel="This basket" benchmarkLabel="S&P 500 fund (SPY)" />
        </div>
      </ResultLead>
      {late.length > 0 || test.pick.noHistory.length > 0 ? (
        <p className="px-1 text-[13px] leading-5 text-oa-muted-fg">
          {late.length > 0
            ? `${names(late.map((item) => item.symbol))} listed after ${fmtDay(result.period.start, true)}, so the test leaves ${late.length === 1 ? "it" : "them"} out rather than shorten the window for everyone. `
            : ""}
          {test.pick.noHistory.length > 0 ? `We hold no price history for ${names(test.pick.noHistory)}, so ${test.pick.noHistory.length === 1 ? "it is" : "they are"} not in the test.` : ""}
        </p>
      ) : null}
      <StatGrid
        strategy={strategy}
        benchmark={bench}
        benchmarkLabel="S&P 500"
        worstYear={result.worst_year}
        bestYear={result.best_year}
        hitRate={result.hit_rate}
        turnover={result.turnover.annual}
        headline={false}
      />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
          <h3 className="oa-label border-b border-oa-border px-3.5 py-2.5">Year by year</h3>
          <YearTable years={result.years} benchmarkLabel="S&P 500" strategyLabel="Basket" />
        </section>
        <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
          <h3 className="oa-label border-b border-oa-border px-3.5 py-2.5">The caveats</h3>
          <CaveatList caveats={result.caveats} />
        </section>
      </div>
    </div>
  );
}
