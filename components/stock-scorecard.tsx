import type { StockIntelPro, StockIntelPillar } from "@/lib/types";
import { PercentileRail } from "@/components/percentile-rail";
import { toneFromScore } from "@/components/radial-gauge";

const PILLAR_ORDER: Array<keyof StockIntelPro["pillars"]> = [
  "growth",
  "momentum",
  "valuation",
  "quality",
];

const PILLAR_LABEL: Record<keyof StockIntelPro["pillars"], string> = {
  valuation: "Valuation",
  growth: "Growth",
  quality: "Quality",
  momentum: "Momentum",
};

const PILLAR_SUBTITLE: Record<keyof StockIntelPro["pillars"], string> = {
  growth: "Revenue & earnings trajectory",
  momentum: "Market signals & sentiment",
  valuation: "Price vs sector & growth",
  quality: "Profitability & balance sheet",
};

const URGENCY_CLASSES: Record<string, string> = {
  high: "bg-signal-bearish/15 text-signal-bearish border-signal-bearish/50",
  med: "bg-signal-neutral/25 text-on-surface border-signal-neutral/50",
  low: "bg-surface-container-highest text-on-surface-variant border-outline-variant/50",
};

const FILL_BY_TONE: Record<string, string> = {
  bullish: "bg-signal-bullish",
  neutral: "bg-signal-neutral",
  bearish: "bg-signal-bearish",
  muted: "bg-outline-variant",
};

const TEXT_BY_TONE: Record<string, string> = {
  bullish: "text-signal-bullish",
  neutral: "text-on-surface",
  bearish: "text-signal-bearish",
  muted: "text-on-surface-variant",
};

const VERDICT_COPY: Record<string, string> = {
  strong: "Strong",
  solid: "Solid",
  mixed: "Mixed",
  weak: "Weak",
};

function ScoreBar({ score, tone, height = "h-1.5" }: { score: number; tone: string; height?: string }) {
  const fill = FILL_BY_TONE[tone] ?? FILL_BY_TONE.muted;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className={`relative ${height} bg-surface-container-high w-full`}>
      <div className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function PillarChip({
  name,
  pillar,
}: {
  name: keyof StockIntelPro["pillars"];
  pillar: StockIntelPillar;
}) {
  const tone = toneFromScore(pillar.score);
  const textClass = TEXT_BY_TONE[tone] ?? TEXT_BY_TONE.muted;
  return (
    <div className="border border-outline-variant/40 p-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant">
          {PILLAR_LABEL[name]}
        </span>
        <span className={`text-[18px] font-bold tabular-nums ${textClass}`}>
          {Math.round(pillar.score)}
        </span>
      </div>
      <ScoreBar score={pillar.score} tone={tone} />
      <span className="text-[10px] text-on-surface-variant font-medium capitalize">
        {VERDICT_COPY[pillar.verdict] ?? pillar.verdict}
      </span>
    </div>
  );
}

function PillarPanel({
  name,
  pillar,
}: {
  name: keyof StockIntelPro["pillars"];
  pillar: StockIntelPillar;
}) {
  const tone = toneFromScore(pillar.score);
  const textClass = TEXT_BY_TONE[tone] ?? TEXT_BY_TONE.muted;
  return (
    <div className="bg-surface-container-lowest brutalist-border p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-on-surface-variant">
              {PILLAR_LABEL[name]}
            </div>
            <div className="text-[12px] text-on-surface-variant mt-0.5">
              {PILLAR_SUBTITLE[name]}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-[32px] font-bold leading-none tabular-nums ${textClass}`}>
              {Math.round(pillar.score)}
            </div>
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant mt-1">
              {VERDICT_COPY[pillar.verdict] ?? pillar.verdict} · {Math.round(pillar.weight * 100)}% wt
            </div>
          </div>
        </div>
        <ScoreBar score={pillar.score} tone={tone} height="h-2" />
      </div>

      <div className="flex flex-col divide-y divide-outline-variant/30">
        {pillar.metrics
          .filter((m) => m.value !== null && m.value !== undefined)
          .map((m) => (
            <PercentileRail key={m.label} metric={m} />
          ))}
      </div>
    </div>
  );
}

function CatalystStrip({ catalysts }: { catalysts: StockIntelPro["catalysts"] }) {
  if (!catalysts.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {catalysts.map((c, i) => (
        <span
          key={`${c.kind}-${i}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[11px] font-semibold ${URGENCY_CLASSES[c.urgency] ?? URGENCY_CLASSES.low}`}
        >
          <span className="text-[9px] uppercase tracking-wider opacity-70">{c.urgency}</span>
          {c.title}
        </span>
      ))}
    </div>
  );
}

export function StockScorecard({ intel }: { intel: StockIntelPro | null }) {
  if (!intel) return null;

  const overallTone = toneFromScore(intel.overall.score);

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-8">
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-10">
        <div className="shrink-0">
          <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-on-surface-variant">
            Fundamentals Score
          </div>
          <div className={`flex items-baseline gap-2 mt-2 ${TEXT_BY_TONE[overallTone]}`}>
            <span className="text-[72px] font-bold leading-none tabular-nums">
              {Math.round(intel.overall.score)}
            </span>
            <span className="text-[24px] font-semibold text-on-surface-variant">/100</span>
          </div>
          <div className="text-[12px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant mt-2">
            {VERDICT_COPY[intel.overall.verdict] ?? intel.overall.verdict} · {intel.overall.stance}-tilted
          </div>
          <div className="text-[11px] text-on-surface-variant mt-1 leading-snug max-w-[160px]">
            Based on valuation, growth, quality & momentum vs. sector peers.
          </div>
          {intel.sector_label && (
            <div className="text-[12px] text-on-surface-variant mt-1">
              {intel.sector_label}
              {intel.industry_label ? ` · ${intel.industry_label}` : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 w-full">
          {PILLAR_ORDER.map((name) => (
            <PillarChip key={name} name={name} pillar={intel.pillars[name]} />
          ))}
        </div>
      </div>

      <CatalystStrip catalysts={intel.catalysts} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PILLAR_ORDER.map((name) => (
          <PillarPanel key={name} name={name} pillar={intel.pillars[name]} />
        ))}
      </div>
    </section>
  );
}
