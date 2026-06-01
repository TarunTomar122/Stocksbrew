import Link from "next/link";
import type { RedditSnapshot, RedditTicker } from "@/lib/reddit-cues";
import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import { getFeedPreviewLimit } from "@/lib/pro-features";
import { MARKET_FEED_FRESHNESS, freshnessInfo } from "@/lib/freshness";

type Props = {
  data: RedditSnapshot;
  isSubscribed?: boolean;
};

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

function TickerCard({ item }: { item: RedditTicker }) {
  const meta = getSentimentMeta(item.sentiment);
  const topCatalyst = item.catalysts?.[0] ?? null;

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-[#f9fafb] p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StockLogo ticker={item.ticker} market="US" size={28} />
        <span className="text-[13px] font-bold text-[#111111] tracking-[-0.01em]">{item.ticker}</span>
        <div className="flex items-center gap-1" style={{ color: meta.color }}>
          <UpvoteArrow color={meta.color} />
          <span className="text-[12px] font-bold tabular-nums">{item.mention_count}</span>
        </div>
        <span className="ml-auto shrink-0 text-[11px] font-bold" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>

      {item.summary ? (
        <p className="text-[13px] font-medium leading-snug text-[#374151]">
          {item.summary}
        </p>
      ) : null}

      {topCatalyst ? (
        <div className="mt-auto pt-1">
          <span
            className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ background: "#f3f4f6", color: meta.color }}
          >
            {topCatalyst}
          </span>
        </div>
      ) : null}
    </Link>
  );
}

export function RedditCues({ data, isSubscribed = false }: Props) {
  if (!data.tickers || data.tickers.length === 0) return null;
  const maxCards = 8;
  const visibleLimit = getFeedPreviewLimit(isSubscribed, maxCards);
  const visible = data.tickers.slice(0, visibleLimit);
  const lockedCount = Math.max(0, Math.min(data.tickers.length, maxCards) - visible.length);

  const bulls = data.tickers.filter((t) => t.sentiment?.toLowerCase() === "bullish").length;
  const bears = data.tickers.filter((t) => t.sentiment?.toLowerCase() === "bearish").length;
  const freshness = freshnessInfo(data.generated_at, MARKET_FEED_FRESHNESS);

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/anomalies"
              className="group/title inline-flex items-center gap-1.5 text-[18px] font-semibold tracking-[-0.015em] text-[#111111] hover:text-[#0052ff] transition-colors"
            >
              Reddit Buzz
              <span className="text-[14px] text-[#9ca3af] group-hover/title:text-[#0052ff] group-hover/title:translate-x-0.5 transition-all">→</span>
            </Link>
            {lockedCount > 0 && <ProBadge isSubscribed={isSubscribed} />}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
              style={{ background: "#fff1ec", color: "#ff4500" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#ff4500" }} />
              r/stocks &amp; more
            </span>
          </div>
          <p className="text-[12px] text-[#9ca3af]">
            {data.post_count} posts scanned · <span className={freshness.toneClass}>{freshness.label}</span>
            {freshness.relative ? ` · ${freshness.relative}` : ""}
          </p>
        </div>

        <div
          className="hidden sm:flex items-center divide-x rounded-xl overflow-hidden"
          style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
        >
          <div className="px-4 py-2 text-center" style={{ borderRight: "1px solid #e5e7eb" }}>
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: "#10b981" }}>{bulls}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Bullish</div>
          </div>
          <div className="px-4 py-2 text-center">
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: "#ef4444" }}>{bears}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Bearish</div>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {visible.map((item) => (
          <div key={item.ticker} className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col">
            <TickerCard item={item} />
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
                <p className="text-[13px] font-semibold text-[#111111]">+{lockedCount} more names</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5">Unlock with Pro</p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
