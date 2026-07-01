"use client";

import Link from "next/link";

import { AnomalyMovesBoard } from "@/components/daily-anomalies-board";
import { MOVES_SECTION_TAGLINE } from "@/components/daily-anomalies-shared";
import { RedditBuzzFeed } from "@/components/reddit-buzz-feed";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { MARKET_FEED_FRESHNESS, SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";
import { hasRedditBrief, type RedditSnapshot } from "@/lib/reddit-cues-shared";

/** Cap scroll on lg+ only; mobile uses page scroll so touch does not get trapped. */
export const HOME_LIVE_FEED_SCROLL_CLASS =
  "lg:max-h-[min(32rem,55vh)] lg:overflow-y-auto";

function RedditBuzzRail({
  data,
  isSubscribed,
}: {
  data: RedditSnapshot;
  isSubscribed: boolean;
}) {
  const briefTickers = (data.tickers ?? []).filter(hasRedditBrief);
  if (briefTickers.length === 0) return null;

  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(data.generated_at, MARKET_FEED_FRESHNESS)
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Link
          href="/reddit-buzz"
          className="group/title inline-flex items-center gap-1 text-[16px] font-semibold tracking-[-0.02em] text-[#111111] hover:text-[#0052ff] transition-colors"
        >
          Reddit buzz
          <span className="text-[14px] text-[#9ca3af] transition-all group-hover/title:translate-x-0.5 group-hover/title:text-[#0052ff]">
            →
          </span>
        </Link>
        <p className="text-[12px] text-[#9ca3af]">
          {data.post_count} posts scanned
          {relativeTime(data.generated_at) ? (
            <span> · Updated {relativeTime(data.generated_at)}</span>
          ) : null}
          {SHOW_DATA_FRESHNESS_UI && freshness ? (
            <>
              {" "}
              · <span className={freshness.toneClass}>{freshness.label}</span>
            </>
          ) : null}
        </p>
      </div>

      <RedditBuzzFeed
        items={briefTickers}
        isSubscribed={isSubscribed}
        limit={6}
        gridCols="1"
        scrollClassName={HOME_LIVE_FEED_SCROLL_CLASS}
      />
    </div>
  );
}

type Props = {
  ups: AnomalyItem[];
  downs: AnomalyItem[];
  generatedAt: string;
  reddit?: RedditSnapshot | null;
  isSubscribed?: boolean;
  fullItemLimit?: number;
};

export function HomeLiveFeed({
  ups,
  downs,
  generatedAt,
  reddit = null,
  isSubscribed = false,
  fullItemLimit,
}: Props) {
  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(generatedAt, MARKET_FEED_FRESHNESS)
    : null;
  const hasReddit = Boolean(reddit && (reddit.tickers ?? []).some(hasRedditBrief));

  return (
    <section className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href="/anomalies"
          className="group/title inline-flex items-center gap-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[#111111] hover:text-[#0052ff] transition-colors md:text-[24px]"
        >
          Today&apos;s big moves
          <span className="text-[16px] text-[#9ca3af] transition-all group-hover/title:translate-x-0.5 group-hover/title:text-[#0052ff]">
            →
          </span>
        </Link>
        <p className="text-[13px] leading-relaxed text-[#6b7280]">
          {MOVES_SECTION_TAGLINE}
          {relativeTime(generatedAt) ? (
            <span className="text-[#9ca3af]"> · Updated {relativeTime(generatedAt)}</span>
          ) : null}
          {SHOW_DATA_FRESHNESS_UI && freshness ? (
            <>
              {" "}
              · <span className={freshness.toneClass}>{freshness.label}</span>
            </>
          ) : null}
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${hasReddit ? "lg:grid-cols-3 lg:gap-8" : ""}`}
      >
        <div className={hasReddit ? "min-w-0 lg:col-span-2" : "min-w-0"}>
          <AnomalyMovesBoard
            ups={ups}
            downs={downs}
            layout="table"
            showSeeAll
            scrollable
            isSubscribed={isSubscribed}
            fullItemLimit={fullItemLimit}
          />
        </div>

        {hasReddit && reddit ? (
          <div className="min-w-0 lg:col-span-1">
            <RedditBuzzRail data={reddit} isSubscribed={isSubscribed} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
