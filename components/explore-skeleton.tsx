const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-oa-secondary ${className}`} aria-hidden />;
}

function TrendingSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-6 w-52" />
      <Bone className="mt-2 h-4 w-56" />
      <div className="mt-5 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-44 shrink-0 space-y-3 rounded-[22px] border border-oa-border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:rounded-[26px]">
            <div className="flex items-center gap-2">
              <Bone className="size-6 !rounded-full" />
              <Bone className="h-4 w-14" />
            </div>
            <Bone className="h-5 w-20" />
            <Bone className="h-3.5 w-14" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ScanRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <Bone className="mt-0.5 size-8 shrink-0 !rounded-full" />
      <div className="w-28 shrink-0 space-y-1.5 sm:w-44">
        <Bone className="h-4 w-16" />
        <Bone className="h-3 w-full max-w-28" />
      </div>
      <Bone className="h-6 w-32 shrink-0" />
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
        <Bone className="h-4 w-16" />
        <Bone className="h-3 w-12" />
      </div>
    </div>
  );
}

function ScansSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-7 w-44" />
      <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-oa-border bg-oa-bg p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className={`h-9 ${i === 0 ? "w-24" : "w-20"}`} />
        ))}
      </div>
      <Bone className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-4 overflow-hidden rounded-[26px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:rounded-[50px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <ScanRowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function ExplorePageSkeleton() {
  return (
    <div className={`${FRAME} flex flex-col gap-12 py-8 sm:gap-16 sm:py-12`}>
      <header className="max-w-2xl space-y-4" aria-hidden>
        <Bone className="h-10 w-4/5" />
        <Bone className="h-10 w-3/5" />
        <Bone className="mt-6 h-4 w-full max-w-lg" />
      </header>

      <TrendingSkeleton />

      <ScansSkeleton />
    </div>
  );
}
