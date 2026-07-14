function Bone({ className = "" }: { className?: string }) {
  return <div className={`rn-bone ${className}`} aria-hidden />;
}

export function RadarNextSkeleton() {
  return (
    <div className="radar-next radar-next-glow flex w-full flex-col gap-3 px-0 pb-3 pt-2 sm:gap-7 sm:px-1 sm:pb-4 sm:pt-8" aria-busy>
      <div className="rn-window">
        <div className="rn-chrome flex items-center justify-between px-2.5 py-2 sm:px-4 sm:py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="rn-light rn-light--r" />
            <span className="rn-light rn-light--y" />
            <span className="rn-light rn-light--g" />
          </div>
          <Bone className="h-3 w-10" />
        </div>
        <div className="px-2.5 py-4 sm:px-7 sm:py-8">
          <Bone className="h-3 w-40" />
          <Bone className="mt-4 h-9 w-56" />
          <Bone className="mt-3 h-3 w-72" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        <div>
          <Bone className="mb-3 h-3 w-24" />
          <div className="rn-card p-2 sm:p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Bone className="h-6 w-6 rounded-full" />
                  <Bone className="h-3 w-24" />
                </div>
                <Bone className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Bone className="mb-3 h-3 w-24" />
          <div className="rn-card p-5">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
              <Bone className="h-[118px] w-[118px] rounded-full" />
              <div className="w-full flex-1">
                <Bone className="h-4 w-40" />
                <Bone className="mt-2 h-3 w-full" />
                <Bone className="mt-1.5 h-3 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Bone className="mb-3 h-3 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rn-card p-3 sm:p-3.5">
              <div className="flex items-center gap-2.5">
                <Bone className="h-[28px] w-[28px] rounded-full" />
                <Bone className="h-3 w-16" />
              </div>
              <Bone className="mt-3 h-3 w-full" />
              <Bone className="mt-1.5 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
