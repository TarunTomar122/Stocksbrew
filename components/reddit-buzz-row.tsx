import Link from "next/link";

import { FeedRowLockedBlur } from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";
import type { RedditTicker } from "@/lib/reddit-cues-shared";

const SENTIMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  bullish: { label: "Bullish", color: "#10b981", bg: "#ecfdf5" },
  bearish: { label: "Bearish", color: "#ef4444", bg: "#fef2f2" },
  neutral: { label: "Neutral", color: "#6b7280", bg: "#f3f4f6" },
};

export function getRedditSentimentMeta(s: string) {
  return SENTIMENT_META[s?.toLowerCase()] ?? SENTIMENT_META.neutral;
}

function UpvoteArrow({ color }: { color: string }) {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path d="M5 0L10 8H0L5 0Z" fill={color} />
    </svg>
  );
}

function fmtPrice(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: v < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtVolume(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function hasRedditQuote(item: RedditTicker) {
  return Boolean(
    item.company?.trim() ||
      typeof item.price === "number" ||
      typeof item.changePct === "number" ||
      typeof item.volume === "number",
  );
}

function RedditBuzzQuoteStrip({
  item,
  variant,
}: {
  item: RedditTicker;
  variant: "home" | "pulse";
}) {
  const hasQuote =
    item.company?.trim() ||
    typeof item.price === "number" ||
    typeof item.changePct === "number" ||
    typeof item.volume === "number";
  if (!hasQuote) return null;

  const isPulse = variant === "pulse";
  const metaClass = isPulse ? "text-[11px] text-on-surface-variant" : "text-[11px] text-[#6b7280]";
  const priceClass = isPulse
    ? "font-semibold tabular-nums text-on-surface"
    : "font-semibold tabular-nums text-[#111111]";
  const up = typeof item.changePct === "number" && item.changePct >= 0;

  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-2 ${metaClass}`}>
      {item.company?.trim() ? (
        <span className="max-w-[200px] truncate sm:max-w-[240px]">{item.company.trim()}</span>
      ) : null}
      {typeof item.price === "number" ? <span className={priceClass}>{fmtPrice(item.price)}</span> : null}
      {typeof item.changePct === "number" ? (
        <span
          className="font-semibold tabular-nums"
          style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
        >
          {up ? "+" : ""}
          {item.changePct.toFixed(2)}%
        </span>
      ) : null}
      {typeof item.volume === "number" ? <span className="tabular-nums">vol {fmtVolume(item.volume)}</span> : null}
    </div>
  );
}

export function RedditBuzzRow({
  item,
  locked = false,
  variant = "home",
}: {
  item: RedditTicker;
  locked?: boolean;
  variant?: "home" | "pulse";
}) {
  const meta = getRedditSentimentMeta(item.sentiment);
  const summary = item.summary?.trim() || item.catalysts?.[0] || meta.label;
  const topCatalyst = item.catalysts?.[0] ?? null;
  const showCatalyst = topCatalyst && topCatalyst !== summary;

  const isPulse = variant === "pulse";
  const tickerClass = isPulse
    ? `shrink-0 text-[13px] font-semibold text-on-surface ${locked ? "" : "group-hover:text-landing-brand"}`
    : `shrink-0 text-[13px] font-semibold text-[#111111] ${locked ? "" : "group-hover:text-[#0052ff]"}`;
  const summaryClass = isPulse
    ? "text-[12px] leading-relaxed text-on-surface-variant"
    : "text-[12px] leading-relaxed text-[#374151]";
  const rowHover = isPulse ? "hover:bg-surface-container-low" : "hover:bg-[#f9fafb]";

  const header = locked ? (
    <div className="flex min-w-0 items-center gap-2">
      <StockLogo ticker={item.ticker} market="US" size={26} className="shrink-0" />
      <span className={tickerClass}>{item.ticker}</span>
    </div>
  ) : (
    <div className="flex min-w-0 items-center gap-2">
      <StockLogo ticker={item.ticker} market="US" size={26} className="shrink-0" />
      <span className={tickerClass}>{item.ticker}</span>
      <div className="flex shrink-0 items-center gap-1" style={{ color: meta.color }}>
        <UpvoteArrow color={meta.color} />
        <span className="text-[11px] font-bold tabular-nums">{item.mention_count}</span>
      </div>
      <span
        className="ml-auto shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold"
        style={{ color: meta.color, background: meta.bg }}
      >
        {meta.label}
      </span>
    </div>
  );

  const quoteStrip = hasRedditQuote(item) ? (
    <RedditBuzzQuoteStrip item={item} variant={variant} />
  ) : null;

  const body = (
    <div className="mt-2 min-w-0">
      {locked ? (
        <FeedRowLockedBlur variant="reddit" ticker={item.ticker} dense size="inline" />
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={summaryClass}>{summary}</p>
          {showCatalyst ? (
            <span
              className="self-start rounded-md px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: meta.color, background: meta.bg }}
            >
              {topCatalyst}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );

  const rowContent = (
    <>
      {header}
      {quoteStrip}
      {body}
    </>
  );

  if (locked) {
    return (
      <div className="block px-4 py-3.5 sm:px-5">
        {rowContent}
      </div>
    );
  }

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className={`group block px-4 py-3.5 transition-colors sm:px-5 ${rowHover}`}
    >
      {rowContent}
    </Link>
  );
}
