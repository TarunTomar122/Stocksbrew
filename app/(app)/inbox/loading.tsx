import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { PageHeadGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

export default function Loading() {
  return (
    <SkeletonFrame label="Loading your inbox" className="max-w-[68rem]">
      <PageHeadGhost lede={0} />
      <InboxSkeleton />
    </SkeletonFrame>
  );
}
