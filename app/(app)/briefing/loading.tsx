import { Bar, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The briefing's shape: the head, the strip of figures, then the modules in one column (no rail). */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading your briefing">
      <div className="flex max-w-[60rem] flex-col gap-6">
        <div className="px-2 sm:px-0">
          <Bar className="h-6 w-72 max-w-full" />
        </div>
        <Bar className="h-[4.25rem] w-full" />
        <PanelGhost rows={2} lines={2} />
        <PanelGhost rows={3} />
      </div>
    </SkeletonFrame>
  );
}
