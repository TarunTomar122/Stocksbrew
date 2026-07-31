import { Suspense } from "react";
import type { Metadata } from "next";

import { PulseHubStream } from "@/components/pulse-hub-stream";
import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";
import { MarketingSchema } from "@/components/seo/marketing-schema";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "US Stock Market Analysis Today",
  description:
    "Current US stock market analysis with major movers, sector direction, earnings, pre-market context, and the events driving stocks today.",
  keywords: [
    "US stock market analysis",
    "stock market today",
    "US stocks today",
    "market movers",
    "sector performance",
  ],
  alternates: { canonical: "/pulse" },
  openGraph: {
    title: "US Stock Market Analysis Today · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, the opening setup, earnings, and sector direction.",
    url: "https://www.stocksbrew.online/pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stock Market Analysis Today · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, the opening setup, earnings, and sector direction.",
  },
};

export default function PulsePage() {
  return (
    <main className="pulse-page flex-grow">
      <MarketingSchema
        path="/pulse"
        name="US Stock Market Analysis Today"
        description="Current US stock market analysis with movers, sectors, earnings, pre-market context, and the events driving stocks today."
        breadcrumbLabel="US Stock Market Analysis"
      />
      <div className="pulse-shell">
        <Suspense fallback={<PulsePageSkeleton />}>
          <PulseHubStream />
        </Suspense>
      </div>
    </main>
  );
}
