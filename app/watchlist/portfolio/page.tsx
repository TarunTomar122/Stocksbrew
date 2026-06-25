import type { Metadata } from "next";
import { Suspense } from "react";

import { PortfolioRebalanceStream } from "@/components/portfolio-rebalance-stream";
import { PortfolioRebalancePageSkeleton } from "@/components/page-stream-skeletons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rebalance - At-a-glance portfolio view",
  description:
    "Strategy-driven portfolio diagnosis: concentration, weak links, sector fit, and gaps to fill.",
  alternates: { canonical: "/watchlist/portfolio" },
};

export default function PortfolioPage() {
  return (
    <Suspense fallback={<PortfolioRebalancePageSkeleton />}>
      <PortfolioRebalanceStream />
    </Suspense>
  );
}
