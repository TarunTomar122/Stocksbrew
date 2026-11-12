import { Suspense } from "react";

import { PortfolioAskHint } from "@/components/ask/portfolio-ask-hint";
import { AgentsPanel, AgentsPanelGhost } from "@/components/portfolio-home/agents-panel";
import { ExampleLine } from "@/components/portfolio-home/home";
import { BookLead, BookLeadGhost, MemoFigures, StockList, StockListGhost, ToolLinks } from "@/components/portfolio-home/stocks";
import { FollowedRebalances } from "@/components/strategies/rebalance-notice";
import type { HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview under its title: how the stocks did and every holding as a card with the one thing that
 * matters for it; in the side rail, the person's agents, the weekly memo's figures and the tools as links. Phones get
 * one column in that order. Each part streams in as soon as its own sources answer.
 */
export function MyStocksBody({ load }: { load: HomeLoad }) {
  return (
    <>
      <Suspense fallback={null}>
        <ExampleLine load={load} />
      </Suspense>
      {/* How the stocks did, across the page: the stock list then starts level with the rail and takes its height. */}
      <div className="mb-4 lg:mb-5">
        <Suspense fallback={<BookLeadGhost />}>
          <BookLead load={load} />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Both columns are `contents` on a phone, so their parts join one column in this order. */}
        {/* Every holding shows (./stocks.tsx StockList, a long list scrolls inside on whole rows of cards). */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <Suspense fallback={<StockListGhost />}>
            <StockList load={load} />
          </Suspense>
          {/* Pro: a followed strategy that rebalanced in the last few days. Nothing at all otherwise. */}
          <Suspense fallback={null}>
            <FollowedRebalances />
          </Suspense>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <Suspense fallback={<AgentsPanelGhost />}>
            <AgentsPanel load={load} />
          </Suspense>
          <Suspense fallback={null}>
            <MemoFigures load={load} />
          </Suspense>
          <Suspense fallback={null}>
            <ToolLinks load={load} />
          </Suspense>
          {/* No Ask box here: the shell's Ask opens on this page's stocks with its questions (owner rule 1). */}
          <Suspense fallback={null}>
            <PortfolioAskHint load={load} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
