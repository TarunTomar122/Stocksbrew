export default function NewsLoading() {
  return (
    <main className="loading-screen flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 flex flex-col gap-6 animate-pulse">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="h-7 w-24 rounded bg-oa-bg" />
          <div className="h-4 w-72 rounded bg-oa-bg" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* Filter rail */}
          <div className="flex flex-col gap-3">
            <div className="h-10 w-full rounded bg-oa-bg" />
            <div className="h-8 w-full rounded bg-oa-bg" />
            <div className="h-8 w-full rounded bg-oa-bg" />
            {[0,1,2,3,4,5,6].map((i) => (
              <div key={i} className="h-6 w-full rounded bg-oa-bg" />
            ))}
          </div>

          {/* Article list */}
          <div className="flex flex-col gap-3">
            {[0,1,2,3,4,5,6,7].map((i) => (
              <div key={i} className="flex flex-col gap-2 p-4 rounded-xl bg-oa-bg">
                <div className="h-3 w-48 rounded bg-oa-accent" />
                <div className="h-5 w-full rounded bg-oa-accent" />
                <div className="h-4 w-4/5 rounded bg-oa-accent" />
                <div className="flex gap-2 mt-1">
                  <div className="h-5 w-12 rounded bg-oa-accent" />
                  <div className="h-5 w-16 rounded bg-oa-accent" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
