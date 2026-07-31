"use client";

import { useState } from "react";
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
  if (v == null || !Number.isFinite(v)) return "—";
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

function MetricRow({ metric: m }: { metric: StockIntelMetric }) {
  const relative = relativeMetricLine(m);
  const tone = metricTone(m.signal, m.score);

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-on-surface">{m.label}</span>
        {m.value != null ? (
          <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums" style={{ color: tone }}>
            {formatMetricValue(m.value)}
          </span>
        ) : null}
      </div>
      {relative ? (
        <div className="mt-0.5 flex items-start justify-between gap-3 text-[12px] leading-snug text-on-surface-variant">
          <span>{relative}</span>
          {m.benchmark != null && m.benchmark_label ? (
            <span className="shrink-0 tabular-nums text-[11px] text-on-surface-variant/80">
              {m.benchmark_label}: {formatMetricValue(m.benchmark)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PillarRing({
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
      className={`border-b-2 py-3 text-left transition-colors ${
        active
          ? "border-on-surface text-on-surface"
          : "border-transparent text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="block text-[18px] font-extrabold tabular-nums leading-none" style={{ color }}>
        {sufficient ? score : "N/A"}
      </span>
      <span className="mt-1.5 block text-[10.5px] font-semibold">{label}</span>
    </button>
  );
}

export function FundamentalsBreakdown({ pillars }: { pillars: StockIntelPro["pillars"] }) {
  const [active, setActive] = useState<Key>("growth");
  const p = pillars[active];
  const metrics = (p?.metrics ?? []).filter((m) => m.value != null || m.summary);

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 border-b border-outline-variant">
        {KEYS.map((key) => {
          const pl = pillars[key];
          const coverage = pillarCoverage(pl);
          return (
            <PillarRing
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

      {metrics.length > 0 && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--outline-variant)" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-on-surface-variant">
            <p className="text-[13px] capitalize">{p.verdict}</p>
            <p className="font-mono tabular-nums">
              {p.available_metrics ?? p.metrics.filter((metric) => metric.score != null).length} of{" "}
              {p.total_metrics ?? p.metrics.length} metrics · {Math.round(pillarCoverage(p) * 100)}% coverage
            </p>
          </div>
          <div className="divide-y divide-outline-variant">
            {metrics.map((m, i) => (
              <MetricRow key={`${m.label}-${i}`} metric={m} />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-on-surface-variant">
            {pillarCoverage(p) < 0.5
              ? "Score withheld until at least half of this pillar's weighted inputs are available."
              : "Missing inputs are treated as neutral uncertainty; compared with sector peers where available."}
          </p>
        </div>
      )}
    </div>
  );
}
