function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function StockScreenerSkeleton() {
  return (
    <section aria-hidden>
      <Bone className="h-6 w-36" />
      <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant md:grid md:min-h-[32rem] md:grid-cols-[16rem_1fr]">
        <div className="min-w-0 md:border-r md:border-outline-variant">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-outline-variant/70 px-4 py-3.5 first:border-t-0">
              <Bone className="h-3 w-32" />
              <Bone className="h-3 w-5" />
            </div>
          ))}
        </div>
        <div className="hidden min-w-0 md:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-outline-variant/70 px-5 py-3 first:border-t-0">
              <Bone className="h-7 w-7 rounded-full" />
              <div className="min-w-0 flex-1">
                <Bone className="h-3 w-14" />
                <Bone className="mt-1.5 h-2.5 w-40" />
              </div>
              <Bone className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ExplorePageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <section aria-hidden className="border-b border-outline-variant pb-8">
        <Bone className="h-6 w-40" />
        <div className="mt-4 flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-[104px] w-40 shrink-0 rounded-xl sm:w-44" />
          ))}
        </div>
      </section>
      <StockScreenerSkeleton />
    </div>
  );
}
