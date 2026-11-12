"use client";

import { LockCard, MeterNote } from "@/components/oa/gate";
import type { GatedBacktestResponse } from "@/lib/backtest/gated";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { StockLogo } from "@/components/stock-logo";
import type { BacktestRun } from "@/lib/backtest";
import {
  BENCHMARK_OPTIONS,
  REBALANCE_OPTIONS,
  cleanTicker,
  setupHref,
  type BacktestSetup,
} from "@/lib/backtest/setup";
import { EXAMPLE_MIXES } from "@/lib/backtest/examples";
import type { WeightsRebalance } from "@/lib/backtest/types";

import { EquityChart } from "./equity-chart";
import { longDay, plainPct, signedPct, toneOf } from "./format";
import { TheRead } from "@/components/oa/insight";
import { START_MONEY, buildBacktestRead } from "@/lib/backtest-insights";
import type { Caveat } from "@/lib/backtest/types";

import { BIAS_ORDER, Panel, StatGrid, YearTable } from "./results";
import { trackBacktestRun, trackLimitHit } from "@/lib/product-analytics";

type Row = { id: number; symbol: string; weight: string };
export type Preset = { href: string; label: string; group: string };

const EXAMPLES = EXAMPLE_MIXES.map((mix) => ({ label: mix.label, rows: mix.holdings.map((item): [string, number] => [item.symbol, item.weight]) }));

const FIELD =
  "h-9 w-full min-w-0 rounded-md border border-oa-border bg-oa-page px-2.5 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary";

let nextId = 1;
function makeRows(holdings: { symbol: string; weight: number }[]): Row[] {
  return holdings.map((item) => ({ id: nextId++, symbol: item.symbol, weight: String(Math.round(item.weight * 100) / 100) }));
}

/** The biases that apply to this run, as one plain sentence next to the result. */
function caveatSentence(caveats: Caveat[], example: boolean): string {
  const titles = BIAS_ORDER.map((id) => caveats.find((caveat) => caveat.id === id))
    // The example is a decades-old rule of thumb, not tickers picked for how they did, so the hindsight warning is the user's own runs only.
    .filter((caveat): caveat is Caveat => Boolean(caveat) && !(example && caveat!.id === "hindsight_picks"))
    .map((caveat) => caveat.title.replace(/\.$/, ""));
  const rest = titles.map((title) => title.charAt(0).toLowerCase() + title.slice(1)).join("; ");
  return `A replay of past prices, not real trades${rest ? `: ${rest}` : ""}.`;
}

/** Holdings as cards: the logo, its own return big, and how its share of the mix moved. Rows fill edge to edge. */
function HoldingCards({ run }: { run: BacktestRun }) {
  return (
    <div className="max-h-[22rem] overflow-y-auto overscroll-contain p-3">
      <ul className="flex flex-wrap gap-2">
        {run.holdings.map((holding) => (
          <li key={holding.symbol} className="min-w-[7.75rem] flex-1 basis-[calc(33.333%-0.5rem)]">
            {/* Not a link: funds such as TLT or GLD have no stock page. */}
            <div className="h-full rounded-md border border-oa-border bg-oa-bg px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-oa-fg">
              <StockLogo ticker={holding.symbol} size={20} />
              <span className="oa-mono">{holding.symbol}</span>
            </span>
            <p className={`oa-mono mt-1.5 text-[20px] font-medium leading-7 tabular-nums ${toneOf(holding.total_return)}`}>{signedPct(holding.total_return, 0)}</p>
            <p className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">
              {plainPct(holding.weight, 0)} of the mix, {plainPct(holding.end_weight, 0)} at the end
            </p>
            {holding.last_price_date && holding.last_price_date < run.period.end ? (
              <p className="mt-0.5 text-[12px] text-oa-muted-fg">Last price {longDay(holding.last_price_date)}</p>
            ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultView({ run, example }: { run: BacktestRun; example: boolean }) {
  const benchmark = run.input.benchmark;
  const s = run.summary.strategy;
  const b = run.summary.benchmark;
  const read = React.useMemo(() => {
    const base = buildBacktestRead({ ...run, benchmark }, example ? "the 60/40 mix" : "this mix");
    // The hindsight caveat sits right under the number it qualifies, as one sentence.
    return { ...base, sub: caveatSentence(run.caveats, example), source: `Prices through ${longDay(run.price_as_of)}` };
  }, [run, benchmark, example]);
  // The chart in money: what $10,000 became on each day, in the mix and in the comparison fund. The thinned curve
  // can skip the first day, so the start (the $10,000 itself) is put back, or the legend's change would not match the read.
  const curve = React.useMemo(() => {
    const money = (value: number) => (value * START_MONEY) / 100;
    const head = run.curve.dates[0] && run.curve.dates[0] > run.period.start;
    return {
      dates: head ? [run.period.start, ...run.curve.dates] : run.curve.dates,
      strategy: [...(head ? [START_MONEY] : []), ...run.curve.strategy.map(money)],
      benchmark: [...(head ? [START_MONEY] : []), ...run.curve.benchmark.map(money)],
      dd_strategy: [...(head ? [0] : []), ...run.curve.dd_strategy],
      dd_benchmark: [...(head ? [0] : []), ...run.curve.dd_benchmark],
    };
  }, [run.curve, run.period.start]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TheRead read={read} askContext={false} />
      <Panel
        title={`What $10,000 became, ${longDay(run.period.start)} to ${longDay(run.period.end)}`}
        aside={
          <a href="#mix" className="text-oa-primary underline underline-offset-2 lg:hidden">
            Change the mix
          </a>
        }
      >
        <div className="px-4 py-3">
          <EquityChart curve={curve} strategyLabel={example ? "60/40 mix" : "Your mix"} benchmarkLabel={benchmark} unit="money" note={false} />
        </div>
        {run.limited_by ? (
          <p className="max-w-[78ch] border-t border-oa-border px-4 py-3 text-[14px] leading-[22px] text-oa-fg">
            The test starts on {longDay(run.period.start)} because {run.limited_by.symbol} has no price before then.
          </p>
        ) : null}
      </Panel>

      <StatGrid
        headline={false}
        strategy={s}
        benchmark={b}
        benchmarkLabel={benchmark}
        worstYear={run.worst_year}
        bestYear={run.best_year}
        hitRate={run.hit_rate}
        turnover={run.turnover.annual}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Year by year">
          {/* About eight years tall; older years scroll inside. */}
          <div className="max-h-[21rem] overflow-y-auto overscroll-contain">
            <YearTable years={run.years} benchmarkLabel={benchmark} strategyLabel={example ? "60/40" : "Your mix"} bars={false} />
          </div>
        </Panel>
        <Panel title="What each holding did">
          <HoldingCards run={run} />
          <p className="border-t border-oa-border px-3.5 py-2 text-[12.5px] leading-5 text-oa-muted-fg">
            {run.turnover.rebalances === 0
              ? "Never rebalanced, so the end weights show how far the mix drifted."
              : `Reset to the target weights ${run.turnover.rebalances} times. Trading costs took about ${(run.costs.total_drag * 100).toFixed(1)}% in total.`}
          </p>
        </Panel>
      </div>
    </div>
  );
}

export function BacktestWorkbench({
  initialSetup,
  initialResponse,
  presets,
  notice,
  activePreset,
  firstDate,
  lastDate,
  example = false,
}: {
  initialSetup: BacktestSetup;
  initialResponse: GatedBacktestResponse | null;
  presets: Preset[];
  notice: string | null;
  /** The preset this setup was loaded from, so the picker shows it. */
  activePreset: string;
  firstDate: string | null;
  lastDate: string | null;
  /** The page opened on its example run (no mix in the address). */
  example?: boolean;
}) {
  const [rows, setRows] = React.useState<Row[]>(() =>
    initialSetup.holdings.length > 0 ? makeRows(initialSetup.holdings) : [{ id: nextId++, symbol: "", weight: "" }],
  );
  const [start, setStart] = React.useState(initialSetup.start ?? "");
  const [end, setEnd] = React.useState(initialSetup.end ?? "");
  const [rebalance, setRebalance] = React.useState<WeightsRebalance>(initialSetup.rebalance);
  const [benchmark, setBenchmark] = React.useState(initialSetup.benchmark);
  const [cost, setCost] = React.useState(String(initialSetup.cost_bps));
  const [response, setResponse] = React.useState<GatedBacktestResponse | null>(initialResponse);
  // Still showing the page's example, until the first run of your own.
  const [showingExample, setShowingExample] = React.useState(example);
  // Which ready-made mix the form shows as picked; a run of your own clears it.
  const [preset, setPreset] = React.useState(activePreset);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [shareHref, setShareHref] = React.useState<string | null>(initialSetup.holdings.length > 0 ? setupHref(initialSetup) : null);
  const resultRef = React.useRef<HTMLDivElement>(null);

  const total = rows.reduce((sum, row) => sum + (Number(row.weight) > 0 ? Number(row.weight) : 0), 0);
  const filled = rows.filter((row) => row.symbol.trim() !== "");
  const benchmarkOptions = BENCHMARK_OPTIONS.some((option) => option.value === benchmark)
    ? BENCHMARK_OPTIONS
    : [...BENCHMARK_OPTIONS, { value: benchmark, label: benchmark }];

  const update = (id: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const equalize = () => {
    const count = filled.length;
    if (count === 0) return;
    const each = Math.floor(1000 / count) / 10;
    setRows((current) =>
      current.filter((row) => row.symbol.trim() !== "").map((row, index) => ({ ...row, weight: String(index === 0 ? Math.round((100 - each * (count - 1)) * 10) / 10 : each) })),
    );
  };

  const run = async (override?: Row[]) => {
    const source = (override ?? rows).filter((row) => row.symbol.trim() !== "");
    setFormError(null);
    const holdings: BacktestSetup["holdings"] = [];
    for (const row of source) {
      const symbol = cleanTicker(row.symbol);
      if (!symbol) return setFormError(`"${row.symbol}" does not look like a ticker.`);
      if (holdings.some((item) => item.symbol === symbol)) return setFormError(`${symbol} is listed twice.`);
      const weight = Number(row.weight);
      if (!(weight > 0)) return setFormError(`Give ${symbol} a weight above zero.`);
      holdings.push({ symbol, weight });
    }
    if (holdings.length === 0) return setFormError("Add at least one ticker.");
    const costValue = Number(cost);
    if (!Number.isInteger(costValue) || costValue < 0 || costValue > 200) return setFormError("Cost per trade must be a whole number from 0 to 200.");
    if (start && end && start >= end) return setFormError("The start date must be before the end date.");

    const setup: BacktestSetup = { holdings, start: start || null, end: end || null, rebalance, benchmark, cost_bps: costValue };
    setBusy(true);
    try {
      const reply = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      });
      const body = (await reply.json()) as GatedBacktestResponse;
      trackBacktestRun({
        ok: body.ok,
        holdings: holdings.length,
        tickers: holdings.map((item) => item.symbol),
        rebalance,
        benchmark,
        error_code: body.ok ? null : body.error.code,
        origin: override ? "preset" : "form",
      });
      if (!body.ok && body.error.code === "limit_reached") trackLimitHit({ feature: "backtest", plan: body.gate.plan, limit: body.gate.meter?.limit ?? null, code: "limit_reached" });
      setResponse(body);
      setShowingExample(false);
      if (!override) setPreset("");
      const href = setupHref(setup);
      setShareHref(href);
      window.history.replaceState(null, "", href);
      setCopied(false);
      requestAnimationFrame(() => {
        if (window.matchMedia("(max-width: 1023px)").matches) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setResponse((previous) => ({
        ok: false,
        error: { code: "unavailable", message: "The test did not run. Check your connection and try again." },
        gate: previous?.gate ?? { plan: "anon", trialEligible: false, meter: null, lookback: null },
      }));
    } finally {
      setBusy(false);
    }
  };

  const loadExample = (example: (typeof EXAMPLES)[number]) => {
    const next = example.rows.map(([symbol, weight]) => ({ id: nextId++, symbol, weight: String(weight) }));
    setRows(next);
    void run(next);
  };

  const copyLink = async () => {
    if (!shareHref) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareHref}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const groups = [...new Set(presets.map((preset) => preset.group))];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <form
        id="mix"
        className={`oa-surface scroll-mt-16 overflow-hidden border border-oa-border bg-oa-card lg:sticky lg:top-4 lg:order-last ${
          response?.ok ? "order-last" : ""
        }`}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-oa-border px-3.5 py-2">
          <h2 className="oa-label">Your mix</h2>
          <span className={`oa-mono text-[12.5px] tabular-nums ${Math.abs(total - 100) < 0.5 || total === 0 ? "text-oa-muted-fg" : "text-oa-primary"}`}>
            {total > 0 ? `adds up to ${Math.round(total * 10) / 10}` : ""}
          </span>
        </div>

        {presets.length > 0 ? (
          <div className="border-b border-oa-border px-3.5 py-2.5">
            <label className="oa-caption" htmlFor="bt-preset">
              Start from
            </label>
            <select
              id="bt-preset"
              className={`${FIELD} mt-1`}
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value);
                if (event.target.value) window.location.href = event.target.value;
              }}
            >
              <option value="">Your own mix</option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {presets
                    .filter((preset) => preset.group === group)
                    .map((preset) => (
                      <option key={preset.href} value={preset.href}>
                        {preset.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}

        <div className="px-3.5 py-2.5">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] gap-x-2 gap-y-1.5">
            <span className="oa-caption">Ticker</span>
            <span className="oa-caption text-right">Weight</span>
            <span />
            {rows.map((row, index) => (
              <React.Fragment key={row.id}>
                <input
                  aria-label={`Ticker ${index + 1}`}
                  className={`${FIELD} oa-mono uppercase`}
                  placeholder="AAPL"
                  value={row.symbol}
                  maxLength={12}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => update(row.id, { symbol: event.target.value.toUpperCase() })}
                />
                <input
                  aria-label={`Weight for ticker ${index + 1}`}
                  className={`${FIELD} oa-mono text-right tabular-nums`}
                  placeholder="25"
                  inputMode="decimal"
                  value={row.weight}
                  onChange={(event) => update(row.id, { weight: event.target.value.replace(/[^0-9.]/g, "") })}
                />
                <button
                  type="button"
                  aria-label={`Remove ${row.symbol || `row ${index + 1}`}`}
                  className="h-9 rounded-md text-[16px] text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg disabled:opacity-30"
                  disabled={rows.length === 1}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                >
                  ×
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <OaButton
              variant="secondary"
              size="xs"
              disabled={rows.length >= 30}
              onClick={() => setRows((current) => [...current, { id: nextId++, symbol: "", weight: "" }])}
            >
              + Add ticker
            </OaButton>
            <OaButton variant="secondary" size="xs" disabled={filled.length === 0} onClick={equalize}>
              Equal weights
            </OaButton>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 border-t border-oa-border px-3.5 py-2.5">
          <label className="min-w-0">
            <span className="oa-caption">From</span>
            <input type="date" className={`${FIELD} oa-mono mt-1`} value={start} min={firstDate ?? undefined} max={lastDate ?? undefined} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="oa-caption">To</span>
            <input type="date" className={`${FIELD} oa-mono mt-1`} value={end} min={firstDate ?? undefined} max={lastDate ?? undefined} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <label className="col-span-2 min-w-0">
            <span className="oa-caption">Rebalance</span>
            <select className={`${FIELD} mt-1`} value={rebalance} onChange={(event) => setRebalance(event.target.value as WeightsRebalance)}>
              {REBALANCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="oa-caption">Compare with</span>
            <select className={`${FIELD} mt-1`} value={benchmark} onChange={(event) => setBenchmark(event.target.value)}>
              {benchmarkOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="oa-caption">Cost per trade</span>
            <span className="relative mt-1 block">
              <input title="10 bps is 0.1% of each trade" className={`${FIELD} oa-mono pr-9 text-right tabular-nums`} inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value.replace(/[^0-9]/g, ""))} />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-oa-muted-fg">bps</span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-oa-border px-3.5 py-2.5">
          <OaButton type="submit" loading={busy}>
            Run backtest
          </OaButton>
          {shareHref && response?.ok ? (
            <OaButton variant="secondary" onClick={copyLink}>
              {copied ? "Link copied ✓" : "Copy link"}
            </OaButton>
          ) : null}
        </div>
        {formError ? (
          <p role="alert" className="border-t border-oa-border bg-oa-bg px-3.5 py-2 text-[13px] leading-5 text-signal-bearish">
            {formError}
          </p>
        ) : null}
      </form>

      <div ref={resultRef} className="min-w-0 scroll-mt-16">
        {notice && !(example && !showingExample) ? (
          <p className="mb-4 max-w-[78ch] rounded-md border border-oa-border bg-oa-bg px-3.5 py-2.5 text-[14px] leading-[22px] text-oa-fg">{notice}</p>
        ) : null}
        {response === null ? (
          <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
            <div className="border-b border-oa-border px-3.5 py-2">
              <h2 className="oa-label">Nothing run yet</h2>
            </div>
            <div className="px-3.5 py-4">
              <p className="max-w-xl text-[14.5px] leading-6 text-oa-fg">
                Enter tickers and weights, then run it. You get the growth of the mix against a benchmark, the worst fall, a year-by-year table
                and the ways the result is likely to mislead you.
              </p>
              <p className="oa-caption mt-4">Or try one</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    disabled={busy}
                    onClick={() => loadExample(example)}
                    className="rounded-md border border-oa-border bg-oa-page px-3 py-2 text-left hover:border-oa-primary disabled:opacity-50"
                  >
                    <span className="block text-[13.5px] font-medium text-oa-fg">{example.label}</span>
                    <span className="oa-mono block text-[12px] text-oa-muted-fg">{example.rows.map(([symbol, weight]) => `${symbol} ${weight}`).join(" · ")}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : response.ok ? (
          <>
            <ResultView run={response.result} example={showingExample} />
            <div className="mt-3 flex flex-col gap-2">
              {response.gate.lookback ? (
                <LockCard
                  feature="backtest_history"
                  plan={response.gate.plan}
                  trialEligible={response.gate.trialEligible}
                  title={`This run starts ${response.gate.lookback.start}: Free tests the last ${response.gate.lookback.years} years`}
                />
              ) : null}
              {response.gate.meter ? (
                <MeterNote used={response.gate.meter.used} limit={response.gate.meter.limit} unit="backtests" />
              ) : null}
            </div>
          </>
        ) : response.error.code === "limit_reached" ? (
          <LockCard feature="backtest" plan={response.gate.plan} trialEligible={response.gate.trialEligible} body={response.error.message} />
        ) : (
          <div role="alert" className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
            <div className="border-b border-oa-border px-3.5 py-2">
              <h2 className="oa-label">{response.error.code === "missing_history" ? "No price history" : "That did not run"}</h2>
            </div>
            <div className="px-3.5 py-4">
              <p className="max-w-xl text-[14.5px] leading-6 text-oa-fg">{response.error.message}</p>
              {response.error.symbols && response.error.symbols.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {response.error.symbols.map((symbol) => (
                    <span key={symbol} className="oa-mono rounded-sm border border-oa-border bg-oa-bg px-2 py-0.5 text-[13px] text-oa-fg">
                      {symbol}
                    </span>
                  ))}
                  <OaButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const missing = new Set(response.error.symbols);
                      const next = rows.filter((row) => !missing.has(row.symbol.trim().toUpperCase()));
                      setRows(next.length > 0 ? next : [{ id: nextId++, symbol: "", weight: "" }]);
                      if (next.some((row) => row.symbol.trim() !== "")) void run(next);
                    }}
                  >
                    Remove and run again
                  </OaButton>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
