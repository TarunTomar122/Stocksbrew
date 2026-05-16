"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StockLogo } from "@/components/stock-logo";
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
          <div className="md:hidden rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden max-h-[560px] overflow-y-auto">
            {rows.map((row, i) => (
              <MobileRow key={row.instrument_id} row={row} hasBorder={i > 0} />
            ))}
          </div>

          {/* ── Desktop table (≥ md) ── */}
          <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[540px] rounded-2xl border border-[#e5e7eb] bg-white">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-[#f3f4f6] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                  <th className="px-4 py-3 font-semibold">Ticker</th>
                  <th className="px-3 py-3 text-right font-semibold">Price</th>
                  <th className="px-3 py-3 text-right font-semibold">Change</th>
                  <th className="px-3 py-3 text-right font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Directive</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LedgerRow key={row.instrument_id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </>
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
  { ticker: "AAPL", sector: "Consumer Electronics", reason: "Most-watched name on tikrr.", market: "US" },
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
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
  const router = useRouter();

  async function addAsHolding(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "idle") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: instrumentId, position_type: "holding" }),
      });
      if (res.ok) {
        setStatus("done");
        router.refresh();
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="group flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white p-3 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      <StockLogo ticker={ticker} market={market} size={32} />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
            {ticker}
          </span>
          {suggestion.sector && (
            <span className="text-[10px] text-[#9ca3af] truncate">{suggestion.sector}</span>
          )}
        </div>
        {suggestion.reason && (
          <span className="text-[11px] text-[#6b7280] leading-snug truncate">
            {suggestion.reason}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {typeof score === "number" && (
          <span className={`text-[14px] font-semibold tabular-nums ${scoreToneText(score)}`}>
            {Math.round(score)}
          </span>
        )}
        <button
          type="button"
          onClick={addAsHolding}
          title="Add as holding"
          className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-[10px] font-semibold transition-all ${
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
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// MobileRow — 2-col card for small screens
// -----------------------------------------------------------------------------

function MobileRow({ row, hasBorder }: { row: WatchlistRow; hasBorder: boolean }) {
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const stance = String(row.ai_directive?.stance ?? "").toLowerCase();
  const stanceMeta = STANCE_CHIP[stance];
  const rsi = rsiExtremeFromRow(row);
  const cats = (row.catalysts ?? []) as Array<Record<string, unknown>>;

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className={`flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors ${
        hasBorder ? "border-t border-[#f3f4f6]" : ""
      }`}
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

      {/* RIGHT: price + % change */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
          {fmtPrice(row.price, row.currency)}
        </span>
        {typeof dayChange === "number" && (
          <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {fmtSignedPct(dayChange)}
          </span>
        )}
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// LedgerRow — desktop table row
// -----------------------------------------------------------------------------

function LedgerRow({ row }: { row: WatchlistRow }) {
  const dayChange = row.day_change_pct;
  const positive = (dayChange ?? 0) >= 0;
  const market = row.market === "IN" ? "IN" : "US";
  const rsi = rsiExtremeFromRow(row);
  const score = row.scores?.overall ?? null;
  const cats = (row.catalysts ?? []) as Array<Record<string, unknown>>;
  const stance = String(row.ai_directive?.stance ?? "").toLowerCase();
  const stanceMeta = STANCE_CHIP[stance];

  return (
    <tr className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#fafafa] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href={`/stock/${encodeURIComponent(row.ticker)}`} className="shrink-0">
            <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={28} />
          </Link>
          <div className="flex flex-col gap-1 min-w-0">
            <Link
              href={`/stock/${encodeURIComponent(row.ticker)}`}
              className="text-[13px] font-semibold text-[#111111] hover:text-[#0052ff] transition-colors leading-none"
            >
              {row.ticker}
            </Link>
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
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              positive ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {fmtSignedPct(dayChange)}
          </span>
          {row.day_change_abs !== null && row.day_change_abs !== undefined && (
            <span
              className={`text-[11px] tabular-nums ${
                positive ? "text-[#10b981]" : "text-[#ef4444]"
              }`}
            >
              {fmtSignedAbs(row.day_change_abs, row.currency)}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span
          className={`text-[14px] font-semibold tabular-nums ${scoreToneText(score)}`}
        >
          {score === null ? "—" : Math.round(score)}
        </span>
      </td>
      <td className="px-4 py-3">
        {stanceMeta ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
            style={{ background: stanceMeta.bg, color: stanceMeta.fg }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: stanceMeta.dot }}
            />
            {stanceMeta.label}
          </span>
        ) : (
          <span className="text-[11px] text-[#9ca3af]">—</span>
        )}
      </td>
    </tr>
  );
}
