"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import { TrackButton } from "@/components/track-button";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { RedditSnapshot, RedditTicker } from "@/lib/reddit-cues";
import { getFeedPreviewLimit } from "@/lib/pro-features";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number): string {
  return `${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Anomaly card ─────────────────────────────────────────────────────────────

function AnomalyCard({ item, isTracked }: { item: AnomalyItem; isTracked: boolean }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const changeBg = isUp ? "#ecfdf5" : "#fef2f2";
  const brief = (item.today_brief || item.key_points?.[0] || "").trim();
  const showBrief = brief && brief !== item.headline;

  return (
    <div className="group relative flex flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="flex items-center gap-2.5 min-w-0">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em] group-hover:text-[#0052ff] transition-colors">
              {item.ticker}
            </span>
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[120px]">{item.name}</span>
          </div>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums"
            style={{ background: changeBg, color: changeColor }}
          >
            {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
          </span>
          <TrackButton
            ticker={item.ticker}
            instrumentId={item.instrument_id}
            isTracked={isTracked}
            variant="icon"
          />
        </div>
      </div>

      <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
            ${fmtPrice(item.price)}
          </span>
          {item.day_change_abs != null && (
            <span className="text-[11px] font-medium tabular-nums" style={{ color: changeColor }}>
              {isUp ? "+" : ""}{item.day_change_abs.toFixed(2)}
            </span>
          )}
        </div>

        {item.headline && (
          <p className="text-[13px] leading-snug font-medium text-[#111111]">{item.headline}</p>
        )}

        {showBrief && (
          <p className="line-clamp-3 text-[12px] leading-snug text-[#6b7280]">{brief}</p>
        )}

        <div className="mt-auto">
          {item.catalyst && item.catalyst.length <= 48 && (
            <span className="inline-flex items-center rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
              {item.catalyst}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

// ─── Reddit ticker card (light) ───────────────────────────────────────────────

const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  bullish: { label: "Bullish", color: "#10b981" },
  bearish: { label: "Bearish", color: "#ef4444" },
  neutral: { label: "Neutral", color: "#6b7280" },
};

function getSentimentMeta(s: string) {
  return SENTIMENT_META[s?.toLowerCase()] ?? SENTIMENT_META.neutral;
}

function UpvoteArrow({ color }: { color: string }) {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path d="M5 0L10 8H0L5 0Z" fill={color} />
    </svg>
  );
}

function RedditCard({ item, isTracked }: { item: RedditTicker; isTracked: boolean }) {
  const meta = getSentimentMeta(item.sentiment);
  const topCatalyst = item.catalysts?.[0] ?? null;
  const instrumentId = `US_${item.ticker}`;

  return (
    <div className="group relative flex flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-[#f9fafb] p-4 transition-all hover:border-[#111111] hover:shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="flex items-center gap-2 min-w-0 flex-1">
          <StockLogo ticker={item.ticker} market="US" size={28} />
          <span className="text-[13px] font-bold text-[#111111] tracking-[-0.01em]">{item.ticker}</span>
          <div className="flex items-center gap-1" style={{ color: meta.color }}>
            <UpvoteArrow color={meta.color} />
            <span className="text-[12px] font-bold tabular-nums">{item.mention_count}</span>
          </div>
          <span className="text-[11px] font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </Link>
        <TrackButton
          ticker={item.ticker}
          instrumentId={instrumentId}
          isTracked={isTracked}
          variant="icon"
        />
      </div>

      <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="flex flex-col gap-3">
        {item.summary && (
          <p className="text-[13px] font-medium leading-snug text-[#374151]">
            {item.summary}
          </p>
        )}

        {topCatalyst && (
          <div className="mt-auto pt-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{ background: "#f3f4f6", color: meta.color }}
            >
              <span className="h-1 w-1 rounded-full shrink-0" style={{ background: meta.color }} />
              {topCatalyst}
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}

// ─── Mobile tab bar (hidden on md+) ──────────────────────────────────────────

type Tab = "anomalies" | "reddit";

function MobileTabBar({
  active,
  onSelect,
  anomalyCount,
  redditCount,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  anomalyCount: number;
  redditCount: number;
}) {
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "anomalies", label: "Biggest moves", count: anomalyCount },
    { key: "reddit", label: "Reddit buzz", count: redditCount },
  ];

  return (
    <div className="flex md:hidden items-center gap-1.5">
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            active === key ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          }`}
        >
          {label}
          <span className={`text-[10px] font-semibold tabular-nums ${active === key ? "text-white/70" : "text-[#9ca3af]"}`}>
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Section header (desktop only) ───────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="hidden md:flex items-center gap-2">
      <span className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em]">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-[#9ca3af]">{count}</span>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnomaliesPageView({
  anomalies,
  summary,
  generatedAt,
  reddit,
  isSubscribed = false,
  trackedIds = new Set(),
}: {
  anomalies: AnomalyItem[];
  summary: string;
  generatedAt: string;
  reddit: RedditSnapshot | null;
  isSubscribed?: boolean;
  trackedIds?: Set<string>;
}) {
  const [tab, setTab] = useState<Tab>("anomalies");

  const hasReddit = reddit && (reddit.tickers?.length ?? 0) > 0;
  const redditCount = reddit?.tickers?.length ?? 0;
  const freeLimit = getFeedPreviewLimit(isSubscribed, 8);
  const visibleAnomalies = anomalies.slice(0, freeLimit);
  const visibleReddit = (reddit?.tickers ?? []).slice(0, freeLimit);
  const lockedAnomalyCount = Math.max(0, anomalies.length - visibleAnomalies.length);
  const lockedRedditCount = Math.max(0, redditCount - visibleReddit.length);

  // On mobile, show only the active tab. On desktop, show both stacked.
  const showAnomalies = tab === "anomalies";
  const showReddit = hasReddit && tab === "reddit";

  return (
    <div className="flex flex-col gap-8">
      {/* Tab bar - mobile only, shown when reddit data exists */}
      {hasReddit && (
        <MobileTabBar
          active={tab}
          onSelect={setTab}
          anomalyCount={anomalies.length}
          redditCount={redditCount}
        />
      )}

      {/* Anomalies section - always visible on desktop, tab-controlled on mobile */}
      <div className={tab === "reddit" ? "hidden md:flex md:flex-col md:gap-4" : "flex flex-col gap-4"}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <SectionLabel label="Biggest moves" count={anomalies.length} />
              {lockedAnomalyCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            </div>
            <p className="text-[12px] text-[#9ca3af]">
              {summary} · {timeAgo(generatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold tabular-nums text-[#10b981]">
              ▲ {anomalies.filter((a) => a.direction === "up").length} surging
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-[#ef4444]">
              ▼ {anomalies.filter((a) => a.direction === "down").length} dropping
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleAnomalies.map((item) => (
            <AnomalyCard key={item.ticker} item={item} isTracked={trackedIds.has(item.instrument_id)} />
          ))}
          {!isSubscribed && lockedAnomalyCount > 0 && (
            <Link
              href="/subscribe"
              className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-[#d1d5db] bg-[#f9fafb] p-4 text-center"
            >
              <p className="text-[15px] font-semibold text-[#111111]">+{lockedAnomalyCount} more anomalies</p>
              <p className="text-[12px] text-[#6b7280]">Unlock Pro for full anomaly feed</p>
            </Link>
          )}
        </div>
      </div>

      {/* Reddit section - always visible on desktop (below anomalies), tab-controlled on mobile */}
      {hasReddit && (
        <div className={tab === "anomalies" ? "hidden md:flex md:flex-col md:gap-4" : "flex flex-col gap-4"}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <SectionLabel label="Reddit buzz" count={redditCount} />
              {lockedRedditCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            </div>
            <p className="text-[12px] text-[#9ca3af]">
              {reddit!.post_count} posts scanned · {timeAgo(reddit!.generated_at)}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleReddit.map((item) => (
              <RedditCard key={item.ticker} item={item} isTracked={trackedIds.has(`US_${item.ticker}`)} />
            ))}
            {!isSubscribed && lockedRedditCount > 0 && (
              <Link
                href="/subscribe"
                className="flex min-h-[176px] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-[#d1d5db] bg-[#f9fafb] p-4 text-center hover:border-[#111111] hover:bg-white transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <rect x="3" y="7" width="10" height="8" rx="2" stroke="#6b7280" strokeWidth="1.4" />
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="8" cy="11" r="1" fill="#6b7280" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#111111]">+{lockedRedditCount} more names</p>
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">Unlock with Pro</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
