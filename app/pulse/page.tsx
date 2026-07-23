import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { PulseHubStream } from "@/components/pulse-hub-stream";
import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";
import { MarketingSchema } from "@/components/seo/marketing-schema";

export const revalidate = 120;

const SECTOR_BRIEFS = [
  ["ai-infrastructure", "AI infrastructure"],
  ["big-tech", "Big tech"],
  ["consumer", "Consumer"],
  ["energy", "Energy"],
  ["financials", "Financials"],
  ["healthcare", "Healthcare"],
  ["industrials", "Industrials"],
  ["semiconductors", "Semiconductors"],
] as const;

export const metadata: Metadata = {
  title: "US Stock Market Analysis Today",
  description:
    "Current US stock market analysis with major movers, sector direction, earnings, pre-market context, Reddit activity, and the events driving stocks today.",
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
      "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning.",
    url: "https://www.stocksbrew.online/pulse",
  },
  twitter: {
    card: "summary_large_image",
    title: "US Stock Market Analysis Today · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning.",
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
        <section className="mt-8 rounded-2xl border border-outline-variant bg-surface px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            Sector briefs
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {SECTOR_BRIEFS.map(([slug, label]) => (
              <Link
                key={slug}
                href={`/sector/${slug}`}
                className="text-[13px] font-medium text-landing-brand hover:underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
        <section className="mt-8 grid gap-6 border-y border-outline-variant py-8 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
              Read the market in layers
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-on-surface">
              What a useful daily US market analysis includes
            </h2>
          </div>
          <div className="text-[14px] leading-6 text-on-surface-variant">
            <p>
              Start with broad direction and sector participation, then inspect the stocks making unusual
              moves. Check whether earnings, a filing, guidance, macro data, or a genuine company event
              explains the move. Keep the market-wide read separate from the evidence for any one stock.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-semibold text-landing-brand">
              <Link href="/stocks" className="hover:underline">Browse US stocks</Link>
              <Link href="/earnings" className="hover:underline">Earnings calendar</Link>
              <Link href="/news" className="hover:underline">US stock market news</Link>
              <Link href="/blog/us-stock-market-analysis-daily-workflow-2026" className="hover:underline">
                Daily analysis workflow
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
