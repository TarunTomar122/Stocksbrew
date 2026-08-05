import Link from "next/link";
import { hasRedditBrief, type RedditSnapshot, type RedditTicker } from "@/lib/reddit-cues";
import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import { FeedRowLockedBlur, FeedUnlockBar, FeedStickyUnlock } from "@/components/feed-row-lock-teaser";
import { FeedPaywallSlot, RedditBuzzPaywall } from "@/components/feed-pro-paywalls";
import { FREE_REDDIT_BUZZ_VISIBLE_LIMIT } from "@/lib/pro-features";
import { MARKET_FEED_FRESHNESS, SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";

type Props = {
  data: RedditSnapshot;
  isSubscribed?: boolean;
};

const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  bullish: { label: "Bullish", color: "var(--signal-bullish)" },
  bearish: { label: "Bearish", color: "var(--signal-bearish)" },
  neutral: { label: "Neutral", color: "var(--on-surface-variant)" },
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

function TickerCard({ item, locked = false }: { item: RedditTicker; locked?: boolean }) {
  const meta = getSentimentMeta(item.sentiment);
  const topCatalyst = item.catalysts?.[0] ?? null;

  const cardBody = (
    <>
      {locked ? (
        <div className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={item.ticker} market="US" size={28} />
          <span className="text-[13px] font-bold tracking-[-0.01em] text-[#111111]">{item.ticker}</span>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={item.ticker} market="US" size={28} />
          <span className="text-[13px] font-bold tracking-[-0.01em] text-[#111111]">{item.ticker}</span>
          <div className="flex items-center gap-1" style={{ color: meta.color }}>
            <UpvoteArrow color={meta.color} />
            <span className="text-[12px] font-bold tabular-nums">{item.mention_count}</span>
          </div>
          <span className="ml-auto shrink-0 text-[11px] font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
      )}

      {locked ? (
        <FeedRowLockedBlur variant="reddit" ticker={item.ticker} dense size="block" />
      ) : (
        <>
          {item.summary ? (
            <p className="text-[13px] font-medium leading-snug text-[#374151]">{item.summary}</p>
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
        </>
      )}
    </>
  );

  if (locked) {
    return (
      <div className="flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-[#f9fafb] p-4">
        {cardBody}
      </div>
    );
  }

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-[#f9fafb] p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      {cardBody}
    </Link>
  );
}

export function RedditCues({ data, isSubscribed = false }: Props) {
  const briefTickers = (data.tickers ?? []).filter(hasRedditBrief);
  if (briefTickers.length === 0) return null;
  const maxCards = 8;
  const visibleLimit = isSubscribed ? maxCards : FREE_REDDIT_BUZZ_VISIBLE_LIMIT;
  const visible = briefTickers.slice(0, maxCards);
  const lockedCount = isSubscribed ? 0 : Math.max(0, visible.length - visibleLimit);
  const hiddenCount = Math.max(0, briefTickers.length - visible.length);

  const bulls = briefTickers.filter((t) => t.sentiment?.toLowerCase() === "bullish").length;
  const bears = briefTickers.filter((t) => t.sentiment?.toLowerCase() === "bearish").length;
  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(data.generated_at, MARKET_FEED_FRESHNESS)
    : null;

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/pulse"
              className="group/title inline-flex items-center gap-1.5 text-[22px] md:text-[24px] font-semibold tracking-[-0.02em] text-[#111111] hover:text-[#0052ff] transition-colors"
            >
              Reddit Buzz
              <span className="text-[16px] text-[#9ca3af] group-hover/title:text-[#0052ff] group-hover/title:translate-x-0.5 transition-all">→</span>
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
            {data.post_count} posts scanned
            {relativeTime(data.generated_at) && (
              <> · Updated {relativeTime(data.generated_at)}</>
            )}
            {SHOW_DATA_FRESHNESS_UI && freshness ? (
              <> · <span className={freshness.toneClass}>{freshness.label}</span></>
            ) : null}
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
        {visible.map((item, index) => (
          <div key={item.ticker} className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col">
            <TickerCard item={item} locked={!isSubscribed && index >= visibleLimit} />
          </div>
        ))}
      </div>

      {!isSubscribed && (lockedCount > 0 || hiddenCount > 0) ? (
        <>
          <FeedUnlockBar surface="reddit_buzz" compact />
          <FeedStickyUnlock surface="reddit_buzz" />
        </>
      ) : null}

      {!isSubscribed && lockedCount > 0 ? (
        <FeedPaywallSlot>
          <RedditBuzzPaywall
            tickers={briefTickers}
            postCount={data.post_count}
            bullCount={bulls}
            bearCount={bears}
          />
        </FeedPaywallSlot>
      ) : null}
    </section>
  );
}
