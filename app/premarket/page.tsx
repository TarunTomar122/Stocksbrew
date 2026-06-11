import type { Metadata } from "next";
import Link from "next/link";

import { PremarketPageView } from "@/components/premarket-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getSectorRegimes } from "@/lib/sector-regimes";
import { getUserDoc } from "@/lib/watchlist";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Pre-Market Movers - Before the Open Gaps",
  description:
    "See which stocks are gapping up or down before the market opens. Live pre-market prices, gaps vs prior close, and sector context.",
  alternates: { canonical: "/premarket" },
  openGraph: {
    title: "Pre-Market Movers · stocksbrew",
    description: "Stocks gapping before the open — live pre-market movers with gap % and prices.",
    url: "https://www.stocksbrew.online/premarket",
  },
  twitter: {
    title: "Pre-Market Movers · stocksbrew",
    description: "Stocks gapping before the open — live pre-market movers with gap % and prices.",
  },
};

export default async function PremarketPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [premarketDoc, regimes, userDoc] = await Promise.all([
    getPremarketMovers(market).catch(() => null),
    getSectorRegimes(market).catch(() => ({ sectors: {}, macro: null })),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);

  const premarketLive = isPremarketLive(premarketDoc, market);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks : [];
  const hasRows =
    (premarketDoc?.gappers_up?.length ?? 0) + (premarketDoc?.gappers_down?.length ?? 0) > 0;

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        {!premarketDoc || !hasRows ? (
          <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#111111]">
              No pre-market snapshot yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6b7280]">
              {premarketLive
                ? "Quotes are still syncing. Check back in a few minutes."
                : "Pre-market movers refresh on US trading days between 4:00 and 9:30 AM ET."}
            </p>
            <Link
              href="/watchlist"
              className="mt-5 inline-flex items-center rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white hover:bg-black"
            >
              Open Radar
            </Link>
          </div>
        ) : (
          <PremarketPageView
            movers={premarketDoc}
            premarketLive={premarketLive}
            marketPhase={regimes.macro?.market_phase}
            marketRisk={regimes.macro?.risk_appetite}
            trackedIds={trackedIds}
          />
        )}

        <footer className="text-[11px] text-[#9ca3af]">
          Pre-market quotes can be thin and volatile · not investment advice.
        </footer>
      </div>
    </main>
  );
}
