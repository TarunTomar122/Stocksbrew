import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/**
 * The portfolio view before its numbers arrive: the totals card, the tab row
 * and the positions table, each the size of the real one so nothing moves
 * when it lands. Used by the route's loading state and by the page's own
 * Suspense boundaries.
 */
export function PortfolioGhost() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the portfolio">
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-3 py-3">
          <div>
            <Bar className="h-3 w-28" />
            <Bar className="mt-2.5 h-9 w-48" />
            <Bar className="mt-2 h-3 w-20" />
          </div>
          {[0, 1].map((index) => (
            <div key={index}>
              <Bar className="h-3 w-16" />
              <Bar className="mt-2.5 h-5 w-24" />
              <Bar className="mt-2 h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="border-t border-oa-border px-3 py-1.5">
          <Bar className="my-0.5 h-3 w-80 max-w-full" />
        </div>
      </div>
      <div className="-mx-2 flex h-[41px] items-center gap-6 overflow-hidden border-b border-oa-border px-4 sm:mx-0 sm:px-3">
        {[0, 1, 2, 3].map((index) => (
          <Bar key={index} className="h-3.5 w-16 shrink-0" />
        ))}
      </div>
      <PanelGhost rows={7} />
    </div>
  );
}
