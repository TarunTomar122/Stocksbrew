import { Bar, PageHeadGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/**
 * Analysis: the title and the section links, then the first module as it lays out: the sectors table (7 columns)
 * beside the three figures stacked (5), figures first on a phone.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading the analysis" width="dash">
      <PageHeadGhost lede={0} meta />
      <Bar className="mb-6 h-4 w-80 max-w-full lg:mb-8" />
      <Bar className="mb-2 h-5 w-40" />
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="flex flex-col gap-3 lg:order-2 lg:col-span-5 lg:gap-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="oa-surface flex flex-col gap-2 border border-oa-border bg-oa-card px-4 py-3">
              <Bar className="h-3 w-24" />
              <Bar className="h-8 w-20" />
              <Bar className="h-3 w-40" />
            </div>
          ))}
        </div>
        <div className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card p-4 lg:order-1 lg:col-span-7">
          <Bar className="h-4 w-32" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Bar key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
