import type { Metadata } from "next";
import { ShouldIBuyInteractive } from "@/components/should-i-buy-interactive";
import { ShouldIBuyLandingSections } from "@/components/should-i-buy-landing-sections";
import { FreeToolBreadcrumb, FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { ShareLinkBar } from "@/components/marketing/share-link-bar";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "Free Should I Buy Stock Checker",
  description:
    "Check any US stock across valuation, growth, quality and momentum. See the current call, then add it to Watchlist for ongoing research.",
  alternates: { canonical: "/should-i-buy" },
  openGraph: {
    title: "Free Should I Buy Stock Checker · stocksbrew",
    description:
      "Enter any US ticker for valuation, growth, quality, momentum and the current call. Add it to Watchlist for alerts.",
    url: "https://www.stocksbrew.online/should-i-buy",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Should I Buy Stock Checker · stocksbrew",
    description:
      "Enter any US ticker for valuation, growth, quality, momentum and the current call. Add it to Watchlist for alerts.",
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
      <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
        <FreeToolBreadcrumb title="Should I Buy?" />
      </div>
      <ShouldIBuyInteractive searchIndex={searchIndex} isSubscribed={isSubscribed} />
      <ShouldIBuyLandingSections />
      <div className="mx-auto w-full max-w-screen-2xl px-6 pb-14 md:px-10 lg:px-16 flex flex-col gap-10">
        <ShareLinkBar url="/should-i-buy" title="Free Should I Buy stock checker — stocksbrew" />
        <FreeToolRelated currentHref="/should-i-buy" />
      </div>
    </main>
  );
}
