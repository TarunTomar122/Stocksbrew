"use client";

import Link from "next/link";
import { useState } from "react";
import { StockLogo } from "@/components/stock-logo";
import type { WatchlistRow } from "@/lib/watchlist-view";

type Dict = Record<string, unknown>;

type Tab = "holdings" | "watching" | "suggestions";

type Props = {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
  suggestions: Dict[];
};

// ─── helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCurrency(price: unknown, currency: unknown): string {
  const p = num(price);
  if (p === null) return "—";
  const cur = String(currency ?? "USD");
  try {
    return p.toLocaleString("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return `$${p.toFixed(2)}`;
  }
}

function formatSignedPct(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatSignedAbs(v: unknown, currency: unknown): string {
  const n = num(v);
  if (n === null) return "";
  const cur = String(currency ?? "USD");
  const sign = n >= 0 ? "+" : "-";
  try {
    const abs = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sign}${abs}`;
  } catch {
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }
}

function groupSummary(rows: WatchlistRow[]): { avgPct: number | null; totalAbs: number | null; currency: string } {
  const pcts = rows.map((r) => num(r.day_change_pct)).filter((n): n is number => n !== null);
  const absPairs = rows.filter((r) => num(r.day_change_abs) !== null);
  const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const totalAbs = absPairs.length ? absPairs.reduce((s, r) => s + (num(r.day_change_abs) ?? 0), 0) : null;
  const currency = rows.find((r) => r.currency)?.currency ?? "USD";
  return { avgPct, totalAbs, currency };
}

const MIN_HEADLINES = 6;

function rsiChip(row: WatchlistRow): { label: string; tone: "overbought" | "oversold" } | null {
  const tech = row.technicals as Dict | undefined;
  const rsiBlock = (tech?.rsi_14 as Dict | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  const state = String(rsiBlock.state ?? "").toLowerCase().trim();
  const over = state === "overbought" || (rsi !== null && rsi >= 70);
  const under = state === "oversold" || (rsi !== null && rsi <= 30);
  if ((!over && !under) || (over && under)) return null;
  const suffix = rsi !== null ? ` · RSI ${rsi.toFixed(0)}` : "";
  return over
    ? { label: `OVERBOUGHT${suffix}`, tone: "overbought" }
    : { label: `OVERSOLD${suffix}`, tone: "oversold" };
}

// ─── row components ──────────────────────────────────────────────────────────

function StockRow({ row }: { row: WatchlistRow }) {
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const market = row.market === "IN" ? "IN" : "US";
  const nv = row.news_velocity as Dict | undefined;
  const mentions = num(nv?.mentions_1d);
  const velocityHint =
    typeof mentions === "number" && mentions >= MIN_HEADLINES
      ? `${mentions} headline${mentions === 1 ? "" : "s"} today`
      : null;
  const rsi = rsiChip(row);
  const catalysts = (row.catalysts ?? []) as Dict[];
  const hasChips = velocityHint || rsi || catalysts.length > 0;

  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(row.ticker)}`}
        className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-[#f5f5f5] sm:hover:bg-[#f5f5f5]"
      >
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[#111111]">{row.ticker}</span>
          </div>
          {hasChips && (
            <div className="mt-1 flex flex-wrap gap-1">
              {velocityHint && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#0052ff]">
                  {velocityHint}
                </span>
              )}
              {rsi && (
                <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${rsi.tone === "overbought" ? "text-[#b91c1c]" : "text-[#047857]"}`}>
                  {rsi.label}
                </span>
              )}
              {catalysts.slice(0, 2).map((c, i) => {
                const urgency = String(c.urgency ?? "").toLowerCase();
                const label = String(c.title ?? c.kind ?? "").trim();
                if (!label) return null;
                return (
                  <span
                    key={i}
                    className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${urgency === "high" ? "text-[#b91c1c]" : "text-[#b45309]"}`}
                  >
                    {label.length > 38 ? `${label.slice(0, 36)}…` : label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
            {formatCurrency(row.price, row.currency)}
          </span>
          <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {formatSignedPct(row.day_change_pct)}
          </span>
          {row.day_change_abs != null && (
            <span className={`text-[11px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
              {formatSignedAbs(row.day_change_abs, row.currency)}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function SuggestionRow({ item }: { item: Dict }) {
  const ticker = String(item.ticker || "");
  const sector = String(item.sector || "").trim();
  const reason = String(item.reason || "Related to your tracked universe.");
  const market = item.market === "IN" ? "IN" : "US";
  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-[#f5f5f5] sm:hover:bg-[#f5f5f5]"
      >
        <StockLogo ticker={ticker} market={market} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-[#111111]">{ticker}</span>
            {sector && <span className="text-[12px] text-[#9ca3af]">{sector}</span>}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-[#6b7280]">{reason}</p>
        </div>
        <span
          className="material-symbols-outlined shrink-0 text-[#d1d5db]"
          style={{ fontSize: 18 }}
        >
          chevron_right
        </span>
      </Link>
    </li>
  );
}

function EmptyList({ message }: { message: string }) {
  return <p className="px-4 py-10 text-[14px] text-[#9ca3af]">{message}</p>;
}

function DailySummary({ rows, label }: { rows: WatchlistRow[]; label: string }) {
  const { avgPct, totalAbs, currency } = groupSummary(rows);
  if (avgPct === null) return null;
  const positive = avgPct >= 0;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#fafafa] border-b border-[#f3f4f6]">
      <span className="text-[12px] text-[#9ca3af] font-medium">{label} · today</span>
      <div className="flex items-center gap-2.5">
        {totalAbs !== null && (
          <span className={`text-[13px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {formatSignedAbs(totalAbs, currency)}
          </span>
        )}
        <span className={`text-[13px] font-bold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
          {positive ? "+" : ""}{avgPct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ─── desktop column (unchanged visual style) ─────────────────────────────────

function DesktopColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-[#e5e7eb] overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-[#e5e7eb] px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">{title}</h2>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">{count}</span>
      </div>
      <div className="overflow-y-auto max-h-[480px] scrollbar-hide">
        <ul className="divide-y divide-[#f3f4f6]">{children}</ul>
      </div>
    </section>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

export function WatchlistTabs({ holdings, watching, suggestions }: Props) {
  const [active, setActive] = useState<Tab>("holdings");

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "holdings", label: "Holdings", count: holdings.length },
    { key: "watching", label: "Watching", count: watching.length },
    { key: "suggestions", label: "Ideas", count: suggestions.length },
  ];

  return (
    <>
      {/* ── Mobile: tab bar + single list ── */}
      <div className="lg:hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[#e5e7eb]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`flex-1 py-3 text-[13px] font-semibold transition-colors relative ${
                active === t.key ? "text-[#111111]" : "text-[#9ca3af]"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active === t.key ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#9ca3af]"
                }`}>
                  {t.count}
                </span>
              )}
              {active === t.key && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[#111111]" />
              )}
            </button>
          ))}
        </div>

        {/* Summary + List */}
        {active === "holdings" && (
          <>
            <DailySummary rows={holdings} label="Holdings" />
            <ul className="divide-y divide-[#f3f4f6]">
              {holdings.length === 0
                ? <EmptyList message="No holdings yet — open a stock you own and mark it as a holding." />
                : holdings.map((r) => <StockRow key={r.instrument_id} row={r} />)}
            </ul>
          </>
        )}
        {active === "watching" && (
          <>
            <DailySummary rows={watching} label="Watching" />
            <ul className="divide-y divide-[#f3f4f6]">
              {watching.length === 0
                ? <EmptyList message="Nothing in Watching — bookmark tickers from the search bar." />
                : watching.map((r) => <StockRow key={r.instrument_id} row={r} />)}
            </ul>
          </>
        )}
        {active === "suggestions" && (
          <ul className="divide-y divide-[#f3f4f6]">
            {suggestions.length === 0
              ? <EmptyList message="No ideas queued — Tikrr will suggest names that complement your Radar." />
              : suggestions.slice(0, 8).map((s) => (
                  <SuggestionRow key={String(s.instrument_id || s.ticker)} item={s} />
                ))}
          </ul>
        )}
      </div>

      {/* ── Desktop: 3-column grid ── */}
      <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 xl:gap-8">
        <DesktopColumn title="Holdings" count={holdings.length}>
          <DailySummary rows={holdings} label="Holdings" />
          {holdings.length === 0
            ? <EmptyList message="No holdings yet — open a stock you own and mark it as a holding." />
            : holdings.map((r) => <StockRow key={r.instrument_id} row={r} />)}
        </DesktopColumn>
        <DesktopColumn title="Watching" count={watching.length}>
          <DailySummary rows={watching} label="Watching" />
          {watching.length === 0
            ? <EmptyList message="Nothing in Watching — bookmark tickers from the search bar." />
            : watching.map((r) => <StockRow key={r.instrument_id} row={r} />)}
        </DesktopColumn>
        <DesktopColumn title="Ideas" count={suggestions.slice(0, 8).length}>
          {suggestions.length === 0
            ? <EmptyList message="No ideas queued yet." />
            : suggestions.slice(0, 8).map((s) => (
                <SuggestionRow key={String(s.instrument_id || s.ticker)} item={s} />
              ))}
        </DesktopColumn>
      </div>
    </>
  );
}
