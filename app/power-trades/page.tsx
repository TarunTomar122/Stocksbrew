import type { Metadata } from "next";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PowerTradesFeed } from "@/components/power-trades-feed";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "Power Trades",
  description:
    "Disclosed stock trades from a curated watchlist of US lawmakers under the STOCK Act, updated daily. See who bought, who sold, and how quickly they filed.",
  alternates: { canonical: "/power-trades" },
  openGraph: {
    title: "Power Trades | stocksbrew",
    description:
      "What US lawmakers bought and sold, straight from STOCK Act filings. Updated daily.",
    url: "https://www.stocksbrew.online/power-trades",
  },
};

export default async function PowerTradesPage() {
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <FreeToolPageFrame toolHref="/power-trades">
        <PowerTradesFeed isPro={isSubscribed} />
      </FreeToolPageFrame>
    </main>
  );
}
