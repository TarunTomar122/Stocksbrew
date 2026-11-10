import { PageHeadGhost, PanelGhost, SkeletonFrame, TabRowGhost } from "@/components/oa/kit/skeleton";

/** Follow's shape: the title, three tabs, then the directory table. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading follow">
      <PageHeadGhost lede={0} />
      <TabRowGhost count={3} />
      <PanelGhost rows={14} />
    </SkeletonFrame>
  );
}
