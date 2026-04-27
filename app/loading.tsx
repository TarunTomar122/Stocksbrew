export default function HomeLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-8 py-10 flex flex-col gap-10 animate-pulse">
        {/* Hero */}
        <div className="flex flex-col gap-3">
          <div className="h-8 w-64 rounded bg-surface-container-low" />
          <div className="h-5 w-96 rounded bg-surface-container-low" />
        </div>

        {/* Market snapshot strip */}
        <div className="h-16 w-full rounded-xl bg-surface-container-low" />

        {/* Movers grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 rounded-xl bg-surface-container-low" />
          <div className="h-64 rounded-xl bg-surface-container-low" />
        </div>

        {/* Screens */}
        <div className="flex flex-col gap-4">
          <div className="h-6 w-48 rounded bg-surface-container-low" />
          <div className="flex gap-2">
            {[0,1,2,3,4].map((i) => (
              <div key={i} className="h-9 w-28 rounded-full bg-surface-container-low" />
            ))}
          </div>
          <div className="h-72 w-full rounded-xl bg-surface-container-low" />
        </div>
      </div>
    </main>
  );
}
