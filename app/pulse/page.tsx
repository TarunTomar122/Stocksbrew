import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { PulseHubStream } from "@/components/pulse-hub-stream";
import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";

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
  title: "Market today — movers, Reddit buzz, sector heat",
  description:
    "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning. One live view.",
  alternates: { canonical: "/pulse" },
  openGraph: {
    title: "Market today — movers, Reddit buzz, sector heat · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning.",
    url: "https://www.stocksbrew.online/pulse",
  },
  twitter: {
    title: "Market today — movers, Reddit buzz, sector heat · stocksbrew",
    description:
      "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning.",
  },
};

export default function PulsePage() {
  return (
    <main className="pulse-page flex-grow">
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
      </div>
    </main>
  );
}
