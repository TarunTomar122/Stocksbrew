import { Suspense } from "react";
import type { Metadata } from "next";

import { PulseHubStream } from "@/components/pulse-hub-stream";
import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Market today — movers, Reddit buzz, sector heat",
  description:
    "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning. One live view.",
  alternates: { canonical: "/pulse" },
};

export default function PulsePage() {
  return (
    <main className="pulse-page flex-grow">
      <div className="pulse-shell">
        <Suspense fallback={<PulsePageSkeleton />}>
          <PulseHubStream />
        </Suspense>
      </div>
    </main>
  );
}
