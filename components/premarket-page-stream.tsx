import Link from "next/link";

import { PremarketPageView } from "@/components/premarket-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getSectorRegimes } from "@/lib/sector-regimes";
import { getUserDoc } from "@/lib/watchlist";

export async function PremarketPageStream() {
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

  if (!premarketDoc || !hasRows) {
    return (
      <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#111111]">
          No pre-market snapshot yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6b7280]">
          Gappers populate once pre-market quotes roll in. Check back before the open.
        </p>
        <Link
          href="/pulse"
          className="mt-5 inline-flex rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white"
        >
          Market pulse →
        </Link>
      </div>
    );
  }

  return (
    <PremarketPageView
      movers={premarketDoc}
      premarketLive={premarketLive}
      marketPhase={regimes.macro?.market_phase}
      marketRisk={regimes.macro?.risk_appetite}
      trackedIds={trackedIds}
    />
  );
}
