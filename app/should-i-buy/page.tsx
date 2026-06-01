import type { Metadata } from "next";
import { ShouldIBuyInteractive } from "@/components/should-i-buy-interactive";
import { ShouldIBuyLandingSections } from "@/components/should-i-buy-landing-sections";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "Free Should I Buy Stock Checker",
  description:
    "Free AI scorecard for any US stock. Valuation, growth, quality, and momentum scores with a clear buy/hold/avoid signal. Add to Radar for ongoing briefs.",
  alternates: { canonical: "/should-i-buy" },
  openGraph: {
    title: "Free Should I Buy Stock Checker · stocksbrew",
    description:
      "Enter any US ticker and get a data-driven buy/hold/avoid signal. Free tool tied to Radar alerts.",
    url: "https://www.stocksbrew.online/should-i-buy",
  },
  twitter: {
    title: "Free Should I Buy Stock Checker · stocksbrew",
    description:
      "Enter any US ticker and get a data-driven buy/hold/avoid signal. Free tool tied to Radar alerts.",
  },
};

export default async function ShouldIBuyPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [searchIndex, userDoc] = await Promise.all([
    getSearchIndex(market).catch(() => []),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);

  return (
    <main className="flex-grow">
      <ShouldIBuyInteractive searchIndex={searchIndex} isSubscribed={isSubscribed} />
      <ShouldIBuyLandingSections />
    </main>
  );
}
