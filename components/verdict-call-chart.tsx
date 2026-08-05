"use client";

import { useMemo, type ReactNode } from "react";

import { PriceChart, type PriceChartZone } from "@/components/price-chart";
import { sliceChartRange, type StockReturns } from "@/lib/chart-range";
import type { StockTechnicalLevels } from "@/lib/technicals";

type Point = { date: string; close: number };

const RETURN_ROWS: Array<{ label: string; key: keyof StockReturns }> = [
  { label: "3M", key: "three_month_pct" },
  { label: "6M", key: "six_month_pct" },
  { label: "1Y", key: "one_year_pct" },
];

function hasTechnicalLevels(technicalLevels?: StockTechnicalLevels | null) {
  return Boolean(
    technicalLevels?.source &&
      technicalLevels?.as_of &&
      [technicalLevels.support, technicalLevels.resistance].some(
        (value) => typeof value === "number" && Number.isFinite(value),
      ),
  );
}

function ReturnsRow({
  returns,
}: {
  returns?: StockReturns | null;
}) {
  const items = RETURN_ROWS.map(({ label, key }) => ({
    label,
    value: returns?.[key],
  })).filter((row): row is { label: string; value: number } => typeof row.value === "number" && Number.isFinite(row.value));

  if (!items.length) return null;

  return (
    <div className="mt-8">
      <p className="text-[13px] font-bold text-on-surface">Price context</p>
      <div className="mt-5">
        <p className="text-[12px] font-medium text-on-surface-variant">Past returns</p>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-4">
          {items.map(({ label, value }) => {
            const up = value >= 0;
            return (
              <div key={label} className="min-w-[4.5rem]">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{label}</p>
                <p
                  className="mt-1 text-[17px] font-bold tabular-nums tracking-tight"
                  style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                >
                  {up ? "+" : ""}
                  {value.toFixed(1)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TechnicalLevelsRow({
  technicalLevels,
  currency,
  currentPrice,
}: {
  technicalLevels?: StockTechnicalLevels | null;
  currency: string;
  currentPrice: number;
}) {
  const support = technicalLevels?.support;
  const resistance = technicalLevels?.resistance;
  if (!hasTechnicalLevels(technicalLevels)) return null;

  const money = (value: number) =>
    `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const distance = (value: number) => `${Math.abs(((value - currentPrice) / currentPrice) * 100).toFixed(1)}%`;

  return (
    <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-outline-variant/60 pt-4">
      <div className="min-w-[11rem]">
        <p className="text-[12px] font-medium text-on-surface-variant">Support{technicalLevels?.support_label ? ` · ${technicalLevels.support_label}` : ""}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-[17px] font-bold tabular-nums text-[var(--signal-bullish)]">{typeof support === "number" ? money(support) : "—"}</p>
          {typeof support === "number" ? <span className="text-[11px] font-medium text-on-surface-variant">{distance(support)} below</span> : null}
        </div>
      </div>
      <div className="min-w-[11rem]">
        <p className="text-[12px] font-medium text-on-surface-variant">Resistance{technicalLevels?.resistance_label ? ` · ${technicalLevels.resistance_label}` : ""}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-[17px] font-bold tabular-nums text-[var(--signal-bearish)]">{typeof resistance === "number" ? money(resistance) : "—"}</p>
          {typeof resistance === "number" ? <span className="text-[11px] font-medium text-on-surface-variant">{distance(resistance)} above</span> : null}
        </div>
      </div>
    </div>
  );
}

export function VerdictCallChart({
  callSlot,
  hist,
  returns,
  currency,
  zones,
  lineColor,
  currentPrice,
  technicalLevels,
  zoneHint,
  columnsAt = "lg",
  chartHeight,
}: {
  callSlot: ReactNode;
  hist: Point[];
  returns?: StockReturns | null;
  currency: string;
  zones: PriceChartZone[];
  lineColor: string;
  currentPrice: number;
  technicalLevels?: StockTechnicalLevels | null;
  zoneHint?: { label: string; color: string } | null;
  columnsAt?: "md" | "lg";
  chartHeight?: number;
}) {
  const chartHist = useMemo(() => sliceChartRange(hist, "1y"), [hist]);
  const hasChart = chartHist.length >= 5;
  const hasLevels = hasTechnicalLevels(technicalLevels);
  const gridCols =
    columnsAt === "md"
      ? "md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]";
  const gridStretch = columnsAt === "md" ? "md:items-center" : "lg:items-stretch";
  const gridGap = columnsAt === "md" ? "md:gap-8" : "lg:gap-8";

  return (
    <div className={`grid gap-5 ${gridCols} ${gridStretch} ${gridGap}`}>
      <div className="flex min-w-0 flex-col">
        {callSlot}
        <ReturnsRow returns={returns} />
      </div>

      {(hasChart || hasLevels) && (
        <div className="min-w-0">
          {hasChart && zoneHint ? (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: zoneHint.color }} aria-hidden />
              <span className="text-[12px] font-medium text-on-surface">{zoneHint.label}</span>
            </div>
          ) : null}
          {hasChart ? (
            <PriceChart
              data={chartHist}
              currency={currency}
              zones={zones}
              lineColor={lineColor}
              embedded
              currentPrice={currentPrice}
              height={chartHeight}
            />
          ) : null}
          <TechnicalLevelsRow technicalLevels={technicalLevels} currency={currency} currentPrice={currentPrice} />
        </div>
      )}
    </div>
  );
}
