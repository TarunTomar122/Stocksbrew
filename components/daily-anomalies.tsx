import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { FeedLockedCard, FeedPaywallSlot, MarketAnomaliesPaywall } from "@/components/feed-pro-paywalls";
import { getFeedPreviewLimit, PRO_LOCKED_FEED_TEASER } from "@/lib/pro-features";
import { MARKET_FEED_FRESHNESS, SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";

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

function AnomalyCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const title = (item.headline || "").trim();
  const moveExplanation = item.move_explanation;
  const explanationHeadline = (moveExplanation?.headline || "").trim();
  const explanationBody = (moveExplanation?.why_it_matters || "").trim();
  const whatChanged = (item.visual_summary?.what_changed || "").trim();
  const showWhatChanged = !explanationBody && whatChanged && whatChanged !== title;

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
            <span className="text-[11px] leading-snug text-[#9ca3af]">
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

      {(explanationHeadline || title) ? (
        <p className="text-[13px] leading-snug font-medium text-[#111111]">
          {explanationHeadline || title}
        </p>
      ) : null}

      {explanationBody ? (
        <p className="text-[12px] leading-relaxed text-[#6b7280]">
          {explanationBody}
        </p>
      ) : null}

      {showWhatChanged ? (
        <p className="text-[12px] leading-relaxed text-[#6b7280]">
          {whatChanged}
        </p>
      ) : null}

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
  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(generatedAt, MARKET_FEED_FRESHNESS)
    : null;

  const ups = anomalies.filter((a) => a.direction === "up");
  const downs = anomalies.filter((a) => a.direction === "down");

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Link
              href="/anomalies"
              className="group/title inline-flex items-center gap-1.5 text-[22px] md:text-[24px] font-semibold text-[#111111] tracking-[-0.02em] hover:text-[#0052ff] transition-colors"
            >
              Market Anomalies
              <span className="text-[16px] text-[#9ca3af] group-hover/title:text-[#0052ff] group-hover/title:translate-x-0.5 transition-all">→</span>
            </Link>
            {lockedCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Live
            </span>
          </div>
          <p className="text-[12px] text-[#9ca3af]">
            {summary}
            {relativeTime(generatedAt) && (
              <> · Updated {relativeTime(generatedAt)}</>
            )}
            {SHOW_DATA_FRESHNESS_UI && freshness ? (
              <>
                {" "}
                · <span className={freshness.toneClass}>{freshness.label}</span>
              </>
            ) : null}
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
        {!isSubscribed && lockedCount > 0 ? (
          <div className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col">
            <FeedLockedCard label={`${PRO_LOCKED_FEED_TEASER} more moves`} />
          </div>
        ) : null}
      </div>

      {!isSubscribed && lockedCount > 0 ? (
        <FeedPaywallSlot>
          <MarketAnomaliesPaywall anomalies={anomalies} upCount={ups.length} downCount={downs.length} />
        </FeedPaywallSlot>
      ) : null}
    </section>
  );
}
