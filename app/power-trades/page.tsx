import type { Metadata } from "next";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PowerTradesFeed } from "@/components/power-trades-feed";

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

export default function PowerTradesPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <FreeToolPageFrame toolHref="/power-trades">
        <PowerTradesFeed />
      </FreeToolPageFrame>
    </main>
  );
}
