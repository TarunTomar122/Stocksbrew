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

export function LandingHeroSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-12">
      <div className="lg:pb-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">Stocksbrew</p>
        <h1 className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-[-0.045em] text-on-surface sm:text-5xl lg:text-[3.75rem]">
          Analyse and track US stocks with AI
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-on-surface-variant">
          Search any US stock for financials, news and market context.
        </p>
        <div className="mt-7 space-y-3" aria-hidden>
          <Bone className="h-14 w-full rounded-full" />
          <Bone className="h-12 w-44 rounded-full" />
        </div>
      </div>
      <div className="landing-card overflow-hidden" aria-hidden>
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <Bone className="h-3 w-32" />
          <Bone className="h-3 w-20" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-4">
            <div className="flex items-start gap-3">
              <Bone className="h-9 w-9 rounded-lg" />
              <div className="space-y-2">
                <Bone className="h-5 w-36" />
                <Bone className="h-3 w-28" />
              </div>
            </div>
            <Bone className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Bone className="h-3 w-24" />
              <Bone className="h-9 w-40" />
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-4/5" />
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-outline-variant pt-4">
                <Bone className="h-9 w-full" />
                <Bone className="h-9 w-full" />
                <Bone className="h-9 w-full" />
              </div>
            </div>
            <Bone className="min-h-48 h-full w-full rounded-lg" />
          </div>
          <div className="mt-6 grid gap-5 border-t border-outline-variant pt-5 sm:grid-cols-2">
            <div className="space-y-2"><Bone className="h-3 w-16" /><Bone className="h-5 w-24" /><Bone className="h-3 w-20" /></div>
            <div className="space-y-2"><Bone className="h-3 w-20" /><Bone className="h-5 w-20" /><Bone className="h-3 w-24" /></div>
          </div>
        </div>
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

export function LandingPricingSkeleton() {
  return (
    <section className="border-t border-outline-variant bg-background" aria-busy="true" aria-label="Loading plans">
      <div className="landing-inner py-14 lg:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mx-auto flex w-fit gap-1 rounded-full border border-outline-variant p-1"><Bone className="h-7 w-20 rounded-full" /><Bone className="h-7 w-20 rounded-full" /></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">{[0, 1].map((index) => <div key={index} className="border-y border-outline-variant py-6"><Bone className="h-3 w-12" /><Bone className="mt-4 h-9 w-28" /><Bone className="mt-3 h-3 w-28" /><div className="mt-6 space-y-3">{Array.from({ length: 4 }).map((_, row) => <div key={row} className="flex gap-2"><Bone className="h-3.5 w-3.5 rounded-full" /><Bone className="h-3 w-full" /></div>)}</div><Bone className="mt-7 h-10 w-full rounded-lg" /></div>)}</div>
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
      <LandingPricingSkeleton />
    </div>
  );
}
