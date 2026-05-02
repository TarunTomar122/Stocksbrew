export default function WatchlistLoading() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 flex flex-col gap-8 animate-pulse">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-32 rounded bg-surface-container-low" />
          <div className="h-4 w-56 rounded bg-surface-container-low" />
        </div>
        <div className="h-28 w-full rounded-xl bg-surface-container-low" />
        {[0,1,2,3].map((i) => (
          <div key={i} className="h-24 w-full rounded-xl bg-surface-container-low" />
        ))}
      </div>
    </main>
  );
}
