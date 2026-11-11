import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the memo's shape (headline and chart, the movers, the cards) while the week's facts load. */
export function MemoGhost() {
  return (
    <div aria-hidden="true" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <Bar className="h-3 w-32" />
          <Bar className="mt-5 h-6 w-full max-w-[30rem]" />
          <Bar className="mt-4 h-[196px] w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((card) => (
            <div key={card} className={`oa-surface border border-oa-border bg-oa-card p-3.5 ${card === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
              <Bar className="h-4 w-14" />
              <Bar className="mt-3 h-6 w-16" />
              <Bar className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((card) => (
            <div key={card} className="oa-surface border border-oa-border bg-oa-card p-3.5">
              <Bar className="h-6 w-16" />
              <Bar className="mt-2 h-4 w-full" />
              <Bar className="mt-6 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <PanelGhost rows={4} lines={2} className="hidden lg:block" />
    </div>
  );
}
