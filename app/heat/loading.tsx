export default function HeatLoading() {
  return (
    <main className="loading-screen oa-landing flex-grow">
      <div className="mx-auto w-full max-w-[76rem] flex animate-pulse flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-32 rounded-full border border-oa-border bg-oa-bg" />
          <div className="h-7 w-40 rounded-full border border-oa-border bg-oa-bg" />
          <div className="h-4 w-[32rem] max-w-full rounded-full border border-oa-border bg-oa-bg" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-card p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-16 rounded-full border border-oa-border bg-oa-bg" />
                  <div className="h-3 w-32 rounded-full border border-oa-border bg-oa-bg" />
                </div>
                <div className="h-6 w-10 rounded-full border border-oa-border bg-oa-bg" />
              </div>
              <div className="h-8 w-full rounded-full border border-oa-border bg-oa-bg" />
              <div className="flex gap-1">
                <div className="h-4 w-16 rounded-full border border-oa-border bg-oa-bg" />
                <div className="h-4 w-20 rounded-full border border-oa-border bg-oa-bg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
