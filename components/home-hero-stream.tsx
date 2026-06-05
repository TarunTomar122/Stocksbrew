import { HeroSection } from "@/components/hero-section";
import { getSessionUser } from "@/lib/auth-server";
import { getHeroIndices } from "@/lib/hero-indices";
import { getCurrentMarket } from "@/lib/market";
import { getContrarianCalls, type ContrarianCard } from "@/lib/contrarian";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

function toChips(cards: ContrarianCard[]) {
  return cards.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    verdict: c.our_stance,
    directive: c.reason,
    dayChangePct: c.day_change_pct ?? 0,
  }));
}

export async function HomeHeroStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [indices, userDoc, contrarian] = await Promise.all([
    getHeroIndices(market),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
    getContrarianCalls(market).catch(() => null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);

  const cards = contrarian?.cards ?? [];
  const chips = toChips(cards.slice(0, 6));

  return (
    <HeroSection
      indices={indices}
      isSubscribed={isSubscribed}
      showIndexSkeleton={false}
      chips={chips}
    />
  );
}
