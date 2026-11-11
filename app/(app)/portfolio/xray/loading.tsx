import { PageHeadGhost, PanelGhost, SkeletonFrame, StatStripGhost } from "@/components/oa/kit/skeleton";

/** The x-ray's shape: title, the read, the numbers strip, then the ten biggest companies. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading what you really own">
      <PageHeadGhost lede={0} meta />
      <PanelGhost rows={3} lines={2} />
      <StatStripGhost count={4} className="mt-3" />
      <PanelGhost rows={10} className="mt-3" />
    </SkeletonFrame>
  );
}
