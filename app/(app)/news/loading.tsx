import { ChipRowGhost, PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The wire's shape: title row with the search, the read, the stories beside the most-talked-about stocks, then the chips and cards. */
export default function NewsLoading() {
  return (
    <SkeletonFrame label="Loading the wire">
      <PageHeadGhost lede={0} />
      <div className="mb-4">
        <PanelGhost rows={3} lines={2} />
      </div>
      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-5">
        <PanelGhost rows={5} lines={2} />
        <div className="max-lg:hidden">
          <PanelGhost rows={10} />
        </div>
      </div>
      <ChipRowGhost count={7} className="mb-3 !flex-nowrap overflow-hidden" />
    </SkeletonFrame>
  );
}
