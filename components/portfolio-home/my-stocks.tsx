import { Suspense } from "react";

import { PortfolioAskHint } from "@/components/ask/portfolio-ask-hint";
import { SharesPrompt } from "@/components/import/shares-prompt";
import { AgentsPanel, AgentsPanelGhost } from "@/components/portfolio-home/agents-panel";
import { ExampleLine } from "@/components/portfolio-home/home";
import { MemoFigures, StockList, StockListGhost, ToolsCard } from "@/components/portfolio-home/stocks";
import { FollowedRebalances } from "@/components/strategies/rebalance-notice";
import type { HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview under its title: every holding as a card with the one thing that matters for it; in the
 * side rail, the person's agents, the weekly memo's figures and a card of tools. Phones get
 * one column in that order. Each part streams in as soon as its own sources answer.
 */
export function MyStocksBody({ load }: { load: HomeLoad }) {
  return (
    <>
      <Suspense fallback={null}>
        <ExampleLine load={load} />
      </Suspense>
      <Suspense fallback={null}>
        <SharesPrompt load={load} />
      </Suspense>
      {/* No summary of how the stocks did on top (owner, Nov 12: the read blocks were "super useless"): the page opens
          on the stocks themselves. */}
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
        {/* On a wide screen the rail stretches to the holdings' height and the memo, last, fills what is left: its rows
            of the week's movers scroll inside on whole rows, so the rail and the holdings end together (owner rule 4). */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4 lg:self-stretch [&>*]:shrink-0">
          <Suspense fallback={<AgentsPanelGhost />}>
            <AgentsPanel load={load} />
          </Suspense>
          {/* At least the memo's header, its figure and one whole row of movers (13rem), so the card is never cut mid-row. */}
          <div data-memo-box className="relative min-w-0 lg:min-h-[13rem] lg:!shrink lg:flex-1 [&:not(:has(a))]:hidden">
            <div className="lg:absolute lg:inset-x-0 lg:top-0 lg:flex lg:max-h-full lg:flex-col">
              <Suspense fallback={null}>
                <MemoFigures load={load} />
              </Suspense>
            </div>
          </div>
          {/* The tools last, as one card of small tiles (owner, Nov 12), under the memo on a phone too. */}
          <Suspense fallback={null}>
            <ToolsCard load={load} />
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
