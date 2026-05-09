"use client";

import Link from "next/link";
import { useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { WatchlistRow } from "@/lib/watchlist-view";

type Dict = Record<string, unknown>;

export function WatchlistStockTabs({ rows }: { rows: WatchlistRow[] }) {
  const [activeId, setActiveId] = useState<string>(rows[0]?.instrument_id ?? "");
  const active = rows.find((r) => r.instrument_id === activeId) ?? rows[0];

  if (!active) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Tab strip — horizontally scrollable when overflowing */}
      <div className="-mx-1 overflow-x-auto scrollbar-hide">
        <div
          role="tablist"
          aria-label="Radar stocks"
          className="flex items-center gap-1 px-1 min-w-min"
        >
          {rows.map((row) => {
            const isActive = row.instrument_id === active.instrument_id;
            const positive = (row.day_change_pct ?? 0) >= 0;
            return (
              <button
                key={row.instrument_id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(row.instrument_id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-white border border-[#e5e7eb] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "border border-transparent hover:bg-[#f8f9fa]"
                }`}
              >
                <StockLogo
                  ticker={row.ticker}
                  logoUrl={row.logo_url}
                  market={row.market === "IN" ? "IN" : "US"}
                  size={22}
                />
                <span
                  className={`text-[13px] font-semibold tracking-[-0.01em] ${
                    isActive ? "text-[#111111]" : "text-[#6b7280]"
                  }`}
                >
                  {row.ticker}
                </span>
                {row.day_change_pct !== null && (
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${
                      positive ? "text-[#10b981]" : "text-[#ef4444]"
                    }`}
                  >
                    {formatSignedPct(row.day_change_pct)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <StockBlock row={active} />
    </div>
  );
}

function StockBlock({ row }: { row: WatchlistRow }) {
  const facts = asDict(row.facts);
  const analyst = asDict(facts.analyst);
  const returns = asDict(facts.returns);
  const financials = asDict(facts.financials);
  const quick = asDict(facts.quick_stats);
  const technicals = asDict(row.technicals);
  const rsi = asDict(technicals.rsi_14);
  const distance = asDict(technicals.distance);
  const newsVelocity = asDict(row.news_velocity);
  const signals = asArray(row.premium_signals).slice(0, 4);
  const positive = (row.day_change_pct ?? 0) >= 0;
  const changes = asDict((row as unknown as { changes?: unknown }).changes);
  const catalysts = asArray((row as unknown as { catalysts?: unknown }).catalysts);
  const nextCatalyst = catalysts[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Link
          href={`/stock/${encodeURIComponent(row.ticker)}`}
          className="flex items-center gap-3 group"
        >
          <StockLogo
            ticker={row.ticker}
            logoUrl={row.logo_url}
            market={row.market === "IN" ? "IN" : "US"}
            size={40}
          />
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
              {row.ticker}
            </span>
            <span className="text-[12px] text-[#6b7280]">
              {row.sector_label || row.market}
              {row.scores.overall !== null && (
                <> · Score {Math.round(row.scores.overall)}</>
              )}
            </span>
          </div>
        </Link>
        <div className="flex flex-col items-end">
          <span className="text-[18px] font-semibold text-[#111111] tabular-nums">
            {formatCurrency(row.price, row.currency)}
          </span>
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              positive ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {formatSignedPct(row.day_change_pct)}
          </span>
        </div>
      </div>

      <ChangeAndWatchStrip
        changes={changes}
        nextCatalyst={nextCatalyst}
        alerts={row.alerts}
      />

      {/* Signals — flat rows */}
      {signals.length > 0 && (
        <div className="flex flex-col">
          {signals.map((signal, i) => (
            <div
              key={`sig-${i}`}
              className="flex items-baseline justify-between gap-3 py-2.5 border-t border-[#f3f4f6] first:border-t-0"
            >
              <span className="flex items-baseline gap-3 min-w-0">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af] shrink-0 w-24">
                  {text(signal.label) || text(signal.kind) || "Signal"}
                </span>
                {text(signal.sentence) && (
                  <span className="text-[13px] text-[#111111]">
                    {text(signal.sentence)}
                  </span>
                )}
              </span>
              <span className={`shrink-0 ${toneTextClass(text(signal.tone))}`}>
                {formatSignalValue(signal)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Inline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 pt-2 border-t border-[#f3f4f6]">
        <InlineMetric
          label="Target upside"
          value={formatSignedPct(num(row.target_upside_pct))}
          tone={signedTone(num(row.target_upside_pct))}
        />
        <InlineMetric
          label="Analysts"
          value={formatValue(num(analyst.analyst_count))}
          helper={text(analyst.label)}
        />
        <InlineMetric
          label="1M / 1Y"
          value={`${formatSignedPct(num(returns.one_month_pct))} / ${formatSignedPct(num(returns.one_year_pct))}`}
        />
        <InlineMetric
          label="Inst. own."
          value={formatPct(
            num(quick.institutional_ownership_pct) ??
              num(asDict(facts.institutions).ownership_pct),
          )}
        />
        <InlineMetric
          label="RSI"
          value={formatValue(num(rsi.value))}
          helper={text(rsi.state)}
        />
        <InlineMetric
          label="From 52W high"
          value={formatSignedPct(num(distance.from_52w_high_pct))}
          tone={signedTone(num(distance.from_52w_high_pct))}
        />
        <InlineMetric
          label="Revenue"
          value={formatCompactMoney(num(financials.revenue), row.currency)}
          helper={formatSignedPct(num(financials.revenue_growth_yoy_pct))}
        />
        <InlineMetric
          label="News 7D"
          value={formatValue(num(newsVelocity.mentions_7d))}
          helper={`1D ${formatValue(num(newsVelocity.mentions_1d))}`}
        />
      </div>

      {row.top_metric_summaries?.length ? (
        <ul className="flex flex-col gap-1 pt-3 border-t border-[#f3f4f6]">
          {row.top_metric_summaries.slice(0, 3).map((item) => (
            <li key={item} className="text-[12px] text-[#6b7280] leading-snug">
              · {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChangeAndWatchStrip({
  changes,
  nextCatalyst,
  alerts,
}: {
  changes: Dict;
  nextCatalyst?: Dict;
  alerts: WatchlistRow["alerts"];
}) {
  const hasMaterial = Boolean(changes.has_material_change);
  const isNew = Boolean(changes.is_new);
  const scoreDeltas = asDict(changes.score_deltas);
  const overallDelta = num(scoreDeltas.overall);
  const targetDelta = num(changes.target_upside_delta);
  const dayChangeDelta = num(changes.day_change_delta);
  const newAlerts = asArray(changes.new_alerts);

  const chips: React.ReactNode[] = [];

  if (isNew) {
    chips.push(
      <Chip key="new" tone="info" emoji="🆕">
        New baseline
      </Chip>,
    );
  }
  if (typeof overallDelta === "number" && Math.abs(overallDelta) >= 1) {
    const tone: ChipTone = overallDelta >= 0 ? "up" : "down";
    chips.push(
      <Chip key="score" tone={tone} emoji="📊">
        Score {overallDelta >= 0 ? "+" : ""}
        {overallDelta.toFixed(1)}
      </Chip>,
    );
  }
  if (typeof targetDelta === "number" && Math.abs(targetDelta) >= 1) {
    chips.push(
      <Chip key="target" tone={targetDelta >= 0 ? "up" : "down"} emoji="🎯">
        Target {targetDelta >= 0 ? "+" : ""}
        {targetDelta.toFixed(1)}%
      </Chip>,
    );
  }
  if (typeof dayChangeDelta === "number" && Math.abs(dayChangeDelta) >= 1) {
    chips.push(
      <Chip
        key="day"
        tone={dayChangeDelta >= 0 ? "up" : "down"}
        emoji={dayChangeDelta >= 0 ? "📈" : "📉"}
      >
        Day {dayChangeDelta >= 0 ? "+" : ""}
        {dayChangeDelta.toFixed(1)}%
      </Chip>,
    );
  }
  if (newAlerts.length > 0) {
    chips.push(
      <Chip key="alerts" tone="warn" emoji="🔔">
        {newAlerts.length} new alert{newAlerts.length === 1 ? "" : "s"}
      </Chip>,
    );
  }

  // What to watch — pick from next catalyst, then any active alert.
  const catalystTitle = text(nextCatalyst?.title);
  const catalystDate = text(nextCatalyst?.date_label);
  const catalystKind = text(nextCatalyst?.kind).replaceAll("_", " ");
  const watchEmoji = catalystKind === "earnings" ? "📅" : "🔭";
  const fallbackAlert = alerts[0];
  const alertMessage =
    typeof fallbackAlert?.message === "string"
      ? fallbackAlert.message
      : typeof fallbackAlert?.label === "string"
        ? fallbackAlert.label
        : "";
  const watchHeadline = catalystTitle || alertMessage;
  const watchMeta = catalystDate || (catalystKind && !catalystTitle ? catalystKind : "");

  if (chips.length === 0 && !watchHeadline) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:gap-6 items-start">
      {chips.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
            {hasMaterial ? "What changed" : "Since last refresh"}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
        </div>
      ) : (
        <div />
      )}
      {watchHeadline && (
        <div className="flex items-start gap-2.5 md:max-w-[360px]">
          <span aria-hidden className="text-[16px] mt-0.5 shrink-0">
            {watchEmoji}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              What to watch
            </span>
            <span className="text-[13px] font-semibold text-[#111111] leading-snug">
              {watchHeadline}
            </span>
            {watchMeta && (
              <span className="text-[11px] text-[#6b7280]">{watchMeta}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ChipTone = "up" | "down" | "warn" | "info";

function Chip({
  tone,
  emoji,
  children,
}: {
  tone: ChipTone;
  emoji: string;
  children: React.ReactNode;
}) {
  const palette: Record<ChipTone, { bg: string; fg: string }> = {
    up: { bg: "#ecfdf5", fg: "#065f46" },
    down: { bg: "#fef2f2", fg: "#991b1b" },
    warn: { bg: "#fef3c7", fg: "#92400e" },
    info: { bg: "#eff6ff", fg: "#0052ff" },
  };
  const { bg, fg } = palette[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={{ background: bg, color: fg }}
    >
      <span aria-hidden className="text-[12px]">{emoji}</span>
      {children}
    </span>
  );
}

function InlineMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "up" | "down" | "ink";
}) {
  const valueClass =
    tone === "up"
      ? "text-[#10b981]"
      : tone === "down"
        ? "text-[#ef4444]"
        : "text-[#111111]";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
        {label}
      </span>
      <span className={`text-[14px] font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
      {helper && (
        <span className="text-[11px] text-[#6b7280] leading-tight">{helper}</span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Local helpers (kept in this file so the client bundle is self-contained)
// -----------------------------------------------------------------------------

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Dict =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function signedTone(value: number | null | undefined): "up" | "down" | "ink" {
  if (value === null || value === undefined) return "ink";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "ink";
}

function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function formatCompactMoney(
  value: number | null | undefined,
  currency: string,
): string {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : "$";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000)
    return `${symbol}${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000)
    return `${symbol}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatSignalValue(signal: Dict): string {
  const value = signal.value;
  const unit = text(signal.unit);
  if (typeof value === "number") {
    const formatted = unit === "%" ? formatSignedPct(value) : formatValue(value);
    return unit && unit !== "%" ? `${formatted} ${unit}` : formatted;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return text(signal.tone) || "";
}

function toneTextClass(tone: string): string {
  if (tone === "positive")
    return "text-[12px] font-semibold text-[#10b981] tabular-nums";
  if (tone === "negative")
    return "text-[12px] font-semibold text-[#ef4444] tabular-nums";
  return "text-[12px] font-semibold text-[#6b7280] tabular-nums";
}
