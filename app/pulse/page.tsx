import { Suspense } from "react";
import type { Metadata } from "next";

import { PulseHubStream } from "@/components/pulse-hub-stream";
import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { interTight } from "@/components/oa/font";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "US Stock Market Analysis Today",
  description:
    "Current US stock market analysis with major movers and the reason behind every move, pre-market setup, and what earnings just changed.",
  keywords: [
    "US stock market analysis",
    "stock market today",
    "market movers",
    "why is the market moving",
    "sector performance",
  ],
  alternates: { canonical: "/pulse" },
  openGraph: {
    title: "US Stock Market Analysis Today · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, the opening setup, and what earnings just changed.",
    url: "https://www.stocksbrew.online/pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stock Market Analysis Today · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, the opening setup, and what earnings just changed.",
  },
};

export default function PulsePage() {
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <MarketingSchema
        path="/pulse"
        name="US Stock Market Analysis Today"
        description="Current US stock market analysis with movers, sectors, pre-market setup, and the reason behind every move."
        breadcrumbLabel="US Stock Market Analysis"
      />
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[76rem] px-4 sm:px-6">
        <Suspense fallback={<PulsePageSkeleton />}>
          <PulseHubStream />
        </Suspense>
      </div>
    </main>
  );
}
