import { PageHeadGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";
import { ThreadSkeleton } from "@/components/thread/thread-skeleton";

export default function Loading() {
  return (
    <SkeletonFrame label="Loading your agent">
      <PageHeadGhost lede={0} />
      <ThreadSkeleton />
    </SkeletonFrame>
  );
}
