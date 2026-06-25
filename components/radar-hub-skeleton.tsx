function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

export function RadarHubContentSkeleton() {
  return (
    <div className="w-full pb-12">
      <Bone className="h-3 w-40" />
      <Bone className="mt-3 h-9 w-28" />
      <Bone className="mt-2 h-3 w-72" />
      <Bone className="mt-6 h-10 w-full" />
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bone className="h-44 w-full rounded-xl" />
        <Bone className="h-44 w-full rounded-xl" />
      </div>
      <Bone className="mt-10 h-3 w-24" />
      <Bone className="mt-4 h-64 w-full rounded-xl" />
      <Bone className="mt-10 h-3 w-24" />
      <Bone className="mt-4 h-48 w-full rounded-xl" />
    </div>
  );
}

export function RadarHubStaticHeader() {
  return (
    <div className="w-full pt-6 sm:pt-8">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
        stocksbrew · radar
      </div>
      <h1 className="mt-1 font-mono text-[28px] font-extrabold tracking-tight text-on-surface md:text-[34px]">
        Radar
      </h1>
    </div>
  );
}

export function RadarPageSkeleton() {
  return (
    <main className="flex flex-grow flex-col bg-background">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 md:px-8 lg:px-10">
        <RadarHubStaticHeader />
        <RadarHubContentSkeleton />
      </div>
    </main>
  );
}
