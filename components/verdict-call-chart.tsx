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

function ReturnsRow({
  returns,
  technicalLevels,
  currency,
  currentPrice,
}: {
  returns?: StockReturns | null;
  technicalLevels?: StockTechnicalLevels | null;
  currency: string;
  currentPrice: number;
}) {
  const items = RETURN_ROWS.map(({ label, key }) => ({
    label,
    value: returns?.[key],
  })).filter((row): row is { label: string; value: number } => typeof row.value === "number" && Number.isFinite(row.value));

  const support = technicalLevels?.support;
  const resistance = technicalLevels?.resistance;
  const hasLevels = Boolean(
    technicalLevels?.source &&
      technicalLevels?.as_of &&
      ([support, resistance].some((value) => typeof value === "number" && Number.isFinite(value))),
  );
  if (!items.length && !hasLevels) return null;

  const money = (value: number) =>
    `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const distance = (value: number) => `${Math.abs(((value - currentPrice) / currentPrice) * 100).toFixed(1)}%`;

  return (
    <div className="mt-9 border-t border-outline-variant/40 pt-5">
      {items.length ? <div
        className="grid divide-x divide-outline-variant/35"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ label, value }, i) => {
          const up = value >= 0;
          return (
            <div
              key={label}
              className={`min-w-0 px-2 text-center sm:px-3 ${i === 0 ? "pl-0" : ""} ${i === items.length - 1 ? "pr-0" : ""}`}
            >
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant sm:text-[9.5px]">
                {label}
              </p>
              <p
                className="mt-1 text-[16px] font-bold tabular-nums tracking-tight sm:text-[17px]"
                style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
              >
                {up ? "+" : ""}
                {value.toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div> : null}
      {hasLevels ? (
        <div className={`${items.length ? "mt-5 border-t border-outline-variant/40 pt-4" : ""}`}>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Nearest support{technicalLevels?.support_label ? ` · ${technicalLevels.support_label}` : ""}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-[17px] font-bold tabular-nums text-[var(--signal-bullish)]">{typeof support === "number" ? money(support) : "—"}</p>
                {typeof support === "number" ? <span className="text-[10px] text-on-surface-variant">{distance(support)} below</span> : null}
              </div>
            </div>
            <div className="border-l border-outline-variant/40 pl-5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Nearest resistance{technicalLevels?.resistance_label ? ` · ${technicalLevels.resistance_label}` : ""}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-[17px] font-bold tabular-nums text-[var(--signal-bearish)]">{typeof resistance === "number" ? money(resistance) : "—"}</p>
                {typeof resistance === "number" ? <span className="text-[10px] text-on-surface-variant">{distance(resistance)} above</span> : null}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[9.5px] text-on-surface-variant">{technicalLevels?.source} · {technicalLevels?.as_of}</p>
        </div>
      ) : null}
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
}) {
  const chartHist = useMemo(() => sliceChartRange(hist, "1y"), [hist]);
  const hasChart = chartHist.length >= 5;
  const gridCols =
    columnsAt === "md"
      ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
      : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]";
  const gridStretch = columnsAt === "md" ? "md:items-stretch" : "lg:items-stretch";
  const gridGap = columnsAt === "md" ? "md:gap-8" : "lg:gap-8";

  return (
    <div className={`grid gap-5 ${gridCols} ${gridStretch} ${gridGap}`}>
      <div className="flex min-w-0 flex-col">
        {callSlot}
        <ReturnsRow returns={returns} technicalLevels={technicalLevels} currency={currency} currentPrice={currentPrice} />
      </div>

      {hasChart && (
        <div className="min-w-0">
          {zoneHint ? (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: zoneHint.color }} aria-hidden />
              <span className="text-[12px] font-medium text-on-surface">{zoneHint.label}</span>
            </div>
          ) : null}
          <PriceChart
            data={chartHist}
            currency={currency}
            zones={zones}
            lineColor={lineColor}
            embedded
            currentPrice={currentPrice}
          />
        </div>
      )}
    </div>
  );
}
