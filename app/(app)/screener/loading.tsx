import { ChipRowGhost, PageHeadGhost, PanelGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The screener's shape: title row, one row of saved-screen chips (desktop), then the filter bar and the results. */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading the screener">
      <PageHeadGhost lede={0} meta />
      <ChipRowGhost count={5} className="mb-3 !flex-nowrap overflow-hidden max-lg:hidden" />
      <PanelGhost rows={12} />
    </SkeletonFrame>
  );
}
