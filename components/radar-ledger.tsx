"use client";

import Link from "next/link";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StockLogo } from "@/components/stock-logo";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { triggerRadarBackgroundRefresh } from "@/lib/radar-client-refresh";
import type { WatchlistRow } from "@/lib/watchlist-view";

type DirectiveV2 = NonNullable<WatchlistRow["directive_v2"]>;
type HoldingPatch = Partial<NonNullable<WatchlistRow["holding"]>>;

type Tab = "holdings" | "watching";

type Suggestion = {
  ticker: string;
  name?: string;
  sector?: string;
  reason?: string;
  why?: string;
  score?: number | null;
  market?: string;
  sources?: string[];
};

// Source pills shown on suggestion cards so users see which signals flagged the stock.
const SOURCE_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  heat:    { label: "Heat",    bg: "#fff7ed", fg: "#c2410c" },
  reddit:  { label: "Reddit",  bg: "#f5f3ff", fg: "#7c3aed" },
  anomaly: { label: "Anomaly", bg: "#eff6ff", fg: "#1d4ed8" },
  screen:  { label: "Screen",  bg: "#ecfdf5", fg: "#047857" },
};

type Props = {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
  suggestions?: Suggestion[];
  /** Controlled tab — when provided, RadarLedger hides its own pills */
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
};

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function fmtPrice(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${v.toLocaleString(undefined, {
    minimumFractionDigits: v >= 1000 ? 0 : 2,
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  })}`;
}

function fmtSignedPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtSignedAbs(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined) return "-";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${v >= 0 ? "+" : "-"}${symbol}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function scoreToneText(score: number | null): string {
  if (score === null) return "text-[#9ca3af]";
  if (score >= 80) return "text-[#10b981]";
  if (score >= 60) return "text-[#111111]";
  if (score >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function runwayToneText(pct: number | null): string {
  if (pct === null) return "text-[#9ca3af]";
  if (pct >= 15) return "text-[#047857]";
  if (pct >= 0) return "text-[#111111]";
  return "text-[#ef4444]";
}

function fmtRunwayPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function groupSummary(rows: WatchlistRow[]): {
  avgPct: number | null;
  totalAbs: number | null;
  currency: string;
} {
  // Dollar-weighted % when every row has portfolio_weight_pct stamped (all-or-none).
  const allWeighted =
    rows.length > 0 &&
    rows.every(
      (r) =>
        typeof r.holding?.portfolio_weight_pct === "number" &&
        (r.holding.portfolio_weight_pct as number) > 0,
    );

  let avgPct: number | null;
  if (allWeighted) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const r of rows) {
      const pct = num(r.day_change_pct);
      const w = r.holding!.portfolio_weight_pct as number;
      if (pct !== null && w > 0) {
        weightedSum += pct * w;
        totalWeight += w;
      }
    }
    avgPct = totalWeight > 0 ? weightedSum / totalWeight : null;
  } else {
    const pcts = rows.map((r) => num(r.day_change_pct)).filter((n): n is number => n !== null);
    avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  }

  // Absolute dollar change is always summed — that's the real P&L number regardless of weighting.
  const absRows = rows.filter((r) => num(r.day_change_abs) !== null);
  const totalAbs = absRows.length
    ? absRows.reduce((s, r) => s + (num(r.day_change_abs) ?? 0), 0)
    : null;
  const currency = rows.find((r) => r.currency)?.currency ?? "USD";
  return { avgPct, totalAbs, currency };
}

function fmtShares(qty: number | null | undefined): string {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return "—";
  if (qty >= 1000) return qty.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Number.isInteger(qty)) return String(qty);
  return qty.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtHoldingValue(row: WatchlistRow): string {
  const h = row.holding;
  if (!h) return "-";
  const val = num(h.market_value) ?? num(h.computed_market_value);
  if (val !== null) {
    return `${row.currency === "INR" ? "₹" : "$"}${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  const qty = num(h.quantity);
  if (qty !== null && row.price !== null) {
    return `${row.currency === "INR" ? "₹" : "$"}${(qty * row.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (qty !== null) return `${qty} sh`;
  return "-";
}

const PRIORITY_BADGE: Record<
  DirectiveV2["priority"],
  { label: string; bg: string; fg: string }
> = {
  high: { label: "High", bg: "#fef2f2", fg: "#b91c1c" },
  medium: { label: "Medium", bg: "#fef3c7", fg: "#92400e" },
  low: { label: "Low", bg: "#f3f4f6", fg: "#4b5563" },
};

const STANCE_CHIP: Record<
  string,
  { label: string; bg: string; fg: string; dot: string }
> = {
  accumulate: { label: "Accumulate", bg: "#ecfdf5", fg: "#065f46", dot: "#10b981" },
  trim: { label: "Trim", bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b" },
  watch: { label: "Watch", bg: "#eff6ff", fg: "#1e3a8a", dot: "#0052ff" },
  avoid: { label: "Avoid", bg: "#fef2f2", fg: "#991b1b", dot: "#ef4444" },
  hold: { label: "Hold", bg: "#f3f4f6", fg: "#374151", dot: "#374151" },
};

function rsiExtremeFromRow(row: WatchlistRow): {
  label: string;
  tone: "overbought" | "oversold";
} | null {
  const tech = row.technicals as Record<string, unknown> | undefined;
  const rsiBlock = (tech?.rsi_14 as Record<string, unknown> | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  const state = String(rsiBlock.state ?? "").toLowerCase().trim();

  const over = state === "overbought" || (rsi !== null && rsi >= 70);
  const under = state === "oversold" || (rsi !== null && rsi <= 30);
  if (!over && !under) return null;

  const suffix = rsi !== null ? ` ${rsi.toFixed(0)}` : "";
  if (over && under) return null;
  if (over) return { label: `RSI${suffix}`, tone: "overbought" };
  return { label: `RSI${suffix}`, tone: "oversold" };
}

function mergeHoldingPatch(row: WatchlistRow, patch?: HoldingPatch): WatchlistRow {
  if (!patch) return row;
  return {
    ...row,
    holding: {
      ...row.holding,
      ...patch,
    },
  };
}

function PriorityBadge({ priority }: { priority: DirectiveV2["priority"] }) {
  const meta = PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em]"
      style={{ background: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  );
}

function TriggerChip({ trigger }: { trigger: string }) {
  const label = trigger.trim();
  if (!label) return null;
  return (
    <span className="inline-flex max-w-[120px] shrink-0 items-center truncate rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[9px] font-medium text-[#6b7280]">
      {label.length > 18 ? `${label.slice(0, 16)}…` : label}
    </span>
  );
}

function SizeUnknownBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[#fef3c7] px-1.5 py-0.5 text-[9px] font-semibold text-[#92400e]">
      Size unknown
    </span>
  );
}

type StanceChipMeta = { label: string; bg: string; fg: string; dot: string };

function StanceChip({ meta, size = "sm" }: { meta: StanceChipMeta; size?: "xs" | "sm" }) {
  const cls = size === "xs"
    ? "px-1.5 py-0.5 text-[9px] gap-1"
    : "px-2 py-0.5 text-[10px] gap-1.5";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-semibold tracking-[0.04em] uppercase ${cls}`}
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.dot }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

function DirectiveDisplay({
  row,
  compact = false,
  anyHoldingKnown = false,
}: {
  row: WatchlistRow;
  compact?: boolean;
  anyHoldingKnown?: boolean;
}) {
  const d2 = row.directive_v2;
  const stance = String(row.ai_directive?.stance ?? "").toLowerCase();
  const stanceMeta = STANCE_CHIP[stance];

  if (d2?.title) {
    // Use live holding data — directive_v2.holding_status can be stale from
    // a cached backend view run before the user entered their shares.
    const rowHoldingKnown =
      (row.holding?.quantity ?? 0) > 0 ||
      (row.holding?.market_value ?? 0) > 0 ||
      (row.holding?.computed_market_value ?? 0) > 0;
    const showSizeUnknown =
      anyHoldingKnown && !rowHoldingKnown && row.position_type === "holding";
    const detail = !showSizeUnknown && d2.detail
      ? d2.detail.replace(/;?\s*position size unknown/gi, "").replace(/^;\s*/, "").trim() || null
      : d2.detail || null;

    // Resolve stance chip — prefer ai_directive.stance, fall back to parsing d2.title
    const chipMeta = stanceMeta ?? (() => {
      const t = d2.title.toLowerCase();
      if (t.startsWith("accumulate")) return STANCE_CHIP.accumulate;
      if (t.startsWith("trim")) return STANCE_CHIP.trim;
      if (t.startsWith("avoid")) return STANCE_CHIP.avoid;
      if (t.startsWith("hold")) return STANCE_CHIP.hold;
      return STANCE_CHIP.watch;
    })();

    if (compact) {
      return (
        <div className="mt-0.5 flex flex-col gap-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <StanceChip meta={chipMeta} size="xs" />
            {d2.priority === "high" && <PriorityBadge priority={d2.priority} />}
            {d2.trigger && <TriggerChip trigger={d2.trigger} />}
            {showSizeUnknown && <SizeUnknownBadge />}
          </div>
          {detail && (
            <span className="text-[9px] text-[#9ca3af] leading-snug line-clamp-1">{detail}</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StanceChip meta={chipMeta} />
          {d2.priority === "high" && <PriorityBadge priority={d2.priority} />}
          {d2.trigger && <TriggerChip trigger={d2.trigger} />}
          {showSizeUnknown && <SizeUnknownBadge />}
        </div>
        {detail && (
          <p className="text-[10px] leading-snug text-[#9ca3af] line-clamp-2">{detail}</p>
        )}
      </div>
    );
  }

  if (stanceMeta) {
    return (
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] ${
          compact ? "mt-0.5 rounded px-1.5 py-0.5 text-[9px]" : ""
        }`}
        style={{ background: stanceMeta.bg, color: stanceMeta.fg }}
      >
        <span
          aria-hidden
          className={`rounded-full ${compact ? "h-1 w-1" : "h-1.5 w-1.5"}`}
          style={{ background: stanceMeta.dot }}
        />
        {stanceMeta.label}
      </span>
    );
  }

  return compact ? null : <span className="text-[11px] text-[#9ca3af]">—</span>;
}

type SharesEditHandlers = {
  onSharesSaved: (instrumentId: string, patch: HoldingPatch) => void;
  bulkEditing: boolean;
};

function InlineSharesCell({
  row,
  onSharesSaved,
  bulkEditing,
}: { row: WatchlistRow } & SharesEditHandlers) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const quantity = num(row.holding?.quantity);
  const display = fmtShares(quantity);

  useEffect(() => {
    setDraft(quantity !== null ? String(quantity) : "");
    setError(null);
  }, [quantity, row.instrument_id]);

  function commitDraft() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed.replace(/,/g, ""));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Invalid");
      return;
    }
    setError(null);
    onSharesSaved(row.instrument_id, { quantity: parsed });
  }

  if (!bulkEditing) {
    return <span className={`text-[13px] font-semibold tabular-nums ${display === "—" ? "text-[#9ca3af]" : "text-[#111111]"}`}>{display}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="0.0001"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(quantity !== null ? String(quantity) : "");
            setError(null);
            inputRef.current?.blur();
          }
        }}
        aria-label={`Shares for ${row.ticker}`}
        className={`w-[84px] rounded border px-1.5 py-0.5 text-right text-[12px] font-semibold tabular-nums outline-none ${
          error ? "border-[#fca5a5] bg-[#fef2f2]" : "border-[#d1d5db] bg-white focus:border-[#111111]"
        }`}
      />
      {error && <span className="text-[9px] font-medium text-[#ef4444]">{error}</span>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// main component
// -----------------------------------------------------------------------------

export function RadarLedger({ holdings, watching, suggestions = [], activeTab, onTabChange }: Props) {
  const router = useRouter();
  const [internalTab, setInternalTab] = useState<Tab>(
    holdings.length === 0 && watching.length > 0 ? "watching" : "holdings",
  );
  const [holdingPatches, setHoldingPatches] = useState<Record<string, HoldingPatch>>({});
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const controlled = activeTab !== undefined;
  const tab = controlled ? activeTab : internalTab;
  const setTab = (t: Tab) => {
    if (controlled) onTabChange?.(t);
    else setInternalTab(t);
  };
  const sourceRows = tab === "holdings" ? holdings : watching;
  const rows = sourceRows.map((row) => mergeHoldingPatch(row, holdingPatches[row.instrument_id]));

  // Derive live holding-known status from actual holding data, not the cached
  // directive_v2.holding_status which may be stale from before shares were entered.
  const holdingIsKnown = (r: WatchlistRow) =>
    (r.holding?.quantity ?? 0) > 0 ||
    (r.holding?.market_value ?? 0) > 0 ||
    (r.holding?.computed_market_value ?? 0) > 0;

  // Only show "Size unknown" badge when the portfolio has a mix — at least one
  // holding with a known size so the badge is a meaningful "fill this in" signal
  // rather than noise on every single row.
  const anyHoldingKnown = holdings.some(holdingIsKnown);

  useEffect(() => {
    if (tab !== "holdings" && bulkEditing) {
      setBulkEditing(false);
      setHoldingPatches({});
      setBulkError(null);
    }
  }, [tab, bulkEditing]);

  function applyHoldingPatch(instrumentId: string, patch: HoldingPatch) {
    setHoldingPatches((prev) => ({
      ...prev,
      [instrumentId]: { ...prev[instrumentId], ...patch },
    }));
  }

  function cancelBulkEdits() {
    setHoldingPatches({});
    setBulkEditing(false);
    setBulkError(null);
  }

  async function saveBulkHoldingEdits() {
    if (bulkSaving) return;

    // All-or-none: every holding must have shares > 0. Partial data produces
    // misleading portfolio weights so we block the save and tell the user which are missing.
    const missingTickers = holdings
      .map((row) => ({ row, patched: mergeHoldingPatch(row, holdingPatches[row.instrument_id]) }))
      .filter(({ patched }) => {
        const qty = num(patched.holding?.quantity);
        return qty === null || qty <= 0;
      })
      .map(({ row }) => row.ticker);
    if (missingTickers.length > 0) {
      setBulkError(`Enter shares > 0 for all holdings before saving: ${missingTickers.join(", ")}`);
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    try {
      const items = [
        ...holdings.map((row) => {
          const patched = mergeHoldingPatch(row, holdingPatches[row.instrument_id]);
          return {
            instrument_id: patched.instrument_id,
            position_type: "holding",
            holding: {
              quantity: num(patched.holding?.quantity),
              market_value: num(patched.holding?.market_value),
              average_cost: num(patched.holding?.average_cost),
              currency: patched.currency,
              source: "manual",
            },
          };
        }),
        ...watching.map((row) => ({
          instrument_id: row.instrument_id,
          position_type: "watchlist",
        })),
      ];
      const res = await fetch("/api/watchlist/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("bulk_save_failed");
      setHoldingPatches({});
      setBulkEditing(false);
      triggerRadarBackgroundRefresh(router);
    } catch {
      setBulkError("Couldn’t save updates. Try again.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab pills — only when uncontrolled */}
      {!controlled && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
          <TabButton
            active={tab === "holdings"}
            onClick={() => setTab("holdings")}
            label="Holdings"
            count={holdings.length}
          />
          <TabButton
            active={tab === "watching"}
            onClick={() => setTab("watching")}
            label="Watching"
            count={watching.length}
          />
          </div>
        </div>
      )}
      {/* Ledger */}
      {rows.length === 0 ? (
        <EmptyTabState tab={tab} suggestions={suggestions} />
      ) : (
        <>
          {bulkError && (
            <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[11px] font-medium text-[#b91c1c]">
              {bulkError}
            </div>
          )}
          {/* ── Mobile card list (< md) ── */}
          <div className="md:hidden rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            <DailySummary
              rows={rows}
              label={tab === "holdings" ? "Holdings" : "Watching"}
              editSlot={tab === "holdings" && holdings.length > 0 ? (
                bulkEditing ? (
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={cancelBulkEdits} disabled={bulkSaving} className="rounded-full border border-[#e5e7eb] px-2.5 py-1 text-[10px] font-semibold text-[#6b7280] hover:bg-[#f9fafb] disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={() => void saveBulkHoldingEdits()} disabled={bulkSaving} className="inline-flex items-center gap-1 rounded-full bg-[#111111] px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50">
                      {bulkSaving && <span className="h-2 w-2 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                      Save
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setBulkEditing(true)} className="rounded-full border border-[#e5e7eb] px-2.5 py-1 text-[10px] font-semibold text-[#374151] hover:bg-[#f9fafb]">Edit holdings</button>
                )
              ) : undefined}
            />
            <div className="max-h-[560px] overflow-y-auto">
              {rows.map((row, i) => (
                <MobileRow
                  key={row.instrument_id}
                  row={row}
                  hasBorder={i > 0}
                  anyHoldingKnown={anyHoldingKnown}
                />
              ))}
            </div>
          </div>

          {/* ── Desktop table (≥ md) ── */}
          <div className="hidden md:block rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            <DailySummary
              rows={rows}
              label={tab === "holdings" ? "Holdings" : "Watching"}
              editSlot={tab === "holdings" && holdings.length > 0 ? (
                bulkEditing ? (
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={cancelBulkEdits} disabled={bulkSaving} className="rounded-full border border-[#e5e7eb] px-2.5 py-1 text-[10px] font-semibold text-[#6b7280] hover:bg-[#f9fafb] disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={() => void saveBulkHoldingEdits()} disabled={bulkSaving} className="inline-flex items-center gap-1 rounded-full bg-[#111111] px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50">
                      {bulkSaving && <span className="h-2 w-2 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                      Save
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setBulkEditing(true)} className="rounded-full border border-[#e5e7eb] px-2.5 py-1 text-[10px] font-semibold text-[#374151] hover:bg-[#f9fafb]">Edit holdings</button>
                )
              ) : undefined}
            />
            <div className="overflow-x-auto overflow-y-auto max-h-[540px]">
              <table className="w-full min-w-[800px] border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-[#f3f4f6] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                    <th className="px-4 py-3 font-semibold">Ticker</th>
                    <th className="px-3 py-3 text-right font-semibold">Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Change</th>
                    {tab === "holdings" && (
                      <>
                        <th className="px-3 py-3 text-right font-semibold">Shares</th>
                        <th className="px-3 py-3 text-right font-semibold">Value</th>
                      </>
                    )}
                    <th className="px-3 py-3 text-right font-semibold">Runway</th>
                    <th className="px-4 py-3 font-semibold">Directive</th>
                    <th className="px-3 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <LedgerRow
                      key={row.instrument_id}
                      row={row}
                      showHoldingValue={tab === "holdings"}
                      showShares={tab === "holdings"}
                      onSharesSaved={applyHoldingPatch}
                      bulkEditing={bulkEditing}
                      anyHoldingKnown={anyHoldingKnown}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DailySummary({ rows, label, editSlot }: { rows: WatchlistRow[]; label: string; editSlot?: ReactNode }) {
  const { avgPct, totalAbs, currency } = groupSummary(rows);
  if (avgPct === null && !editSlot) return null;
  const positive = (avgPct ?? 0) >= 0;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f3f4f6] bg-[#fafafa] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-medium text-[#9ca3af]">{label} · today</span>
        {editSlot}
      </div>
      {avgPct !== null && (
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={`text-[14px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}
          >
            {fmtSignedPct(avgPct)}
          </span>
          {totalAbs !== null && (
            <span
              className={`text-[12px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}
            >
              {fmtSignedAbs(totalAbs, currency)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-[#111111] text-white"
          : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-semibold tabular-nums ${
          active ? "text-white/70" : "text-[#9ca3af]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// -----------------------------------------------------------------------------
// EmptyTabState — shown when a tab has no rows
// -----------------------------------------------------------------------------

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { ticker: "AAPL", sector: "Consumer Electronics", reason: "Most-watched name on stocksbrew.", market: "US" },
  { ticker: "NVDA", sector: "Semiconductors", reason: "AI infra leader · high heat.", market: "US" },
  { ticker: "MSFT", sector: "Software", reason: "Quality compounder · steady.", market: "US" },
  { ticker: "META", sector: "Communication Services", reason: "Analyst runway +33%.", market: "US" },
  { ticker: "GOOGL", sector: "Communication Services", reason: "Cheap relative to peers.", market: "US" },
  { ticker: "AMZN", sector: "Consumer Cyclical", reason: "Cloud + retail compounder.", market: "US" },
];

function EmptyTabState({
  tab,
  suggestions,
}: {
  tab: Tab;
  suggestions: Suggestion[];
}) {
  const intro =
    tab === "holdings"
      ? {
          title: "No holdings yet",
          copy: "Mark a stock as held from any stock page. While you're here, popular names to consider:",
        }
      : {
          title: "No watchlist tickers yet",
          copy: "Add stocks to watch from any stock page. Some names worth tracking right now:",
        };

  const cards = (suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS).slice(0, 6);

  return (
    <div className="rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafaf7] p-6 md:p-8 flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
          Empty {tab === "holdings" ? "holdings" : "watching"}
        </span>
        <h3 className="text-[18px] md:text-[20px] font-semibold tracking-[-0.01em] text-[#0a0a0a]">
          {intro.title}
        </h3>
        <p className="text-[13.5px] text-[#6b7280] leading-snug max-w-[640px]">{intro.copy}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {cards.map((s) => (
          <SuggestionCard key={s.ticker} suggestion={s} />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const ticker = suggestion.ticker;
  const market = suggestion.market === "IN" ? "IN" : "US";
  const score = suggestion.score ?? null;
  const instrumentId = `${market}_${ticker}`;
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");
  const router = useRouter();

  async function addAsHolding(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "idle") return;
    setStatus("loading");
    setModalStatus("loading");
    setModalOpen(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId, position_type: "holding" }),
      });
      if (res.ok) {
        setStatus("done");
        setModalStatus("success");
        triggerRadarBackgroundRefresh(router);
      } else {
        setStatus("error");
        setModalStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setStatus("error");
      setModalStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    } finally {
      setTimeout(() => setModalOpen(false), 900);
    }
  }

  return (
    <>
      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        className="group flex h-full flex-col gap-2.5 rounded-xl border border-[#e5e7eb] bg-white p-3 transition-all hover:border-[#111111] hover:shadow-sm"
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <StockLogo ticker={ticker} market={market} size={32} className="shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-[#0a0a0a] transition-colors group-hover:text-[#0052ff]">
                {ticker}
              </span>
              {typeof score === "number" && (
                <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${scoreToneText(score)}`}>
                  {Math.round(score)}
                </span>
              )}
            </div>
            {suggestion.sector && (
              <span className="truncate text-[10px] text-[#9ca3af]">{suggestion.sector}</span>
            )}
            {suggestion.sources && suggestion.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {suggestion.sources.slice(0, 3).map((s) => {
                  const meta = SOURCE_PILL[s] ?? { label: s, bg: "#f3f4f6", fg: "#6b7280" };
                  return (
                    <span
                      key={s}
                      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] uppercase"
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            )}
            {suggestion.why && (
              <span className="line-clamp-2 text-[11px] leading-snug text-[#374151]">
                {suggestion.why}
              </span>
            )}
            {!suggestion.why && suggestion.reason && (
              <span className="line-clamp-2 text-[11px] leading-snug text-[#6b7280]">
                {suggestion.reason}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={addAsHolding}
          title="Add as holding"
          className={`inline-flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-all ${
            status === "done"
              ? "bg-[#ecfdf5] text-[#047857]"
              : status === "error"
              ? "bg-[#fef2f2] text-[#b91c1c]"
              : status === "loading"
              ? "bg-[#f3f4f6] text-[#9ca3af]"
              : "bg-[#f3f4f6] text-[#374151] hover:bg-[#111111] hover:text-white"
          }`}
        >
          {status === "done" ? "✓ Added" : status === "loading" ? "…" : status === "error" ? "Retry" : "+ Hold"}
        </button>
      </Link>
      <RadarAsyncModal
        open={modalOpen}
        title={`Adding ${ticker} to Holdings`}
        subtitle="Saved. Radar analysis is refreshing in the background..."
        status={modalStatus}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// MobileRow — 2-col card for small screens
// -----------------------------------------------------------------------------

function MobileRow({
  row,
  hasBorder,
  anyHoldingKnown,
}: {
  row: WatchlistRow;
  hasBorder: boolean;
  anyHoldingKnown?: boolean;
}) {
  const router = useRouter();
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const rsi = rsiExtremeFromRow(row);
  const cats = (row.catalysts ?? []) as Array<Record<string, unknown>>;
  const href = `/stock/${encodeURIComponent(row.ticker)}`;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors cursor-pointer ${
        hasBorder ? "border-t border-[#f3f4f6]" : ""
      }`}
      onClick={() => router.push(href)}
    >
      {/* LEFT: logo + ticker + directive */}
      <div className="flex items-center gap-2.5 min-w-0">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[14px] font-semibold text-[#111111] leading-none">
            {row.ticker}
          </span>
          {/* Signal chips below name */}
          {(rsi || cats.length > 0) && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              {rsi && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  rsi.tone === "overbought" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#ecfdf5] text-[#047857]"
                }`}>
                  {rsi.label}
                </span>
              )}
              {cats.slice(0, 1).map((c, i) => {
                const label = String(c.title ?? c.kind ?? "").trim();
                if (!label) return null;
                const urgency = String(c.urgency ?? "").toLowerCase();
                return (
                  <span key={i} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    urgency === "high" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#fef3c7] text-[#b45309]"
                  }`}>
                    {label.length > 16 ? `${label.slice(0, 14)}…` : label}
                  </span>
                );
              })}
            </div>
          )}
          {/* Directive below name */}
          <DirectiveDisplay row={row} compact anyHoldingKnown={anyHoldingKnown} />
        </div>
      </div>

      {/* RIGHT: price + % change + menu */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
            {fmtPrice(row.price, row.currency)}
          </span>
          {typeof dayChange === "number" && (
            <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
              {fmtSignedPct(dayChange)}
            </span>
          )}
        </div>
        <RowMenu row={row} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// LedgerRow — desktop table row (fully clickable + options menu)
// -----------------------------------------------------------------------------

function LedgerRow({
  row,
  showHoldingValue,
  showShares,
  onSharesSaved,
  bulkEditing,
  anyHoldingKnown,
}: {
  row: WatchlistRow;
  showHoldingValue?: boolean;
  showShares?: boolean;
  anyHoldingKnown?: boolean;
} & SharesEditHandlers) {
  const router = useRouter();
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const market = row.market === "IN" ? "IN" : "US";
  const rsi = rsiExtremeFromRow(row);
  const runway = num(row.target_upside_pct);
  const cats = (row.catalysts ?? []) as Array<Record<string, unknown>>;
  const href = `/stock/${encodeURIComponent(row.ticker)}`;

  return (
    <tr
      className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#fafafa] transition-colors cursor-pointer"
      onClick={() => router.push(href)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Link href={href}>
              <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={28} />
            </Link>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[13px] font-semibold text-[#111111] leading-none">
              {row.ticker}
            </span>
            {(rsi || cats.length > 0) && (
              <div className="flex flex-wrap items-center gap-1">
                {rsi && (
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] ${
                      rsi.tone === "overbought"
                        ? "bg-[#fef2f2] text-[#b91c1c]"
                        : "bg-[#ecfdf5] text-[#047857]"
                    }`}
                  >
                    {rsi.label}
                  </span>
                )}
                {cats.slice(0, 2).map((c, i) => {
                  const label = String(c.title ?? c.kind ?? "").trim();
                  if (!label) return null;
                  const urgency = String(c.urgency ?? "").toLowerCase();
                  return (
                    <span
                      key={`cat-${i}`}
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] ${
                        urgency === "high"
                          ? "bg-[#fef2f2] text-[#b91c1c]"
                          : "bg-[#fef3c7] text-[#b45309]"
                      }`}
                    >
                      {label.length > 20 ? `${label.slice(0, 18)}…` : label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
          {fmtPrice(row.price, row.currency)}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`text-[13px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {fmtSignedPct(dayChange)}
          </span>
          {row.day_change_abs !== null && row.day_change_abs !== undefined && (
            <span className={`text-[11px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
              {fmtSignedAbs(row.day_change_abs, row.currency)}
            </span>
          )}
        </div>
      </td>
      {showShares && (
        <td className="px-3 py-3 text-right">
          <InlineSharesCell row={row} onSharesSaved={onSharesSaved} bulkEditing={bulkEditing} />
        </td>
      )}
      {showHoldingValue && (
        <td className="px-3 py-3 text-right">
          <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
            {fmtHoldingValue(row)}
          </span>
        </td>
      )}
      <td className="px-3 py-3 text-right">
        <span className={`text-[14px] font-semibold tabular-nums ${runwayToneText(runway)}`}>
          {fmtRunwayPct(runway)}
        </span>
      </td>
      <td className="px-4 py-3">
        <DirectiveDisplay row={row} anyHoldingKnown={anyHoldingKnown} />
      </td>
      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
        <RowMenu row={row} />
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// RowMenu — ⋯ button with position-switch + remove options
// -----------------------------------------------------------------------------

function RowMenu({ row }: { row: WatchlistRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  const isHolding = row.position_type === "holding";
  const instrumentId = row.instrument_id;

  async function move(positionType: "holding" | "watchlist") {
    setBusy(true);
    setOpen(false);
    setModalTitle(positionType === "holding" ? `Moving ${row.ticker} to Holdings` : `Moving ${row.ticker} to Watching`);
    setModalStatus("loading");
    setModalOpen(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId, position_type: positionType }),
      });
      setModalStatus(res.ok ? "success" : "error");
      if (res.ok) triggerRadarBackgroundRefresh(router);
    } finally {
      setBusy(false);
      setTimeout(() => setModalOpen(false), 900);
    }
  }

  async function remove() {
    setBusy(true);
    setOpen(false);
    setModalTitle(`Stopping tracking for ${row.ticker}`);
    setModalStatus("loading");
    setModalOpen(true);
    try {
      const res = await fetch("/api/track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId }),
      });
      setModalStatus(res.ok ? "success" : "error");
      if (res.ok) triggerRadarBackgroundRefresh(router);
    } finally {
      setBusy(false);
      setTimeout(() => setModalOpen(false), 900);
    }
  }

  return (
    <>
      <div ref={ref} className="flex items-center justify-center">
        <button
          ref={btnRef}
          type="button"
          onClick={openMenu}
          disabled={busy}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors disabled:opacity-40 outline-none focus:outline-none"
          aria-label="Row options"
        >
          {busy ? (
            <span className="h-3 w-3 rounded-full border-2 border-[#d1d5db] border-t-[#6b7280] animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.2" />
              <circle cx="7" cy="7" r="1.2" />
              <circle cx="7" cy="11.5" r="1.2" />
            </svg>
          )}
        </button>

        {open && (
          <div
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[200] w-44 rounded-2xl border border-[#e5e7eb] bg-white py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
          >
            <button
              type="button"
              onClick={() => move(isHolding ? "watchlist" : "holding")}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-[#111111] hover:bg-[#f9fafb] transition-colors"
            >
              <span aria-hidden className="text-[14px]">{isHolding ? "👁" : "💼"}</span>
              {isHolding ? "Move to Watching" : "Move to Holdings"}
            </button>
            <div className="mx-3 my-1 border-t border-[#f3f4f6]" />
            <button
              type="button"
              onClick={remove}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-[#ef4444] hover:bg-[#fef2f2] transition-colors"
            >
              <span aria-hidden className="text-[14px]">✕</span>
              Stop tracking
            </button>
          </div>
        )}
      </div>
      <RadarAsyncModal open={modalOpen} title={modalTitle} subtitle="Saved. Radar analysis is refreshing in the background..." status={modalStatus} />
    </>
  );
}
