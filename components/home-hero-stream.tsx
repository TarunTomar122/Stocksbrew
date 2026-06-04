import { HeroSection, type HeroSpotlight } from "@/components/hero-section";
import { getSessionUser } from "@/lib/auth-server";
import { getHeroIndices } from "@/lib/hero-indices";
import { getCurrentMarket } from "@/lib/market";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function pickSpotlight(
  anomalies: Awaited<ReturnType<typeof getDailyAnomalies>>,
): HeroSpotlight | null {
  const rows = anomalies?.anomalies ?? [];
  // Prefer a mover that actually carries a written read (headline + reasoning),
  // ranked by how much it moved so the hero shows something live and concrete.
  const candidates = rows
    .filter((row) => {
      const reasoning = row.visual_summary?.why_it_matters || row.today_brief;
      return Boolean(row.headline && reasoning && row.ticker);
    })
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct));
  const top = candidates[0];
  if (!top) return null;
  return {
    ticker: top.ticker,
    name: top.name || top.ticker,
    logoUrl: top.logo_url,
    dayChangePct: top.day_change_pct,
    headline: top.headline as string,
    reasoning: (top.visual_summary?.why_it_matters || top.today_brief) as string,
    verdict: top.overall_label,
  };
}

export async function HomeHeroStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [indices, userDoc, anomalies] = await Promise.all([
    getHeroIndices(market),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
    getDailyAnomalies(market).catch(() => null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const spotlight = pickSpotlight(anomalies);

  return (
    <HeroSection
      indices={indices}
      isSubscribed={isSubscribed}
      showIndexSkeleton={false}
      spotlight={spotlight}
    />
  );
}
