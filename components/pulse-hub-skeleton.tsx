function Bone({ className = "" }: { className?: string }) {
  return <div className={`landing-bone rounded-md ${className}`} aria-hidden />;
}

function TodayPulseSkeleton() {
  return (
    <>
      <section className="border-b border-outline-variant pb-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] lg:divide-x lg:divide-outline-variant">
          <div className="lg:pr-8"><Bone className="h-3 w-24" /><Bone className="mt-3 h-7 w-56" /><Bone className="mt-4 h-4 w-full max-w-xl" /><Bone className="mt-2 h-4 w-[86%] max-w-xl" /><div className="mt-5 divide-y divide-outline-variant/70 border-y border-outline-variant/70">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex gap-3 py-3"><Bone className="mt-1 h-2 w-2 rounded-full" /><div className="flex-1"><Bone className="h-3 w-36" /><Bone className="mt-2 h-3 w-full" /></div></div>)}</div></div>
          <div className="lg:pl-8"><Bone className="h-3 w-20" /><div className="mt-4 grid grid-cols-3 divide-x divide-outline-variant"><Bone className="mx-auto h-10 w-12" /><Bone className="mx-auto h-10 w-12" /><Bone className="mx-auto h-10 w-16" /></div><div className="mt-5 divide-y divide-outline-variant/70 border-t border-outline-variant/70">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex items-center gap-2 py-2.5"><Bone className="h-5 w-5 rounded-full" /><Bone className="h-3 w-10" /><Bone className="ml-auto h-3 w-14" /></div>)}</div></div>
        </div>
      </section>
      <section className="my-8 grid border-y border-outline-variant py-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:divide-x lg:divide-outline-variant"><div className="lg:pr-8"><Bone className="h-3 w-24" /><Bone className="mt-3 h-6 w-44" />{Array.from({ length: 4 }).map((_, i) => <div key={i} className="mt-4 flex justify-between border-t border-outline-variant/70 pt-3"><Bone className="h-3 w-40" /><Bone className="h-3 w-12" /></div>)}</div><div className="pt-6 lg:pl-8 lg:pt-0"><Bone className="h-3 w-20" /><div className="mt-4 flex items-center gap-3"><Bone className="h-8 w-8 rounded-lg" /><Bone className="h-4 w-14" /><Bone className="ml-auto h-5 w-14 rounded-full" /></div><Bone className="mt-4 h-3 w-full" /><Bone className="mt-2 h-3 w-[84%]" /></div></section>
      <section><Bone className="h-3 w-28" /><Bone className="mt-3 h-7 w-64" /><div className="mt-5 grid gap-6 lg:grid-cols-2">{[0, 1].map((side) => <div key={side}><Bone className="h-3 w-20" />{Array.from({ length: 5 }).map((_, i) => <div key={i} className="mt-3 flex items-center gap-3 border-t border-outline-variant/70 pt-3"><Bone className="h-6 w-6 rounded-full" /><div className="flex-1"><Bone className="h-3 w-16" /><Bone className="mt-1.5 h-2.5 w-32" /></div><Bone className="h-3 w-12" /></div>)}</div>)}</div></section>
    </>
  );
}

export function PulseHubContentSkeleton() {
  return (
    <>
      <nav className="pulse-tabs" aria-hidden>
        {["Today", "Moving now", "Earnings", "Setups"].map((label) => (
          <div key={label} className="pulse-tab text-on-surface-variant">
            {label}
          </div>
        ))}
      </nav>
      <div className="pt-6">
        <TodayPulseSkeleton />
      </div>
    </>
  );
}

export function PulsePageSkeleton() {
  return (
    <>
      <section className="pulse-hero" aria-hidden>
        <div className="space-y-3">
          <Bone className="h-3 w-28" />
          <Bone className="h-10 w-[min(28rem,85%)]" />
          <Bone className="h-5 w-[min(42rem,100%)]" />
        </div>
      </section>
      <PulseHubContentSkeleton />
    </>
  );
}
