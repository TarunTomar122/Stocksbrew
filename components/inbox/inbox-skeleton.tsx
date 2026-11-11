import { Bar } from "@/components/oa/kit/skeleton";

/**
 * The inbox while it loads, in the final layout: the read (a headline and its
 * cards), then the list's chip row and eight rows under a day heading.
 */
export function InboxSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your inbox" className="flex flex-col gap-3 sm:gap-4">
      <div className="oa-surface border border-oa-border bg-oa-card px-4 pb-3.5 pt-3.5 sm:px-5 sm:pb-4 sm:pt-4">
        <Bar className="h-5 w-[30rem] max-w-[90%]" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <div key={card} className={`oa-surface border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 ${card > 0 ? "hidden sm:block" : ""}`}>
              <Bar className="h-7 w-12" />
              <Bar className="mt-1.5 h-3 w-20" />
              <Bar className="mt-3 h-3.5 w-full" />
              <Bar className="mt-2 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex items-center gap-2 border-b border-oa-border px-3 py-2.5 sm:px-4">
          {["w-14", "w-20", "w-24", "w-16"].map((width, index) => (
            <Bar key={index} className={`h-8 shrink-0 rounded-md ${width}`} />
          ))}
          <Bar className="ml-auto hidden h-4 w-28 sm:block" />
        </div>
        <div className="border-b border-oa-border bg-oa-bg px-4 py-2">
          <Bar className="h-3 w-12" />
        </div>
        <ul className="divide-y divide-oa-border">
          {Array.from({ length: 8 }, (_, row) => (
            <li key={row} className="flex items-start gap-3 px-4 py-3">
              <Bar className="size-7 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <Bar className={`h-3.5 ${row % 3 === 0 ? "w-11/12" : row % 3 === 1 ? "w-4/5" : "w-2/3"}`} />
                <Bar className="mt-2 h-3 w-40 max-w-[60%]" />
              </div>
              <Bar className="size-6 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
