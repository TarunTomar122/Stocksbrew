"use client";

import {
  FeedStickyUnlock,
  FeedUnlockBar,
} from "@/components/feed-row-lock-teaser";
import { RedditBuzzCard } from "@/components/reddit-buzz-card";
import { relativeTime } from "@/lib/freshness";
import { FREE_REDDIT_BUZZ_VISIBLE_LIMIT } from "@/lib/pro-features";
import {
  hasRedditBrief,
  type RedditSnapshot,
  type RedditTicker,
} from "@/lib/reddit-cues-shared";

type Props = {
  data: RedditSnapshot | null;
  isSubscribed: boolean;
};

function sortBuzzRows(rows: RedditTicker[]) {
  return [...rows].sort(
    (a, b) =>
      b.mention_count - a.mention_count || a.ticker.localeCompare(b.ticker),
  );
}

export function RedditBuzzPageView({ data, isSubscribed }: Props) {
  const briefTickers = sortBuzzRows(
    (data?.tickers ?? []).filter(hasRedditBrief),
  );
  const visibleTickers = isSubscribed
    ? briefTickers
    : briefTickers.slice(0, FREE_REDDIT_BUZZ_VISIBLE_LIMIT);
  const lockedTickers = isSubscribed
    ? []
    : briefTickers.slice(FREE_REDDIT_BUZZ_VISIBLE_LIMIT);

  if (!data || briefTickers.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-oa-muted-fg">
          Market signal
        </p>
        <h1 className="text-[36px] font-medium tracking-[-0.03em] text-oa-fg md:text-[44px]">
          Reddit buzz
        </h1>
        <p className="text-[16px] leading-7 text-oa-muted-fg">
          No recent Reddit reads yet. Check back after the next scan.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-oa-muted-fg">
          Market signal
        </p>
        <h1 className="text-[36px] font-medium tracking-[-0.03em] text-oa-fg md:text-[44px]">
          Reddit buzz
        </h1>
        <p className="text-[16px] leading-7 text-oa-muted-fg">
          The stocks getting attention over the last three days, with the
          context behind the chatter.
        </p>
        <p className="text-[13px] leading-6 text-oa-muted-fg">
          {briefTickers.length} names · Last 3 days
          {relativeTime(data.generated_at) ? (
            <span> · Updated {relativeTime(data.generated_at)}</span>
          ) : null}
        </p>
      </header>

      <section aria-label="Reddit buzz names">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[22px] font-medium tracking-[-0.02em] text-oa-fg">
            Mention heat
          </h2>
          <p className="text-[14px] text-oa-muted-fg">
            Sorted by discussion volume
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTickers.map((item) => (
            <RedditBuzzCard
              key={item.ticker}
              item={item}
              variant="pulse"
              showStockLink={false}
              showTalkingPoints={false}
            />
          ))}
          {lockedTickers.map((item) => (
            <RedditBuzzCard
              key={`locked-${item.ticker}`}
              item={item}
              locked
              variant="pulse"
              showStockLink={false}
              showTalkingPoints={false}
            />
          ))}
        </div>

        {lockedTickers.length > 0 ? (
          <div className="mt-4">
            <FeedUnlockBar surface="reddit_buzz" compact />
            <FeedStickyUnlock surface="reddit_buzz" />
          </div>
        ) : null}
      </section>

      <p className="text-[12px] leading-5 text-oa-muted-fg">
        Reddit discussion is a crowd signal, not investment advice.
      </p>
    </div>
  );
}
