"use client";

import { useState } from "react";
import { FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import { metricContextLine } from "@/components/percentile-rail";
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

function stripBenchmarkParenthetical(text: string, benchmark: number | null): string {
  if (benchmark == null || !Number.isFinite(benchmark)) return text;
  const nums = [...new Set([
    benchmark.toFixed(1),
    benchmark.toFixed(2),
    formatMetricValue(benchmark),
    String(Math.round(benchmark)),
  ])];
  let out = text;
  for (const b of nums) {
    const escaped = b.replace(".", "\\.");
    out = out.replace(new RegExp(`\\([^)]*${escaped}%?[^)]*\\)`, "g"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Drop the headline number when it is already shown in the row above. */
function stripLeadingMetricValue(summary: string, value: number): string {
  const dashed = summary.trim().match(/^[+\-]?\d+(?:\.\d+)?%?\s*-\s*(.+)$/);
  if (dashed) return dashed[1].trim();

  if (Number.isInteger(value)) {
    const ranked = summary.trim().match(new RegExp(`^${Math.round(value)}\\s*-\\s*(.+)$`));
    if (ranked) return ranked[1].trim();
  }

  return summary.trim();
}

function relativeMetricLine(m: StockIntelMetric): string {
  const context = metricContextLine(m).trim();
  const hasBenchmark = m.benchmark != null && Number.isFinite(m.benchmark);

  // Peer-relative one-liner without repeating the headline figure.
  if (hasBenchmark && context) return context;

  const summary = m.summary?.trim();
  if (!summary) return context;

  if (m.value == null || !Number.isFinite(m.value)) return summary;

  const stripped = stripBenchmarkParenthetical(stripLeadingMetricValue(summary, m.value), m.benchmark);
  if (stripped && stripped !== formatMetricValue(m.value)) return stripped;

  return context || "";
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
  const relative = relativeMetricLine(m);
  const tone = metricTone(m.signal, m.score);

  return (
    <div className="min-w-0 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-on-surface">{m.label}</span>
        {m.value != null ? (
          <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums" style={{ color: tone }}>
            {formatMetricValue(m.value)}
          </span>
        ) : null}
      </div>
      {relative ? (
        <div className="mt-1.5 text-[11.5px] leading-snug text-on-surface-variant">
          <span className="block max-w-[42ch]">{relative}</span>
          {m.benchmark != null && m.benchmark_label ? (
            <span className="mt-1 block font-mono tabular-nums text-[10px] text-on-surface-variant/80">
              {m.benchmark_label}: {formatMetricValue(m.benchmark)}
            </span>
          ) : null}
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
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-left transition-colors ${
        active
          ? "border-[color-mix(in_srgb,var(--on-surface)_20%,transparent)] bg-surface-container-low text-on-surface"
          : "border-outline-variant bg-surface text-on-surface-variant hover:border-on-surface hover:text-on-surface"
      }`}
      aria-pressed={active}
    >
      <span className="text-[10.5px] font-semibold">{label}</span>
      <span
        className="font-mono text-[12px] font-extrabold tabular-nums leading-none"
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
}: {
  pillars: StockIntelPro["pillars"];
  isSubscribed: boolean;
}) {
  const [active, setActive] = useState<Key>("growth");
  const p = pillars[active];
  const metrics = (p?.metrics ?? []).filter((m) => m.value != null || m.summary);
  const groups = groupPillarMetrics(active, metrics);
  const availableMetrics = p.available_metrics ?? p.metrics.filter((metric) => metric.score != null).length;
  const totalMetrics = p.total_metrics ?? p.metrics.length;
  const coverage = Math.round(pillarCoverage(p) * 100);

  return (
    <div className={isSubscribed ? "" : "flex h-full min-h-[32rem] flex-col"}>
      <div className={isSubscribed ? "" : "p-5 pb-4 sm:p-6 sm:pb-5 lg:p-7 lg:pb-5"}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fundamental score category">
          {KEYS.map((key) => {
            const pl = pillars[key];
            const coverage = pillarCoverage(pl);
            return (
              <PillarTab
                key={key}
                score={pl.score}
                coverage={coverage}
                color={scoreColor(pl.score, coverage >= 0.5)}
                label={LABEL[key]}
                active={key === active}
                onClick={() => setActive(key)}
              />
            );
          })}
        </div>
      </div>

      {metrics.length > 0 && isSubscribed && (
        <div className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
            <div>
              <p className="text-[16px] font-semibold capitalize text-on-surface">{p.verdict}</p>
              <p className="mt-1 max-w-[48ch] text-[10.5px] leading-relaxed text-on-surface-variant">
                {pillarCoverage(p) < 0.5
                  ? "Score withheld until enough weighted inputs are available."
                  : "Compared with sector peers where available."}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10.5px] tabular-nums text-on-surface-variant">
                {availableMetrics} / {totalMetrics} metrics
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-on-surface">
                {coverage}% coverage
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-7 md:grid-cols-2 md:gap-0 md:divide-x md:divide-outline-variant/50">
            {groups.map((group) => (
              <section
                key={group.title}
                className="min-w-0 first:md:pr-7 last:md:pl-7"
              >
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                  {group.title}
                </p>
                <div className="mt-2 space-y-1">
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
        <div className="relative flex min-h-[22rem] flex-1 overflow-hidden border-t border-outline-variant bg-surface-container-low/70">
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
              <p className="text-[22px] font-extrabold tracking-[-0.03em] text-on-surface">See the full financial picture</p>
              <p className="mt-2 max-w-[54ch] text-[12.5px] leading-relaxed text-on-surface-variant">Open the five-year record, valuation checks and Wall Street view behind these scores.</p>
              <ul className="mt-5 grid gap-x-8 gap-y-3 text-[12.5px] text-on-surface/85 sm:grid-cols-2">
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
                buttonClassName="!min-h-11 !w-full !rounded-lg !border-primary !bg-none !bg-primary !px-5 !py-3 !text-[13px] !text-on-primary !shadow-none sm:!w-auto sm:!min-w-[15rem]"
              />
              <p className="mt-2 text-[10.5px] text-on-surface-variant">Free for 3 days, then $9/mo. Cancel anytime.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
