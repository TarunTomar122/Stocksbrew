import { Bar, PageHeadGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** What you own: the title, then the first module's three figure cards and its sector chart, in the same grid. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading what you own">
      <PageHeadGhost lede={0} meta />
      <Bar className="mb-2 h-5 w-40" />
      <div className="grid grid-cols-1 gap-3 md:[grid-template-columns:repeat(auto-fill,304px)] md:gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="oa-surface flex flex-col gap-2 border border-oa-border bg-oa-card px-4 py-3">
            <Bar className="h-3 w-24" />
            <Bar className="h-8 w-20" />
            <Bar className="h-3 w-40" />
          </div>
        ))}
        <div className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card p-4 md:col-span-2">
          <Bar className="h-4 w-32" />
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Bar key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
