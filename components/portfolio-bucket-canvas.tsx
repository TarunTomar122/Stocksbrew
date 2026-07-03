"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import Link from "next/link";
import { useMemo } from "react";

import { SectorIconBadge } from "@/components/sector-icon-badge";
import { StockLogo } from "@/components/stock-logo";
import { buildRebalanceImpactView } from "@/lib/portfolio-rebalance-impact";
import type {
  PortfolioRebalancePlan,
  RebalanceHoldingView,
  RebalanceSectorView,
} from "@/lib/portfolio-organize-types";
import { decodeTextEntities } from "@/lib/utils";

function fmtWeight(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtDay(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-[#9ca3af]";
  if (score >= 80) return "text-[#059669]";
  if (score >= 60) return "text-[#111111]";
  return "text-[#dc2626]";
}

function dayTone(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "text-[#6b7280]";
  if (value > 0) return "text-[#059669]";
  if (value < 0) return "text-[#dc2626]";
  return "text-[#6b7280]";
}

function roleLabel(role: RebalanceHoldingView["role"]): string | null {
  switch (role) {
    case "core":
      return "Core";
    case "support":
      return "Support";
    case "trim":
      return "Trim";
    default:
      return null;
  }
}

function sectorLabel(row: {
  industry_label?: string | null;
  sector_label?: string | null;
}): string {
  const industry = decodeTextEntities(String(row.industry_label || "").trim());
  if (industry) return industry;
  return decodeTextEntities(String(row.sector_label || "").trim()) || "—";
}

function displayName(value: string): string {
  return decodeTextEntities(value);
}

const skeletonStyles = `
@keyframes rebalance-shimmer {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
.rebalance-skeleton-bone {
  position: relative;
  overflow: hidden;
  background: #f3f4f6;
}
.rebalance-skeleton-bone::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-120%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.55) 45%,
    rgba(255, 255, 255, 0.85) 50%,
    rgba(255, 255, 255, 0.55) 55%,
    transparent 100%
  );
  animation: rebalance-shimmer 1.7s ease-in-out infinite;
}
`;

function SkeletonBone({ className = "" }: { className?: string }) {
  return <div className={`rebalance-skeleton-bone ${className}`} />;
}

function SkeletonChip() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f3f4f6] bg-[#fafafa] px-2 py-1.5">
      <SkeletonBone className="h-[22px] w-[22px] shrink-0 rounded-full" />
      <div className="flex flex-col gap-1">
        <SkeletonBone className="h-2.5 w-10" />
        <SkeletonBone className="h-2 w-14" />
      </div>
    </div>
  );
}

function SkeletonMoveRow() {
  return (
    <div className="flex gap-3 px-2 py-2">
      <SkeletonBone className="h-8 w-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <SkeletonBone className="h-3.5 w-28" />
          <SkeletonBone className="h-3 w-10" />
        </div>
        <SkeletonBone className="mt-2 h-3 w-full" />
        <SkeletonBone className="mt-1.5 h-2 w-24" />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <style>{skeletonStyles}</style>
      <div
        className="flex w-full flex-col gap-4"
        aria-busy="true"
        aria-label="Loading rebalance plan"
      >
        <div className="rounded-xl border border-[#eceff3] bg-[#fafafa] px-4 py-3.5">
          <SkeletonBone className="h-2.5 w-24 rounded" />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <SkeletonBone className="h-2.5 w-20 rounded" />
              <SkeletonBone className="mt-2 h-7 w-28 rounded" />
            </div>
            <div>
              <SkeletonBone className="h-2.5 w-20 rounded" />
              <SkeletonBone className="mt-2 h-5 w-32 rounded" />
            </div>
          </div>
          <div className="mt-3 border-t border-[#eceff3] pt-2.5">
            <SkeletonBone className="h-3 w-52 rounded" />
          </div>
        </div>

        <div className="grid divide-y divide-[#f3f4f6] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white lg:grid-cols-[1.5fr_1fr] lg:divide-x lg:divide-y-0">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-[#f3f4f6] pb-3">
              <SkeletonBone className="h-3 w-20 rounded" />
              <SkeletonBone className="h-3 w-14 rounded" />
            </div>
            <div className="divide-y divide-[#f3f4f6]">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2.5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <SkeletonBone className="h-[26px] w-[26px] shrink-0 rounded-full" />
                    <SkeletonBone className="h-3.5 flex-1 rounded" />
                    <SkeletonBone className="h-3 w-10 rounded" />
                    <SkeletonBone className="h-3 w-6 rounded" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: i === 0 ? 4 : i === 1 ? 3 : 2 }).map((_, j) => (
                      <SkeletonChip key={j} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <SkeletonBone className="h-3 w-28 rounded" />
            <div>
              <SkeletonBone className="h-5 w-[72px] rounded-full" />
              <div className="mt-2 flex flex-col">
                <SkeletonMoveRow />
                <SkeletonMoveRow />
              </div>
            </div>
            <div>
              <SkeletonBone className="h-5 w-14 rounded-full" />
              <div className="mt-2 flex flex-col">
                <SkeletonMoveRow />
                <SkeletonMoveRow />
                <SkeletonMoveRow />
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] font-medium text-[#9ca3af]">
          Building your rebalance plan…
        </p>
      </div>
    </>
  );
}

/* ------------------------------ score strip ------------------------------ */

function ScoreStrip({ plan }: { plan: PortfolioRebalancePlan }) {
  const impact = buildRebalanceImpactView(plan);
  const improved = impact.diversification_after > impact.diversification_before;
  const concentrationImproved =
    impact.concentration_before === "High" &&
    impact.concentration_after !== "High";

  return (
    <div className="rounded-xl border border-[#eceff3] bg-[#fafafa] px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">
        Projected impact
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-[11px] font-medium text-[#6b7280]">Diversification</p>
          <p className="mt-0.5 text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[#111111] sm:text-[22px]">
            <span className="text-[#9ca3af]">{impact.diversification_before}</span>
            <span className="mx-1.5 text-[15px] font-normal text-[#d1d5db]">→</span>
            <span className={improved ? "text-[#059669]" : "text-[#111111]"}>
              {impact.diversification_after}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[#6b7280]">Concentration</p>
          <p className="mt-1 text-[14px] font-semibold text-[#111111]">
            {impact.concentration_before}
            <span className="mx-1.5 font-normal text-[#d1d5db]">→</span>
            <span className={concentrationImproved ? "text-[#059669]" : "text-[#111111]"}>
              {impact.concentration_after}
            </span>
          </p>
        </div>
      </div>
      {impact.balance_improvement_pct > 0 ? (
        <p className="mt-2.5 border-t border-[#eceff3] pt-2.5 text-[12px] font-medium text-[#059669]">
          +{impact.balance_improvement_pct}% sector balance improvement
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------- book panel ------------------------------ */

function HoldingChip({ holding }: { holding: RebalanceHoldingView }) {
  const trim = holding.role === "trim";
  const day = fmtDay(holding.day_change_pct);
  const label = roleLabel(holding.role);

  return (
    <Link
      href={`/stock/${encodeURIComponent(holding.ticker)}`}
      title={[
        holding.name,
        fmtWeight(holding.weight_pct),
        holding.fit_score != null ? `fit ${Math.round(holding.fit_score)}` : null,
        day,
        label,
        holding.directive_text || holding.reason,
      ]
        .filter(Boolean)
        .join(" · ")}
      className={`group inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
        trim
          ? "border-[#fecaca] bg-[#fef2f2] hover:bg-[#fee2e2]"
          : "border-[#eceff3] bg-[#f9fafb] hover:bg-[#f3f4f6]"
      }`}
    >
      <StockLogo ticker={holding.ticker} logoUrl={holding.logo_url} size={22} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-[#111111]">
            {holding.ticker}
          </span>
          {holding.fit_score != null ? (
            <span
              className={`text-[10px] font-bold tabular-nums ${scoreTone(holding.fit_score)}`}
            >
              {Math.round(holding.fit_score)}
            </span>
          ) : null}
          {label ? (
            <span
              className={`rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.05em] ${
                trim
                  ? "bg-[#fee2e2] text-[#b91c1c]"
                  : holding.role === "core"
                    ? "bg-[#ecfdf5] text-[#047857]"
                    : "bg-[#f3f4f6] text-[#6b7280]"
              }`}
            >
              {label}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium tabular-nums text-[#6b7280]">
          <span>{fmtWeight(holding.weight_pct)}</span>
          {day ? (
            <>
              <span className="text-[#d1d5db]">·</span>
              <span className={dayTone(holding.day_change_pct)}>{day}</span>
            </>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function SectorLane({ sector }: { sector: RebalanceSectorView }) {
  const heavy = sector.holdings.some((h) => h.role === "trim");

  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center gap-2.5">
        <SectorIconBadge label={sector.sector} size={26} iconSize={14} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#111111]">
          {displayName(sector.sector)}
        </span>
        {heavy ? (
          <span className="rounded-full bg-[#fef2f2] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[#b91c1c]">
            Reduce
          </span>
        ) : null}
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#374151]">
          {fmtWeight(sector.weight_pct)}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[#9ca3af]">
          · {sector.count}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sector.holdings.map((holding) => (
          <HoldingChip key={holding.instrument_id} holding={holding} />
        ))}
      </div>
    </div>
  );
}

function BookPanel({ plan }: { plan: PortfolioRebalancePlan }) {
  const sectors = useMemo(
    () => [...plan.sectors].sort((a, b) => b.weight_pct - a.weight_pct),
    [plan.sectors],
  );

  return (
    <section className="p-4 sm:p-5">
      <header className="flex items-center justify-between border-b border-[#f3f4f6] pb-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#374151]">
          <AnimatedIcon name="inventory_2" size={15} className="text-[#6b7280]" />
          Your book
        </h2>
        <span className="text-[11px] tabular-nums text-[#6b7280]">
          {sectors.length} {sectors.length === 1 ? "sector" : "sectors"}
        </span>
      </header>
      {sectors.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[#6b7280]">
          No sectors to show.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-[#f3f4f6]">
          {sectors.map((sector) => (
            <SectorLane key={sector.sector} sector={sector} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ moves panel ------------------------------ */

function MoveRow({
  ticker,
  name,
  logoUrl,
  reason,
  meta,
  fitScore,
  tone,
}: {
  ticker: string;
  name: string;
  logoUrl: string | null;
  reason: string;
  meta: string;
  fitScore: number | null;
  tone: "remove" | "add";
}) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f9fafb]"
    >
      <div className="shrink-0">
        <StockLogo ticker={ticker} logoUrl={logoUrl} size={32} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-[#111111]">
            {ticker}
            <span className="ml-1.5 text-[11px] font-normal text-[#6b7280]">
              {displayName(name)}
            </span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-bold tabular-nums ${scoreTone(fitScore)}`}
          >
            {fitScore != null ? `fit ${Math.round(fitScore)}` : "—"}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[#4b5563]">
          {reason}
        </p>
        {meta ? (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#9ca3af]">
            {meta}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function MovesGroup({
  label,
  tone,
  count,
  children,
}: {
  label: string;
  tone: "remove" | "add";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
            tone === "remove"
              ? "bg-[#fee2e2] text-[#b91c1c]"
              : "bg-[#dbeafe] text-[#1d4ed8]"
          }`}
        >
          {label}
          <span className="tabular-nums opacity-80">{count}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  );
}

function MovesPanel({ plan }: { plan: PortfolioRebalancePlan }) {
  const impact = useMemo(() => buildRebalanceImpactView(plan), [plan]);
  const { remove, add } = impact;

  if (remove.length === 0 && add.length === 0) {
    return (
      <section className="p-4 sm:p-5">
        <h2 className="border-b border-[#f3f4f6] pb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#374151]">
          Suggested moves
        </h2>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <AnimatedIcon name="check_circle" size={28} className="text-[#059669]" />
          <p className="text-[13px] text-[#6b7280]">
            Nothing to change — the book already fits this strategy.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 p-4 sm:p-5">
      <h2 className="flex items-center gap-1.5 border-b border-[#f3f4f6] pb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#374151]">
        <AnimatedIcon name="swap_horiz" size={15} className="text-[#6b7280]" />
        Suggested moves
      </h2>

      {remove.length > 0 ? (
        <MovesGroup label="Remove" tone="remove" count={remove.length}>
          {remove.map((h) => (
            <MoveRow
              key={h.instrument_id}
              ticker={h.ticker}
              name={h.name}
              logoUrl={h.logo_url}
              reason={h.directive_text || h.reason}
              meta={sectorLabel(h)}
              fitScore={h.fit_score}
              tone="remove"
            />
          ))}
        </MovesGroup>
      ) : null}

      {add.length > 0 ? (
        <MovesGroup label="Add" tone="add" count={add.length}>
          {add.map((s) => (
            <MoveRow
              key={s.instrument_id}
              ticker={s.ticker}
              name={s.name}
              logoUrl={s.logo_url}
              reason={s.why_now || s.directive_text || s.reason}
              meta={sectorLabel(s)}
              fitScore={s.fit_score}
              tone="add"
            />
          ))}
        </MovesGroup>
      ) : null}
    </section>
  );
}

/* -------------------------------- canvas --------------------------------- */

export function PortfolioBucketCanvas({
  plan,
  loading = false,
}: {
  plan: PortfolioRebalancePlan | null;
  loading?: boolean;
}) {
  if (!plan && loading) return <LoadingSkeleton />;
  if (!plan) return null;

  return (
    <div
      className={`relative flex w-full flex-col gap-4 ${loading ? "opacity-60" : ""}`}
      aria-busy={loading}
    >
      <ScoreStrip plan={plan} />

      <div className="grid divide-y divide-[#f3f4f6] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white lg:grid-cols-[1.5fr_1fr] lg:divide-x lg:divide-y-0">
        <BookPanel plan={plan} />
        <MovesPanel plan={plan} />
      </div>

      {loading ? (
        <p className="text-center text-[11px] font-medium text-[#6b7280]">
          Updating…
        </p>
      ) : null}
    </div>
  );
}
