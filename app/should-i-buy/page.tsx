import type { Metadata } from "next";
import { ShouldIBuyInteractive } from "@/components/should-i-buy-interactive";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "Should I Buy a Stock Right Now? | stocksbrew",
  description:
    "Enter any stock ticker and get a data-driven buy/hold/avoid signal based on valuation, growth, quality, and momentum scores. Free tool by stocksbrew.",
  openGraph: {
    title: "Should I Buy a Stock Right Now? | stocksbrew",
    description:
      "Enter any stock ticker and get a data-driven buy/hold/avoid signal based on valuation, growth, quality, and momentum scores.",
    url: "https://www.stocksbrew.online/should-i-buy",
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
    </main>
  );
}
