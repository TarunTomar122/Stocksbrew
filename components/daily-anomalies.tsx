import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { AnomalyItem } from "@/lib/daily-anomalies";

type Props = {
  anomalies: AnomalyItem[];
  summary: string;
  generatedAt: string;
};

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function AnomalyCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const accentColor = isUp ? "#10b981" : "#ef4444";
  const bgColor = isUp ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)";
  const borderColor = isUp ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";
  const arrow = isUp ? "▲" : "▼";
  const fallbackBg = isUp ? "#065f46" : "#7f1d1d";

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex items-start gap-3.5 p-4 rounded-xl border transition-all hover:shadow-md"
      style={{
        background: bgColor,
        borderColor,
      }}
    >
      {/* Logo */}
      <div className="shrink-0 mt-0.5">
        <StockLogo
          ticker={item.ticker}
          size={40}
          fallbackBg={fallbackBg}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: ticker + change */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-bold text-[#111111] tracking-tight">
              {item.ticker}
            </span>
            <span className="text-[11px] text-[#6b7280] truncate max-w-[140px]">
              {item.name}
            </span>
          </div>
          <div
            className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-[13px] font-bold tabular-nums"
            style={{
              background: isUp ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              color: accentColor,
            }}
          >
            <span className="text-[10px]">{arrow}</span>
            {fmtPct(item.day_change_pct)}
          </div>
        </div>

        {/* Price line */}
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[13px] font-semibold text-[#111111] tabular-nums">
            ${fmtPrice(item.price)}
          </span>
          {item.day_change_abs != null && (
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{ color: accentColor }}
            >
              {isUp ? "+" : ""}
              {item.day_change_abs.toFixed(2)}
            </span>
          )}
        </div>

        {/* Headline / brief */}
        {(item.headline || item.today_brief) && (
          <p className="text-[12px] text-[#374151] leading-[1.5] line-clamp-2">
            {item.headline || item.today_brief}
          </p>
        )}

        {/* Catalyst tag */}
        {item.catalyst && (
          <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[10px] font-medium text-[#6b7280]">
            <span className="text-[8px]">⚡</span>
            {item.catalyst}
          </span>
        )}
      </div>
    </Link>
  );
}

export function DailyAnomalies({ anomalies, summary, generatedAt }: Props) {
  if (!anomalies || anomalies.length === 0) return null;

  const ups = anomalies.filter((a) => a.direction === "up");
  const downs = anomalies.filter((a) => a.direction === "down");

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#ef4444]">
            <span className="text-[16px]" aria-hidden>
              🔥
            </span>
          </div>
          <div>
            <h2 className="text-[16px] md:text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              Market Movers
            </h2>
            <p className="text-[11px] text-[#9ca3af]">
              {summary} · {timeAgo(generatedAt)}
            </p>
          </div>
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fef3c7] text-[11px] font-semibold text-[#92400e]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f59e0b]" />
          </span>
          Live
        </span>
      </div>

      {/* Anomaly cards — horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {anomalies.slice(0, 8).map((item) => (
          <div key={item.ticker} className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0">
            <AnomalyCard item={item} />
          </div>
        ))}
      </div>

      {/* Quick stats bar */}
      <div className="flex items-center gap-4 mt-4 px-4 py-2.5 rounded-xl bg-[#f9fafb] border border-[#f3f4f6]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9ca3af]">
            Threshold
          </span>
          <span className="text-[12px] font-semibold text-[#111111] tabular-nums">
            ±{anomalies[0] ? "2" : "—"}%
          </span>
        </div>
        <div className="w-px h-4 bg-[#e5e7eb]" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#10b981]">
            {ups.length} surging
          </span>
        </div>
        <div className="w-px h-4 bg-[#e5e7eb]" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#ef4444]">
            {downs.length} dropping
          </span>
        </div>
      </div>
    </section>
  );
}
