import { ExplorePageSkeleton } from "@/components/explore-skeleton";

export default function ExploreLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[72rem] px-5 py-8 md:px-8 md:py-10">
        <ExplorePageSkeleton />
      </div>
    </main>
  );
}
