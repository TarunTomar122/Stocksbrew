import { Suspense } from "react";

import { PortfolioAskHint } from "@/components/ask/portfolio-ask-hint";
import { SharesPrompt } from "@/components/import/shares-prompt";
import { FoldScope } from "@/components/portfolio-home/fold-cards";
import { ExampleLine } from "@/components/portfolio-home/home";
import { StockList, StockListGhost } from "@/components/portfolio-home/stocks";
import { WeekBand } from "@/components/portfolio-home/week";
import { FollowedRebalances } from "@/components/strategies/rebalance-notice";
import type { HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview under its title: every holding as a card with the one thing that matters for it, then the
 * weekly memo's figures and the person's agents, all cards of ONE grid with no side rail (owner, Nov 12: "empty space
 * on left side, u didn't fix all possible cases"). Each part starts in whatever the one before it left of its last
 * row, so every row ends full (./fit.ts). The holdings stream in as soon as their sources answer; the memo and
 * agents join them once their own reads are in (React's Suspense adds no element, so they are still grid cells).
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
      <FoldScope>
        {/* The ones that need a look, then the quiet rest behind one button; the grid never scrolls inside. */}
        <Suspense fallback={<StockListGhost />}>
          <StockList load={load} />
        </Suspense>
        {/* The memo and the agents, in the cells the holdings leave and on (./week.tsx). */}
        <Suspense fallback={null}>
          <WeekBand load={load} />
        </Suspense>
      </FoldScope>
      <div className="mt-6 flex min-w-0 flex-col gap-6 empty:hidden">
        {/* Pro: a followed strategy that rebalanced in the last few days. Nothing at all otherwise. */}
        <Suspense fallback={null}>
          <FollowedRebalances />
        </Suspense>
        {/* No tools card: the tools are in the nav (owner, Nov 12: "remove this"). */}
        {/* No Ask box here: the shell's Ask opens on this page's stocks with its questions (owner rule 1). */}
        <Suspense fallback={null}>
          <PortfolioAskHint load={load} />
        </Suspense>
      </div>
    </>
  );
}
