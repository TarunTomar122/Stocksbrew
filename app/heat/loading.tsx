export default function HeatLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 flex flex-col gap-6 animate-pulse">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-32 rounded bg-surface-container-low" />
          <div className="h-7 w-40 rounded bg-surface-container-low" />
          <div className="h-4 w-[32rem] max-w-full rounded bg-surface-container-low" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 p-4 bg-surface-container-low brutalist-border"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-16 rounded bg-surface-container" />
                  <div className="h-3 w-32 rounded bg-surface-container" />
                </div>
                <div className="h-6 w-10 rounded bg-surface-container" />
              </div>
              <div className="h-8 w-full rounded bg-surface-container" />
              <div className="flex gap-1">
                <div className="h-4 w-16 rounded bg-surface-container" />
                <div className="h-4 w-20 rounded bg-surface-container" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
