import { HeroSection } from "@/components/hero-section";
import { getSessionUser } from "@/lib/auth-server";
import { getHeroIndices } from "@/lib/hero-indices";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function HomeHeroStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [indices, userDoc] = await Promise.all([
    getHeroIndices(market),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);

  return (
    <HeroSection
      indices={indices}
      isSubscribed={isSubscribed}
      showIndexSkeleton={false}
    />
  );
}
