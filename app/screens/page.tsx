import type { Metadata } from "next";
import { Suspense } from "react";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { ScreensTableView } from "@/components/screens-table-view";
import { getCurrentMarket } from "@/lib/market";
import { getThematicScreens } from "@/lib/screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thematic Screens",
  description:
    "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
  alternates: { canonical: "/screens" },
  openGraph: {
    title: "Thematic Screens · stocksbrew",
    description:
      "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
    url: "https://www.stocksbrew.online/screens",
  },
  twitter: {
    title: "Thematic Screens · stocksbrew",
    description:
      "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
  },
};

function ScreensFallback() {
  return (
    <div className="animate-pulse rounded-[24px] border border-outline-variant bg-surface p-4">
      <div className="mb-4 h-8 w-64 rounded bg-surface-container" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-container" />
        ))}
      </div>
    </div>
  );
}

async function ScreensContentStream() {
  const market = getCurrentMarket();
  const doc = await getThematicScreens(market);
  const screens = (doc?.screens ?? []).filter((s) => s.match_count > 0);

  if (screens.length === 0) {
    return (
      <div className="rounded-[24px] border border-outline-variant bg-surface px-6 py-16 text-center">
        <h2 className="text-[18px] font-semibold text-on-surface">No screens are populated yet.</h2>
        <p className="mx-auto mt-2 max-w-[480px] text-[14px] text-on-surface-variant">
          We&apos;re computing the latest scores. Check back in a few minutes.
        </p>
      </div>
    );
  }

  return <ScreensTableView screens={screens} market={market} />;
}

export default function ScreensIndexPage() {
  return (
    <main className="flex-grow">
      <FreeToolPageFrame toolHref="/screens">
        <div className="flex items-center gap-3 text-[12px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" />
            Updated daily
          </span>
        </div>
        <Suspense fallback={<ScreensFallback />}>
          <ScreensContentStream />
        </Suspense>
      </FreeToolPageFrame>
    </main>
  );
}
