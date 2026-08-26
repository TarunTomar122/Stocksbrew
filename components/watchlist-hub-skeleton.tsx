import { SquircleSurface } from "@/components/oa/squircle";

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";
const PULSE = "animate-pulse bg-oa-secondary";

function GhostBookRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5">
      <div className={`size-8 shrink-0 rounded-full ${PULSE}`} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className={`h-3.5 w-16 rounded-full ${PULSE}`} />
        <div className={`h-2.5 w-48 max-w-full rounded-full ${PULSE}`} />
      </div>
      <div className="shrink-0 space-y-1.5 text-right">
        <div className={`ml-auto h-3.5 w-14 rounded-full ${PULSE}`} />
        <div className={`ml-auto h-2.5 w-12 rounded-full ${PULSE}`} />
      </div>
    </div>
  );
}

function GhostEarningsCard() {
  return (
    <div className="flex min-w-[15.5rem] shrink-0 flex-col gap-3 rounded-[18px] border border-oa-border bg-oa-card p-4 sm:min-w-[17rem]">
      <div className="flex items-center gap-2.5">
        <div className={`size-7 shrink-0 rounded-full ${PULSE}`} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className={`h-3 w-14 rounded-full ${PULSE}`} />
          <div className={`h-2.5 w-24 rounded-full ${PULSE}`} />
        </div>
      </div>
      <div className={`h-2.5 w-32 rounded-full ${PULSE}`} />
    </div>
  );
}

function GhostSectionHead() {
  return (
    <div className="mb-4 max-w-2xl space-y-2.5">
      <div className={`h-7 w-64 rounded-full ${PULSE}`} />
      <div className={`h-4 w-80 max-w-full rounded-full ${PULSE}`} />
    </div>
  );
}

export function WatchlistHubSkeleton() {
  return (
    <div aria-hidden="true" aria-busy="true" className={`loading-screen mx-auto w-full max-w-[76rem] flex flex-col gap-10 px-0 pb-36 pt-8 sm:gap-12 sm:pb-36 sm:px-6 sm:pt-10`}>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className={`h-9 w-72 max-w-full rounded-full ${PULSE}`} />
        <div className={`h-9 w-40 shrink-0 rounded-full ${PULSE}`} />
      </header>

      <section>
        <GhostSectionHead />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <GhostEarningsCard key={i} />
          ))}
        </div>
      </section>

      <section>
        <GhostSectionHead />
        <SquircleSurface className="border border-oa-border p-1">
          <SquircleSurface className="overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
            <div className="flex gap-2 px-3 pb-1 pt-3 sm:px-5">
              <div className={`h-8 w-24 rounded-full ${PULSE}`} />
              <div className={`h-8 w-24 rounded-full ${PULSE}`} />
            </div>
            <div className="divide-y divide-oa-border/60 pb-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <GhostBookRow key={i} />
              ))}
            </div>
          </SquircleSurface>
        </SquircleSurface>
      </section>

      <section>
        <GhostSectionHead />
        <SquircleSurface className="border border-oa-border p-1">
          <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-5 [--card-clip-radius:12px] sm:px-6 sm:py-6 sm:[--card-clip-radius:17px]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <div className={`size-20 shrink-0 rounded-full ${PULSE}`} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`h-5 w-72 max-w-full rounded-full ${PULSE}`} />
                <div className={`h-4 w-full max-w-md rounded-full ${PULSE}`} />
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-t border-oa-border pt-5 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className={`h-3 w-16 rounded-full ${PULSE}`} />
                  <div className={`h-1.5 w-full rounded-full ${PULSE}`} />
                </div>
              ))}
            </div>
          </SquircleSurface>
        </SquircleSurface>
      </section>

      <section>
        <GhostSectionHead />
        <SquircleSurface className="border border-oa-border p-1">
          <SquircleSurface className="divide-y divide-oa-border/60 overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
            {Array.from({ length: 3 }).map((_, i) => (
              <GhostBookRow key={i} />
            ))}
          </SquircleSurface>
        </SquircleSurface>
      </section>
    </div>
  );
}
