"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StockLogo } from "@/components/stock-logo";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { triggerRadarBackgroundRefresh } from "@/lib/radar-client-refresh";
import type { WatchlistRow } from "@/lib/watchlist-view";

type Tab = "holdings" | "watching";

type Suggestion = {
  ticker: string;
  name?: string;
  sector?: string;
  reason?: string;
  why?: string;
  score?: number | null;
  market?: string;
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
  const pcts = rows.map((r) => num(r.day_change_pct)).filter((n): n is number => n !== null);
  const absRows = rows.filter((r) => num(r.day_change_abs) !== null);
  const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const totalAbs = absRows.length
    ? absRows.reduce((s, r) => s + (num(r.day_change_abs) ?? 0), 0)
    : null;
  const currency = rows.find((r) => r.currency)?.currency ?? "USD";
  return { avgPct, totalAbs, currency };
}

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

// -----------------------------------------------------------------------------
// main component
// -----------------------------------------------------------------------------

export function RadarLedger({ holdings, watching, suggestions = [], activeTab, onTabChange }: Props) {
  const [internalTab, setInternalTab] = useState<Tab>(
    holdings.length === 0 && watching.length > 0 ? "watching" : "holdings",
  );
  const controlled = activeTab !== undefined;
  const tab = controlled ? activeTab : internalTab;
  const setTab = (t: Tab) => {
    if (controlled) onTabChange?.(t);
    else setInternalTab(t);
  };
  const rows = tab === "holdings" ? holdings : watching;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab pills — only when uncontrolled */}
      {!controlled && (
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
      )}

      {/* Ledger */}
      {rows.length === 0 ? (
        <EmptyTabState tab={tab} suggestions={suggestions} />
      ) : (
        <>
          {/* ── Mobile card list (< md) ── */}
          <div className="md:hidden rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            <DailySummary rows={rows} label={tab === "holdings" ? "Holdings" : "Watching"} />
            <div className="max-h-[560px] overflow-y-auto">
              {rows.map((row, i) => (
                <MobileRow key={row.instrument_id} row={row} hasBorder={i > 0} />
              ))}
            </div>
          </div>

          {/* ── Desktop table (≥ md) ── */}
          <div className="hidden md:block rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            <DailySummary rows={rows} label={tab === "holdings" ? "Holdings" : "Watching"} />
            <div className="overflow-x-auto overflow-y-auto max-h-[540px]">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-[#f3f4f6] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                    <th className="px-4 py-3 font-semibold">Ticker</th>
                    <th className="px-3 py-3 text-right font-semibold">Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Change</th>
                    <th className="px-3 py-3 text-right font-semibold">Runway</th>
                    <th className="px-4 py-3 font-semibold">Directive</th>
                    <th className="px-3 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <LedgerRow key={row.instrument_id} row={row} />
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

function DailySummary({ rows, label }: { rows: WatchlistRow[]; label: string }) {
  const { avgPct, totalAbs, currency } = groupSummary(rows);
  if (avgPct === null) return null;
  const positive = avgPct >= 0;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f3f4f6] bg-[#fafafa] px-4 py-3">
      <span className="text-[12px] font-medium text-[#9ca3af]">{label} · today</span>
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
            {suggestion.reason && (
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

function MobileRow({ row, hasBorder }: { row: WatchlistRow; hasBorder: boolean }) {
  const router = useRouter();
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const stance = String(row.ai_directive?.stance ?? "").toLowerCase();
  const stanceMeta = STANCE_CHIP[stance];
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
          {/* Directive chip below name */}
          {stanceMeta && (
            <span
              className="mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em]"
              style={{ background: stanceMeta.bg, color: stanceMeta.fg }}
            >
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: stanceMeta.dot }} />
              {stanceMeta.label}
            </span>
          )}
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

function LedgerRow({ row }: { row: WatchlistRow }) {
  const router = useRouter();
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const market = row.market === "IN" ? "IN" : "US";
  const rsi = rsiExtremeFromRow(row);
  const runway = num(row.target_upside_pct);
  const cats = (row.catalysts ?? []) as Array<Record<string, unknown>>;
  const stance = String(row.ai_directive?.stance ?? "").toLowerCase();
  const stanceMeta = STANCE_CHIP[stance];
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
      <td className="px-3 py-3 text-right">
        <span className={`text-[14px] font-semibold tabular-nums ${runwayToneText(runway)}`}>
          {fmtRunwayPct(runway)}
        </span>
      </td>
      <td className="px-4 py-3">
        {stanceMeta ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
            style={{ background: stanceMeta.bg, color: stanceMeta.fg }}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: stanceMeta.dot }} />
            {stanceMeta.label}
          </span>
        ) : (
          <span className="text-[11px] text-[#9ca3af]">—</span>
        )}
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
