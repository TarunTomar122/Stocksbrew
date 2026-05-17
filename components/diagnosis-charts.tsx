"use client";

import {
  PieChart, Pie, Cell, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const SECTOR_COLORS = [
  "#0052ff", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
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

function scoreColor(s: number | null): string {
  if (s === null) return "#9ca3af";
  if (s >= 80) return "#10b981";
  if (s >= 60) return "#111111";
  if (s >= 40) return "#6b7280";
  return "#ef4444";
}

export function DiagnosisSectorChart({ sectors }: { sectors: SectorSlice[] }) {
  if (!sectors.length) return null;
  const data = sectors.map((s) => ({ name: s.sector, value: s.weight_pct }));

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <h3 className="text-[13px] font-semibold text-[#111111] mb-4">Sector allocation</h3>
      <div className="flex flex-col md:flex-row items-center gap-5">
        <div className="w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 flex flex-col gap-2.5 w-full">
          {sectors.map((s, i) => (
            <div key={s.sector} className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
              <span className="flex-1 text-[12px] font-medium text-[#374151] truncate">{s.sector}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, s.weight_pct)}%`,
                      background: SECTOR_COLORS[i % SECTOR_COLORS.length],
                    }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-[#111111] tabular-nums w-10 text-right">
                  {s.weight_pct.toFixed(1)}%
                </span>
                <span className="text-[11px] text-[#9ca3af] tabular-nums w-6">
                  ({s.count})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DiagnosisFactorRadar({ factors }: { factors: FactorScores }) {
  const data = [
    { factor: "Valuation", score: factors.valuation ?? 0 },
    { factor: "Growth",    score: factors.growth ?? 0 },
    { factor: "Quality",   score: factors.quality ?? 0 },
    { factor: "Momentum",  score: factors.momentum ?? 0 },
  ];
  if (!data.some((d) => d.score > 0)) return null;

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <h3 className="text-[13px] font-semibold text-[#111111]">Factor tilt</h3>
      <p className="text-[11px] text-[#9ca3af] mt-0.5 mb-3">Average across 4 pillars · 0–100</p>
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="factor" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} />
            <Radar dataKey="score" stroke="#0052ff" fill="#0052ff" fillOpacity={0.1} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
