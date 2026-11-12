import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { JsonLd } from "@/components/docs/json-ld";
import { AppPage, PageHead } from "@/components/oa/kit";
import { MyStocksBody } from "@/components/portfolio-home/my-stocks";
import { HoldingsStream } from "@/components/portfolio/holdings-stream";
import { MyStocksTabs } from "@/components/portfolio/my-stocks-tabs";
import { PortfolioGhost } from "@/components/portfolio/portfolio-ghost";
import { loadPortfolioHome } from "@/lib/portfolio-home/server";
import { myStocksTab } from "@/lib/portfolio-shared";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio");

type Search = Record<string, string | string[] | undefined>;

/**
 * My stocks, the one home for what a person owns and watches (owner, Nov 11: "more useful stuff about my stocks").
 * The overview: every holding as a card with its price, day, our call and the one thing that matters for it now
 * (lib/portfolio-home/stocks.ts), then the weekly memo's figures and their agents as cards in the same columns, with
 * no side rail (components/portfolio-home/my-stocks.tsx). Its tabs open the holdings editor (Holdings, Watching, Alerts: components/portfolio/holdings-stream,
 * which was /watchlist) and Taxes. Signed out, every view is the example portfolio. The overview's loads are only
 * started on the overview, and the editor's only on its tabs.
 */
export default function PortfolioHomePage({ searchParams }: { searchParams?: Search }) {
  // Taxes is its own page; a ?tab=taxes link goes there.
  if (String(searchParams?.tab ?? "").toLowerCase() === "taxes") redirect("/portfolio/taxes");
  const tab = myStocksTab(searchParams);
  // Both views at the dashboard width (90rem), so the title and tabs do not move between them; the overview's cards
  // run four across there (components/portfolio-home/fit.ts).
  if (tab) {
    return (
      <AppPage width="dash">
        <JsonLd data={toolPageLd("/portfolio")} />
        <PageHead title="My stocks" note={false} />
        <Suspense fallback={<PortfolioGhost />}>
          <HoldingsStream tab={tab} />
        </Suspense>
      </AppPage>
    );
  }
  const load = loadPortfolioHome();
  return (
    <AppPage width="dash">
      <JsonLd data={toolPageLd("/portfolio")} />
      <PageHead title="My stocks" note={false} />
      <MyStocksTabs current="overview" />
      <MyStocksBody load={load} />
    </AppPage>
  );
}
