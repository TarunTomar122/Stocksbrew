"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { PowerTrade, PowerTradesResult } from "@/lib/power-trades";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function fmtMoney(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtAmount(low: number | null, high: number | null) {
  if (low != null && high != null) return `${fmtMoney(low)} – ${fmtMoney(high)}`;
  if (low != null) return `${fmtMoney(low)}+`;
  return "range n/a";
}

function typeMeta(txType: string) {
  switch (txType) {
    case "buy":
      return { label: "Buy", dot: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400" };
    case "sell":
      return { label: "Sell", dot: "bg-rose-500 dark:bg-rose-400", text: "text-rose-700 dark:text-rose-400" };
    default:
      return { label: "Exchange", dot: "bg-[var(--oa-muted-fg)]", text: "text-[var(--oa-muted-fg)]" };
  }
}

export function TradeCard({ trade }: { trade: PowerTrade }) {
  const meta = typeMeta(trade.tx_type);
  const late = trade.lag_days != null && trade.lag_days > 45;
  const trackable = /^[A-Z0-9_]+$/.test(trade.ticker || "");

  return (
    <article className="group relative flex flex-col gap-4 rounded-[24px] border border-[var(--oa-border)] bg-[var(--oa-card)] p-5 shadow-sm transition-shadow hover:shadow-md">
      {trackable && (
        <Link
          href={`/stock/${encodeURIComponent(trade.ticker)}`}
          aria-label={`View ${trade.ticker} on stocksbrew`}
          className="absolute inset-0 z-10 rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--oa-ring)]"
        />
      )}
      {trackable && (
        <div className="absolute right-3 top-3 z-20 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-events-none motion-reduce:transition-none">
          <TrackButton ticker={trade.ticker} instrumentId={`US_${trade.ticker}`} isTracked={false} variant="icon" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <StockLogo ticker={trade.ticker || "US"} size={40} market="US" circle />
        <div className="min-w-0 flex-1">
          {trade.ticker ? (
            <Link
              href={`/stock/${encodeURIComponent(trade.ticker)}`}
              className="oa-mono block text-[15px] font-medium tabular-nums tracking-[-0.01em] text-[var(--oa-fg)] transition-colors hover:text-[var(--oa-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oa-ring)]"
            >
              {trade.ticker}
            </Link>
          ) : (
            <span className="oa-mono text-[15px] font-medium text-[var(--oa-muted-fg)]">no ticker</span>
          )}
          <p className="mt-0.5 truncate text-[12px] text-[var(--oa-muted-fg)]">{trade.company || "—"}</p>
        </div>
        <span className={`flex shrink-0 items-center gap-2 ${meta.text}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          <span className="text-[13px] font-medium">{meta.label}</span>
        </span>
      </div>

      <div>
        <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--oa-fg)]">{trade.person_name}</p>
        <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.08em] text-[var(--oa-muted-fg)]">
          {[trade.chamber, trade.party, trade.state].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--oa-bg)] pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--oa-muted-fg)]">Value filed</p>
          <p className="oa-mono mt-1 text-[14px] tabular-nums text-[var(--oa-fg)]">
            {fmtAmount(trade.amount_low, trade.amount_high)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--oa-muted-fg)]">Traded {fmtDate(trade.transaction_date)}</p>
          <p className="mt-1 flex items-center justify-end gap-2">
            {trade.lag_days != null && (
              <span
                className={`oa-mono text-[11px] tabular-nums ${
                  late ? "text-rose-700 dark:text-rose-400" : "text-[var(--oa-muted-fg)]"
                }`}
                title={late ? "Disclosed past the STOCK Act 45-day window" : "Days from trade to disclosure"}
              >
                {late ? `late ${trade.lag_days}d` : `filed in ${trade.lag_days}d`}
              </span>
            )}
            {trade.perf_pct != null && (
              <span
                className={`oa-mono text-[11px] tabular-nums ${
                  trade.perf_pct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {trade.perf_pct >= 0 ? "+" : ""}
                {trade.perf_pct.toFixed(1)}%
              </span>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

export function Skeleton() {
  return (
    <div role="status" aria-label="Loading power trades" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <div key={card} className="flex flex-col gap-4 rounded-[24px] bg-[var(--oa-card)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
            <div className="flex-1">
              <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
              <div className="mt-2 h-2.5 w-28 animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
            </div>
          </div>
          <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
          <div className="h-2.5 w-20 animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded-full bg-[var(--oa-secondary)] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div role="status" className="rounded-[24px] bg-[var(--oa-card)] p-10 text-center shadow-sm">
      <p className="text-[17px] font-medium tracking-[-0.01em] text-[var(--oa-fg)]">Nothing disclosed yet</p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--oa-muted-fg)]">
        The sync pulls STOCK Act filings daily and lawmakers have up to 45 days to disclose a trade. Check back soon.
      </p>
    </div>
  );
}

export function PowerTradesFeed() {
  const [data, setData] = useState<PowerTradesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch("/api/power-trades?days=30")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: PowerTradesResult) => {
        if (alive) setData(payload);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const trades = data?.trades ?? [];
  const summary = useMemo(() => data?.summary, [data]);

  return (
    <section aria-label="Power trades feed" className="flex flex-col gap-6">
      {summary && summary.total > 0 && (
        <p className="oa-mono text-[12px] tabular-nums text-[var(--oa-muted-fg)]">
          last 30 days · {summary.total} trades · {summary.buys} buys · {summary.sells} sells ·{" "}
          {summary.people} people
        </p>
      )}

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div role="status" className="rounded-[24px] bg-[var(--oa-card)] p-10 text-center shadow-sm">
          <p className="text-[17px] font-medium text-[var(--oa-fg)]">Could not load trades</p>
          <p className="mt-2 text-[13px] text-[var(--oa-muted-fg)]">
            The sync service returned {error}. Try again in a moment.
          </p>
        </div>
      ) : trades.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trades.map((trade) => (
            <TradeCard key={trade.trade_id} trade={trade} />
          ))}
        </div>
      )}

      <aside className="rounded-[20px] bg-[var(--oa-accent)] p-5 text-[13px] leading-relaxed text-[var(--oa-muted-fg)]">
        <p>
          Filings report value ranges, not exact amounts, so every figure above is a bracket — and a disclosed trade can
          surface up to 45 days after it happened. Track a stock as a holding and Pro members get an email the moment
          someone here trades it. Executive branch officials (the White House and cabinet) file through OGE instead of
          Congress; that feed lands next.
        </p>
      </aside>
    </section>
  );
}
