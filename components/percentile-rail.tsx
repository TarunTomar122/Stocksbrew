import type { StockIntelMetric } from "@/lib/types";
import { METRIC_HELP, MetricTooltip } from "@/components/metric-tooltip";

const VALUE_TEXT: Record<string, string> = {
  green: "text-[#10b981]",
  yellow: "text-[#111111]",
  red: "text-[#ef4444]",
  na: "text-[#9ca3af]",
};

function formatValue(v: number | string | null): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v;
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2).replace(/\.?0+$/, "");
}

// Turn raw metric numbers + benchmark into a plain-English one-liner the user
// can actually act on, rather than an opaque percentile tier label.
export function metricContextLine(m: StockIntelMetric): string {
  const score = m.score;
  const label = m.label ?? "";
  const value = typeof m.value === "number" ? m.value : null;
  const benchmark = typeof m.benchmark === "number" ? m.benchmark : null;
  const blabel = m.benchmark_label ?? "sector";
  const benchmarkLabel = /\b(?:avg|average)$/i.test(blabel.trim())
    ? blabel.trim()
    : `${blabel.trim()} avg`;

  // If we have an actual benchmark number we can write a relative sentence.
  if (value !== null && benchmark !== null && benchmark !== 0) {
    const diff = ((value - benchmark) / Math.abs(benchmark)) * 100;
    const absDiff = Math.abs(diff);
    const isHigherBetter = !isLowerBetterMetric(label);
    const ahead = isHigherBetter ? diff > 0 : diff < 0;
    const pct = absDiff < 1 ? "<1" : Math.round(absDiff).toString();
    const direction = diff > 0 ? "above" : "below";

    if (absDiff < 3) return `In line with ${benchmarkLabel}`;
    return `${pct}% ${direction} ${benchmarkLabel}${ahead ? " · favorable" : ""}`;
  }

  // Fallback to qualitative tier copy.
  if (score === null || score === undefined) return m.summary;
  if (score >= 85) return "Exceptional vs sector peers";
  if (score >= 70) return "Ahead of most sector peers";
  if (score >= 50) return "Roughly in line with sector";
  if (score >= 30) return "Lagging most sector peers";
  return "Among weakest in sector";
}

// Short good/bad-vs-average read, for surfaces where the full sentence is too much text.
// Only applies when there's an actual value-vs-benchmark comparison to make — rank/categorical
// metrics (quant rank, analyst rating, beat likelihood) have no real "average" to be above or below.
export function metricRelativeTier(m: StockIntelMetric): { text: string; favorable: boolean | null } {
  const label = m.label ?? "";
  const value = typeof m.value === "number" ? m.value : null;
  const benchmark = typeof m.benchmark === "number" ? m.benchmark : null;

  if (value !== null && benchmark !== null && benchmark !== 0) {
    const diff = ((value - benchmark) / Math.abs(benchmark)) * 100;
    const absDiff = Math.abs(diff);
    const isHigherBetter = !isLowerBetterMetric(label);
    const ahead = isHigherBetter ? diff > 0 : diff < 0;
    const pct = absDiff < 1 ? "<1" : Math.round(absDiff).toString();
    const direction = diff > 0 ? "above" : "below";

    if (absDiff < 3) return { text: "In line with avg", favorable: null };
    return { text: `${pct}% ${direction} avg`, favorable: ahead };
  }

  // No real average to compare against — just call out whether it's favorable.
  if (m.signal === "green") return { text: "Favorable", favorable: true };
  if (m.signal === "red") return { text: "Unfavorable", favorable: false };
  if (m.signal === "yellow") return { text: "Mixed", favorable: null };

  const score = m.score;
  if (score == null) return { text: "", favorable: null };
  if (score >= 70) return { text: "Favorable", favorable: true };
  if (score >= 40) return { text: "Mixed", favorable: null };
  return { text: "Unfavorable", favorable: false };
}

// Metrics where a lower number is better (leverage, payout, shorts, etc.)
function isLowerBetterMetric(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("p/e") ||
    l.includes("peg") ||
    l.includes("debt") ||
    l.includes("payout") ||
    l.includes("short") ||
    l.includes("forward p/e")
  );
}

export function PercentileRail({ metric }: { metric: StockIntelMetric }) {
  const valueClass = VALUE_TEXT[metric.signal] ?? VALUE_TEXT.na;

  return (
    <div className="py-3.5 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[14px] font-semibold text-[#111111] truncate">
            {metric.label}
          </span>
          {METRIC_HELP[metric.label] && (
            <MetricTooltip
              title={METRIC_HELP[metric.label].title}
              body={METRIC_HELP[metric.label].body}
            />
          )}
        </span>
        <span className={`text-[16px] font-bold tabular-nums shrink-0 ${valueClass}`}>
          {formatValue(metric.value)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[12px] text-[#6b7280]">
        <span className="font-medium">{metricContextLine(metric)}</span>
        {metric.benchmark !== null && metric.benchmark !== undefined && (
          <span className="tabular-nums">
            {metric.benchmark_label}: {formatValue(metric.benchmark)}
          </span>
        )}
      </div>
    </div>
  );
}
