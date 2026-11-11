import { MarketsGhost } from "@/app/(app)/explore/ghosts";
import { PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** Market today's shape while it loads: the title, the read with its three points, then the market sections. */
export default function ExploreLoading() {
  return (
    <SkeletonFrame label="Loading today's market">
      <PageHeadGhost lede={0} />
      <div className="flex flex-col gap-4">
        <PanelGhost rows={3} lines={2} />
        <MarketsGhost />
      </div>
    </SkeletonFrame>
  );
}
