function Bone({ className = "" }: { className?: string }) {
  return <div className={`rn-bone ${className}`} aria-hidden />;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rn-line)]">
      <div className="hidden grid-cols-[1fr_1fr_7rem_7rem_5rem] gap-4 border-b border-[var(--rn-line)] bg-[var(--rn-card-2)] px-4 py-3 sm:grid">
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-20" />
        <Bone className="ml-auto h-3 w-10" />
        <Bone className="ml-auto h-3 w-10" />
        <Bone className="ml-auto h-3 w-10" />
      </div>
      <div className="divide-y divide-[var(--rn-line)]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 sm:grid-cols-[1fr_1fr_7rem_7rem_5rem]">
            <div className="flex items-center gap-3">
              <Bone className="h-8 w-8 rounded-full" />
              <Bone className="h-3 w-20" />
            </div>
            <Bone className="hidden h-3 w-40 sm:block" />
            <Bone className="h-3 w-16" />
            <Bone className="hidden h-3 w-12 sm:block" />
            <Bone className="hidden h-3 w-8 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadarNextSkeleton() {
  return (
    <div className="radar-next mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-4 pb-8 pt-3 sm:gap-14 sm:px-6 sm:pb-12 sm:pt-6" aria-busy>
      <header className="border-b border-[var(--rn-line)] pb-6 pt-3 sm:pb-8 sm:pt-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Bone className="h-8 w-48" />
          <Bone className="h-9 w-32 rounded-full" />
        </div>
      </header>

      <section>
        <Bone className="mb-3 h-8 w-40 rounded-full" />
        <TableSkeleton rows={8} />
      </section>

      <section>
        <div className="border-y border-[var(--rn-line)] py-6">
          <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] md:items-center">
            <div className="flex gap-5">
              <Bone className="h-11 w-14" />
              <div className="flex-1">
                <Bone className="h-4 w-52" />
                <Bone className="mt-3 h-3 w-full" />
                <Bone className="mt-2 h-3 w-[78%]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <Bone className="h-3 w-16" />
                  <Bone className="mt-2 h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-3 border-t border-[var(--rn-line)] py-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Bone key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </section>

      <section>
        <Bone className="mb-3 h-5 w-40" />
        <TableSkeleton rows={5} />
      </section>
    </div>
  );
}
