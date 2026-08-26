const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-oa-secondary ${className}`} aria-hidden />;
}

function PlateFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-oa-border bg-oa-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:rounded-[50px]">
      {children}
    </div>
  );
}

function OpensSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-7 w-44" />
      <Bone className="mt-2 h-4 w-64" />
      <PlateFrame>
        <div className="rounded-[22px] border border-oa-border bg-oa-bg px-5 py-6 sm:rounded-[44px] sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <Bone className="h-3 w-24" />
              <Bone className="mt-3 h-14 w-28" />
              <Bone className="mt-3 h-4 w-32" />
            </div>
            <Bone className="h-[76px] w-36 rounded-[18px]" />
          </div>
          <Bone className="mt-5 h-8 w-40 rounded-full" />
        </div>
      </PlateFrame>
    </section>
  );
}

function LeaningSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-7 w-56" />
      <Bone className="mt-2 h-4 w-72" />
      <PlateFrame>
        <div className="rounded-[22px] border border-oa-border bg-oa-bg px-5 py-6 sm:rounded-[44px] sm:px-8 sm:py-8">
          <div className="grid grid-cols-4 gap-1.5 [grid-auto-rows:4.5rem]">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bone key={i} className="!rounded-[14px]" />
            ))}
          </div>
          <div className="mt-6 space-y-5">
            {[0, 1].map((row) => (
              <div key={row}>
                <Bone className="h-3 w-20" />
                <div className="mt-2 flex gap-3 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Bone key={i} className="h-[92px] w-40 shrink-0 !rounded-[18px] sm:w-44" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PlateFrame>
    </section>
  );
}

function MoverRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Bone className="size-8 shrink-0 !rounded-full" />
      <div className="w-24 shrink-0 space-y-1.5 sm:w-36">
        <Bone className="h-3.5 w-14" />
        <Bone className="h-2.5 w-20" />
      </div>
      <Bone className="h-3.5 w-40" />
      <div className="ml-auto hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <Bone className="h-3.5 w-14" />
        <Bone className="h-2.5 w-12" />
      </div>
    </div>
  );
}

function MoversSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-7 w-64" />
      <Bone className="mt-2 h-4 w-80 max-w-full" />
      <PlateFrame>
        <div className="overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg sm:rounded-[44px]">
          <div className="md:grid md:grid-cols-[22rem_1fr] lg:grid-cols-[26rem_1fr]">
            <div className="min-w-0 md:border-r md:border-oa-border">
              <div className="flex gap-2 px-4 pb-3 pt-4 sm:px-5">
                <Bone className="h-9 w-24 rounded-full" />
                <Bone className="h-9 w-20 rounded-full" />
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <MoverRowSkeleton key={i} />
              ))}
            </div>
            <div className="hidden min-w-0 p-6 md:block">
              <div className="flex items-center gap-3">
                <Bone className="size-10 !rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Bone className="h-4 w-40" />
                  <Bone className="h-3 w-24" />
                </div>
                <Bone className="h-8 w-32 rounded-full" />
              </div>
              <Bone className="mt-4 h-[180px] w-full !rounded-[14px]" />
              <Bone className="mt-4 h-4 w-3/4" />
              <Bone className="mt-2 h-3 w-full" />
              <Bone className="mt-1.5 h-3 w-5/6" />
            </div>
          </div>
        </div>
      </PlateFrame>
    </section>
  );
}

function EarningsSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-7 w-52" />
      <Bone className="mt-2 h-4 w-60" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[22px] border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:rounded-[26px]"
          >
            <div className="flex items-center gap-3">
              <Bone className="size-8 !rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bone className="h-3.5 w-12" />
                <Bone className="h-2.5 w-14" />
              </div>
              <Bone className="h-6 w-12 rounded-full" />
            </div>
            <Bone className="mt-3 h-3 w-full" />
            <Bone className="mt-1.5 h-3 w-5/6" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PulseHubContentSkeleton() {
  return (
    <div className={`${FRAME} loading-screen flex flex-col gap-12 py-8 sm:gap-16 sm:py-12`} aria-busy="true">
      <header className="max-w-2xl space-y-4" aria-hidden>
        <Bone className="h-10 w-4/5" />
        <Bone className="h-10 w-3/5" />
        <Bone className="mt-6 h-4 w-full max-w-lg" />
      </header>

      <OpensSkeleton />
      <LeaningSkeleton />
      <MoversSkeleton />
      <EarningsSkeleton />
    </div>
  );
}

export function PulsePageSkeleton() {
  return <PulseHubContentSkeleton />;
}
