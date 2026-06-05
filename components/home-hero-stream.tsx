import { HeroSection, type HeroSpotlight } from "@/components/hero-section";
import { getSessionUser } from "@/lib/auth-server";
import { getHeroIndices } from "@/lib/hero-indices";
import { getCurrentMarket } from "@/lib/market";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getContrarianCalls, type ContrarianCard } from "@/lib/contrarian";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function pickSpotlight(
  anomalies: Awaited<ReturnType<typeof getDailyAnomalies>>,
): HeroSpotlight | null {
  const rows = anomalies?.anomalies ?? [];
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

// Tasteful float presets so the real cards keep the scattered hero feel.
const ROTATIONS = ["-2.5deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg"];
const OFFSETS = [
  "-translate-y-1 translate-x-2",
  "translate-x-6",
  "translate-y-1 -translate-x-1",
  "translate-y-1 translate-x-2",
  "-translate-x-5",
  "translate-y-1 translate-x-1",
];

function toChips(cards: ContrarianCard[]) {
  return cards.map((c, i) => ({
    ticker: c.ticker,
    name: c.name,
    verdict: c.our_stance,
    directive: c.reason,
    dayChangePct: c.day_change_pct ?? 0,
    rotate: ROTATIONS[i % ROTATIONS.length],
    offsetClass: OFFSETS[i % OFFSETS.length],
  }));
}

export async function HomeHeroStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [indices, userDoc, anomalies, contrarian] = await Promise.all([
    getHeroIndices(market),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
    getDailyAnomalies(market).catch(() => null),
    getContrarianCalls(market).catch(() => null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const spotlight = pickSpotlight(anomalies);

  const cards = contrarian?.cards ?? [];
  const chips = toChips(cards);
  const leftChips = chips.slice(0, 3);
  const rightChips = chips.slice(3, 6);
  const mobileChips = chips.slice(0, 4);

  return (
    <HeroSection
      indices={indices}
      isSubscribed={isSubscribed}
      showIndexSkeleton={false}
      spotlight={spotlight}
      leftChips={leftChips}
      rightChips={rightChips}
      mobileChips={mobileChips}
    />
  );
}
