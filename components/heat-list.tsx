"use client";

import { useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { HeatList, HeatRow } from "@/lib/heat";
import type { DivergenceList, DivergenceRow } from "@/lib/divergence";

const ROWS_PER_TAB = 10;
const SIDE_RAIL_ROWS = 6;
const DIVERGENCE_RAIL_ROWS = 5;

type Props = {
  data: HeatList | null;
  divergence?: DivergenceList | null;
  trackedIds?: string[];
  isSubscribed?: boolean;
};

type SetupMeta = {
  label: string;
  short: string;
  desc: string;
  color: string;
  bg: string;
  order: number;
};

const SETUP_META: Record<string, SetupMeta> = {
  overheated:     { label: "Overheated",     short: "Overheated", desc: "Heat score is extreme. Unusually high volume, momentum, or news velocity. Proceed with caution.",   color: "#c2410c", bg: "#fff7ed", order: 1 },
  catalyst_watch: { label: "Catalyst watch", short: "Catalyst",   desc: "An upcoming event (earnings, FDA ruling, or macro data) could be a significant price mover.",      color: "#b45309", bg: "#fffbeb", order: 2 },
  breakout:       { label: "Breakout",       short: "Breakout",   desc: "Price breaking above a key level with confirmation. Momentum is building on the upside.",            color: "#047857", bg: "#ecfdf5", order: 3 },
  news_spike:     { label: "News spike",     short: "News",       desc: "A sudden surge in news coverage or press mentions is driving unusual attention to this stock.",      color: "#7c3aed", bg: "#f5f3ff", order: 4 },
  dip_setup:      { label: "Dip setup",      short: "Dip",        desc: "Stock is pulling back within an uptrend, a potential re-entry point if the thesis still holds.",    color: "#0052ff", bg: "#eff6ff", order: 5 },
  momentum_watch: { label: "Momentum watch", short: "Momentum",   desc: "Consistent signal strength without a single trigger. Worth watching for a cleaner entry.",          color: "#475569", bg: "#f8fafc", order: 6 },
};

function getSetupMeta(key?: string): SetupMeta {
  if (key && SETUP_META[key]) return SETUP_META[key];
  return { label: key ? key.replaceAll("_", " ") : "Watching", short: "Watching", desc: "", color: "#6b7280", bg: "#f3f4f6", order: 99 };
}

function extractCatalystHint(sentence: string | undefined, ticker: string): string | null {
  if (!sentence) return null;
  // Drop everything after the first semicolon (price/heat noise)
  const trimmed = sentence.split(";")[0].trim();
  // Drop leading "{TICKER} has " boilerplate
  const withoutPrefix = trimmed.replace(new RegExp(`^${ticker}\\s+has\\s+`, "i"), "");
  return withoutPrefix || null;
}

function fmtPct(v: number | null | undefined): { text: string; positive: boolean } | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return { text: `${Math.abs(v).toFixed(2)}%`, positive: v >= 0 };
}

function heatScoreColor(score: number): string {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#111111";
  if (score >= 40) return "#6b7280";
  return "#9ca3af";
}

function rsiMeta(state?: string): { label: string; color: string; bg: string } | null {
  switch ((state ?? "").toLowerCase()) {
    case "overbought":
      return { label: "Overbought", color: "#c2410c", bg: "#fff7ed" };
    case "oversold":
      return { label: "Oversold", color: "#047857", bg: "#ecfdf5" };
    default:
      return null;
  }
}

// ─── Rail row (left sidebar - lean) ──────────────────────────────────────────

function RailRow({ row, trackedIds, isSubscribed }: { row: HeatRow; trackedIds: string[]; isSubscribed: boolean }) {
  const market = row.instrument_id.startsWith("IN_") ? "IN" : "US";

  return (
    <div className="flex items-center gap-2.5 py-2.5 border-t border-[#f3f4f6] first:border-t-0 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors">
      <a href={`/stock/${encodeURIComponent(row.ticker)}`} className="flex items-center gap-2.5 flex-1 min-w-0">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={32} />
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111] hover:text-[#0052ff] transition-colors">
            {row.ticker}
          </span>
          {row.first_appearance && (
            <span className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#0052ff] bg-[#eff6ff] px-1.5 py-0.5 rounded-md">New</span>
          )}
        </div>
      </a>
      <TrackButton ticker={row.ticker} instrumentId={row.instrument_id} isTracked={trackedIds.includes(row.instrument_id)} isSubscribed={isSubscribed} variant="icon" />
    </div>
  );
}

// ─── Table row (right rail - full columns) ────────────────────────────────────

// Column widths - must match TableHeader exactly
const COL_RSI    = "w-[160px]";
const COL_HEAT   = "w-[48px]";
const COL_TRACK  = "w-8";

function TableRow({ row, trackedIds, isSubscribed, showReason = false }: { row: HeatRow; trackedIds: string[]; isSubscribed: boolean; showReason?: boolean }) {
  const market = row.instrument_id.startsWith("IN_") ? "IN" : "US";
  const heatColor = heatScoreColor(Math.min(100, Math.max(0, row.heat_score)));
  const rsi = typeof row.rsi_14 === "number" ? Math.round(row.rsi_14) : null;
  const rsiBadge = rsiMeta(row.rsi_14_state);

  return (
    <div className="flex items-center gap-4 py-3 border-t border-[#f3f4f6] first:border-t-0 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors">
      {/* Ticker */}
      <a href={`/stock/${encodeURIComponent(row.ticker)}`} className="flex items-center gap-2.5 flex-1 min-w-0">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] hover:text-[#0052ff] transition-colors">
              {row.ticker}
            </span>
            {row.first_appearance && (
              <span className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#0052ff] bg-[#eff6ff] px-1.5 py-0.5 rounded-md">New</span>
            )}
          </div>
          {showReason && (() => {
            const hint = extractCatalystHint(row.reason_sentence, row.ticker) ?? row.primary_driver;
            return hint ? (
              <span className="text-[11px] text-[#6b7280] truncate">{hint}</span>
            ) : null;
          })()}
        </div>
      </a>

      {/* RSI - number always visible, badge sm+ only */}
      <div className="shrink-0 flex items-center justify-end gap-1.5 w-[36px] sm:w-[160px]">
        {rsi !== null ? (
          <>
            <span className="text-[13px] font-semibold tabular-nums text-[#111111]">{rsi}</span>
            {rsiBadge && (
              <span className="hidden sm:inline text-[10px] font-semibold rounded-md px-1.5 py-0.5" style={{ background: rsiBadge.bg, color: rsiBadge.color }}>
                {rsiBadge.label}
              </span>
            )}
          </>
        ) : (
          <span className="text-[12px] text-[#d1d5db]">-</span>
        )}
      </div>

      {/* Heat - hidden on mobile */}
      <div className={`${COL_HEAT} hidden sm:flex shrink-0 justify-end`}>
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: heatColor }}>
          {Math.round(row.heat_score)}
        </span>
      </div>

      {/* Track */}
      <div className={`${COL_TRACK} shrink-0 flex justify-end`}>
        <TrackButton ticker={row.ticker} instrumentId={row.instrument_id} isTracked={trackedIds.includes(row.instrument_id)} isSubscribed={isSubscribed} variant="icon" />
      </div>
    </div>
  );
}

// ─── Hot stocks rail card ─────────────────────────────────────────────────────

function HotStocksCard({
  count,
  rows,
  trackedIds,
  isSubscribed,
}: {
  count: number;
  rows: HeatRow[];
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">Hot stocks</h3>
        {count > 0 && (
          <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">{count}</span>
        )}
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <RailRow key={r.instrument_id} row={r} trackedIds={trackedIds} isSubscribed={isSubscribed} />
        ))}
      </div>
    </div>
  );
}

// ─── Mixed signals rail card (divergence) ────────────────────────────────────

function DivergenceRow({
  row,
}: {
  row: DivergenceRow;
}) {
  const pct = fmtPct(row.price_change_pct);
  const isBullishNewsDown = row.direction === "bullish_news_price_down";

  return (
    <a
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="flex items-start gap-3 py-3 border-t border-[#f3f4f6] first:border-t-0 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors"
    >
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] hover:text-[#0052ff] transition-colors">
            {row.ticker}
          </span>
          {row.name && (
            <span className="text-[11px] text-[#9ca3af] truncate">{row.name}</span>
          )}
        </div>
        <span
          className="text-[10px] font-semibold tracking-[0.04em] uppercase rounded-md px-1.5 py-0.5 w-fit"
          style={{
            background: isBullishNewsDown ? "#ecfdf5" : "#fef2f2",
            color: isBullishNewsDown ? "#047857" : "#b91c1c",
          }}
        >
          {isBullishNewsDown ? "Good news, price fell" : "Bad news, price rose"}
        </span>
      </div>
      {pct && (
        <span
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums"
          style={{
            background: pct.positive ? "#ecfdf5" : "#fef2f2",
            color: pct.positive ? "#10b981" : "#ef4444",
          }}
        >
          {pct.positive ? "▲" : "▼"} {pct.text}
        </span>
      )}
    </a>
  );
}

function MixedSignalsCard({ divergence }: { divergence: DivergenceList }) {
  const rows = divergence.rows.slice(0, DIVERGENCE_RAIL_ROWS);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
          Mixed signals
        </h3>
        <p className="text-[11px] text-[#9ca3af]">News and price moving in opposite directions</p>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <DivergenceRow key={r.instrument_id} row={r} />
        ))}
      </div>
    </div>
  );
}

// ─── Setup filter pills ───────────────────────────────────────────────────────

function SetupPills({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  active: string;
  onSelect: (key: string) => void;
}) {
  const setups = Object.entries(SETUP_META)
    .sort((a, b) => a[1].order - b[1].order)
    .filter(([k]) => (counts[k] ?? 0) > 0);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {setups.map(([k, m]) => (
        <button
          type="button"
          key={k}
          onClick={() => onSelect(k)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            active === k
              ? "bg-[#111111] text-white"
              : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          }`}
        >
          {m.short}
          <span className={`text-[10px] font-semibold tabular-nums ${active === k ? "text-white/70" : "text-[#9ca3af]"}`}>
            {(counts[k] ?? 0) > 10 ? "10+" : counts[k] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
      <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#111111]">
        Quiet day
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280] max-w-md mx-auto">
        Today&apos;s ranked signals haven&apos;t been generated yet. Check back after the next
        market refresh.
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HeatListView({ data, divergence, trackedIds = [], isSubscribed = false }: Props) {
  const [activeTab, setActiveTab] = useState("overheated");

  const sorted = useMemo(
    () => (data ? [...data.rows].sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0)) : []),
    [data],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of sorted) {
      const k = r.setup_type ?? "momentum_watch";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [sorted]);

  if (!data || data.rows.length === 0) return <EmptyState />;

  const tabRows = sorted
    .filter((r) => (r.setup_type ?? "momentum_watch") === activeTab)
    .slice(0, ROWS_PER_TAB);

  const hotRows = sorted.slice(0, SIDE_RAIL_ROWS);
  const hasDivergence = divergence && Array.isArray(divergence.rows) && divergence.rows.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-x-14 gap-y-8">

      {/* Left rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <HotStocksCard
          count={sorted.length}
          rows={hotRows}
          trackedIds={trackedIds}
          isSubscribed={isSubscribed}
        />

        {hasDivergence && (
          <MixedSignalsCard divergence={divergence} />
        )}
      </aside>

      {/* Right rail */}
      <section className="flex flex-col gap-4 min-w-0">
        <SetupPills
          counts={counts}
          active={activeTab}
          onSelect={(k) => setActiveTab(k)}
        />

        {SETUP_META[activeTab] && (
          <p className="text-[12px] text-[#6b7280] leading-relaxed">
            {SETUP_META[activeTab].desc}
          </p>
        )}

        {/* Column headers */}
        <div className="flex items-center gap-4 px-1 pb-1 border-b border-[#f3f4f6]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Ticker</span>
          </div>
          <div className="shrink-0 flex justify-end w-[36px] sm:w-[160px]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">RSI</span>
          </div>
          <div className={`${COL_HEAT} hidden sm:flex shrink-0 justify-end`}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">Heat</span>
          </div>
          <div className={`${COL_TRACK} shrink-0`} />
        </div>

        <div className="flex flex-col">
          {tabRows.map((r) => (
            <TableRow
              key={r.instrument_id}
              row={r}
              trackedIds={trackedIds}
              isSubscribed={isSubscribed}
              showReason={activeTab === "catalyst_watch"}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
