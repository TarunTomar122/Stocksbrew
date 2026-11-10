import { Bar, PageHeadGhost, PanelGhost, SkeletonFrame, StatStripGhost } from "@/components/oa/kit/skeleton";

/**
 * The signed-in account's shape (the signed-out page answers at once and
 * rarely shows this): the contents rail, then head, the four-figure strip and
 * the first sections.
 */
export default function AccountLoading() {
  return (
    <SkeletonFrame label="Loading your account">
      <div className="lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-x-10">
        <div className="hidden lg:block">
          <Bar className="mb-3 h-3 w-16" />
          <div className="border-l border-oa-border">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex h-7 items-center pl-3">
                <Bar className={`h-3 ${index % 2 === 0 ? "w-24" : "w-32"}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 max-w-[54rem]">
          <Bar className="mb-5 h-[38px] w-full lg:hidden" />
          <PageHeadGhost lede={0} meta />
          <StatStripGhost count={4} />
          <Bar className="mb-3 mt-9 h-5 w-36" />
          <PanelGhost rows={2} lines={2} />
          <PanelGhost rows={7} className="mt-3" />
        </div>
      </div>
    </SkeletonFrame>
  );
}
