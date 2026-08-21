function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

/** Content-only skeleton for Suspense fallbacks inside a page shell. */
export function MarketFeedStreamSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-oa-border bg-oa-card p-4">
            <div className="flex items-center gap-3">
              <Bone className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Bone className="h-4 w-24" />
                <Bone className="h-3 w-full" />
              </div>
              <Bone className="h-4 w-14" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic market feed page — anomalies, reddit, events, premarket. */
export function MarketFeedPageSkeleton() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <div className="flex flex-col gap-3">
          <Bone className="h-3 w-32" />
          <Bone className="h-10 w-72 max-w-full" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
        <MarketFeedStreamSkeleton />
      </div>
    </main>
  );
}

export function SectorPageSkeleton() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-6 py-12 md:px-10 lg:px-16">
        <Bone className="h-3 w-40" />
        <div className="rounded-xl border border-oa-border bg-oa-card p-8 md:p-10">
          <Bone className="h-4 w-36" />
          <Bone className="mt-6 h-12 w-64" />
          <Bone className="mt-4 h-4 w-full max-w-2xl" />
          <Bone className="mt-2 h-4 w-[88%] max-w-2xl" />
        </div>
        <div className="rounded-xl border border-oa-border bg-oa-card p-6">
          <Bone className="mb-4 h-4 w-48" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-oa-border/50 py-3 first:border-t-0">
              <Bone className="h-4 w-12" />
              <Bone className="h-3 flex-1" />
              <Bone className="h-3 w-16" />
              <Bone className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export function EarningsCalendarPageSkeleton() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-8 px-6 py-12 md:px-10 lg:px-16">
        <div className="flex w-full max-w-[960px] flex-col gap-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-10 w-80 max-w-full" />
          <Bone className="h-4 w-full max-w-xl" />
        </div>
        <Bone className="h-[420px] w-full max-w-[960px] rounded-2xl" />
      </div>
    </main>
  );
}

export function PortfolioRebalancePageSkeleton() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-10 md:px-10 md:py-12 lg:px-12">
        <div className="flex flex-col gap-3 border-b border-[var(--oa-bg)] pb-6">
          <Bone className="h-3 w-16" />
          <Bone className="h-9 w-48" />
          <Bone className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <Bone className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Bone className="h-[420px] rounded-2xl" />
          <Bone className="h-[420px] rounded-2xl" />
        </div>
      </div>
    </main>
  );
}

export function RadarDiagnosisSectionSkeleton() {
  return (
    <section className="flex flex-col gap-8" aria-busy="true" aria-label="Loading diagnosis">
      <div className="border-t border-oa-border/60 pt-8">
        <Bone className="h-3 w-24" />
        <Bone className="mt-3 h-6 w-40" />
      </div>
      <Bone className="h-4 w-full max-w-2xl" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Bone className="h-56 rounded-xl" />
        <Bone className="h-56 rounded-xl" />
      </div>
      <Bone className="h-40 rounded-xl" />
    </section>
  );
}

export function RadarEarningsRailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading earnings">
      <Bone className="h-24 w-full rounded-xl" />
    </div>
  );
}

export function SectorConstituentsSkeleton() {
  return (
    <>
      <div className="rounded-xl border border-oa-border bg-oa-card p-6" aria-busy="true">
        <Bone className="mb-4 h-4 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-oa-border/50 py-3 first:border-t-0">
            <Bone className="h-4 w-12" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-oa-border bg-oa-card p-6">
        <Bone className="mb-4 h-4 w-24" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}

/** Neutral route transition shell — not the marketing homepage. */
export function RouteLoadingShell() {
  return (
    <main className="flex-grow" aria-busy="true" aria-label="Loading page">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 py-12 md:px-10 md:py-16">
        <Bone className="h-3 w-24" />
        <Bone className="h-9 w-64 max-w-full" />
        <Bone className="h-4 w-96 max-w-full" />
        <Bone className="mt-2 h-56 w-full rounded-2xl" />
      </div>
    </main>
  );
}

export function SubscribePageSkeleton() {
  return (
    <main className="flex-grow bg-background" aria-busy="true" aria-label="Loading pricing">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-4 py-12 sm:px-6 md:py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <Bone className="h-4 w-28" />
          <Bone className="h-10 w-72 max-w-full" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <Bone className="h-[420px] w-full rounded-2xl" />
        <div className="flex flex-wrap justify-center gap-4">
          <Bone className="h-3 w-36" />
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-32" />
        </div>
      </div>
    </main>
  );
}

/** Matches the OA stock page layout — header row, call + chart, section plates. */
export function StockPageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full min-w-0 max-w-[76rem] flex-col gap-12 px-4 py-8 sm:gap-16 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="Loading stock"
    >
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Bone className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0">
              <Bone className="h-7 w-52 max-w-full" />
              <Bone className="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <Bone className="h-9 w-28" />
            <Bone className="h-4 w-24" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Bone className="h-8 w-32 rounded-full" />
          <Bone className="h-8 w-20 rounded-full" />
        </div>
      </header>

      {/* the call — pulse plate */}
      <section>
        <div className="rounded-[22px] border border-oa-border bg-oa-bg p-5 sm:rounded-[44px] sm:p-8">
          <Bone className="h-3 w-32" />
          <Bone className="mt-4 h-14 w-56" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="space-y-2.5">
              <Bone className="h-4 w-full max-w-[25rem]" />
              <Bone className="h-4 w-[82%] max-w-[22rem]" />
              <Bone className="h-4 w-[60%] max-w-[16rem]" />
            </div>
            <div>
              <Bone className="h-[200px] w-full rounded-2xl" />
              <div className="mt-3 flex justify-between"><Bone className="h-3 w-14" /><Bone className="h-3 w-14" /><Bone className="h-3 w-14" /><Bone className="h-3 w-14" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* section head + plate */}
      <section>
        <Bone className="h-8 w-72 max-w-full" />
        <Bone className="mt-2.5 h-5 w-96 max-w-full" />
        <div className="mt-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:rounded-[44px] sm:p-8">
          <div className="grid gap-10 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Bone className="h-3 w-20" />
                <Bone className="h-2.5 w-full rounded-full" />
                <Bone className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <Bone className="h-8 w-64 max-w-full" />
        <Bone className="mt-2.5 h-5 w-80 max-w-full" />
        <div className="mt-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:rounded-[44px] sm:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-2.5">
                <Bone className="h-4 w-[70%]" />
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-[84%]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
