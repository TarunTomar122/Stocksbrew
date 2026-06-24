function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function CallRowSkeleton() {
  return (
    <div className="border-t px-5 py-4 first:border-t-0" style={{ borderColor: "var(--outline-variant)" }}>
      <div className="flex items-center gap-3">
        <Bone className="h-6 w-6 rounded-full" />
        <Bone className="h-3.5 w-12" />
        <Bone className="h-3 w-24" />
        <div className="ml-auto flex flex-col items-end gap-1.5">
          <Bone className="h-5 w-20" />
          <Bone className="h-3 w-14" />
        </div>
      </div>
      <Bone className="mt-2.5 h-3.5 w-40" />
    </div>
  );
}

export function RadarHubContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10">
      <Bone className="mt-3 h-4 w-full max-w-xl" />
      <Bone className="mt-1 h-4 w-64 max-w-full" />

      <div className="mt-7 mb-2 flex gap-2">
        <Bone className="h-7 w-28 rounded-md" />
        <Bone className="h-7 w-28 rounded-md" />
      </div>

      <div className="panel overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <CallRowSkeleton key={i} />
        ))}
      </div>

      <div className="mt-8">
        <Bone className="mb-2 h-3 w-44" />
        <div className="panel overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0"
              style={{ borderColor: "var(--outline-variant)" }}
            >
              <Bone className="h-[22px] w-[22px] rounded-full" />
              <Bone className="h-3 w-12" />
              <Bone className="h-3 flex-1" />
              <Bone className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="panel space-y-3 p-5">
            <Bone className="h-3 w-24" />
            <Bone className="h-20 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadarHubStaticHeader() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pt-10">
      <div className="font-mono text-[12px] text-accent-terminal">
        // your radar
      </div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">The market, on your stocks.</h1>
    </div>
  );
}

export function RadarPageSkeleton() {
  return (
    <main className="flex flex-grow flex-col bg-background">
      <RadarHubStaticHeader />
      <RadarHubContentSkeleton />
    </main>
  );
}
