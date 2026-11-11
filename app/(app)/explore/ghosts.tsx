import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** The cross-asset strip, the stock moves beside the sectors, and the folded sections, while the market data loads. Shared by the page and its loading file. */
export function MarketsGhost() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="oa-surface flex gap-4 overflow-hidden border border-oa-border bg-oa-card px-3 py-3">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="min-w-[8rem] flex-1">
            <Bar className="h-3 w-12" />
            <Bar className="mt-2 h-4 w-20" />
            <Bar className="mt-1.5 h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PanelGhost rows={6} lines={2} />
        <PanelGhost rows={8} />
      </div>
      <div className="mt-4">
        <Bar className="mx-2 mb-2 h-5 w-32 sm:mx-3" />
        <div className="border-t border-oa-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="border-b border-oa-border px-2 py-3 sm:px-3"
            >
              <Bar className="h-4 w-48" />
              <Bar className="mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
