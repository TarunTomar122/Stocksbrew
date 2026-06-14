import Link from "next/link";

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

export function RedditBuzzRow({ item }: { item: RedditTicker }) {
  const meta = getRedditSentimentMeta(item.sentiment);
  const summary = item.summary?.trim() || item.catalysts?.[0] || meta.label;
  const topCatalyst = item.catalysts?.[0] ?? null;
  const showCatalyst = topCatalyst && topCatalyst !== summary;

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group block px-4 py-3.5 transition-colors hover:bg-[#f9fafb] sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <StockLogo ticker={item.ticker} market="US" size={26} className="shrink-0" />
        <span className="shrink-0 text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
          {item.ticker}
        </span>
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
      <div className="mt-2 flex min-w-0 flex-col gap-1.5">
        <p className="text-[12px] leading-relaxed text-[#374151]">{summary}</p>
        {showCatalyst ? (
          <span
            className="self-start rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: meta.color, background: meta.bg }}
          >
            {topCatalyst}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
