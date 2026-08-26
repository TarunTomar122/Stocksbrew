import type { Metadata } from "next";
import { Suspense } from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { RedditBuzzPageStream } from "@/components/reddit-buzz-page-stream";
import { MarketFeedPageSkeleton } from "@/components/page-stream-skeletons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reddit Buzz · Stocksbrew",
  description:
    "The stocks getting attention on Reddit over the last three days, with the context behind the chatter.",
  alternates: { canonical: "/reddit-buzz" },
};

export default function RedditBuzzPage() {
  return (
    <main className="oa-landing flex-grow overflow-x-clip">
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
        <Suspense fallback={<MarketFeedPageSkeleton />}>
          <RedditBuzzPageStream />
        </Suspense>
      </div>
    </main>
  );
}
