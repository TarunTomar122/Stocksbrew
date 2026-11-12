"use client";

import * as React from "react";

import { FanChart, FanLegend } from "@/components/goal/fan-chart";
import { Card as Panel, NUM, Stats, dayWords } from "@/components/goal/card";
import { ShowMore } from "@/components/oa/kit/more";
import { StockLogo } from "@/components/stock-logo";
import { INFLATION, PATHS, BLOCK_MONTHS, replay, yearlyOf } from "@/lib/goal/bootstrap";
import type { GoalData, GoalMix } from "@/lib/goal/data";
import { LIMITS, inputProblem, inputsQuery, parseAmount, type GoalInputs, type MixId } from "@/lib/goal/inputs";
import { planOutcome, type Outcome } from "@/lib/goal/plan";
import { dayPossessive, etToday } from "@/lib/day-words";
import { moneyWords, monthlyWords, pctWords } from "@/lib/goal/read";
import { HINDSIGHT_DISCOUNT, discounted, monthWords, type PartHistory } from "@/lib/goal/series";

/**
 * "today", "yesterday's close", "Monday's close", "the Nov 3 close". By the day alone (no market-hours clock), so the
 * server and the browser only disagree across midnight, not at the open or the close.
 */
function pricesFrom(day: string): string {
  const today = etToday();
  if (day.slice(0, 10) === today) return "today";
  const close = dayPossessive(day, today);
  return close ? `${close} close` : dayWords(day);
}

/**
 * /portfolio/goal in the browser: the replays run here from the monthly
 * series the server sends, so editing an input redraws at once. The
 * replays use a fixed seed, so the page the server renders and the one the
 * browser takes over show the same numbers.
 */

const pct1 = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const INFLATION_WORDS = `${+(INFLATION * 100).toFixed(1)}%`;

function chanceLabel(chance: number): string {
  if (chance >= 0.995) return "Over 99%";
  if (chance < 0.005) return "Under 1%";
  return `${Math.round(chance * 100)}%`;
}

export function GoalPlanner({
  data,
  initial,
  portfolioStart,
  thisYear,
}: {
  data: GoalData;
  initial: GoalInputs;
  portfolioStart: number;
  /** The server's calendar year, so the page and the browser agree on "around 2046". */
  thisYear: number;
}) {
  const [inputs, setInputs] = React.useState<GoalInputs>(initial);
  const example = data.mode === "example";
  const mix = data.mixes.find((item) => item.id === inputs.mix) ?? data.mixes[0]!;
  const spy = data.mixes.find((item) => item.id === "spy") ?? null;
  const inflation = inputs.real ? INFLATION : 0;

  // Your own holdings count only half of their past lead over the S&P 500 unless the full replay is asked for.
  const discount = mix.id === "own" && !inputs.full && spy !== null;
  const series = React.useMemo(() => (discount && spy ? discounted(mix.returns, spy.returns, HINDSIGHT_DISCOUNT) : mix.returns), [discount, mix, spy]);
  // The yearly figure shown beside your holdings: the one the replays use, so the full past lead only shows with the full replay on.
  const own = data.mixes.find((item) => item.id === "own") ?? null;
  const ownYearly = React.useMemo(
    () => (!own ? null : inputs.full || !spy ? own.yearly : yearlyOf(discounted(own.returns, spy.returns, HINDSIGHT_DISCOUNT))),
    [own, spy, inputs.full],
  );
  const replays = React.useMemo(() => replay(series, { inflation }), [series, inflation]);
  // The S&P 500's replays only change with the inflation switch, not with the mix.
  const spyAll = React.useMemo(() => (spy ? replay(spy.returns, { inflation }) : null), [spy, inflation]);
  const spyReplays = mix.id === "spy" ? null : spyAll;
  const problem = inputProblem(inputs);
  const outcome = React.useMemo(() => (problem ? null : planOutcome(replays, inputs, spyReplays)), [problem, replays, inputs, spyReplays]);
  // The full replay flatters the holdings only when their full past beat the S&P 500's.
  const fullFlatters = own?.yearly != null && spy?.yearly != null ? own.yearly > spy.yearly : true;

  // Keep the address in step so a plan can be reloaded or shared. Next's own history state is kept.
  React.useEffect(() => {
    const query = inputsQuery(inputs, portfolioStart);
    const url = `${window.location.pathname}?${query}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
  }, [inputs, portfolioStart]);

  const update = (patch: Partial<GoalInputs>) => setInputs((current) => ({ ...current, ...patch }));
  const label = [
    example && inputs.mix === "own" ? "The example's goal" : "Your goal",
    inputs.mix === "own" && inputs.full ? "full replay" : null,
    inputs.real ? "in today's money" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const putIn = outcome ? outcome.bands.map((_, year) => inputs.start + inputs.monthly * 12 * year) : [];
  const more = outcome?.levers.find((lever) => lever.kind === "more");

  return (
    <div className="flex flex-col gap-3">
      {problem ? (
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
          <p className="oa-label">{label}</p>
          <p className="mt-1 text-[15px] leading-[22px] text-oa-fg">{problem}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {outcome ? (
            <Panel label={`The range, age ${inputs.age} to ${inputs.byAge}`}>
              <FanLegend />
              <div className="mt-3">
                <FanChart bands={outcome.bands} target={inputs.target} startAge={inputs.age} putIn={putIn} />
              </div>
            </Panel>
          ) : null}
          {outcome ? <EndStats outcome={outcome} inputs={inputs} /> : null}
          <Limits data={data} mix={mix} inputs={inputs} planned={!problem} />
        </div>
        <Inputs
          inputs={inputs}
          mixes={data.mixes}
          update={update}
          portfolioStart={portfolioStart}
          example={example}
          suggestion={more && more.kind === "more" ? more.monthly : null}
          thisYear={thisYear}
          ownYearly={ownYearly}
          hasOwn={own !== null}
          fullFlatters={fullFlatters}
        />
      </div>

      <ShowMore always label="How the replays work, and what they leave out" less="Hide the details">
        <Details data={data} mix={mix} inputs={inputs} outcome={outcome} />
      </ShowMore>
    </div>
  );
}

function EndStats({ outcome, inputs }: { outcome: Outcome; inputs: GoalInputs }) {
  const { end } = outcome;
  return (
    <Stats
      stats={[
        { label: "Chance of the goal", value: chanceLabel(outcome.chance), sub: `by ${inputs.byAge}, of ${PATHS.toLocaleString("en-US")} replays` },
        { label: "Weakest 1 in 10", value: moneyWords(end.p10) },
        { label: "Middle replay", value: moneyWords(end.p50), sub: `${moneyWords(outcome.putIn)} put in` },
        { label: "Strongest 1 in 10", value: moneyWords(end.p90) },
      ]}
    />
  );
}

/** The limits, said plainly and always in view. */
function Limits({ data, mix, inputs, planned }: { data: GoalData; mix: GoalMix; inputs: GoalInputs; planned: boolean }) {
  const spy = data.mixes.find((item) => item.id === "spy");
  const months = mix.returns.length;
  const historyYears = Math.round(months / 12);
  const years = inputs.byAge - inputs.age;
  return (
    <div className="flex flex-col gap-1.5 px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">
      <p className="max-w-[48rem] text-pretty">
        These replays reuse the last {historyYears} years of actual returns, {monthWords(data.span.first)} to {monthWords(data.span.last)}, and those
        were unusually good years for US stocks{spy?.yearly != null ? `: the S&P 500 returned about ${pct1(spy.yearly)} a year before inflation` : ""}.{" "}
        {planned ? `The next ${years > 1 ? `${years} years` : "year"}` : "The years ahead"} can be worse than any replay here. This is not a forecast, and it is not advice.
      </p>
      {inputs.mix === "own" ? (
        <p className="max-w-[48rem] text-pretty">
          Holding a few stocks makes the range wider than an index fund&apos;s, and a stock that led these years may not lead the next ones.
        </p>
      ) : null}
    </div>
  );
}

function AmountField({
  id,
  label,
  value,
  limits,
  onCommit,
  prefix = "$",
  whole = false,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  limits: readonly [number, number];
  onCommit: (value: number) => void;
  prefix?: string;
  whole?: boolean;
  hint?: React.ReactNode;
}) {
  const shown = (n: number) => (prefix ? Math.round(n).toLocaleString("en-US") : String(Math.round(n)));
  const [text, setText] = React.useState(shown(value));
  const [bad, setBad] = React.useState(false);
  const focused = React.useRef(false);
  // Follow changes made elsewhere (a suggestion button) while the field is not being typed in.
  React.useEffect(() => {
    if (!focused.current) {
      setText(shown(value));
      setBad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const valid = (raw: string): number | null => {
    const parsed = parseAmount(raw);
    return parsed !== null && parsed >= limits[0] && parsed <= limits[1] ? (whole ? Math.round(parsed) : parsed) : null;
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] leading-4 text-oa-muted-fg">
        {label}
      </label>
      <div
        className={`flex h-10 items-center rounded-md border bg-oa-bg px-2.5 focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${bad ? "border-signal-bearish" : "border-oa-border"}`}
      >
        {prefix ? <span className={`${NUM} mr-1 text-[14px] text-oa-muted-fg`}>{prefix}</span> : null}
        <input
          id={id}
          type="text"
          inputMode={whole ? "numeric" : "decimal"}
          autoComplete="off"
          value={text}
          aria-invalid={bad || undefined}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => {
            // Valid values apply as you type; the message waits until you leave the field, so "4" on the way to "45" is not an error.
            setText(event.target.value);
            const next = valid(event.target.value);
            if (next !== null) {
              setBad(false);
              onCommit(next);
            }
          }}
          onBlur={() => {
            focused.current = false;
            const next = valid(text);
            // Something the plan cannot use: say so, and keep the number the plan is using in the box.
            setBad(next === null);
            setText(shown(next ?? value));
          }}
          className={`${NUM} min-w-0 flex-1 bg-transparent text-[15px] text-oa-fg outline-none`}
        />
      </div>
      {bad ? (
        <p className="text-[12px] leading-4 text-signal-bearish">
          That has to be a number from {prefix}
          {limits[0].toLocaleString("en-US")} to {prefix}
          {limits[1].toLocaleString("en-US")}, so the plan keeps the last one.
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-4 text-oa-muted-fg">{hint}</p>
      ) : null}
    </div>
  );
}

function Inputs({
  inputs,
  mixes,
  update,
  portfolioStart,
  example,
  suggestion,
  thisYear,
  ownYearly,
  hasOwn,
  fullFlatters,
}: {
  inputs: GoalInputs;
  mixes: GoalMix[];
  update: (patch: Partial<GoalInputs>) => void;
  portfolioStart: number;
  example: boolean;
  suggestion: number | null;
  thisYear: number;
  /** The yearly figure the replays use for your holdings: after the hindsight discount unless the full replay is on. */
  ownYearly: number | null;
  hasOwn: boolean;
  fullFlatters: boolean;
}) {
  const years = inputs.byAge - inputs.age;
  const goalYear = thisYear + years;
  return (
    <Panel label="Your plan" className="lg:self-start">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <div className="col-span-2">
          <AmountField id="goal-target" label="Goal" value={inputs.target} limits={LIMITS.target} onCommit={(target) => update({ target })} />
        </div>
        <AmountField id="goal-age" label="Your age now" value={inputs.age} limits={LIMITS.age} prefix="" whole onCommit={(age) => update({ age })} />
        <AmountField
          id="goal-by"
          label="Reach it by age"
          value={inputs.byAge}
          limits={LIMITS.byAge}
          prefix=""
          whole
          onCommit={(byAge) => update({ byAge })}
          hint={years >= 1 ? `In ${years === 1 ? "a year" : `${years} years`}, around ${goalYear}` : null}
        />
        <div className="col-span-2">
          <AmountField
            id="goal-start"
            label="Starting with"
            value={inputs.start}
            limits={LIMITS.start}
            onCommit={(start) => update({ start })}
            hint={
              portfolioStart > 0 && Math.round(inputs.start) !== Math.round(portfolioStart) ? (
                <button type="button" onClick={() => update({ start: portfolioStart })} className="font-medium text-oa-primary hover:underline">
                  Use {example ? "the example's" : "your portfolio's"} value, {monthlyWords(portfolioStart)}
                </button>
              ) : portfolioStart > 0 ? (
                `${example ? "The example's" : "Your portfolio's"} value today`
              ) : null
            }
          />
        </div>
        <div className="col-span-2">
          <AmountField
            id="goal-monthly"
            label="Added every month"
            value={inputs.monthly}
            limits={LIMITS.monthly}
            onCommit={(monthly) => update({ monthly })}
            hint={
              suggestion !== null ? (
                <button type="button" onClick={() => update({ monthly: suggestion })} className="font-medium text-oa-primary hover:underline">
                  Try {monthlyWords(suggestion)} a month
                </button>
              ) : null
            }
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[12.5px] leading-4 text-oa-muted-fg">Invested in</legend>
        <div className="flex flex-col gap-1.5" role="radiogroup">
          {mixes.map((item) => {
            const active = item.id === inputs.mix;
            const yearly = item.id === "own" ? ownYearly : item.yearly;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ mix: item.id as MixId })}
                className={`flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-left text-[14px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
                  active
                    ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-bg font-medium text-oa-fg"
                    : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                }`}
              >
                <span className="min-w-0">{item.label}</span>
                {yearly !== null ? <span className={`${NUM} shrink-0 text-[12.5px] font-normal text-oa-muted-fg`}>{pct1(yearly)} a year</span> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] leading-4 text-oa-muted-fg">
          Yearly figures are each mix&apos;s past from {monthWords(mixes[0]?.months[0] ?? null)}, before inflation
          {hasOwn && !inputs.full ? `, with ${example ? "the example's" : "your"} holdings counted at half their lead or lag against the S&P 500` : ""}.
        </p>
      </fieldset>

      {hasOwn ? (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={inputs.full}
            onChange={(event) => update({ full: event.target.checked })}
            className="mt-0.5 size-4 shrink-0 accent-[var(--oa-primary)]"
          />
          <span className="text-[14px] leading-5 text-oa-fg">
            {fullFlatters ? "Show the full replay, the flattering version" : "Show the full replay, without the hindsight discount"}
            <span className="block text-[12px] leading-4 text-oa-muted-fg">
              Counts all of how far each holding beat or trailed the S&amp;P 500, as if picking today&apos;s holdings back then had been possible.
            </span>
          </span>
        </label>
      ) : null}

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={inputs.real}
          onChange={(event) => update({ real: event.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-[var(--oa-primary)]"
        />
        <span className="text-[14px] leading-5 text-oa-fg">
          Show in today&apos;s money
          <span className="block text-[12px] leading-4 text-oa-muted-fg">
            Takes {INFLATION_WORDS} a year off for rising prices, close to the average since 2014, so the goal and the monthly amount stay in today&apos;s
            dollars.
          </span>
        </span>
      </label>
    </Panel>
  );
}

function standInWords(part: PartHistory, span: { first: string; last: string }): string | null {
  if (part.filled === 0) return null;
  if (part.own === 0) return `We have no stored prices for ${part.name}, so its share uses the S&P 500's return in every month.`;
  const before = part.first && part.first > span.first;
  const after = part.last && part.last < span.last;
  if (before && !after) {
    return `${part.name} has its own prices only from ${monthWords(part.first)}. For the ${part.filled} months before that, its share uses the S&P 500's return.`;
  }
  if (after && !before) return `Our prices for ${part.name} stop at ${monthWords(part.last)}. For the ${part.filled} months after that, its share uses the S&P 500's return.`;
  return `${part.name} is missing ${part.filled} months of prices. In those months its share uses the S&P 500's return.`;
}

function Details({ data, mix, inputs, outcome }: { data: GoalData; mix: GoalMix; inputs: GoalInputs; outcome: Outcome | null }) {
  const months = mix.returns.length;
  const years = inputs.byAge - inputs.age;
  const standIns = mix.parts.map((part) => standInWords(part, data.span)).filter((line): line is string => line !== null);
  const own = mix.id === "own";
  // Every year for a short plan, every fifth (and the last) for a long one.
  const rows = outcome
    ? outcome.bands.filter((band) => band.year > 0 && (outcome.years <= 10 || band.year % 5 === 0 || band.year === outcome.years))
    : [];
  return (
    <div className="flex flex-col gap-3">
      <Panel label="How it works">
        <div className="flex max-w-[48rem] flex-col gap-2 text-[14px] leading-5 text-oa-fg">
          <p>
            We take the actual monthly return of every holding from {monthWords(data.span.first)} to {monthWords(data.span.last)} ({months} months, dividends
            included) and weight them by today&apos;s mix. Each of the {PATHS.toLocaleString("en-US")} replays strings together random {BLOCK_MONTHS}-month
            stretches of that history, so a crash and the recovery after it stay together. A stretch that runs past {monthWords(data.span.last)} carries on
            from {monthWords(data.span.first)}.
          </p>
          <p>
            Your monthly amount goes in at the end of every month. The middle replay is the one in the middle when all of them are lined up; the weakest one
            in ten is the replay that only one in ten do worse than.
          </p>
          {outcome && years > months / 12 ? (
            <p>
              A {years}-year plan is longer than the {Math.round(months / 12)} years of history, so each replay reuses stretches of the same years. Real{" "}
              {years}-year stretches can differ from each other far more than these replays do.
            </p>
          ) : null}
          <p>
            {inputs.real
              ? `In today's money, ${INFLATION_WORDS} a year comes off every return for rising prices, close to the average yearly rise in US consumer prices since 2014. It is one flat rate, not the month-by-month price index. The goal and the monthly amount are in today's dollars, which means the amount you actually add rises with prices.`
              : "These are plain dollars, with no allowance for rising prices. A million dollars in 20 years will buy a good deal less than it does today; switch on today's money to see that."}
          </p>
          {mix.id === "own" ? (
            <p>
              {inputs.full
                ? "This is the full replay: it counts all of how far each holding beat or trailed the S&P 500 in each month. Today's holdings were picked knowing how they did, so this version leans on hindsight."
                : `Today's holdings were picked knowing how they did, so replaying their whole past leans on hindsight. Each month we count only ${HINDSIGHT_DISCOUNT === 0.5 ? "half" : `${Math.round(HINDSIGHT_DISCOUNT * 100)}%`} of how far each holding beat or trailed the S&P 500: a stock that beat it by 4 points in a month counts as beating it by 2. That share is our judgement, not a measured figure. Pulling each month toward the S&P 500 also narrows how far the holdings swing around it, so the range is narrower too.`}
            </p>
          ) : null}
          <p>
            It keeps today&apos;s mix the whole way, as if you rebalanced every month, and it leaves out taxes, fund fees, trading costs and any money you take
            out.
          </p>
        </div>
      </Panel>

      {own ? (
        <Panel label={data.mode === "example" ? "The example's holdings" : "Your holdings in the replays"} flush>
          {standIns.length > 0 || data.unvalued.length > 0 || data.basis === "count" ? (
            <div className="flex flex-col gap-1.5 border-b border-oa-border px-4 py-3 text-[14px] leading-5 text-oa-fg">
              {data.basis === "count" ? (
                <p>None of your holdings has a share count or a value yet, so each one counts the same and the start is $0 until you type in what you have.</p>
              ) : null}
              {data.unvalued.length > 0 ? (
                <p>
                  {data.unvalued.join(", ")} {data.unvalued.length === 1 ? "has" : "have"} no share count or value, so {data.unvalued.length === 1 ? "it is" : "they are"} left
                  out of the mix. Add the shares in Portfolio to count {data.unvalued.length === 1 ? "it" : "them"}.
                </p>
              ) : null}
              {standIns.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <HoldingsTable parts={mix.parts} />
        </Panel>
      ) : null}

      {rows.length > 0 ? (
        <Panel label="Year by year" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-[13.5px]">
              <thead>
                <tr className="border-b border-oa-border text-left text-[11.5px] uppercase tracking-[0.06em] text-oa-muted-fg">
                  <th className="px-4 py-2 font-normal">Age</th>
                  <th className="px-3 py-2 text-right font-normal">Weakest 1 in 10</th>
                  <th className="px-3 py-2 text-right font-normal">Middle</th>
                  <th className="px-3 py-2 text-right font-normal">Strongest 1 in 10</th>
                  <th className="px-4 py-2 text-right font-normal">Put in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-oa-border">
                {rows.map((band) => (
                  <tr key={band.year}>
                    <td className={`${NUM} px-4 py-2`}>{inputs.age + band.year}</td>
                    <td className={`${NUM} px-3 py-2 text-right`}>{moneyWords(band.p10)}</td>
                    <td className={`${NUM} px-3 py-2 text-right font-medium`}>{moneyWords(band.p50)}</td>
                    <td className={`${NUM} px-3 py-2 text-right`}>{moneyWords(band.p90)}</td>
                    <td className={`${NUM} px-4 py-2 text-right text-oa-muted-fg`}>{moneyWords(inputs.start + inputs.monthly * 12 * band.year)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <p className="px-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-0">
        Daily closes with dividends from Yahoo Finance, turned into month-end returns
        {data.pricesAsOf ? `. Today's weights use the prices from ${pricesFrom(data.pricesAsOf)}` : ""}.
      </p>
    </div>
  );
}

function HoldingsTable({ parts }: { parts: PartHistory[] }) {
  const sorted = [...parts].sort((a, b) => b.weight - a.weight);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-[13.5px]">
        <thead>
          <tr className="border-b border-oa-border text-left text-[11.5px] uppercase tracking-[0.06em] text-oa-muted-fg">
            <th className="px-4 py-2 font-normal">Holding</th>
            <th className="px-3 py-2 text-right font-normal">Weight</th>
            <th className="px-3 py-2 text-right font-normal">Own prices from</th>
            <th className="px-3 py-2 text-right font-normal">A year, own past</th>
            <th className="px-4 py-2 text-right font-normal">Share of the gain</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-oa-border">
          {sorted.map((part) => (
            <tr key={part.ticker}>
              <td className="px-4 py-2">
                <span className={`${NUM} inline-flex items-center gap-1.5 align-middle font-medium text-oa-fg`}>
                  <StockLogo ticker={part.ticker} size={18} />
                  {part.ticker}
                </span>{" "}
                <span className="text-oa-muted-fg">{part.name !== part.ticker ? part.name : ""}</span>
              </td>
              <td className={`${NUM} px-3 py-2 text-right`}>{pctWords(part.weight)}</td>
              <td className={`${NUM} px-3 py-2 text-right ${part.filled > 0 ? "text-oa-fg" : "text-oa-muted-fg"}`}>{part.own > 0 ? monthWords(part.first) : "None"}</td>
              <td className={`${NUM} px-3 py-2 text-right`}>{pct1(part.yearly)}</td>
              <td className={`${NUM} px-4 py-2 text-right`}>{part.driveShare === null ? "n/a" : part.driveShare < 0 ? "Held it back" : pctWords(part.driveShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
