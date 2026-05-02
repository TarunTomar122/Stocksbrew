export default function StockLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 flex flex-col gap-8 animate-pulse">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-surface-container-low shrink-0" />
          <div className="flex flex-col gap-2 flex-1">
            <div className="h-7 w-40 rounded bg-surface-container-low" />
            <div className="h-4 w-64 rounded bg-surface-container-low" />
          </div>
          <div className="h-10 w-28 rounded-full bg-surface-container-low" />
        </div>

        {/* Price strip */}
        <div className="h-20 w-full rounded-xl bg-surface-container-low" />

        {/* Technical pulse — 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-surface-container-low" />
          ))}
        </div>

        {/* Wide cards */}
        <div className="h-48 w-full rounded-xl bg-surface-container-low" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-xl bg-surface-container-low" />
          <div className="h-64 rounded-xl bg-surface-container-low" />
        </div>
      </div>
    </main>
  );
}
