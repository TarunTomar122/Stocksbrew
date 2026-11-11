import type { Metadata } from "next";
import { Suspense } from "react";

import { AppPage, PageHead } from "@/components/oa/kit";
import { ExampleLine, NoticedFeed, NoticedGhost, ToolGrid, ToolGridGhost } from "@/components/portfolio-home/home";
import { loadPortfolioHome } from "@/lib/portfolio-home/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My stocks",
  description:
    "One page on everything you own: what changed this week, the earnings report that matters most, your next dividend, what your funds really hold, and the rebalancing or tax idea worth a look, each with the evidence.",
  alternates: { canonical: "/portfolio" },
};

const LEDE = "What changed in your stocks this week, what is coming up, and what you could do about it.";

/**
 * The My stocks overview. Every portfolio tool already writes its own read;
 * this page asks them all at once (lib/portfolio-home/server.ts), picks the
 * few things worth saying (lib/portfolio-home/pick.ts), and links each one to
 * the page with the evidence. Each part waits only for its own sources.
 */
export default function PortfolioHomePage() {
  const load = loadPortfolioHome();
  return (
    <AppPage>
      <PageHead title="My stocks" lede={LEDE} full />
      <Suspense fallback={null}>
        <ExampleLine load={load} />
      </Suspense>
      <Suspense fallback={<NoticedGhost />}>
        <NoticedFeed load={load} />
      </Suspense>
      <Suspense fallback={<ToolGridGhost />}>
        <ToolGrid load={load} />
      </Suspense>
    </AppPage>
  );
}
