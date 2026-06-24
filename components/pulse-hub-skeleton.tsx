import { PulseHubHero } from "@/components/pulse-hub-header";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function MoversDetailedSkeleton() {
  return (
    <>
      <div className="mb-4 flex gap-1.5">
        <Bone className="h-8 w-28 rounded-full" />
        <Bone className="h-8 w-28 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pulse-mover-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bone className="h-7 w-7 rounded-full" />
                <Bone className="h-4 w-12" />
              </div>
              <Bone className="h-4 w-20" />
            </div>
            <Bone className="h-4 w-full" />
            <Bone className="h-3 w-[92%]" />
          </div>
        ))}
      </div>
      <Bone className="mt-8 h-3 w-44" />
      <div className="pulse-list-panel mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-outline-variant px-4 py-3 first:border-t-0">
            <Bone className="h-5 w-5 rounded-full" />
            <Bone className="h-3 w-10" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-14" />
          </div>
        ))}
      </div>
    </>
  );
}

export function PulseHubContentSkeleton() {
  return (
    <>
      <nav className="pulse-tabs" aria-hidden>
        {["Movers", "Reddit", "Sectors", "Earnings"].map((label) => (
          <div key={label} className="pulse-tab text-on-surface-variant">
            {label}
          </div>
        ))}
      </nav>
      <div className="pt-6">
        <MoversDetailedSkeleton />
      </div>
    </>
  );
}

export function PulsePageSkeleton() {
  return (
    <>
      <PulseHubHero />
      <PulseHubContentSkeleton />
    </>
  );
}
