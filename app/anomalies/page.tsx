import Link from "next/link";
import type { Metadata } from "next";

import { StockLogo } from "@/components/stock-logo";
import { getDailyAnomalies, type DailyAnomaliesDoc } from "@/lib/daily-anomalies";
import { getCurrentMarket } from "@/lib/market";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Daily Market Movers — Stocks Moving the Most Today",
  description:
    "Stocks with the biggest price moves today. See what's surging, what's dropping, and why — powered by AI-enriched market intelligence.",
  openGraph: {
    title: "Daily Market Movers · Tikrr",
    description: "Stocks with the biggest price moves today. See what's surging and dropping.",
  },
};

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function AnomalyRow({ item, rank }: { item: NonNullable<DailyAnomaliesDoc["anomalies"]>[number]; rank: number }) {
  const isUp = item.direction === "up";
  const accentColor = isUp ? "#10b981" : "#ef4444";
  const arrow = isUp ? "▲" : "▼";
  const fallbackBg = isUp ? "#065f46" : "#7f1d1d";

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex items-center gap-4 p-5 border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
    >
      {/* Rank */}
      <span className="text-[14px] font-bold text-[#d1d5db] w-6 text-right tabular-nums shrink-0">
        {rank}
      </span>

      {/* Logo */}
      <StockLogo ticker={item.ticker} size={44} fallbackBg={fallbackBg} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[15px] font-bold text-[#111111] tracking-tight">
            {item.ticker}
          </span>
          <span className="text-[12px] text-[#6b7280] truncate">
            {item.name}
          </span>
          {item.sector && (
            <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[10px] font-medium text-[#6b7280]">
              {item.sector}
            </span>
          )}
        </div>
        {item.headline && (
          <p className="text-[13px] text-[#374151] leading-snug line-clamp-1 mb-1">
            {item.headline}
          </p>
        )}
        {item.today_brief && (
          <p className="text-[12px] text-[#6b7280] leading-[1.5] line-clamp-2">
            {item.today_brief}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {item.catalyst && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fef3c7] text-[10px] font-semibold text-[#92400e]">
              ⚡ {item.catalyst}
            </span>
          )}
          {item.news_count > 0 && (
            <span className="text-[10px] text-[#9ca3af]">
              {item.news_count} articles · {item.source_count} sources
            </span>
          )}
        </div>
      </div>

      {/* Price + change */}
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[15px] font-semibold text-[#111111] tabular-nums">
          ${fmtPrice(item.price)}
        </span>
        <div
          className="flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full text-[14px] font-bold tabular-nums"
          style={{
            background: isUp ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: accentColor,
          }}
        >
          <span className="text-[10px]">{arrow}</span>
          {fmtPct(item.day_change_pct)}
        </div>
      </div>
    </Link>
  );
}

export default async function AnomaliesPage() {
  const market = getCurrentMarket();
  const data = await getDailyAnomalies(market).catch(() => null);

  if (!data || data.anomalies.length === 0) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10">
          <h1 className="text-[24px] font-bold text-[#111111] mb-4">
            Daily Market Movers
          </h1>
          <p className="text-[14px] text-[#6b7280]">
            No significant anomalies detected today. Check back during market hours.
          </p>
        </div>
      </main>
    );
  }

  const ups = data.anomalies.filter((a) => a.direction === "up");
  const downs = data.anomalies.filter((a) => a.direction === "down");

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-8 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[28px] md:text-[32px] font-bold text-[#111111] tracking-[-0.02em]">
                🔥 Market Movers
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fef3c7] text-[11px] font-semibold text-[#92400e]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f59e0b]" />
                </span>
                Live
              </span>
            </div>
            <p className="text-[14px] text-[#6b7280]">
              {data.summary} · Updated{" "}
              {new Date(data.enriched_at || data.generated_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mb-6 px-5 py-3 rounded-xl bg-[#f9fafb] border border-[#f3f4f6]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#9ca3af]">
              Threshold
            </span>
            <span className="text-[13px] font-semibold text-[#111111] tabular-nums">
              ±{data.threshold_pct}%
            </span>
          </div>
          <div className="w-px h-4 bg-[#e5e7eb]" />
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#10b981]">
              {ups.length}
            </span>
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#10b981]">
              Surging
            </span>
          </div>
          <div className="w-px h-4 bg-[#e5e7eb]" />
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#ef4444]">
              {downs.length}
            </span>
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#ef4444]">
              Dropping
            </span>
          </div>
        </div>

        {/* Surging */}
        {ups.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[13px] font-bold tracking-[0.1em] uppercase text-[#10b981] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
              Surging
            </h2>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              {ups.map((item, i) => (
                <AnomalyRow key={item.ticker} item={item} rank={i + 1} />
              ))}
            </div>
          </section>
        )}

        {/* Dropping */}
        {downs.length > 0 && (
          <section>
            <h2 className="text-[13px] font-bold tracking-[0.1em] uppercase text-[#ef4444] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
              Dropping
            </h2>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              {downs.map((item, i) => (
                <AnomalyRow key={item.ticker} item={item} rank={i + 1} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
