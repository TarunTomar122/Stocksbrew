import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** The cross-asset strip while the market data loads. */
export function StripGhost() {
  return (
    <div className="oa-surface flex gap-4 overflow-hidden border border-oa-border bg-oa-card px-3 py-3" aria-busy="true">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="min-w-[8rem] flex-1">
          <Bar className="h-3 w-12" />
          <Bar className="mt-2 h-4 w-20" />
          <Bar className="mt-1.5 h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * The day's moves: two tables, gainers beside losers (./move-tables.tsx). It carries the section's id, so a link to
 * /explore#moves (where /movers lands) has its place on the page before the moves arrive.
 */
export function MovesGhost() {
  return (
    <div id="moves" className="scroll-mt-20" aria-busy="true">
      <Bar className="mx-2 mb-2 h-5 w-40 sm:mx-3" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[0, 1].map((side) => (
          <div key={side} className={`oa-surface border border-oa-border bg-oa-card ${side ? "max-md:hidden" : ""}`}>
            <div className="flex h-10 items-center border-b border-oa-border px-3.5">
              <Bar className="h-3.5 w-24" />
            </div>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex h-[3.25rem] items-center gap-3 border-b border-oa-border px-3.5 last:border-b-0">
                <Bar className="h-4 w-16" />
                <Bar className="h-3.5 flex-1" />
                <Bar className="h-4 w-12" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The strip, the stock moves, the sector list and the market cards, for the route's loading file. */
export function MarketsGhost() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <StripGhost />
      <MovesGhost />
      <PanelGhost rows={4} />
      <div className="mt-4">
        <Bar className="mx-2 mb-2 h-5 w-32 sm:mx-3" />
        <MarketCardsGhost className="mt-2" />
      </div>
    </div>
  );
}

/** "More markets": six cards, as components/markets/market-cards.tsx lays them out. */
export function MarketCardsGhost({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-busy="true">
      {/* The "More markets" title row the cards arrive with (components/markets/market-cards.tsx). */}
      <Bar className="mx-2 mb-2 h-5 w-32 sm:mx-3" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="oa-surface border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3">
            <Bar className="h-3 w-24" />
            <Bar className="mt-3 h-7 w-20" />
            <Bar className="mt-1.5 h-3 w-40" />
            <Bar className="mt-3 h-4 w-full" />
            <Bar className="mt-1.5 h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
