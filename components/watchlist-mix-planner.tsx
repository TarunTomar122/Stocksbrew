"use client";

import { useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { deriveResearchMix, type MixWeights } from "@/lib/portfolio-mix";
import type { PortfolioBookRow } from "@/lib/portfolio-book";

const pieColors = ["#6d3be8", "#16835f", "#4b5b73", "#d97706", "#b4232f", "#0e7490"];

function allocationAmount(percent: number): number {
  return Math.round(percent * 10);
}

function allocationRows(rows: PortfolioBookRow[], weights: MixWeights) {
  const values = rows.map((row) => ({ row, percent: Math.max(0, weights[row.instrument_id] ?? 0) }));
  const amounts = values.map(({ percent }) => allocationAmount(percent));
  let remainder = 1000 - amounts.reduce((total, amount) => total + amount, 0);
  for (let index = 0; values.length > 0 && remainder !== 0; index = (index + 1) % values.length) {
    const step = remainder > 0 ? 1 : -1;
    if (amounts[index] + step >= 0) {
      amounts[index] += step;
      remainder -= step;
    }
  }
  return values
    .map((value, index) => ({ ...value, dollars: amounts[index] }))
    .sort((a, b) => b.percent - a.percent);
}

function PieChart({
  allocations,
  hoveredId,
  onHover,
}: {
  allocations: ReturnType<typeof allocationRows>;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  const circumference = 2 * Math.PI * 70;
  let start = 0;
  const hovered = allocations.find((item) => item.row.instrument_id === hoveredId);
  return (
    <div className="relative h-48 w-48" role="img" aria-label="Suggested portfolio allocation pie chart">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r="70" fill="none" stroke="#eef0f3" strokeWidth="42" />
        {allocations.filter(({ percent }) => percent > 0).map(({ row, percent }, index) => {
          const offset = start;
          start += percent;
          return (
            <circle
              key={row.instrument_id}
              cx="100"
              cy="100"
              r="70"
              fill="none"
              stroke={pieColors[index % pieColors.length]}
              strokeWidth="42"
              strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
              strokeDashoffset={`${-(offset / 100) * circumference}`}
              opacity={hoveredId && hoveredId !== row.instrument_id ? 0.28 : 1}
              onMouseEnter={() => onHover(row.instrument_id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(row.instrument_id)}
              onBlur={() => onHover(null)}
              tabIndex={0}
            />
          );
        })}
      </svg>
      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center">
        {hovered ? <span className="text-[16px] font-semibold text-[#111111]">{hovered.row.ticker}</span> : <span className="text-[26px] font-semibold tabular-nums text-[#111111]">$1,000</span>}
        <span className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">{hovered ? `${hovered.percent}% suggested` : "suggested mix"}</span>
      </div>
    </div>
  );
}

function formatUpside(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}% target upside`;
}

export function WatchlistMixPlanner({
  rows,
}: {
  rows: PortfolioBookRow[];
}) {
  const [weights, setWeights] = useState<MixWeights>(() => deriveResearchMix(rows).weights);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const allocations = useMemo(() => allocationRows(rows, weights), [rows, weights]);

  return (
    <div className="flex flex-col gap-12">
      <section className="border-y border-[#e5e7eb] py-9" aria-labelledby="portfolio-distribution-title">
        <header className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d3be8]">Portfolio distribution</p>
          <h2 id="portfolio-distribution-title" className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#111111]">
            If you had $1,000, here is how StocksBrew suggests distributing it across your holdings.
          </h2>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <PieChart allocations={allocations} hoveredId={hoveredId} onHover={setHoveredId} />
            <p className="text-center text-[12px] leading-5 text-[#6b7280] lg:text-left">Based on the current research read for your holdings.</p>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {allocations.map(({ row, percent, dollars }) => (
                <article key={row.instrument_id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9b9f6] hover:shadow-[0_8px_22px_rgba(17,17,17,0.08)]" onMouseEnter={() => setHoveredId(row.instrument_id)} onMouseLeave={() => setHoveredId(null)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={row.market} size={30} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#111111]">{row.ticker}</p>
                        <p className="truncate text-[12px] text-[#6b7280]">{row.name}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[17px] font-semibold tabular-nums text-[#111111]">${dollars.toLocaleString()}</p>
                      <p className="text-[12px] font-medium tabular-nums text-[#6b3be8]">{percent}%</p>
                    </div>
                  </div>
                  {formatUpside(row.target_upside_pct) ? <p className={`mt-3 text-[12px] font-medium ${row.target_upside_pct! >= 0 ? "text-[#16835f]" : "text-[#b4232f]"}`}>{formatUpside(row.target_upside_pct)}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
