import { TerminalLandingHeroCopy } from "@/components/terminal-landing-hero-copy";

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
    <div className="landing-card w-full overflow-hidden">
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--outline-variant)", background: "var(--surface-container)" }}
      >
        <Bone className="h-3 w-36" />
        <Bone className="h-3 w-10" />
      </div>
      <div className="space-y-3 p-4">
        <Bone className="h-3.5 w-44" />
        <div className="inset space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-52" />
              <Bone className="h-8 w-36" />
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
          <Bone className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-3.5 w-12" />
            <Bone className="h-3 w-full" />
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <Bone className="ml-auto h-3.5 w-16" />
            <Bone className="ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RedditCardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="landing-reddit-card space-y-2">
          <div className="flex items-center gap-2">
            <Bone className="h-6 w-6 rounded-full" />
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-20" />
            <Bone className="ml-auto h-5 w-16 rounded-full" />
          </div>
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-[88%]" />
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
            <Bone className="h-4 w-14" />
          </div>
          <Bone className="h-4 w-12" />
        </div>
        <Bone className="mb-2 h-3 w-16" />
        <div className="mb-2 border-t border-outline-variant" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 border-t border-outline-variant py-2 first:border-t-0">
            <Bone className="h-5 w-5 shrink-0 rounded-full" />
            <Bone className="h-3 w-10" />
            <Bone className="ml-auto h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingSectorHeatSkeleton() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card overflow-hidden p-5 md:p-6">
          <div className="mb-8 space-y-2">
            <Bone className="h-3 w-28" />
            <Bone className="h-8 w-72 max-w-full" />
            <Bone className="h-4 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SectorPanelSkeleton key={i} />
            ))}
          </div>
          <div className="sector-heat-cta mt-6">
            <Bone className="h-4 w-full max-w-md" />
            <Bone className="h-10 w-48 rounded-xl" />
          </div>
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
        <div className="landing-inner grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.12fr] lg:gap-14">
          <TerminalLandingHeroCopy />
          <LandingHeroCommandSkeleton />
        </div>
      </header>
      <LandingScannerRedditSkeleton />
      <LandingSectorHeatSkeleton />
    </div>
  );
}
