import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** The thread's shape while it loads: a few notes under a day divider, the reply box, and the rail. */
export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-6">
      <div className="flex min-w-0 flex-col gap-3">
        <Bar className="mx-auto h-3 w-32" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-start gap-3">
            <Bar className="hidden size-8 rounded-full sm:block" />
            <div className="flex-1 rounded-2xl border border-oa-border bg-oa-card px-4 py-3">
              <Bar className="h-3.5 w-3/4" />
              <Bar className="mt-2 h-3 w-1/2" />
            </div>
          </div>
        ))}
        <Bar className="mt-2 h-12 w-full rounded-[22px]" />
      </div>
      <div className="hidden flex-col gap-4 lg:flex">
        <PanelGhost rows={3} />
      </div>
    </div>
  );
}
