"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { StockRedditBuzzLockedRail, StockRedditBuzzRail } from "@/components/stock-reddit-buzz-rail";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { UnlistedStockDiscoveryModal } from "@/components/unlisted-stock-discovery-modal";
import type { RedditTickerContext } from "@/lib/reddit-cues-shared";

type Props = {
  ticker: string;
  market: "US" | "IN";
  redditTickerContext: RedditTickerContext | null;
  isSubscribed: boolean;
};

export function UnlistedStockShell({ ticker, market, redditTickerContext, isSubscribed }: Props) {
  const [showModal, setShowModal] = useState(true);

  return (
    <>
      <StockViewTracker ticker={ticker} instrumentId={`${market}_${ticker}`} market={market} />
      {showModal && (
        <UnlistedStockDiscoveryModal ticker={ticker} onDismiss={() => setShowModal(false)} />
      )}
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 md:px-10 lg:px-16 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-10 lg:gap-14">
          <aside className="lg:sticky lg:top-20 lg:self-start flex flex-col gap-4 w-full lg:max-w-[340px]">
            <div className="rounded-[20px] border border-outline-variant bg-surface p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <StockLogo ticker={ticker} market={market} size={48} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[15px] font-semibold text-on-surface tracking-[-0.01em]">
                    {ticker}
                  </span>
                  <span className="text-[12px] text-on-surface-variant leading-snug mt-1">
                    Not in stocksbrew&apos;s tracked universe yet. Full quotes and AI briefs will appear once we add it.
                  </span>
                </div>
              </div>
              <p className="text-[11px] font-medium text-on-surface-variant border-t border-outline-variant pt-3">
                Tip: open this page again after we ship coverage - the URL stays the same.
              </p>
            </div>

            {redditTickerContext ? (
              isSubscribed ? (
                <StockRedditBuzzRail context={redditTickerContext} />
              ) : (
                <StockRedditBuzzLockedRail />
              )
            ) : null}
          </aside>

          <section className="flex flex-col gap-6 min-w-0">
            <h1 className="text-[26px] md:text-[30px] font-semibold text-on-surface tracking-[-0.03em] leading-none">
              Overview
            </h1>
            <div className="rounded-3xl border border-outline-variant bg-surface p-6 md:p-7 flex flex-col gap-4">
              <p className="text-[15px] text-on-surface leading-relaxed">
                {redditTickerContext ? (
                  <>
                    We don&apos;t fully cover this symbol yet. On the left is recent{" "}
                    <strong className="text-on-surface">Reddit Buzz</strong> about it. Prices, fundamentals and the
                    brief unlock once it is added.
                  </>
                ) : (
                  <>
                    We don&apos;t cover <strong className="text-on-surface">{ticker}</strong> yet. Your visit helps us
                    prioritize adding it.
                  </>
                )}
              </p>
              <Link
                href="/"
                className="inline-flex self-start text-[14px] font-semibold text-[#0052ff] hover:underline"
              >
                ← Back to home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
