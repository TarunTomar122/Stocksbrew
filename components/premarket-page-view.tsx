"use client";

import { useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { PremarketMovers, PremarketRow } from "@/lib/premarket";
import { relativeTime } from "@/lib/freshness";

const PHASE_LABEL: Record<string, string> = {
  trending_up: "trending up",
  distribution: "in distribution",
  correction: "in a correction",
  recovery: "recovering",
  range: "range-bound",
};
const RISK_LABEL: Record<string, string> = { on: "risk-on", off: "risk-off", mixed: "mixed" };

type Tab = "up" | "down";

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function MobileTabBar({
  active,
  onSelect,
  upCount,
  downCount,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
  upCount: number;
  downCount: number;
}) {
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "up", label: "Gapping up", count: upCount },
    { key: "down", label: "Gapping down", count: downCount },
  ];

  return (
    <div className="flex items-center gap-1.5 lg:hidden">
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            active === key ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          }`}
        >
          {label}
          <span
            className={`text-[10px] font-semibold tabular-nums ${
              active === key ? "text-white/70" : "text-[#9ca3af]"
            }`}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

function MoverTable({
  label,
  rows,
  market,
  trackedIds,
  tone,
  showLabel = true,
}: {
  label: string;
  rows: PremarketRow[];
  market: "US" | "IN";
  trackedIds: Set<string>;
  tone: "up" | "down";
  showLabel?: boolean;
}) {
  if (rows.length === 0) return null;
  const color = tone === "up" ? "#10b981" : "#ef4444";

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {showLabel && (
        <div className="hidden items-center gap-2 px-1 lg:flex">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">{label}</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>
            {rows.length}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white px-3 sm:px-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#f3f4f6] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                <th className="px-3 py-3 font-semibold">Ticker</th>
                <th className="px-3 py-3 text-right font-semibold">Gap</th>
                <th className="px-3 py-3 text-right font-semibold">Pre-market</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const up = row.pre_market_change_pct >= 0;
                const pctColor = up ? "#10b981" : "#ef4444";
                return (
                  <tr
                    key={row.instrument_id}
                    className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#fafaf7]"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/stock/${encodeURIComponent(row.ticker)}`}
                        className="group flex min-w-0 items-center gap-2.5"
                      >
                        <StockLogo ticker={row.ticker} market={market} size={28} logoUrl={row.logo_url} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
                            {row.ticker}
                          </div>
                          {row.sector && (
                            <div className="max-w-[140px] truncate text-[11px] text-[#9ca3af]">{row.sector}</div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-semibold tabular-nums" style={{ color: pctColor }}>
                        {up ? "+" : ""}
                        {row.pre_market_change_pct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-[#111111]">
                      ${fmtPrice(row.pre_market_price)}
                    </td>
                    <td className="px-3 py-3">
                      <TrackButton
                        ticker={row.ticker}
                        instrumentId={row.instrument_id}
                        isTracked={trackedIds.has(row.instrument_id)}
                        variant="icon"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PremarketMoversTables({
  gappersUp,
  gappersDown,
  market,
  trackedIds,
}: {
  gappersUp: PremarketRow[];
  gappersDown: PremarketRow[];
  market: "US" | "IN";
  trackedIds: Set<string>;
}) {
  const [tab, setTab] = useState<Tab>(gappersUp.length > 0 ? "up" : "down");
  const showTabs = gappersUp.length > 0 && gappersDown.length > 0;
  const mobileRows = tab === "up" ? gappersUp : gappersDown;
  const mobileTone = tab === "up" ? "up" : "down";

  return (
    <div className="flex flex-col gap-4">
      {showTabs && (
        <MobileTabBar
          active={tab}
          onSelect={setTab}
          upCount={gappersUp.length}
          downCount={gappersDown.length}
        />
      )}

      <div className="lg:hidden">
        <MoverTable
          label={tab === "up" ? "Gapping up" : "Gapping down"}
          rows={mobileRows}
          market={market}
          trackedIds={trackedIds}
          tone={mobileTone}
          showLabel={false}
        />
      </div>

      <div className="hidden gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <MoverTable
          label="Gapping up"
          rows={gappersUp}
          market={market}
          trackedIds={trackedIds}
          tone="up"
        />
        <MoverTable
          label="Gapping down"
          rows={gappersDown}
          market={market}
          trackedIds={trackedIds}
          tone="down"
        />
      </div>
    </div>
  );
}

export function PremarketPageView({
  movers,
  premarketLive,
  marketPhase,
  marketRisk,
  trackedIds = [],
}: {
  movers: PremarketMovers;
  premarketLive: boolean;
  marketPhase?: string | null;
  marketRisk?: string | null;
  trackedIds?: string[];
}) {
  const gappersUp = [...(movers.gappers_up ?? [])].sort(
    (a, b) => b.pre_market_change_pct - a.pre_market_change_pct,
  );
  const gappersDown = [...(movers.gappers_down ?? [])].sort(
    (a, b) => a.pre_market_change_pct - b.pre_market_change_pct,
  );
  const total = gappersUp.length + gappersDown.length;
  const phase = marketPhase ? PHASE_LABEL[marketPhase] : null;
  const risk = marketRisk ? RISK_LABEL[marketRisk] : null;
  const tracked = new Set(trackedIds);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0052ff]">
            Before the open
          </p>
          {premarketLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[#047857]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Pre-market live
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2.5 py-0.5 text-[10px] font-semibold text-[#6b7280]">
              Last snapshot
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[40px]">
            Pre-market movers
          </h1>
          <p className="max-w-2xl text-[14px] leading-relaxed text-[#6b7280]">
            {total > 0
              ? `${total} stocks gapping before the open · ${gappersUp.length} up, ${gappersDown.length} down`
              : "No pre-market quotes in the latest snapshot."}
            {relativeTime(movers.generated_at) ? ` · Updated ${relativeTime(movers.generated_at)}` : ""}
            {movers.quoted_count > 0 ? ` · ${movers.quoted_count} quoted` : ""}
          </p>
          {phase && (
            <p className="text-[13px] text-[#6b7280]">
              Market is {phase}
              {risk ? `, ${risk}` : ""}.
            </p>
          )}
        </div>
      </div>

      <PremarketMoversTables
        gappersUp={gappersUp}
        gappersDown={gappersDown}
        market={movers.market}
        trackedIds={tracked}
      />
    </div>
  );
}
