import type { StockIntelPro, StockIntelPillar } from "@/lib/types";
import { PillarBreakdown } from "@/components/pillar-breakdown";

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

const PILLAR_ICON: Record<keyof StockIntelPro["pillars"], { emoji: string; bg: string }> = {
  growth:    { emoji: "🌱",  bg: "#ecfdf5" },
  momentum:  { emoji: "🚀",  bg: "#eff6ff" },
  valuation: { emoji: "🏷️", bg: "#fef3c7" },
  quality:   { emoji: "🏛️", bg: "#f3f4f6" },
};

const VERDICT_COPY: Record<string, string> = {
  strong: "Strong",
  solid: "Solid",
  mixed: "Mixed",
  weak: "Weak",
};

function scoreTone(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-[#9ca3af]";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-[#111111]";
  if (v >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function scoreFill(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "bg-[#e5e7eb]";
  if (v >= 80) return "bg-[#10b981]";
  if (v >= 60) return "bg-[#0052ff]";
  if (v >= 40) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

function urgencyTone(u?: string): { bg: string; fg: string } {
  switch ((u ?? "").toLowerCase()) {
    case "high":
      return { bg: "#fef2f2", fg: "#ef4444" };
    case "med":
      return { bg: "#fef3c7", fg: "#b45309" };
    default:
      return { bg: "#f3f4f6", fg: "#6b7280" };
  }
}

function ScoreBar({ score, height = "h-1.5" }: { score: number; height?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className={`relative ${height} rounded-full bg-[#f3f4f6] overflow-hidden`}>
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
}: {
  name: keyof StockIntelPro["pillars"];
  pillar: StockIntelPillar;
}) {
  const icon = PILLAR_ICON[name];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
          style={{ background: icon.bg }}
          aria-hidden
        >
          {icon.emoji}
        </span>
        <span className={`text-[24px] font-semibold tabular-nums leading-none ${scoreTone(pillar.score)}`}>
          {Math.round(pillar.score)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#111111]">
          {PILLAR_LABEL[name]}
        </span>
        <ScoreBar score={pillar.score} />
        <span className="text-[11px] text-[#6b7280]">
          {VERDICT_COPY[pillar.verdict] ?? pillar.verdict}
        </span>
      </div>
    </div>
  );
}

export function StockScorecard({ intel }: { intel: StockIntelPro | null }) {
  if (!intel) return null;

  return (
    <div className="flex flex-col gap-10">
      {/* Header: overall + 4 pillar columns */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(220px,_280px)_1fr] gap-8 items-start">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
            Fundamentals score
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-[64px] font-semibold leading-none tabular-nums ${scoreTone(intel.overall.score)}`}>
              {Math.round(intel.overall.score)}
            </span>
            <span className="text-[20px] font-medium text-[#9ca3af]">/ 100</span>
          </div>
          <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#6b7280]">
            {VERDICT_COPY[intel.overall.verdict] ?? intel.overall.verdict} · {intel.overall.stance}-tilted
          </span>
          <p className="text-[13px] text-[#6b7280] leading-relaxed mt-1 max-w-[260px]">
            Composite of valuation, growth, quality &amp; momentum versus sector peers.
          </p>
          {intel.sector_label && (
            <span className="text-[12px] text-[#6b7280] mt-1">
              {intel.sector_label}
              {intel.industry_label ? ` · ${intel.industry_label}` : ""}
            </span>
          )}
          {intel.catalysts.length > 0 && (
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
                    <span className="text-[#111111]">{c.title}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PILLAR_ORDER.map((name) => (
            <PillarCard key={name} name={name} pillar={intel.pillars[name]} />
          ))}
        </div>
      </section>

      <PillarBreakdown pillars={intel.pillars} />
    </div>
  );
}
