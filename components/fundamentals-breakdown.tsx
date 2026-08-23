"use client";

import { useState } from "react";
import { FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import { metricRelativeTier } from "@/components/percentile-rail";
import { pillarCoverage } from "@/lib/fundamentals-coverage";
import type { StockIntelMetric, StockIntelPro } from "@/lib/types";

const KEYS = ["growth", "momentum", "valuation", "quality"] as const;
type Key = (typeof KEYS)[number];

const LABEL: Record<Key, string> = {
  growth: "Growth",
  momentum: "Momentum",
  valuation: "Valuation",
  quality: "Quality",
};

function scoreColor(v: number, sufficient = true) {
  if (!sufficient) return "var(--outline)";
  return v >= 85 ? "var(--signal-bullish)" : v >= 60 ? "var(--signal-neutral)" : "var(--signal-bearish)";
}

function metricTone(signal?: string, score?: number | null): string {
  if (signal === "green") return "var(--signal-bullish)";
  if (signal === "red") return "var(--signal-bearish)";
  if (signal === "yellow") return "var(--signal-neutral)";
  if (score != null) return score >= 70 ? "var(--signal-bullish)" : score <= 40 ? "var(--signal-bearish)" : "var(--on-surface)";
  return "var(--on-surface)";
}

function formatMetricValue(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
  if (Math.abs(v) >= 1000 || Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function paceTier(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 75) return "strong";
  if (score >= 55) return "solid";
  if (score >= 40) return "average";
  if (score >= 20) return "below average";
  return "weak";
}

function benchmarkDirection(value: number, benchmark: number): "ahead of" | "below" | "in line with" {
  const diff = value - benchmark;
  if (diff > 1) return "ahead of";
  if (diff < -1) return "below";
  return "in line with";
}

// Every metric here means something different, so this explains what each one
// actually is instead of reusing one generic template for every row. Never
// restate the row's own value, since it's already shown in the value column.
function metricTakeaway(m: StockIntelMetric): string | null {
  const { label, value, benchmark, score } = m;
  if (value == null) return null;
  const tier = paceTier(score);
  const cmp = benchmark != null ? benchmarkDirection(value, benchmark) : null;

  switch (label) {
    case "Revenue growth (TTM)":
    case "Revenue CAGR (3Y)":
    case "Revenue CAGR (5Y)": {
      const share = cmp === "below" ? "losing ground to peers" : cmp === "ahead of" ? "taking share from peers" : "matching peers";
      return cmp
        ? `Sales are growing ${cmp} the sector average of ${benchmark!.toFixed(1)}%, meaning the business is ${share}.`
        : "How fast sales are growing, a sign of demand for the business.";
    }
    case "EPS growth (TTM)":
    case "Profit CAGR (3Y)":
    case "Profit CAGR (5Y)":
    case "Profit CAGR (10Y)":
      return cmp
        ? `Profit per share is growing ${cmp} the sector average of ${benchmark!.toFixed(1)}%.`
        : "How fast profit per share is growing.";
    case "EPS forecast (5Y)":
      return cmp
        ? `Analysts expect earnings growth ${cmp} the sector average of ${benchmark!.toFixed(1)}% over the next 5 years.`
        : "Analysts' 5-year earnings growth forecast.";
    case "EPS next year":
      return tier ? `Analysts expect a ${tier} pace of earnings growth next year.` : "What analysts expect earnings to do next year.";
    case "EPS growth (Q/Q)":
      return tier ? `Earnings grew at a ${tier} pace versus last quarter.` : "How much earnings grew versus last quarter.";
    case "P/E TTM":
      return cmp
        ? `Trading ${cmp === "below" ? "cheaper than" : cmp === "ahead of" ? "pricier than" : "in line with"} the sector average of ${benchmark!.toFixed(1)}x, so you pay ${cmp === "below" ? "less" : cmp === "ahead of" ? "more" : "about the same"} per dollar of profit already earned.`
        : "What you pay per dollar of profit already earned.";
    case "Forward P/E":
      return cmp
        ? `Trading ${cmp === "below" ? "cheaper than" : cmp === "ahead of" ? "pricier than" : "in line with"} the sector average of ${benchmark!.toFixed(1)}x, so you pay ${cmp === "below" ? "less" : cmp === "ahead of" ? "more" : "about the same"} per dollar of next year's expected profit.`
        : "What you pay per dollar of next year's expected profit.";
    case "PEG":
      return value < 1
        ? "Below 1, meaning the price looks reasonable for how fast it's expected to grow."
        : value <= 1.5
          ? "Around 1, a fair price for how fast it's expected to grow."
          : "Above 1, meaning the price is running ahead of how fast it's expected to grow.";
    case "Analyst target": {
      const upside = benchmark ? ((value - benchmark) / benchmark) * 100 : null;
      return upside != null
        ? `About ${upside >= 0 ? "+" : ""}${upside.toFixed(1)}% ${upside >= 0 ? "upside" : "downside"} to the average target.`
        : "Analysts' average 12-month price target.";
    }
    case "ROE":
      return "How efficiently shareholder money turns into profit.";
    case "Operating margin":
      return "Profit kept per dollar of revenue. Higher means more pricing power.";
    case "Payout ratio":
      return "Share of profit paid as dividends. Under 60% is usually sustainable.";
    case "Debt / Equity":
      return "How much the business relies on debt versus equity. Lower is safer.";
    case "Institutional ownership":
      return "Share of stock held by funds and institutions, often read as a vote of confidence.";
    case "Quant rank":
      return "A model rank from 1 (Strong Buy) to 5 (Strong Sell).";
    case "Beat likelihood":
      return "Odds of beating this quarter's earnings estimate.";
    case "Analyst rating":
    case "Analyst consensus":
      return "Average Wall Street rating, from Buy to Sell.";
    case "Short float":
      return "Share of shares sold short. Higher means more bearish bets outstanding.";
    case "Insider activity":
      return "Insider buying or selling over the last six months.";
    case "1-month performance":
    case "1-week performance":
    case "1-year performance":
      return "Price performance over the period.";
    case "5-year CAGR":
      return "Annualized price return over 5 years.";
    case "RSI (14)":
      return "A momentum gauge from 0 to 100. 50s to 60s is typically healthy.";
    default:
      return null;
  }
}

type MetricGroup = {
  title: string;
  metrics: StockIntelMetric[];
};

function groupPillarMetrics(key: Key, metrics: StockIntelMetric[]): MetricGroup[] {
  const inFirstGroup = (metric: StockIntelMetric): boolean => {
    const label = metric.label.toLowerCase();
    if (key === "growth") return !/(forecast|next)/.test(label);
    if (key === "momentum") return /(quant|beat|analyst)/.test(label);
    if (key === "valuation") return /(p\/e|peg|multiple)/.test(label);
    return /(roe|margin|return on)/.test(label);
  };

  const titles: Record<Key, [string, string]> = {
    growth: ["Reported growth", "Forward outlook"],
    momentum: ["Market signal", "Positioning & trend"],
    valuation: ["Valuation multiples", "Price context"],
    quality: ["Profitability", "Balance sheet & ownership"],
  };

  const first = metrics.filter(inFirstGroup);
  const second = metrics.filter((metric) => !inFirstGroup(metric));
  if (first.length === 0 || second.length === 0) return [{ title: "Key metrics", metrics }];

  return [
    { title: titles[key][0], metrics: first },
    { title: titles[key][1], metrics: second },
  ];
}

function MetricRow({ metric: m }: { metric: StockIntelMetric }) {
  const tier = metricRelativeTier(m);
  const tone = metricTone(m.signal, m.score);
  const tierColor =
    tier.favorable == null ? "var(--on-surface-variant)" : tier.favorable ? "var(--signal-bullish)" : "var(--signal-bearish)";
  // Explain what this specific metric means and why the comparison matters,
  // rather than a bare "good"/"bad" tag or one generic template reused for
  // every row regardless of what it's actually measuring.
  const summary = metricTakeaway(m);

  return (
    <div className="min-w-0 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-on-surface">{m.label}</span>
        <span className="shrink-0 font-mono text-[15px] font-medium tabular-nums" style={{ color: m.value != null ? tone : "var(--on-surface-variant)" }}>
          {m.value != null ? formatMetricValue(m.value) : "--"}
        </span>
      </div>
      {summary ? (
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-on-surface-variant">{summary}</p>
      ) : tier.text ? (
        <div className="mt-1.5 text-[13px] leading-snug text-on-surface-variant">
          {tier.text.includes("avg") ? (
            <>
              {tier.text}
              {tier.favorable != null && (
                <span className="font-medium" style={{ color: tierColor }}> · {tier.favorable ? "good" : "bad"}</span>
              )}
            </>
          ) : (
            <span className="font-medium" style={{ color: tierColor }}>{tier.text}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PillarTab({
  score,
  coverage,
  color,
  label,
  active,
  onClick,
}: {
  score: number;
  coverage: number;
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const sufficient = coverage >= 0.5;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2.5 rounded-full border px-4 py-2.5 text-left transition-colors ${
        active
          ? "border-primary text-on-surface"
          : "border-outline-variant bg-surface text-on-surface-variant hover:border-on-surface hover:text-on-surface"
      }`}
      style={
        active
          ? { background: "color-mix(in srgb, var(--primary) 10%, var(--surface))" }
          : undefined
      }
      aria-pressed={active}
    >
      <span className="text-[13px] font-medium">{label}</span>
      <span
        className="font-mono text-[14px] font-medium tabular-nums leading-none"
        style={{ color }}
      >
        {sufficient ? score : "N/A"}
      </span>
    </button>
  );
}

export function FundamentalsBreakdown({
  pillars,
  isSubscribed,
  overallScore,
  overallCoverage,
}: {
  pillars: StockIntelPro["pillars"];
  isSubscribed: boolean;
  overallScore?: number | null;
  overallCoverage?: number | null;
}) {
  const [active, setActive] = useState<Key>("growth");
  const p = pillars[active];
  const metrics = (p?.metrics ?? []).filter((m) => m.value != null || m.summary);
  const groups = groupPillarMetrics(active, metrics);
  const hasOverall = overallScore != null;

  return (
    <div className={isSubscribed ? "" : "flex h-full min-h-[32rem] flex-col"}>
      <div className={isSubscribed ? "" : "sm:p-0"}>
        <div>
          <p className="text-[13px] font-medium text-on-surface-variant">Overall score</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="font-mono text-[36px] font-medium leading-none tabular-nums"
              style={{ color: scoreColor(hasOverall ? overallScore! : 0, hasOverall) }}
            >
              {hasOverall ? Math.round(overallScore!) : "N/A"}
            </span>
            <span className="text-[14px] text-on-surface-variant">/100</span>
          </p>
        </div>

        <div
          className="mt-7 flex gap-2.5 overflow-x-auto sm:flex-wrap"
          style={{ scrollbarWidth: "none" }}
          role="group"
          aria-label="Fundamental score category"
        >
          {KEYS.map((key) => {
            const pl = pillars[key];
            const pillarCov = pillarCoverage(pl);
            return (
              <PillarTab
                key={key}
                score={pl.score}
                coverage={pillarCov}
                color={scoreColor(pl.score, pillarCov >= 0.5)}
                label={LABEL[key]}
                active={key === active}
                onClick={() => setActive(key)}
              />
            );
          })}
        </div>
      </div>

      {metrics.length > 0 && isSubscribed && (
        <div className="mt-8">
          <div className="grid gap-8 sm:grid-cols-2 sm:divide-x sm:divide-outline-variant">
            {groups.map((group) => (
              <section
                key={group.title}
                className="min-w-0 first:sm:pr-8 last:sm:pl-8"
              >
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                  {group.title}
                </p>
                <div className="mt-2 divide-y divide-outline-variant">
                  {group.metrics.map((metric, index) => (
                    <MetricRow key={`${metric.label}-${index}`} metric={metric} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {!isSubscribed && (
        <div className="relative mt-8 flex min-h-[22rem] flex-1 overflow-hidden rounded-2xl bg-surface-container-low/70">
          <div aria-hidden className="pointer-events-none absolute inset-0 select-none space-y-5 p-7 blur-[7px]">
            <div className="flex items-start justify-between gap-5">
              <div className="space-y-2">
                <div className="h-5 w-24 rounded bg-surface-container-high" />
                <div className="h-3 w-52 rounded bg-surface-container-high" />
              </div>
              <div className="h-8 w-20 rounded bg-surface-container-high" />
            </div>
            <div className="grid gap-7 md:grid-cols-2">
              {[0, 1].map((column) => (
                <div key={column} className="space-y-4">
                  <div className="h-3 w-28 rounded bg-surface-container-high" />
                  <div className="h-4 w-full rounded bg-surface-container-high" />
                  <div className="h-3 w-4/5 rounded bg-surface-container-high" />
                  <div className="h-4 w-10/12 rounded bg-surface-container-high" />
                  <div className="h-3 w-2/3 rounded bg-surface-container-high" />
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 flex w-full items-center bg-surface/88 px-6 py-8 backdrop-blur-[3px] sm:px-8 lg:px-10">
            <div className="w-full">
              <p className="text-[22px] font-medium tracking-tight text-on-surface">See the full financial picture</p>
              <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed text-on-surface-variant">Open the five-year record, valuation checks and Wall Street view behind these scores.</p>
              <ul className="mt-5 grid gap-x-8 gap-y-3 text-[13.5px] text-on-surface/85 sm:grid-cols-2">
                {["5 years of revenue, profit and cash flow", "Valuation and balance-sheet checks", "Business and geographic mix", "Analyst targets and recommendation trend"].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[var(--signal-bullish)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <FeedUnlockBar
                surface="stock_tab"
                compact
                className="mt-4 !justify-start !p-0"
                signedOutLabel="See full financials"
                signedInLabel="Unlock full financials"
                buttonClassName="!min-h-11 !w-full !rounded-full !border-none !bg-none !bg-primary !px-5 !py-3 !text-[13px] !font-semibold !text-on-primary !shadow-none sm:!w-auto sm:!min-w-[15rem]"
              />
              <p className="mt-2 text-[10.5px] text-on-surface-variant">Free for 3 days, then $9/mo. Cancel anytime.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
