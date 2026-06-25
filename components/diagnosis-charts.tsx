"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const SECTOR_COLORS = [
  "var(--on-surface)",
  "color-mix(in srgb, var(--on-surface) 62%, transparent)",
  "color-mix(in srgb, var(--on-surface) 44%, transparent)",
  "color-mix(in srgb, var(--accent-terminal) 72%, var(--on-surface))",
  "color-mix(in srgb, var(--signal-bullish) 55%, var(--on-surface))",
  "color-mix(in srgb, var(--signal-bearish) 45%, var(--on-surface))",
];

type SectorSlice = {
  sector: string;
  weight_pct: number;
  count: number;
};

type FactorScores = {
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
};

export function DiagnosisSectorChart({
  sectors,
  bare = false,
  weightLabel = "of book",
}: {
  sectors: SectorSlice[];
  bare?: boolean;
  weightLabel?: string;
}) {
  const data = useMemo(
    () =>
      [...sectors]
        .sort((a, b) => b.weight_pct - a.weight_pct)
        .map((s, i) => ({
          name: s.sector,
          value: s.weight_pct,
          count: s.count,
          color: SECTOR_COLORS[i % SECTOR_COLORS.length],
        })),
    [sectors],
  );

  const [activeIndex, setActiveIndex] = useState(0);

  if (!data.length) return null;

  const safeIndex = Math.min(activeIndex, data.length - 1);
  const active = data[safeIndex]!;
  const wrap = bare ? "" : "rounded-xl border border-outline-variant bg-surface p-5";

  return (
    <div className={wrap}>
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        Sector allocation
      </h3>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-outline-variant/30">
        {data.map((s) => (
          <div
            key={s.name}
            className="inline-block h-full align-top"
            style={{ width: `${Math.max(s.value, 0.5)}%`, background: s.color }}
            title={`${s.name} ${s.value.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-[148px] w-[148px] shrink-0 sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={safeIndex === i ? 1 : 0.5}
                    stroke="var(--surface)"
                    strokeWidth={safeIndex === i ? 2 : 1}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="font-mono text-[26px] font-bold tabular-nums leading-none tracking-tight text-on-surface">
              {active.value.toFixed(1)}%
            </span>
            <span className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
              {weightLabel}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="mb-1 line-clamp-2 text-[13px] font-semibold leading-snug text-on-surface">{active.name}</p>
          <p className="mb-2 font-mono text-[10px] text-on-surface-variant">
            {active.count} {active.count === 1 ? "name" : "names"} in this sector
          </p>
          <div className="flex flex-col divide-y divide-outline-variant/40">
            {data.map((s, i) => {
              const on = safeIndex === i;
              return (
                <button
                  key={s.name}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-2.5 py-2 text-left transition-colors ${
                    on ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.color, opacity: on ? 1 : 0.7 }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{s.name}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">({s.count})</span>
                  <span className="w-11 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums">
                    {s.value.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiagnosisFactorRadar({ factors, bare = false }: { factors: FactorScores; bare?: boolean }) {
  const data = [
    { factor: "Valuation", score: factors.valuation ?? 0 },
    { factor: "Growth", score: factors.growth ?? 0 },
    { factor: "Quality", score: factors.quality ?? 0 },
    { factor: "Momentum", score: factors.momentum ?? 0 },
  ];
  if (!data.some((d) => d.score > 0)) return null;
  const wrap = bare ? "" : "rounded-xl border border-outline-variant bg-surface p-5";

  return (
    <div className={wrap}>
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        Factor tilt
      </h3>
      <p className={`mt-1 font-mono text-[10px] text-on-surface-variant/80 ${bare ? "mb-2" : "mb-3"}`}>
        Average across 4 pillars · 0–100
      </p>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="var(--surface-container-high)" />
            <PolarAngleAxis dataKey="factor" tick={{ fontSize: 11, fill: "var(--on-surface-variant)" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--on-surface-variant)" }} />
            <Radar
              dataKey="score"
              stroke="var(--on-surface)"
              fill="var(--on-surface)"
              fillOpacity={0.08}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function scoreToneColor(score: number | null): string {
  if (score === null) return "var(--on-surface-variant)";
  if (score >= 80) return "var(--signal-bullish)";
  if (score >= 60) return "var(--on-surface)";
  if (score >= 40) return "var(--on-surface-variant)";
  return "var(--signal-bearish)";
}
