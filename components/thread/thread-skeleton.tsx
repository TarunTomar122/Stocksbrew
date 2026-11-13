import { Bar } from "@/components/oa/kit/skeleton";

/**
 * /agent's shape while it loads, one column as the page is: a neutral block for "Needs you" (there may be none), the
 * record's first lines, and the reply box. Nothing shifts sideways when the content arrives.
 */
export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-5">
      {/* A neutral block where "Needs you" or the agent's status lands: there may be no proposals to show. */}
      <Bar className="h-14 w-full rounded-lg" />
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
