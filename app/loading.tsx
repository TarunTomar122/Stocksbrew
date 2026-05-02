export default function HomeLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-8 md:py-10 flex flex-col gap-10 animate-pulse">
        {/* Hero */}
        <div className="h-[320px] md:h-[380px] w-full rounded-2xl bg-surface-container-low border border-outline-variant/30" />

        {/* Movers grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-20 rounded-full bg-surface-container-low" />
              <div className="h-9 w-20 rounded-full bg-surface-container-low" />
              <div className="h-9 w-20 rounded-full bg-surface-container-low" />
            </div>
            <div className="h-[420px] rounded-2xl bg-surface-container-low border border-outline-variant/30" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-5 w-24 rounded bg-surface-container-low" />
            <div className="h-[420px] rounded-2xl bg-surface-container-low border border-outline-variant/30" />
          </div>
        </div>
      </div>
    </main>
  );
}
