import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { ScreensTableView } from "@/components/screens-table-view";
import { getCurrentMarket } from "@/lib/market";
import { getThematicScreens } from "@/lib/screens";

export const dynamic = "force-dynamic";

const SCREEN_LINKS = [
  ["tikrr_top", "Top Stocksbrew Score"],
  ["quality_compounders", "Quality Compounders"],
  ["cheap_growth", "Growth at a Fair Price"],
  ["momentum_leaders", "Momentum Leaders"],
  ["oversold_quality", "Quality on Sale"],
  ["near_52w_high", "Near 52-Week Highs"],
  ["smart_money", "Where the Pros Are"],
] as const;

export const metadata: Metadata = {
  title: "Free Stock Screener: Thematic US Stock Screens",
  description:
    "Browse daily US stock screens for quality, value, growth, momentum, oversold stocks, 52-week highs, and institutional ownership. Free, no sign-in.",
  alternates: { canonical: "/screens" },
  openGraph: {
    title: "Free Stock Screener: Thematic US Stock Screens · stocksbrew",
    description:
      "Browse daily US stock screens for quality, value, growth, momentum, oversold stocks, 52-week highs, and institutional ownership.",
    url: "https://www.stocksbrew.online/screens",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Stock Screener: Thematic US Stock Screens · stocksbrew",
    description:
      "Browse daily US stock screens for quality, value, growth, momentum, oversold stocks, 52-week highs, and institutional ownership.",
  },
};

function ScreensFallback() {
  return (
    <div className="loading-screen animate-pulse rounded-[22px] border border-oa-border bg-oa-card p-4">
      <div className="mb-4 h-8 w-64 rounded-full border border-oa-border bg-oa-bg" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-[18px] border border-oa-border bg-oa-bg" />
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
      <div className="rounded-[22px] border border-oa-border bg-oa-card px-6 py-16 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">No screens are populated yet.</h2>
        <p className="mx-auto mt-2 max-w-[480px] text-sm leading-relaxed text-oa-muted-fg">
          We&apos;re computing the latest scores. Check back in a few minutes.
        </p>
      </div>
    );
  }

  return <ScreensTableView screens={screens} market={market} />;
}

export default function ScreensIndexPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <FreeToolPageFrame toolHref="/screens">
        <div className="flex items-center gap-3 text-xs text-oa-muted-fg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-oa-accent px-2.5 py-1 font-medium text-oa-fg">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Updated daily
          </span>
        </div>
        <Suspense fallback={<ScreensFallback />}>
          <ScreensContentStream />
        </Suspense>
        <nav className="rounded-[22px] border border-oa-border bg-oa-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)]" aria-label="Browse stock screens">
          <p className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">
            Browse stock screens
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {SCREEN_LINKS.map(([id, label]) => (
              <Link
                key={id}
                href={`/screens/${id}`}
                className="text-[13px] font-medium text-oa-primary underline-offset-4 hover:underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </FreeToolPageFrame>
    </main>
  );
}
