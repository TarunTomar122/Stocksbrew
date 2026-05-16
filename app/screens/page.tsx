import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentMarket } from "@/lib/market";
import { getThematicScreens } from "@/lib/screens";
import { ScreensTableView } from "@/components/screens-table-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thematic Screens",
  description:
    "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
  alternates: { canonical: "/screens" },
  openGraph: {
    title: "Thematic Screens · tikrr",
    description: "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
    url: "https://www.tikrr.online/screens",
  },
  twitter: {
    title: "Thematic Screens · tikrr",
    description: "Curated stock screens based on growth, momentum, quality and valuation. Quality compounders, momentum leaders, oversold quality and more.",
  },
};


function ScreensFallback() {
  return (
    <div className="animate-pulse rounded-[24px] border border-[#e5e7eb] bg-white p-4">
      <div className="mb-4 h-8 w-64 rounded bg-[#f3f4f6]" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-[#f3f4f6]" />
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
      <div className="rounded-[24px] border border-[#e5e7eb] bg-white px-6 py-16 text-center">
        <h2 className="text-[18px] font-semibold text-[#111111]">
          No screens are populated yet.
        </h2>
        <p className="text-[14px] text-[#6b7280] mt-2 max-w-[480px] mx-auto">
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
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <header className="flex flex-col gap-3 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Screens
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Curated screens, ranked by tikrr score.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Each screen filters stocks by a specific angle - growth, momentum, quality or valuation. Skip the screener and jump straight to the names that already fit.
          </p>
          <div className="flex items-center gap-3 mt-2 text-[12px] text-[#6b7280]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Updated daily
            </span>
          </div>
        </header>

        <Suspense fallback={<ScreensFallback />}>
          <ScreensContentStream />
        </Suspense>
      </div>
    </main>
  );
}
