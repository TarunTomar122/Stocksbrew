import { PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** Market today's shape while it loads: the title, the read with its three points, the sectors, then the directory. */
export default function ExploreLoading() {
  return (
    <SkeletonFrame label="Loading today's market">
      <PageHeadGhost lede={0} />
      <div className="mb-4">
        <PanelGhost rows={3} lines={2} />
      </div>
      <div className="mb-5">
        <PanelGhost rows={6} />
      </div>
      <PanelGhost rows={6} lines={2} />
    </SkeletonFrame>
  );
}
