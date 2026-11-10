import { PageHeadGhost, PanelGhost, SkeletonFrame, TabRowGhost } from "@/components/oa/kit/skeleton";

/** The Today tab's shape: head, four tabs, the explained moves, then Reddit beside the policy posts. */
export default function SignalsLoading() {
  return (
    <SkeletonFrame label="Loading signals">
      <PageHeadGhost meta />
      <TabRowGhost count={4} className="!mb-3 lg:!mb-4" />
      <PanelGhost rows={5} lines={2} className="mb-5" />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <PanelGhost rows={5} />
        <PanelGhost rows={5} />
      </div>
    </SkeletonFrame>
  );
}
