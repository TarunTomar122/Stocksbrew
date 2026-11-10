"use client";

import * as React from "react";

import { RECOVERY_LADDER, cagr, drawdownRecovery, futureValue, positionSize, yearsBetween } from "@/lib/docs/calc";
import type { ToolId } from "@/lib/docs/types";

/**
 * The three calculators under /docs/tools. They run in the browser, keep
 * nothing and send nothing. Each starts with a worked example filled in so
 * the page shows a real result before anyone types.
 */

const NUM = "oa-mono tabular-nums";

function num(value: string): number | null {
  const cleaned = value.replace(/[$,%\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number, digits = 2): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function pct(fraction: number, digits = 2): string {
  const value = fraction * 100;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

function Field({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  type = "text",
  hideLabel = false,
}: {
  label: string;
  /** Keep the label for screen readers only, when a visible heading already says it. */
  hideLabel?: boolean;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: React.ReactNode;
  placeholder?: string;
  type?: "text" | "date";
}) {
  const id = React.useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "oa-caption block"}>
        {label}
      </label>
      <div className={`oa-surface flex ${hideLabel ? "" : "mt-1"} h-10 items-center border border-oa-border bg-oa-card px-2.5 focus-within:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]`}>
        {prefix ? <span className={`${NUM} mr-1 text-[14px] text-oa-muted-fg`}>{prefix}</span> : null}
        <input
          id={id}
          type={type}
          inputMode={type === "text" ? "decimal" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${NUM} h-full min-w-0 flex-1 bg-transparent text-[15px] text-oa-fg outline-none placeholder:text-oa-muted-fg/70`}
        />
        {suffix ? <span className={`${NUM} ml-1 shrink-0 text-[14px] text-oa-muted-fg`}>{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[12.5px] leading-4 text-oa-muted-fg">{hint}</p> : null}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-oa-bg p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-7 cursor-pointer rounded px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
            value === option.id ? "bg-oa-card font-medium text-oa-fg shadow-[0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:text-oa-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Frame({ inputs, result }: { inputs: React.ReactNode; result: React.ReactNode }) {
  return (
    <section aria-label="Calculator" className="oa-surface grid overflow-hidden border border-oa-border bg-oa-card md:grid-cols-2">
      <div className="flex flex-col gap-3.5 border-b border-oa-border p-4 md:border-b-0 md:border-r">{inputs}</div>
      <div className="flex flex-col bg-oa-bg p-4" aria-live="polite">
        {result}
      </div>
    </section>
  );
}

function Headline({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="oa-caption">{label}</p>
      <p className={`${NUM} mt-1 text-[34px] font-medium leading-10 tracking-tight text-oa-fg`}>{value}</p>
      {sub ? <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">{sub}</p> : null}
    </div>
  );
}

function Rows({ rows }: { rows: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="mt-4 border-t border-oa-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b border-oa-border py-1.5">
          <dt className="text-[14px] text-oa-muted-fg">{label}</dt>
          <dd className={`${NUM} text-right text-[14px] text-oa-fg`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-6">
      <p className="oa-caption">No result yet</p>
      <p className="mt-1 text-[15px] leading-6 text-oa-fg">{children}</p>
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-oa-primary pl-2.5 text-[13.5px] leading-5 text-oa-fg/90">{children}</p>
  );
}

/* ── Position size ─────────────────────────────────────────────────────── */

function PositionSizeCalc() {
  const [account, setAccount] = React.useState("50000");
  const [mode, setMode] = React.useState<"percent" | "dollars">("percent");
  const [risk, setRisk] = React.useState("1");
  const [entry, setEntry] = React.useState("80");
  const [stop, setStop] = React.useState("72");
  const [cap, setCap] = React.useState("");
  const [target, setTarget] = React.useState("100");

  const riskValue = num(risk);
  const result = positionSize({
    account: num(account) ?? 0,
    riskPct: mode === "percent" ? riskValue : null,
    riskDollars: mode === "dollars" ? riskValue : null,
    entry: num(entry) ?? 0,
    stop: num(stop) ?? 0,
    maxAllocationPct: num(cap),
    target: num(target),
  });

  return (
    <Frame
      inputs={
        <>
          <Field label="Account size" prefix="$" value={account} onChange={setAccount} placeholder="50000" />
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="oa-caption">Risk on this idea</span>
              <Toggle
                label="Risk unit"
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setRisk(next === "percent" ? "1" : "500");
                }}
                options={[
                  { id: "percent", label: "% of account" },
                  { id: "dollars", label: "Dollars" },
                ]}
              />
            </div>
            <Field
              label={mode === "percent" ? "Risk, percent of account" : "Risk, dollars"}
              hideLabel
              prefix={mode === "dollars" ? "$" : undefined}
              suffix={mode === "percent" ? "%" : undefined}
              value={risk}
              onChange={setRisk}
              hint="What you accept losing if the stop is hit."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry price" prefix="$" value={entry} onChange={setEntry} />
            <Field label="Stop price" prefix="$" value={stop} onChange={setStop} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max allocation" suffix="%" value={cap} onChange={setCap} placeholder="optional" />
            <Field label="Target price" prefix="$" value={target} onChange={setTarget} placeholder="optional" />
          </div>
        </>
      }
      result={
        result.ok ? (
          <>
            <Headline
              label={result.direction === "short" ? "Shares to short" : "Shares to buy"}
              value={result.shares.toLocaleString("en-US")}
              sub={`${money(result.positionValue)} position, ${result.allocationPct.toFixed(1)}% of the account`}
            />
            <Rows
              rows={[
                ["Risk per share", money(result.riskPerShare)],
                ["Loss if the stop is hit", `${money(result.riskAtStop)} (${result.riskAtStopPct.toFixed(2)}%)`],
                ["Risk budget", money(result.riskBudget)],
                ["Reward to risk", result.rewardToRisk != null ? `${result.rewardToRisk.toFixed(2)} to 1` : "n/a"],
              ]}
            />
            {result.cappedByAllocation ? (
              <Flag>The size was cut by the allocation limit or the account size, so the loss at the stop is below your risk budget.</Flag>
            ) : null}
            {result.targetOnWrongSide ? <Flag>The target is on the wrong side of the entry for this stop, so no reward to risk is shown.</Flag> : null}
            {result.direction === "short" ? <Flag>The stop is above the entry, so this is sized as a short position.</Flag> : null}
          </>
        ) : (
          <Problem>{result.reason}</Problem>
        )
      }
    />
  );
}

/* ── CAGR ──────────────────────────────────────────────────────────────── */

function CagrCalc() {
  const [start, setStart] = React.useState("10000");
  const [end, setEnd] = React.useState("18000");
  const [mode, setMode] = React.useState<"years" | "dates">("years");
  const [years, setYears] = React.useState("5");
  const [from, setFrom] = React.useState("2020-01-02");
  const [to, setTo] = React.useState("2025-01-02");

  const span = mode === "years" ? num(years) : yearsBetween(from, to);
  const startValue = num(start);
  const endValue = num(end);
  const result = cagr(startValue ?? 0, endValue ?? Number.NaN, span ?? 0);

  return (
    <Frame
      inputs={
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting value" prefix="$" value={start} onChange={setStart} />
            <Field label="Ending value" prefix="$" value={end} onChange={setEnd} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="oa-caption">Period</span>
              <Toggle
                label="Period input"
                value={mode}
                onChange={setMode}
                options={[
                  { id: "years", label: "Years" },
                  { id: "dates", label: "Two dates" },
                ]}
              />
            </div>
            {mode === "years" ? (
              <Field label="Years" hideLabel value={years} onChange={setYears} suffix="yr" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" type="date" value={from} onChange={setFrom} />
                <Field label="To" type="date" value={to} onChange={setTo} />
              </div>
            )}
          </div>
          <p className="text-[13px] leading-5 text-oa-muted-fg">
            Assumes one amount at the start and nothing added or taken out since.
          </p>
        </>
      }
      result={
        result.ok ? (
          <>
            <Headline label="CAGR" value={pct(result.cagr)} sub="a year, compounded" />
            <Rows
              rows={[
                ["Total return", pct(result.totalReturn)],
                ["Multiple", `${result.multiple.toFixed(2)}×`],
                ["Period", `${result.years.toFixed(2)} years`],
                ...(startValue != null && result.cagr > -1
                  ? ([
                      ["Same rate for 10 years", money(futureValue(startValue, result.cagr, 10), 0)],
                      ["Same rate for 20 years", money(futureValue(startValue, result.cagr, 20), 0)],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
            {result.years < 1 ? (
              <Flag>This period is under a year. Annualising it stretches a short result into a yearly rate it has not earned.</Flag>
            ) : null}
            <p className="mt-3 text-[12.5px] leading-4 text-oa-muted-fg">
              The 10 and 20 year rows are what the starting value becomes if the same rate continued. They are arithmetic, not a forecast.
            </p>
          </>
        ) : (
          <Problem>{mode === "dates" && span == null ? "Choose an end date after the start date." : result.reason}</Problem>
        )
      }
    />
  );
}

/* ── Drawdown recovery ─────────────────────────────────────────────────── */

function DrawdownCalc() {
  const [fall, setFall] = React.useState("35");
  const [rate, setRate] = React.useState("8");
  const fallValue = num(fall);
  const result = drawdownRecovery(fallValue ?? 0, num(rate));
  const barWidth = fallValue != null && fallValue > 0 && fallValue < 100 ? 100 - fallValue : 0;

  return (
    <Frame
      inputs={
        <>
          <Field label="Fall from the high" suffix="%" value={fall} onChange={setFall} hint="The max drawdown from a backtest or a Follow record works here." />
          <Field label="Yearly return afterwards" suffix="%" value={rate} onChange={setRate} placeholder="optional" hint="Used only to estimate how long recovery takes." />
          <div>
            <p className="oa-caption mb-1.5">Common falls</p>
            <div className="flex flex-wrap gap-1.5">
              {RECOVERY_LADDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFall(String(value))}
                  aria-pressed={fallValue === value}
                  className={`${NUM} h-7 cursor-pointer rounded-md border px-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
                    fallValue === value ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg" : "border-oa-border bg-oa-card text-oa-muted-fg hover:text-oa-fg"
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>
        </>
      }
      result={
        result.ok ? (
          <>
            <Headline label="Gain needed to get back" value={pct(result.gainNeeded, 1)} sub={`after a ${fallValue}% fall`} />
            <div className="mt-4" aria-hidden="true">
              <div className="flex h-7 overflow-hidden rounded border border-oa-border bg-oa-card">
                <div className="h-full bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]" style={{ width: `${barWidth}%` }} />
                <div className="h-full flex-1 bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--oa-primary)_38%,transparent)_0_6px,transparent_6px_12px)]" />
              </div>
              <div className={`${NUM} mt-1 flex justify-between text-[11.5px] text-oa-muted-fg`}>
                <span>what is left: {result.valueAtBottom.toFixed(1)}</span>
                <span>to regain: {(100 - result.valueAtBottom).toFixed(1)}</span>
              </div>
            </div>
            <Rows
              rows={[
                ["100 becomes", result.valueAtBottom.toFixed(2)],
                ["Multiple needed", `${(1 + result.gainNeeded).toFixed(2)}×`],
                ["Time to recover", result.yearsToRecover != null ? `${result.yearsToRecover.toFixed(1)} years at ${num(rate)}% a year` : "enter a yearly return"],
              ]}
            />
          </>
        ) : (
          <Problem>{result.reason}</Problem>
        )
      }
    />
  );
}

export function Calculator({ tool }: { tool: ToolId }) {
  if (tool === "position-size") return <PositionSizeCalc />;
  if (tool === "cagr") return <CagrCalc />;
  return <DrawdownCalc />;
}
