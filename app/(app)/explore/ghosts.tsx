import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** The cross-asset strip, the sector bars and what moved, while the market read loads. Shared by the page and its loading file. */
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
      <PanelGhost rows={6} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <PanelGhost rows={6} lines={2} />
        <PanelGhost rows={6} />
      </div>
    </div>
  );
}
