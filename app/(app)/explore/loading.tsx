import { Bar, PageHeadGhost, PanelGhost, SkeletonFrame, TabRowGhost } from "@/components/oa/kit/skeleton";

/** The desk's shape while its sources load: the title, the market row, the movers, then the wire beside Ask and the calendar. */
export default function ExploreLoading() {
  return (
    <SkeletonFrame label="Loading the research desk">
      <PageHeadGhost lede={0} />
      <TabRowGhost count={4} className="lg:hidden" />
      <div className="mb-4 flex gap-6 overflow-hidden px-2 sm:px-0">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="shrink-0 py-0.5">
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="mb-5">
        <PanelGhost rows={5} lines={2} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PanelGhost rows={9} lines={2} />
        <div className="grid gap-5">
          <PanelGhost rows={3} />
          <PanelGhost rows={4} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
