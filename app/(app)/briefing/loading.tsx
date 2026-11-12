import { Bar, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The briefing's shape: the head, the read across the page, then the stocks on the left and the rail on the right. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading your briefing">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-5">
        <div className="px-2 sm:px-0 lg:col-span-2">
          <Bar className="h-6 w-80 max-w-full" />
          <Bar className="mt-3 h-3.5 w-96 max-w-full" />
        </div>
        {/* The read across the page, then the stocks beside the rail, as the page lays them out. */}
        <div className="min-w-0 lg:col-span-2">
          <PanelGhost rows={2} lines={2} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PanelGhost rows={3} lines={2} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PanelGhost rows={8} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
