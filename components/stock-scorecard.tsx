import type { StockIntelPro, StockIntelPillar } from "@/lib/types";
import { hasSufficientOverallData, hasSufficientPillarData, overallCoverage } from "@/lib/fundamentals-coverage";
import { PillarBreakdown } from "@/components/pillar-breakdown";
import { StockProPaywall } from "@/components/stock-pro-paywall";

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

const PILLAR_ICON: Record<keyof StockIntelPro["pillars"], { emoji: string; bg: string }> = {
  growth:    { emoji: "🌱",  bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))" },
  momentum:  { emoji: "🚀",  bg: "color-mix(in srgb, #2563eb 14%, var(--surface))" },
  valuation: { emoji: "🏷️", bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))" },
  quality:   { emoji: "🏛️", bg: "var(--surface-container)" },
};

const VERDICT_COPY: Record<string, string> = {
  strong: "Strong",
  solid: "Solid",
  mixed: "Mixed",
  weak: "Weak",
  "insufficient data": "Insufficient data",
};

function scoreTone(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-on-surface-variant";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-on-surface";
  if (v >= 40) return "text-on-surface-variant";
  return "text-[#ef4444]";
}

function scoreFill(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "bg-surface-container-high";
  if (v >= 80) return "bg-[#10b981]";
  if (v >= 60) return "bg-[#0052ff]";
  if (v >= 40) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

function urgencyTone(u?: string): { bg: string; fg: string } {
  switch ((u ?? "").toLowerCase()) {
    case "high":
      return { bg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", fg: "#ef4444" };
    case "med":
      return { bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))", fg: "#f59e0b" };
    default:
      return { bg: "var(--surface-container)", fg: "var(--on-surface-variant)" };
  }
}

function ScoreBar({ score, height = "h-1.5" }: { score: number; height?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className={`relative ${height} rounded-full bg-surface-container overflow-hidden`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${scoreFill(score)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function PillarCard({
  name,
  pillar,
  showVerdict = true,
}: {
  name: keyof StockIntelPro["pillars"];
  pillar: StockIntelPillar;
  showVerdict?: boolean;
}) {
  const icon = PILLAR_ICON[name];
  const sufficient = hasSufficientPillarData(pillar);
  return (
    <div className="flex h-full min-w-[148px] flex-col gap-3 rounded-2xl bg-surface p-4 md:p-4.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
          style={{ background: icon.bg }}
          aria-hidden
        >
          {icon.emoji}
        </span>
        <span className={`text-[24px] font-semibold tabular-nums leading-none ${scoreTone(sufficient ? pillar.score : null)}`}>
          {sufficient ? Math.round(pillar.score) : "N/A"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-on-surface">
          {PILLAR_LABEL[name]}
        </span>
        {sufficient ? <ScoreBar score={pillar.score} /> : <div className="h-1.5 rounded-full bg-surface-container-high" />}
        {showVerdict ? (
          <span className="text-[11px] text-on-surface-variant">
            {VERDICT_COPY[pillar.verdict] ?? pillar.verdict}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StockScorecard({
  intel,
  ticker,
  isSubscribed = false,
}: {
  intel: StockIntelPro | null;
  ticker: string;
  isSubscribed?: boolean;
}) {
  if (!intel) return null;
  const overallSufficient = hasSufficientOverallData(intel);
  const coverage = overallCoverage(intel);

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-1 xl:grid-cols-[minmax(220px,_280px)_1fr] gap-6 md:gap-8 items-start">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
            Fundamentals score
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-[52px] md:text-[64px] font-semibold leading-none tabular-nums ${scoreTone(overallSufficient ? intel.overall.score : null)}`}>
              {overallSufficient ? Math.round(intel.overall.score) : "N/A"}
            </span>
            {overallSufficient ? <span className="text-[20px] font-medium text-on-surface-variant">/ 100</span> : null}
          </div>
          <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
            {isSubscribed
              ? `${VERDICT_COPY[intel.overall.verdict] ?? intel.overall.verdict} · ${intel.overall.stance}-tilted`
              : "Scores are free · Pro unlocks the call"}
          </span>
          <p className="text-[13px] text-on-surface-variant leading-relaxed mt-1 max-w-[260px]">
            Composite of valuation, growth, quality &amp; momentum versus sector peers
            {coverage != null ? ` · ${Math.round(coverage * 100)}% data coverage` : ""}.
          </p>
          {intel.sector_label && (
            <span className="text-[12px] text-on-surface-variant mt-1">
              {intel.sector_label}
              {intel.industry_label ? ` · ${intel.industry_label}` : ""}
            </span>
          )}
          {isSubscribed && intel.catalysts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {intel.catalysts.map((c, i) => {
                const tone = urgencyTone(c.urgency);
                return (
                  <span
                    key={`${c.kind}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: tone.bg, color: tone.fg }}
                    title={`${c.urgency} urgency`}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-80">
                      {c.urgency}
                    </span>
                    <span className="text-on-surface">{c.title}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-3">
          {PILLAR_ORDER.map((name) => (
            <PillarCard
              key={name}
              name={name}
              pillar={intel.pillars[name]}
              showVerdict={isSubscribed}
            />
          ))}
        </div>
      </section>

      {isSubscribed ? (
        <PillarBreakdown pillars={intel.pillars} isSubscribed={isSubscribed} />
      ) : (
        <StockProPaywall ticker={ticker} intel={intel} surface="stock_pro" />
      )}
    </div>
  );
}
