/* ─── Light theme (legacy pages) ─── */
type SkeletonProps = { className?: string };

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse bg-[#1A1A1A]/[0.04] ${className}`} />;
}

export function SkeletonText({ className = "" }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

/* ─── Dark theme ─── */

/** Base dark skeleton block — rounded, pulsing, dark surface */
export function Sk({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-[4px] bg-[#1F2738] ${className}`} />
  );
}

/** Fake dark card shell matching DashboardCard */
export function SkCard({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26] ${className}`}
    >
      {/* card header */}
      <div className="flex items-center justify-between border-b border-[#1F2738] px-5 py-3">
        <div className="flex flex-col gap-1.5">
          <Sk className="h-2 w-16" />
          <Sk className="h-3.5 w-28" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Ticker ribbon placeholder */
export function SkRibbon() {
  return (
    <div className="flex h-8 items-center gap-8 border-b border-[#1F2738] bg-[#0A0E16] px-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Sk key={i} className="h-2.5 w-20" />
      ))}
    </div>
  );
}

/** V2 nav bar */
export function SkNav() {
  return (
    <div className="flex h-[56px] items-center justify-between border-b border-[#1F2738] bg-[#0F1420]/95 px-6">
      <div className="flex items-center gap-8">
        <Sk className="h-4 w-12" />
        <div className="flex gap-6">
          {["w-16", "w-14", "w-16", "w-14"].map((w, i) => (
            <Sk key={i} className={`h-2.5 ${w}`} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex gap-5">
          {["w-20", "w-20", "w-20"].map((w, i) => (
            <Sk key={i} className={`h-2.5 ${w}`} />
          ))}
        </div>
        <Sk className="h-7 w-14 rounded-[6px]" />
        <Sk className="h-7 w-7 rounded-[6px]" />
      </div>
    </div>
  );
}
