"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { StockRedditBuzzRail } from "@/components/stock-reddit-buzz-rail";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { UnlistedStockDiscoveryModal } from "@/components/unlisted-stock-discovery-modal";
import type { RedditTickerContext } from "@/lib/reddit-cues";

type Props = {
  ticker: string;
  market: "US" | "IN";
  redditTickerContext: RedditTickerContext | null;
};

export function UnlistedStockShell({ ticker, market, redditTickerContext }: Props) {
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
            <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <StockLogo ticker={ticker} market={market} size={48} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em]">
                    {ticker}
                  </span>
                  <span className="text-[12px] text-[#6b7280] leading-snug mt-1">
                    Not in stocksbrew&apos;s tracked universe yet. Full quotes and AI briefs will appear once we add it.
                  </span>
                </div>
              </div>
              <p className="text-[11px] font-medium text-[#9ca3af] border-t border-[#f3f4f6] pt-3">
                Tip: open this page again after we ship coverage - the URL stays the same.
              </p>
            </div>

            {redditTickerContext ? <StockRedditBuzzRail context={redditTickerContext} /> : null}
          </aside>

          <section className="flex flex-col gap-6 min-w-0">
            <h1 className="text-[26px] md:text-[30px] font-semibold text-[#111111] tracking-[-0.03em] leading-none">
              Overview
            </h1>
            <div className="rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7 flex flex-col gap-4">
              <p className="text-[15px] text-[#374151] leading-relaxed">
                {redditTickerContext ? (
                  <>
                    You landed on a symbol we don&apos;t fully cover yet. On the left is{" "}
                    <strong className="text-[#111111]">Reddit Buzz</strong> from our latest scan (when this ticker
                    showed up in threads). Price history, fundamentals, and the AI brief will unlock once this name
                    is in the library.
                  </>
                ) : (
                  <>
                    We don&apos;t have Reddit scan hits for <strong className="text-[#111111]">{ticker}</strong> right
                    now, and it isn&apos;t in our price universe yet. Your visit still helps us prioritize adding it.
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
