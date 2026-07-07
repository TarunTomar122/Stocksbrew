"use client";

import { FeedUnlockBar, FeedStickyUnlock } from "@/components/feed-row-lock-teaser";
import { RedditBuzzCard } from "@/components/reddit-buzz-card";
import { FREE_REDDIT_BUZZ_VISIBLE_LIMIT } from "@/lib/pro-features";
import type { RedditTicker } from "@/lib/reddit-cues-shared";

export function redditPickToTicker(r: {
  ticker: string;
  sentiment: string;
  summary: string;
  mention_count?: number;
  catalysts?: string[];
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
}): RedditTicker {
  return {
    ticker: r.ticker,
    sentiment: r.sentiment,
    summary: r.summary,
    mention_count: r.mention_count ?? 0,
    catalysts: r.catalysts ?? [],
    company: r.company,
    price: r.price,
    changePct: r.changePct,
    volume: r.volume,
  };
}

function gridClassFor(cols: "1" | "2" | "3", variant: "home" | "pulse" | "landing") {
  if (variant === "landing") return "flex flex-col gap-1";
  if (cols === "1") return "flex flex-col gap-3";
  if (cols === "2") return "grid gap-4 sm:grid-cols-2";
  return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
}

export function RedditBuzzFeed({
  items,
  isSubscribed,
  limit,
  variant = "home",
  gridCols = "3",
  scrollClassName = "",
  unlockBarClassName,
  showTalkingPoints = true,
  hideLockedRows = false,
  unlockSignedOutLabel,
  unlockSignedInLabel,
}: {
  items: RedditTicker[];
  isSubscribed: boolean;
  limit?: number;
  variant?: "home" | "pulse" | "landing";
  gridCols?: "1" | "2" | "3";
  scrollClassName?: string;
  unlockBarClassName?: string;
  showTalkingPoints?: boolean;
  hideLockedRows?: boolean;
  unlockSignedOutLabel?: string;
  unlockSignedInLabel?: string;
}) {
  const sourceItems = limit ? items.slice(0, limit) : items;
  const hasLocked = !isSubscribed && sourceItems.length > FREE_REDDIT_BUZZ_VISIBLE_LIMIT;
  const visibleItems =
    isSubscribed || !hideLockedRows
      ? sourceItems
      : sourceItems.slice(0, FREE_REDDIT_BUZZ_VISIBLE_LIMIT);
  const unlockClass =
    unlockBarClassName ??
    (variant === "pulse" ? "border-outline-variant bg-surface" : "border-[#e5e7eb] bg-white");

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${gridClassFor(gridCols, variant)} ${scrollClassName}`}>
        {visibleItems.map((item, index) => (
          <RedditBuzzCard
            key={item.ticker}
            item={item}
            locked={!isSubscribed && !hideLockedRows && index >= FREE_REDDIT_BUZZ_VISIBLE_LIMIT}
            variant={variant}
            showTalkingPoints={showTalkingPoints}
          />
        ))}
      </div>
      {hasLocked ? (
        <>
          <FeedUnlockBar
            surface="reddit_buzz"
            className={`rounded-xl border ${unlockClass}`}
            compact
            signedOutLabel={unlockSignedOutLabel}
            signedInLabel={unlockSignedInLabel}
          />
          <FeedStickyUnlock
            surface="reddit_buzz"
            signedOutLabel={unlockSignedOutLabel}
            signedInLabel={unlockSignedInLabel}
          />
        </>
      ) : null}
    </div>
  );
}
