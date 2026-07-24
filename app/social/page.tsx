import type { Metadata } from "next";
import { Suspense } from "react";

import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";
import { SocialPageStream } from "@/components/social-page-stream";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Social Stock Discussion",
  description:
    "A five-day view of US stock discussion volume, directional tone, dominant topics, and freshness, sourced from Reddit.",
  alternates: { canonical: "/social" },
};

export default function SocialPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[1240px] px-3 py-7 sm:px-6 sm:py-10 lg:px-10">
        <header className="mb-6 max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
            // social attention
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.035em] text-on-surface sm:text-[36px]">
            What investors are discussing.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-on-surface-variant">
            Ranked ticker discussion across a rolling five-day Reddit scan, with reposts removed and
            source freshness kept visible.
          </p>
        </header>
        <Suspense fallback={<MarketFeedStreamSkeleton />}>
          <SocialPageStream />
        </Suspense>
      </div>
    </main>
  );
}
