import type { Metadata } from "next";

import { JsonLd } from "@/components/docs/json-ld";
import { PortfolioAnalyzer } from "@/components/portfolio-analyzer";
import { FreeToolRelated } from "@/components/marketing/free-tool-chrome";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/analyze");

export default async function PortfolioPage() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market);

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <JsonLd data={toolPageLd("/portfolio/analyze")} />
      <PortfolioAnalyzer searchIndex={searchIndex} />
      <div className="mx-auto w-full max-w-[76rem] px-4 pb-14 sm:px-6">
        <FreeToolRelated currentHref="/portfolio/analyze" />
      </div>
    </main>
  );
}
