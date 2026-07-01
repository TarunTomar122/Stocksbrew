"use client";

import { useMemo, useState } from "react";

import { FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import { FeedPaywallSlot, RedditBuzzPaywall } from "@/components/feed-pro-paywalls";
import { RedditBuzzCard } from "@/components/reddit-buzz-card";
import { relativeTime } from "@/lib/freshness";
import { FREE_REDDIT_BUZZ_VISIBLE_LIMIT } from "@/lib/pro-features";
import { hasRedditBrief, type RedditSnapshot, type RedditTicker } from "@/lib/reddit-cues-shared";

type Props = {
  data: RedditSnapshot | null;
  isSubscribed: boolean;
};

type SideTab = "bullish" | "neutral" | "bearish";

const SIDE_META: Record<
  SideTab,
  { label: string; color: string; bg: string; border: string }
> = {
  bullish: {
    label: "Bullish",
    color: "#047857",
    bg: "#ecfdf5",
    border: "#bbf7d0",
  },
  neutral: {
    label: "Neutral",
    color: "#4b5563",
    bg: "#f3f4f6",
    border: "#e5e7eb",
  },
  bearish: {
    label: "Bearish",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
};

function isBullishSentiment(sentiment: string | undefined) {
  return sentiment?.toLowerCase() === "bullish";
}

function isBearishSentiment(sentiment: string | undefined) {
  return sentiment?.toLowerCase() === "bearish";
}

function sortBuzzRows(rows: RedditTicker[]) {
  return [...rows].sort(
    (a, b) => b.mention_count - a.mention_count || a.ticker.localeCompare(b.ticker),
  );
}

function BuzzPanel({
  rows,
  lockedRows = [],
  lockedCount,
  side,
  isSubscribed,
  showHeader = true,
}: {
  rows: RedditTicker[];
  lockedRows?: RedditTicker[];
  lockedCount: number;
  side: SideTab;
  isSubscribed: boolean;
  showHeader?: boolean;
}) {
  const meta = SIDE_META[side];
  const visible = rows;

  if (rows.length === 0 && lockedCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-4 py-10 text-center">
        <p className="text-[13px] text-[#9ca3af]">No {meta.label.toLowerCase()} buzz right now.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
      {showHeader ? (
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: meta.border, background: meta.bg }}
        >
          <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[12px] font-medium tabular-nums text-[#6b7280]">
            {isSubscribed || lockedCount === 0
              ? `${rows.length} name${rows.length === 1 ? "" : "s"}`
              : `${rows.length} shown · 5 locked`}
          </span>
        </div>
      ) : null}

      <div className="max-h-[min(720px,70vh)] overflow-y-auto p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((item) => (
            <RedditBuzzCard key={item.ticker} item={item} variant="home" />
          ))}
          {lockedRows.map((item) => (
            <RedditBuzzCard key={`locked-${item.ticker}`} item={item} locked variant="home" />
          ))}
        </div>
      </div>
      {lockedCount > 0 ? (
        <FeedUnlockBar surface="reddit_buzz" className="border-[#e5e7eb] bg-white" compact />
      ) : null}
    </div>
  );
}

export function RedditBuzzPageView({ data, isSubscribed }: Props) {
  const [mobileTab, setMobileTab] = useState<SideTab>("bullish");

  const { bullish, neutral, bearish, visibleBullish, visibleNeutral, visibleBearish, lockedBullishRows, lockedNeutralRows, lockedBearishRows, briefTickers } = useMemo(() => {
    const brief = sortBuzzRows((data?.tickers ?? []).filter(hasRedditBrief));
    const visible = isSubscribed ? brief : brief.slice(0, FREE_REDDIT_BUZZ_VISIBLE_LIMIT);
    const locked = isSubscribed ? [] : brief.slice(FREE_REDDIT_BUZZ_VISIBLE_LIMIT);
    const allBullish = brief.filter((t) => isBullishSentiment(t.sentiment));
    const allNeutral = brief.filter((t) => !isBullishSentiment(t.sentiment) && !isBearishSentiment(t.sentiment));
    const allBearish = brief.filter((t) => isBearishSentiment(t.sentiment));
    return {
      briefTickers: brief,
      bullish: allBullish,
      neutral: allNeutral,
      bearish: allBearish,
      visibleBullish: visible.filter((t) => isBullishSentiment(t.sentiment)),
      visibleNeutral: visible.filter((t) => !isBullishSentiment(t.sentiment) && !isBearishSentiment(t.sentiment)),
      visibleBearish: visible.filter((t) => isBearishSentiment(t.sentiment)),
      lockedBullishRows: locked.filter((t) => isBullishSentiment(t.sentiment)),
      lockedNeutralRows: locked.filter((t) => !isBullishSentiment(t.sentiment) && !isBearishSentiment(t.sentiment)),
      lockedBearishRows: locked.filter((t) => isBearishSentiment(t.sentiment)),
    };
  }, [data?.tickers, isSubscribed]);

  const totalLocked = useMemo(() => {
    if (isSubscribed) return 0;
    return Math.max(0, briefTickers.length - FREE_REDDIT_BUZZ_VISIBLE_LIMIT);
  }, [briefTickers.length, isSubscribed]);

  if (!data || briefTickers.length === 0) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.03em] text-[#111111]">
          Reddit buzz
        </h1>
        <p className="text-[15px] text-[#6b7280] leading-relaxed">
          What retail is debating on r/stocks and more. Check back after the next scan.
        </p>
      </div>
    );
  }

  const activeMobileTab =
    isSubscribed ? mobileTab : visibleBullish.length > 0 ? "bullish" : visibleNeutral.length > 0 ? "neutral" : visibleBearish.length > 0 ? "bearish" : mobileTab;
  const lockedBullish = isSubscribed ? 0 : lockedBullishRows.length;
  const lockedNeutral = isSubscribed ? 0 : lockedNeutralRows.length;
  const lockedBearish = isSubscribed ? 0 : lockedBearishRows.length;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <header className="flex flex-col gap-2 max-w-2xl">
        <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.03em] text-[#111111]">
          Reddit buzz
        </h1>
        <p className="text-[15px] text-[#6b7280] leading-relaxed">
          What retail is debating on r/stocks and more, split bullish, neutral, and bearish.
        </p>
        <p className="text-[12px] text-[#9ca3af]">
          {data.post_count} posts scanned
          {relativeTime(data.generated_at) ? (
            <span> · Updated {relativeTime(data.generated_at)}</span>
          ) : null}
        </p>
      </header>

      <div className="hidden lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        <BuzzPanel rows={isSubscribed ? bullish : visibleBullish} lockedRows={lockedBullishRows} lockedCount={lockedBullish} side="bullish" isSubscribed={isSubscribed} />
        <BuzzPanel rows={isSubscribed ? neutral : visibleNeutral} lockedRows={lockedNeutralRows} lockedCount={lockedNeutral} side="neutral" isSubscribed={isSubscribed} />
        <BuzzPanel rows={isSubscribed ? bearish : visibleBearish} lockedRows={lockedBearishRows} lockedCount={lockedBearish} side="bearish" isSubscribed={isSubscribed} />
      </div>

      <div className="flex flex-col gap-4 lg:hidden">
        <div className="flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
          {(["bullish", "neutral", "bearish"] as const).map((tab) => {
            const active = activeMobileTab === tab;
            const meta = SIDE_META[tab];
            const visibleCount =
              tab === "bullish" ? visibleBullish.length : tab === "neutral" ? visibleNeutral.length : visibleBearish.length;
            const lockedCount =
              tab === "bullish" ? lockedBullish : tab === "neutral" ? lockedNeutral : lockedBearish;
            const countLabel = isSubscribed || lockedCount === 0 ? String(visibleCount) : `${visibleCount}+${lockedCount}`;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  active ? "bg-white shadow-sm" : "text-[#6b7280]"
                }`}
                style={active ? { color: meta.color } : undefined}
              >
                {meta.label}
                <span className="ml-1.5 text-[12px] font-medium tabular-nums text-[#9ca3af]">
                  {countLabel}
                </span>
              </button>
            );
          })}
        </div>
        <BuzzPanel
          rows={activeMobileTab === "bullish" ? (isSubscribed ? bullish : visibleBullish) : activeMobileTab === "neutral" ? (isSubscribed ? neutral : visibleNeutral) : (isSubscribed ? bearish : visibleBearish)}
          lockedRows={activeMobileTab === "bullish" ? lockedBullishRows : activeMobileTab === "neutral" ? lockedNeutralRows : lockedBearishRows}
          lockedCount={activeMobileTab === "bullish" ? lockedBullish : activeMobileTab === "neutral" ? lockedNeutral : lockedBearish}
          side={activeMobileTab}
          isSubscribed={isSubscribed}
          showHeader={false}
        />
      </div>

      {!isSubscribed && totalLocked > 0 ? (
        <FeedPaywallSlot>
          <RedditBuzzPaywall
            tickers={briefTickers}
            postCount={data.post_count}
            bullCount={bullish.length}
            bearCount={bearish.length}
            neutralCount={neutral.length}
          />
        </FeedPaywallSlot>
      ) : null}
    </div>
  );
}
