function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

export function LandingTapeSkeleton() {
  return (
    <div className="w-full overflow-hidden border-b border-outline-variant py-2.5">
      <div className="flex w-full items-center">
        <Bone className="mx-6 hidden h-3 w-12 shrink-0 sm:block md:mx-10 lg:mx-16" />
        <div className="flex min-w-0 flex-1 gap-6 overflow-hidden px-4 sm:px-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Bone key={i} className="h-3 w-28 shrink-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingHeroCommandSkeleton() {
  return (
    <div className="landing-hero-command-wrap relative w-full">
      <div className="landing-hero-command landing-card w-full overflow-hidden">
        <div className="landing-hero-command-chrome flex items-center justify-between border-b px-4 py-2.5">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="landing-hero-traffic-light landing-hero-traffic-light--close" />
            <span className="landing-hero-traffic-light landing-hero-traffic-light--minimize" />
            <span className="landing-hero-traffic-light landing-hero-traffic-light--maximize" />
          </span>
          <Bone className="h-3 w-10" />
        </div>
        <div className="space-y-3 p-4">
          <Bone className="h-3.5 w-44" />
          <div className="inset space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-52" />
                <Bone className="h-3 w-32" />
              </div>
              <Bone className="h-9 w-24 shrink-0 rounded-lg" />
            </div>
            <Bone className="h-[136px] w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-[92%]" />
            <Bone className="h-3 w-[78%]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingHeroSkeleton() {
  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-3xl flex-col items-center" aria-hidden>
        <Bone className="h-10 w-[min(32rem,90%)]" />
        <Bone className="mt-5 h-5 w-[min(38rem,95%)]" />
        <Bone className="mt-2 h-5 w-[min(30rem,82%)]" />
        <Bone className="mt-8 h-14 w-full rounded-2xl" />
        <Bone className="mt-7 h-4 w-[min(28rem,80%)]" />
      </div>
      <div className="mt-10 w-full max-w-4xl sm:mt-12">
        <LandingHeroCommandSkeleton />
      </div>
    </div>
  );
}

function ScannerListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-t border-outline-variant py-4 first:border-t-0"
        >
          <Bone className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-4 w-16" />
            <Bone className="h-3 w-full max-w-[18rem]" />
          </div>
          <div className="shrink-0 space-y-1.5 text-right">
            <Bone className="ml-auto h-4 w-14" />
            <Bone className="ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RedditCardsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-outline-variant p-4">
          <div className="flex items-start gap-2.5">
            <Bone className="h-7 w-7 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-4 w-16" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-[88%]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LandingScannerRedditSkeleton() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-outline-variant p-5 md:p-6 lg:border-b-0 lg:border-r">
              <div className="mb-5 flex items-start gap-3">
                <Bone className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-7 w-56" />
                </div>
              </div>
              <div className="mb-4 flex gap-1.5">
                <Bone className="h-8 w-24 rounded-full" />
                <Bone className="h-8 w-24 rounded-full" />
              </div>
              <ScannerListSkeleton />
            </div>
            <div className="p-5 md:p-6">
              <div className="mb-5 flex items-start gap-3">
                <Bone className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-3 w-20" />
                  <Bone className="h-7 w-52" />
                </div>
              </div>
              <RedditCardsSkeleton />
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-outline-variant px-5 py-4 md:px-6 sm:flex-row sm:justify-between">
            <Bone className="h-3 w-72 max-w-full" />
            <Bone className="h-3 w-36" />
          </div>
        </div>
      </div>
    </section>
  );
}

function SectorPanelSkeleton() {
  return (
    <div className="sector-heat-card overflow-hidden">
      <div className="relative z-[1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bone className="h-9 w-9 shrink-0 rounded-full" />
            <Bone className="h-4 w-24" />
          </div>
          <Bone className="h-4 w-12" />
        </div>
        <Bone className="mb-3 h-2 w-full rounded-full" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingSectorHeatSkeleton() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mb-8 flex items-start gap-3">
          <Bone className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-48" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SectorPanelSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function TerminalLandingPageSkeleton() {
  return (
    <div className="landing-page bg-background text-on-surface">
      <LandingTapeSkeleton />
      <header className="landing-hero-glow relative border-b border-outline-variant">
        <div className="landing-inner py-10 sm:py-14 lg:py-20">
          <LandingHeroSkeleton />
        </div>
      </header>
      <LandingScannerRedditSkeleton />
      <LandingSectorHeatSkeleton />
    </div>
  );
}
