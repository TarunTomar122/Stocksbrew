"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import { TrackButton } from "@/components/track-button";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { hasRedditBrief, type RedditSnapshot, type RedditTicker } from "@/lib/reddit-cues-shared";
import {
  FeedLockedCard,
  FeedPaywallSlot,
  MarketAnomaliesPaywall,
  RedditBuzzPaywall,
} from "@/components/feed-pro-paywalls";
import { getFeedPreviewLimit, PRO_LOCKED_FEED_TEASER } from "@/lib/pro-features";
import { MARKET_FEED_FRESHNESS, SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number): string {
  return `${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

// ─── Anomaly card ─────────────────────────────────────────────────────────────

function AnomalyCard({ item, isTracked }: { item: AnomalyItem; isTracked: boolean }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const changeBg = isUp ? "#ecfdf5" : "#fef2f2";
  const title = (item.headline || "").trim();
  const moveExplanation = item.move_explanation;
  const explanationHeadline = (moveExplanation?.headline || "").trim();
  const explanationBody = (moveExplanation?.why_it_matters || "").trim();
  const whatChanged = (item.visual_summary?.what_changed || "").trim();
  const showWhatChanged = !explanationBody && whatChanged && whatChanged !== title;

  return (
    <div className="group relative flex flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(item.ticker)}`} className="flex items-center gap-2.5 min-w-0">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em] group-hover:text-[#0052ff] transition-colors">
              {item.ticker}
            </span>
            <span className="text-[11px] leading-snug text-[#9ca3af]">{item.name}</span>
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

        {(explanationHeadline || title) ? (
          <p className="text-[13px] leading-snug font-medium text-[#111111]">{explanationHeadline || title}</p>
        ) : null}

        {explanationBody ? (
          <p className="text-[12px] leading-relaxed text-[#6b7280]">{explanationBody}</p>
        ) : null}

        {showWhatChanged ? (
          <p className="text-[12px] leading-relaxed text-[#6b7280]">{whatChanged}</p>
        ) : null}

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
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
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
    <div className="hidden md:flex items-center gap-2.5">
      <span className="text-[24px] font-semibold text-[#111111] tracking-[-0.02em]">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums text-[#9ca3af]">{count}</span>
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

  const briefRedditTickers = (reddit?.tickers ?? []).filter(hasRedditBrief);
  const hasReddit = briefRedditTickers.length > 0;
  const redditCount = briefRedditTickers.length;
  // Cap the feed so the header counts always match what is actually on screen.
  const MAX_ANOMALIES = 12;
  const cappedAnomalies = anomalies.slice(0, MAX_ANOMALIES);
  const anomalyUpCount = cappedAnomalies.filter((a) => a.direction === "up").length;
  const anomalyDownCount = cappedAnomalies.filter((a) => a.direction === "down").length;
  const anomaliesSummary = `${cappedAnomalies.length} of today's biggest moves · ${anomalyUpCount} up, ${anomalyDownCount} down`;

  const anomalyLimit = getFeedPreviewLimit(isSubscribed, cappedAnomalies.length);
  const redditLimit = getFeedPreviewLimit(isSubscribed, 8);
  const visibleAnomalies = cappedAnomalies.slice(0, anomalyLimit);
  const visibleReddit = briefRedditTickers.slice(0, redditLimit);
  const lockedAnomalyCount = Math.max(0, cappedAnomalies.length - visibleAnomalies.length);
  const lockedRedditCount = Math.max(0, redditCount - visibleReddit.length);
  const anomaliesFreshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(generatedAt, MARKET_FEED_FRESHNESS)
    : null;
  const redditFreshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(reddit?.generated_at, MARKET_FEED_FRESHNESS)
    : null;

  // On mobile, show only the active tab. On desktop, show both stacked.
  const showAnomalies = tab === "anomalies";
  const showReddit = hasReddit && tab === "reddit";

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      {/* Tab bar - mobile only, shown when reddit data exists */}
      {hasReddit && (
        <MobileTabBar
          active={tab}
          onSelect={setTab}
          anomalyCount={cappedAnomalies.length}
          redditCount={redditCount}
        />
      )}

      {/* Anomalies section - always visible on desktop, tab-controlled on mobile */}
      <div className={tab === "reddit" ? "hidden md:flex md:flex-col md:gap-6" : "flex flex-col gap-6"}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <SectionLabel label="Biggest moves" count={cappedAnomalies.length} />
              {lockedAnomalyCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            </div>
            <p className="text-[13px] text-[#6b7280]">
              {anomaliesSummary}
              {relativeTime(generatedAt) && (
                <> · Updated {relativeTime(generatedAt)}</>
              )}
              {SHOW_DATA_FRESHNESS_UI && anomaliesFreshness ? (
                <> · <span className={anomaliesFreshness.toneClass}>{anomaliesFreshness.label}</span></>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[12px] font-semibold tabular-nums text-[#10b981]">
              ▲ {anomalyUpCount} surging
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-[#ef4444]">
              ▼ {anomalyDownCount} dropping
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleAnomalies.map((item) => (
            <AnomalyCard key={item.ticker} item={item} isTracked={trackedIds.has(item.instrument_id)} />
          ))}
          {!isSubscribed && lockedAnomalyCount > 0 ? (
            <FeedLockedCard
              label={`${PRO_LOCKED_FEED_TEASER} more unusual moves`}
              description="See every mover and why."
            />
          ) : null}
        </div>

        {!isSubscribed && lockedAnomalyCount > 0 ? (
          <FeedPaywallSlot>
            <MarketAnomaliesPaywall
              anomalies={cappedAnomalies}
              upCount={anomalyUpCount}
              downCount={anomalyDownCount}
            />
          </FeedPaywallSlot>
        ) : null}
      </div>

      {/* Reddit section - always visible on desktop (below anomalies), tab-controlled on mobile */}
      {hasReddit && (
        <div
          className={
            tab === "anomalies"
              ? "hidden md:flex md:flex-col md:gap-6 md:pt-14"
              : "flex flex-col gap-6"
          }
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <SectionLabel label="Reddit buzz" count={redditCount} />
              {lockedRedditCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            </div>
            <p className="text-[13px] text-[#6b7280]">
              {reddit!.post_count} posts scanned
              {relativeTime(reddit?.generated_at) && (
                <> · Updated {relativeTime(reddit?.generated_at)}</>
              )}
              {SHOW_DATA_FRESHNESS_UI && redditFreshness ? (
                <> · <span className={redditFreshness.toneClass}>{redditFreshness.label}</span></>
              ) : null}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleReddit.map((item) => (
              <RedditCard key={item.ticker} item={item} isTracked={trackedIds.has(`US_${item.ticker}`)} />
            ))}
            {!isSubscribed && lockedRedditCount > 0 ? (
              <FeedLockedCard
                label={`${PRO_LOCKED_FEED_TEASER} more names buzzing`}
                description="See the full crowd read."
              />
            ) : null}
          </div>

          {!isSubscribed && lockedRedditCount > 0 ? (
            <FeedPaywallSlot>
              <RedditBuzzPaywall
                tickers={briefRedditTickers}
                postCount={reddit!.post_count}
                bullCount={briefRedditTickers.filter((t) => t.sentiment?.toLowerCase() === "bullish").length}
                bearCount={briefRedditTickers.filter((t) => t.sentiment?.toLowerCase() === "bearish").length}
              />
            </FeedPaywallSlot>
          ) : null}
        </div>
      )}
    </div>
  );
}
