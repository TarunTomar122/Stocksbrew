import { PremarketPageView } from "@/components/premarket-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getSectorRegimes } from "@/lib/sector-regimes";
import { getUserDoc } from "@/lib/watchlist";

export async function PremarketPageStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [premarketDoc, report, regimes, userDoc] = await Promise.all([
    getPremarketMovers(market).catch(() => null),
    getPremarketOpeningReport().catch(() => null),
    getSectorRegimes(market).catch(() => ({ sectors: {}, macro: null })),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);

  const premarketLive = isPremarketLive(premarketDoc, market);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks : [];

  return (
    <PremarketPageView
      movers={premarketDoc}
      report={report}
      premarketLive={premarketLive}
      marketPhase={regimes.macro?.market_phase}
      marketRisk={regimes.macro?.risk_appetite}
      trackedIds={trackedIds}
    />
  );
}
