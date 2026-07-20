import type { Metadata } from "next";
import { Suspense } from "react";

import { EventsPageStream } from "@/components/events-page-stream";
import { MarketFeedStreamSkeleton } from "@/components/page-stream-skeletons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings Reports - Fresh Post-Earnings Analysis",
  description:
    "Fresh post-earnings analysis from stocks that recently reported. See upcoming AI setups on the dedicated page.",
  alternates: { canonical: "/events" },
  openGraph: {
    title: "Earnings Reports · stocksbrew",
    description: "Fresh post-earnings analysis from recently reporting stocks.",
    url: "https://www.stocksbrew.online/events",
  },
  twitter: {
    card: "summary_large_image",
    title: "Earnings Reports · stocksbrew",
    description: "Fresh post-earnings analysis from recently reporting stocks.",
  },
};

export default function EventsPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#111111] md:text-[40px]">
            Earnings reports
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#6b7280]">
            Fresh post-earnings reads from names that just reported — plus upcoming setups on deck.
          </p>
        </header>

        <Suspense fallback={<MarketFeedStreamSkeleton />}>
          <div className="landing-stream-in flex flex-col gap-10">
            <EventsPageStream />
          </div>
        </Suspense>

        <footer className="text-[11px] text-[#9ca3af]">Not investment advice.</footer>
      </div>
    </main>
  );
}
