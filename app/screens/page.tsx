import type { Metadata } from "next";

import { getCurrentMarket } from "@/lib/market";
import { getThematicScreens } from "@/lib/screens";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { ScreensTableView } from "@/components/screens-table-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thematic Screens",
  description:
    "Hand-picked thematic filters over Tikrr's four-pillar score — quality compounders, momentum leaders, oversold quality, and more.",
  alternates: { canonical: "/screens" },
  openGraph: {
    title: "Thematic Screens — Curated Stock Filters · Tikrr",
    description: "Hand-picked thematic filters over Tikrr's four-pillar score — quality compounders, momentum leaders, oversold quality, and more.",
    url: "https://www.tikrr.online/screens",
  },
  twitter: {
    title: "Thematic Screens — Curated Stock Filters · Tikrr",
    description: "Hand-picked thematic filters over Tikrr's four-pillar score — quality compounders, momentum leaders, oversold quality, and more.",
  },
};


export default async function ScreensIndexPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const doc = await getThematicScreens(market);
  const screens = (doc?.screens ?? []).filter((s) => s.match_count > 0);

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <header className="flex flex-col gap-3 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Screens
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Opinionated filters, ranked by Tikrr score.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Hand-picked themes layered over our four-pillar composite — valuation, growth, quality, momentum. Skip the screener; jump to the names that already match.
          </p>
          {doc && (
            <div className="flex items-center gap-3 mt-2 text-[12px] text-[#6b7280]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                Live four-pillar scores
              </span>
              <span>·</span>
              <span>{screens.length} active screens</span>
            </div>
          )}
        </header>

        {screens.length === 0 ? (
          <div className="rounded-[24px] border border-[#e5e7eb] bg-white px-6 py-16 text-center">
            <h2 className="text-[18px] font-semibold text-[#111111]">
              No screens are populated yet.
            </h2>
            <p className="text-[14px] text-[#6b7280] mt-2 max-w-[480px] mx-auto">
              We&apos;re computing the latest scores. Check back in a few minutes.
            </p>
          </div>
        ) : (
          <ScreensTableView screens={screens} market={market} isSubscribed={isSubscribed} />
        )}
      </div>
    </main>
  );
}
