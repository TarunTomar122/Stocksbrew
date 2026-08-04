import type { Metadata } from "next";
import { Suspense } from "react";

import { SocialFeedSkeleton } from "@/components/page-stream-skeletons";
import { SocialPageStream } from "@/components/social-page-stream";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "What Investors Are Saying About US Stocks",
  description:
    "Follow the US stocks investors are discussing, with Reddit summaries, mention counts and the main talking points.",
  alternates: { canonical: "/social" },
};

export default function SocialPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[1240px] px-3 py-7 sm:px-6 sm:py-10 lg:px-10">
        <header className="mb-6 max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
            Social
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.035em] text-on-surface sm:text-[36px]">
            What investors are saying
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-on-surface-variant">
            The US stocks getting attention on Reddit, and what people are actually discussing.
          </p>
        </header>
        <Suspense fallback={<SocialFeedSkeleton />}>
          <SocialPageStream />
        </Suspense>
      </div>
    </main>
  );
}
