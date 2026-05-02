"use client";

import { useState } from "react";

import { PercentileRail } from "@/components/percentile-rail";
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

const VERDICT_TONE: Record<string, { bg: string; fg: string }> = {
  strong: { bg: "#ecfdf5", fg: "#065f46" },
  solid:  { bg: "#eff6ff", fg: "#1e3a8a" },
  mixed:  { bg: "#fef3c7", fg: "#92400e" },
  weak:   { bg: "#fef2f2", fg: "#991b1b" },
};

function scoreTone(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-[#9ca3af]";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-[#111111]";
  if (v >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function metricCount(p: StockIntelPillar): number {
  return p.metrics.filter((m) => m.value !== null && m.value !== undefined).length;
}

export function PillarBreakdown({ pillars }: { pillars: StockIntelPro["pillars"] }) {
  const [active, setActive] = useState<PillarKey>("growth");
  const pillar = pillars[active];
  const validMetrics = pillar.metrics.filter(
    (m) => m.value !== null && m.value !== undefined,
  );
  const verdictTone = VERDICT_TONE[pillar.verdict] ?? VERDICT_TONE.mixed;

  return (
    <section className="flex flex-col gap-5 pt-8 border-t border-[#e5e7eb]">
      <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
        Pillar breakdown
      </h3>

      {/* Segmented tab strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 rounded-2xl bg-[#f8f9fa] border border-[#e5e7eb] p-1.5">
        {PILLAR_ORDER.map((key) => {
          const p = pillars[key];
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
                  ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-[#e5e7eb]"
                  : "border border-transparent hover:bg-white/60"
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
                    isActive ? "text-[#111111]" : "text-[#6b7280]"
                  }`}
                >
                  {PILLAR_LABEL[key]}
                </span>
                <span className={`text-[14px] font-semibold tabular-nums leading-none ${scoreTone(p.score)}`}>
                  {Math.round(p.score)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Active pillar header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            {PILLAR_LABEL[active]}
          </span>
          <span className="text-[14px] text-[#6b7280]">
            {PILLAR_SUBTITLE[active]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase"
            style={{ background: verdictTone.bg, color: verdictTone.fg }}
          >
            {VERDICT_COPY[pillar.verdict] ?? pillar.verdict}
          </span>
          <span className="text-[12px] font-medium tracking-[0.06em] uppercase text-[#9ca3af]">
            {Math.round(pillar.weight * 100)}% wt
          </span>
          <span className={`text-[28px] font-semibold tabular-nums leading-none ${scoreTone(pillar.score)}`}>
            {Math.round(pillar.score)}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      {validMetrics.length === 0 ? (
        <p className="text-[13px] text-[#6b7280]">
          No metrics reported for this pillar.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
          {validMetrics.map((m) => (
            <div
              key={m.label}
              className="border-t border-[#f3f4f6] first:border-t-0 md:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
            >
              <PercentileRail metric={m} />
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[#9ca3af]">
        {metricCount(pillar)} metric{metricCount(pillar) === 1 ? "" : "s"} compared
        against sector peers.
      </p>
    </section>
  );
}
