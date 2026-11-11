import type { Metadata } from "next";

import { JsonLd } from "@/components/docs/json-ld";
import { AppPage, PageHead } from "@/components/oa/kit";
import { MyStocksBody } from "@/components/portfolio-home/my-stocks";
import { loadPortfolioHome } from "@/lib/portfolio-home/server";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio");

const LEDE = "How your stocks did, and the one thing that matters for each of them right now.";

/**
 * The My stocks overview (owner, Nov 11: "more useful stuff about my stocks"): how the person's stocks did against
 * the S&P 500, then every holding as a card with its move, their gain, our call and the one thing that matters for
 * it now (lib/portfolio-home/stocks.ts), the portfolio tools as one line of links, and their agents in the side
 * rail. The signed-out page is the same layout on the example portfolio. Loads: lib/portfolio-home/server.ts.
 */
export default function PortfolioHomePage() {
  const load = loadPortfolioHome();
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio")} />
      <PageHead title="My stocks" lede={LEDE} />
      <MyStocksBody load={load} />
    </AppPage>
  );
}
