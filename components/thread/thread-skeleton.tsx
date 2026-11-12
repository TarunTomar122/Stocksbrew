import { Bar } from "@/components/oa/kit/skeleton";

/**
 * /agent's shape while it loads, one column as the page is: two proposal cards side by side under "Needs you", the
 * record's first lines, and the reply box. Nothing shifts sideways when the content arrives.
 */
export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-5">
      <div>
        <Bar className="mb-2 ml-1 h-4 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((card) => (
            <div key={card} className="oa-surface border border-oa-border bg-oa-card px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Bar className="size-7 rounded-md" />
                <Bar className="h-3.5 w-20" />
              </div>
              <Bar className="mt-3 h-3.5 w-3/4" />
              <Bar className="mt-2 h-3 w-1/2" />
              <Bar className="mt-3 h-1.5 w-full" />
              <div className="mt-3 flex gap-2">
                <Bar className="h-8 w-20 rounded-lg" />
                <Bar className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <Bar className="mb-2 ml-1 h-4 w-20" />
        <div className="oa-surface divide-y divide-oa-border border border-oa-border bg-oa-card">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <Bar className="size-[22px] rounded-full" />
              <Bar className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <Bar className="h-12 w-full rounded-[22px]" />
    </div>
  );
}
