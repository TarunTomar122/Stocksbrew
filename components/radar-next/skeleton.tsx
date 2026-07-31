function Bone({ className = "" }: { className?: string }) {
  return <div className={`rn-bone ${className}`} aria-hidden />;
}

export function RadarNextSkeleton() {
  return (
    <div className="radar-next mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-4 pb-8 pt-3 sm:gap-14 sm:px-6 sm:pb-12 sm:pt-6" aria-busy>
      <header className="border-b border-[var(--rn-line)] pb-6 pt-3 sm:pb-8 sm:pt-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-3"><Bone className="h-3 w-10" /><Bone className="h-3 w-12" /></div>
          <Bone className="h-3 w-20" />
        </div>
        <div className="mt-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div className="w-full max-w-3xl"><Bone className="h-10 w-full max-w-[36rem]" /><Bone className="mt-4 h-4 w-full max-w-[30rem]" /></div><div className="flex gap-2"><Bone className="h-9 w-28 rounded-full" /><Bone className="h-9 w-24 rounded-full" /></div></div>
      </header>

      <section>
        <Bone className="h-3 w-20" />
        <Bone className="mt-2 h-7 w-64" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex min-h-[10.5rem] flex-col rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)] p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3">
                <Bone className="h-7 w-7 rounded-full" />
                <Bone className="h-3 w-16" />
              </div><Bone className="h-3 w-14" /></div>
              <Bone className="mt-5 h-4 w-28" /><Bone className="mt-3 h-3 w-full" />
              <div className="mt-3 flex gap-2"><Bone className="h-6 w-24 rounded-full" /><Bone className="h-6 w-20 rounded-full" /></div>
              <div className="mt-auto flex justify-between pt-4"><Bone className="h-2.5 w-20" /><Bone className="h-2.5 w-12" /></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Bone className="h-3 w-24" />
        <div className="mt-2 flex items-end justify-between"><Bone className="h-7 w-80 max-w-full" /><Bone className="h-8 w-36 rounded-full" /></div>
        <div className="mt-4 divide-y divide-[var(--rn-line)] border-y border-[var(--rn-line)]">
          <div className="hidden grid-cols-[1fr_7rem_7rem_5rem] gap-4 px-3 py-3 sm:grid"><Bone className="h-2.5 w-12" /><Bone className="ml-auto h-2.5 w-10" /><Bone className="ml-auto h-2.5 w-10" /><Bone className="ml-auto h-2.5 w-10" /></div>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 sm:grid-cols-[1fr_1fr_7rem_7rem_5rem] sm:px-3">
              <div className="flex items-center gap-3">
                <Bone className="h-7 w-7 rounded-full" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="hidden h-3 w-40 sm:block" />
              <Bone className="h-3 w-16" />
              <Bone className="hidden h-3 w-12 sm:block" />
              <Bone className="hidden h-3 w-8 sm:block" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <Bone className="h-3 w-20" /><Bone className="mt-2 h-7 w-52" />
        <div className="mt-4 border-y border-[var(--rn-line)] py-6"><div className="grid gap-6 md:grid-cols-[0.8fr_1.2fr]"><div className="flex gap-5"><Bone className="h-14 w-16" /><div className="flex-1"><Bone className="h-4 w-52" /><Bone className="mt-3 h-3 w-full" /><Bone className="mt-2 h-3 w-[78%]" /></div></div><div className="grid grid-cols-2 gap-x-6 gap-y-4">{Array.from({ length: 4 }).map((_, index) => <div key={index}><Bone className="h-2.5 w-16" /><Bone className="mt-2 h-1.5 w-full rounded-full" /></div>)}</div></div></div>
      </section>
    </div>
  );
}
