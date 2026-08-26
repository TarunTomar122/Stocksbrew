function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function ResearchRowSkeleton() {
  return (
    <div className="grid gap-4 border-t border-oa-border/80 px-5 py-5 sm:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)_7rem] sm:gap-4 sm:px-6">
      <div className="flex items-start gap-3">
        <Bone className="size-[38px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bone className="h-4 w-14" />
          <Bone className="h-3 w-36 max-w-full" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2.5">
        <Bone className="h-4 w-full max-w-[34rem]" />
        <Bone className="h-4 w-[72%] max-w-[24rem]" />
        <Bone className="h-3.5 w-24" />
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Bone className="h-3.5 w-20" />
        <Bone className="h-4 w-16" />
        <Bone className="h-3.5 w-14" />
      </div>
    </div>
  );
}

export function ThemePageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 py-8 sm:gap-14 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="Loading theme"
    >
      <div>
        <Bone className="h-3.5 w-28" />
        <div className="mt-8 max-w-3xl space-y-4">
          <Bone className="h-12 w-64 max-w-full" />
          <Bone className="h-4 w-full max-w-3xl" />
          <Bone className="h-4 w-[78%] max-w-2xl" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[30px] border border-oa-border">
        <div className="hidden grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)_7rem] gap-4 border-b border-oa-border bg-oa-bg/60 px-6 py-3 sm:grid">
          <Bone className="h-3 w-16" />
          <Bone className="h-3 w-28" />
          <Bone className="ml-auto h-3 w-12" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <ResearchRowSkeleton key={index} />
        ))}
        <div className="flex flex-wrap items-center justify-center gap-4 border-t border-oa-border/80 px-5 py-5 sm:px-6">
          <Bone className="h-3.5 w-64 max-w-full" />
          <Bone className="h-9 w-36 rounded-full" />
        </div>
      </div>

      <section className="border-t border-oa-border/70 pt-8">
        <Bone className="h-6 w-56" />
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Bone key={index} className="h-3.5 w-28" />
          ))}
        </div>
      </section>
    </div>
  );
}
