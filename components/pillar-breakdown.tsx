"use client";

import { useState } from "react";

import { PercentileRail } from "@/components/percentile-rail";
import { ProBadge } from "@/components/pro-badge";
import { hasSufficientPillarData, pillarCoverage } from "@/lib/fundamentals-coverage";
import type { StockIntelPro, StockIntelPillar } from "@/lib/types";

type PillarKey = keyof StockIntelPro["pillars"];

const PILLAR_ORDER: PillarKey[] = ["growth", "momentum", "valuation", "quality"];

const PILLAR_LABEL: Record<PillarKey, string> = {
  valuation: "Valuation",
  growth: "Growth",
  quality: "Quality",
  momentum: "Momentum",
};

const PILLAR_SUBTITLE: Record<PillarKey, string> = {
  growth: "Revenue & earnings trajectory",
  momentum: "Market signals & sentiment",
  valuation: "Price vs sector & growth",
  quality: "Profitability & balance sheet",
};

const PILLAR_ICON: Record<PillarKey, { emoji: string; bg: string }> = {
  growth: { emoji: "🌱", bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))" },
  momentum: { emoji: "🚀", bg: "color-mix(in srgb, #2563eb 14%, var(--surface))" },
  valuation: { emoji: "🏷️", bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))" },
  quality: { emoji: "🏛️", bg: "var(--surface-container)" },
};

const VERDICT_COPY: Record<string, string> = {
  strong: "Strong",
  solid: "Solid",
  mixed: "Mixed",
  weak: "Weak",
  "insufficient data": "Insufficient data",
};

const VERDICT_TONE: Record<string, { bg: string; fg: string }> = {
  strong: { bg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", fg: "#10b981" },
  solid: { bg: "color-mix(in srgb, #2563eb 14%, var(--surface))", fg: "#3b82f6" },
  mixed: { bg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))", fg: "#f59e0b" },
  weak: { bg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", fg: "#ef4444" },
  "insufficient data": { bg: "var(--surface-container)", fg: "var(--on-surface-variant)" },
};

function scoreTone(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-on-surface-variant";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-on-surface";
  if (v >= 40) return "text-on-surface-variant";
  return "text-[#ef4444]";
}

function metricCount(p: StockIntelPillar): number {
  return p.metrics.filter((m) => m.value !== null && m.value !== undefined).length;
}

export function PillarBreakdown({
  pillars,
  isSubscribed = false,
}: {
  pillars: StockIntelPro["pillars"];
  isSubscribed?: boolean;
}) {
  const [active, setActive] = useState<PillarKey>("growth");
  const pillar = pillars[active];
  const validMetrics = pillar.metrics.filter(
    (m) => m.value !== null && m.value !== undefined,
  );
  const verdictTone = VERDICT_TONE[pillar.verdict] ?? VERDICT_TONE.mixed;
  const pillarSufficient = hasSufficientPillarData(pillar);

  return (
    <section className="flex flex-col gap-6 pt-8">
      <h3 className="inline-flex items-center gap-2 text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
        Pillar breakdown
        <ProBadge isSubscribed={isSubscribed} />
      </h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {PILLAR_ORDER.map((key) => {
              const p = pillars[key];
              const sufficient = hasSufficientPillarData(p);
              const isActive = active === key;
              const tabIcon = PILLAR_ICON[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  aria-selected={isActive}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all ${
                    isActive
                      ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      : "border border-transparent hover:bg-surface-container"
                  }`}
                >
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[16px]"
                    style={{ background: tabIcon.bg }}
                    aria-hidden
                  >
                    {tabIcon.emoji}
                  </span>
                  <span className="flex flex-col items-start min-w-0">
                    <span
                      className={`text-[12px] font-semibold tracking-[-0.01em] truncate ${
                        isActive ? "text-on-surface" : "text-on-surface-variant"
                      }`}
                    >
                      {PILLAR_LABEL[key]}
                    </span>
                    <span className={`text-[14px] font-semibold tabular-nums leading-none ${scoreTone(sufficient ? p.score : null)}`}>
                      {sufficient ? Math.round(p.score) : "N/A"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
                {PILLAR_LABEL[active]}
              </span>
              <span className="text-[14px] text-on-surface-variant">{PILLAR_SUBTITLE[active]}</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase"
                style={{ background: verdictTone.bg, color: verdictTone.fg }}
              >
                {VERDICT_COPY[pillar.verdict] ?? pillar.verdict}
              </span>
              <span className="text-[12px] font-medium tracking-[0.06em] uppercase text-on-surface-variant">
                {Math.round(pillar.weight * 100)}% wt
              </span>
              <span className={`text-[28px] font-semibold tabular-nums leading-none ${scoreTone(pillarSufficient ? pillar.score : null)}`}>
                {pillarSufficient ? Math.round(pillar.score) : "N/A"}
              </span>
            </div>
          </div>

          {validMetrics.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">No metrics reported for this pillar.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
              {validMetrics.map((m) => (
                <div key={m.label}>
                  <PercentileRail metric={m} />
                </div>
              ))}
            </div>
          )}

      <p className="text-[11px] text-on-surface-variant">
        {metricCount(pillar)} metric{metricCount(pillar) === 1 ? "" : "s"} available ·{" "}
        {Math.round(pillarCoverage(pillar) * 100)}% weighted coverage.
      </p>
    </section>
  );
}
