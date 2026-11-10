import { PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The baskets' shape: title, then one ranked table of ideas. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading themes">
      <PageHeadGhost lede={0} />
      <PanelGhost rows={10} lines={2} />
    </SkeletonFrame>
  );
}
