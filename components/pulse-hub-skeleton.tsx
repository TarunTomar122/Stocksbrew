function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function PremarketSkeleton() {
  return (
    <section className="border-b border-outline-variant pb-8" aria-hidden>
      <div className="flex items-baseline gap-x-2">
        <Bone className="h-6 w-32" />
        <Bone className="h-3 w-14" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <Bone className="h-12 w-20 sm:h-16 sm:w-24" />
          <div>
            <Bone className="h-3 w-10" />
            <Bone className="mt-2 h-4 w-32" />
          </div>
        </div>
        <Bone className="h-16 w-32 rounded-xl" />
      </div>
      <div className="mt-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-8 w-32 rounded-full" />
        ))}
      </div>
      <Bone className="mt-5 h-3 w-24" />
      <div className="mt-2.5 grid grid-cols-4 gap-px overflow-hidden rounded-xl [grid-auto-rows:4.5rem]">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="rounded-none" />
        ))}
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="mt-5">
          <Bone className="h-3 w-20" />
          <div className="mt-2 flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} className="h-[92px] w-40 shrink-0 rounded-xl sm:w-44" />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TodayMoversSkeleton() {
  return (
    <section aria-hidden>
      <div className="flex items-baseline gap-x-2">
        <Bone className="h-6 w-56" />
        <Bone className="h-3 w-14" />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface md:grid md:min-h-[38rem] md:grid-cols-[19rem_1fr]">
        <div className="min-w-0 md:border-r md:border-outline-variant">
          <div className="flex gap-2 border-b border-outline-variant px-4 py-3">
            <Bone className="h-8 w-20 rounded-full" />
            <Bone className="h-8 w-16 rounded-full" />
          </div>
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-outline-variant/70 px-4 py-3 first:border-t-0">
                <Bone className="h-7 w-7 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Bone className="h-3 w-14" />
                  <Bone className="mt-1.5 h-2.5 w-24" />
                </div>
                <Bone className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden min-w-0 p-6 md:block">
          <div className="flex items-center gap-3">
            <Bone className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <Bone className="h-4 w-40" />
              <Bone className="mt-1.5 h-3 w-24" />
            </div>
            <Bone className="h-8 w-32 rounded-full" />
          </div>
          <Bone className="mt-4 h-[180px] w-full rounded-xl" />
          <Bone className="mt-4 h-4 w-3/4" />
          <Bone className="mt-2 h-3 w-full" />
          <Bone className="mt-1.5 h-3 w-5/6" />
        </div>
      </div>
    </section>
  );
}

function RecentEarningsSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-6 w-40" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-outline-variant p-4">
            <div className="flex items-center gap-3">
              <Bone className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1">
                <Bone className="h-3 w-12" />
                <Bone className="mt-1.5 h-2.5 w-14" />
              </div>
              <Bone className="h-6 w-12 rounded-full" />
            </div>
            <Bone className="mt-3 h-3 w-full" />
            <Bone className="mt-1.5 h-3 w-5/6" />
            <Bone className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <Bone className="mt-4 h-3 w-32" />
    </section>
  );
}

export function PulseHubContentSkeleton() {
  return (
    <div className="flex flex-col gap-8 pt-2">
      <PremarketSkeleton />
      <TodayMoversSkeleton />
      <RecentEarningsSkeleton />
    </div>
  );
}

export function PulsePageSkeleton() {
  return <PulseHubContentSkeleton />;
}
