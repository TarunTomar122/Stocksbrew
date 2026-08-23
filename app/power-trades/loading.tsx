import { Skeleton } from "@/components/power-trades-feed";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <Skeleton />
    </div>
  );
}
