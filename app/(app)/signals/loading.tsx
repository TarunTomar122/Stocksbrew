import { PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The page's shape, no tabs: head, the Reddit table, then the President's posts under it. */
export default function SignalsLoading() {
  return (
    <SkeletonFrame label="Loading signals">
      <PageHeadGhost lede={0} />
      <PanelGhost rows={8} lines={2} className="mb-5" />
      <PanelGhost rows={6} />
    </SkeletonFrame>
  );
}
