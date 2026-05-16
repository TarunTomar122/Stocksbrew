import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { getFeedPreviewLimit } from "@/lib/pro-features";

type Props = {
  anomalies: AnomalyItem[];
  summary: string;
  generatedAt: string;
  isSubscribed?: boolean;
};

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "-";
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
  if (hours === 1) return "1h ago";
  return `${hours}h ago`;
}

function AnomalyCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      {/* Top: logo + ticker + name + change % */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-[#111111] tracking-tight group-hover:text-[#0052ff] transition-colors">
              {item.ticker}
            </span>
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[120px]">
              {item.name}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 text-[14px] font-bold tabular-nums"
          style={{ color: changeColor }}
        >
          {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
        </span>
      </div>

      {/* Price row */}
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
          ${fmtPrice(item.price)}
        </span>
        {item.day_change_abs != null && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: changeColor }}
          >
            {isUp ? "+" : ""}{item.day_change_abs.toFixed(2)}
          </span>
        )}
      </div>

      {/* Headline */}
      {item.headline && (
        <p className="min-h-[36px] line-clamp-2 text-[13px] leading-snug text-[#374151]">
          {item.headline}
        </p>
      )}

      {/* Catalyst - only short labels, not full sentences */}
      <div className="mt-auto min-h-[20px]">
        {item.catalyst && item.catalyst.length <= 48 && (
          <span className="inline-flex items-center self-start rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
            {item.catalyst}
          </span>
        )}
      </div>
    </Link>
  );
}

export function DailyAnomalies({ anomalies, summary, generatedAt, isSubscribed = false }: Props) {
  if (!anomalies || anomalies.length === 0) return null;
  const maxCards = 8;
  const visibleLimit = getFeedPreviewLimit(isSubscribed, maxCards);
  const visible = anomalies.slice(0, visibleLimit);
  const lockedCount = Math.max(0, Math.min(anomalies.length, maxCards) - visible.length);

  const ups = anomalies.filter((a) => a.direction === "up");
  const downs = anomalies.filter((a) => a.direction === "down");

  return (
    <section className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Link
              href="/anomalies"
              className="group/title inline-flex items-center gap-1.5 text-[18px] font-semibold text-[#111111] tracking-[-0.015em] hover:text-[#0052ff] transition-colors"
            >
              Market Anomalies
              <span className="text-[14px] text-[#9ca3af] group-hover/title:text-[#0052ff] group-hover/title:translate-x-0.5 transition-all">→</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Live
            </span>
          </div>
          <p className="text-[12px] text-[#9ca3af]">
            {summary} · {timeAgo(generatedAt)}
          </p>
        </div>

        <div className="hidden sm:flex items-center divide-x divide-[#e5e7eb] rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
          <div className="px-4 py-2 text-center">
            <div className="text-[15px] font-semibold tabular-nums text-[#10b981]">{ups.length}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Surging</div>
          </div>
          <div className="px-4 py-2 text-center">
            <div className="text-[15px] font-semibold tabular-nums text-[#ef4444]">{downs.length}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Dropping</div>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {visible.map((item) => (
          <div key={item.ticker} className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col">
            <AnomalyCard item={item} />
          </div>
        ))}
        {!isSubscribed && lockedCount > 0 && (
          <div className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col">
            <Link
              href="/subscribe"
              className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#d1d5db] bg-[#f9fafb] p-4 text-center hover:border-[#111111] hover:bg-white transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="3" y="7" width="10" height="8" rx="2" stroke="#6b7280" strokeWidth="1.4" />
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="1" fill="#6b7280" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#111111]">+{lockedCount} more moves</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5">Unlock with Pro</p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
