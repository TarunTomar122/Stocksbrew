"use client";

// A client component only so its markup is not sent twice: as a server component every stock page carried
// this whole skeleton again in its React data, even when it never showed. It has no state.

/**
 * Loading state for the stock report. It mirrors the real layout box for box
 * (price and call, the chart, the follow column, the read, the section tabs) so nothing
 * jumps when the data arrives.
 */

function Bone({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-oa-secondary ${className}`} />;
}

function PanelBone({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card ${className}`}>{children}</div>;
}

export function StockReportSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[76rem] px-2 pb-24 pt-3 sm:px-6 sm:pt-6 lg:pb-10" aria-busy="true" aria-label="Loading stock">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-x-6">
        <div className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
          <PanelBone>
            <div className="px-3.5 pt-3.5 sm:px-4 sm:pt-4">
              <div className="flex items-center gap-3">
                <Bone className="size-9 shrink-0" />
                <div>
                  <Bone className="h-6 w-48" />
                  <Bone className="mt-1.5 h-4 w-56 max-w-full" />
                </div>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <Bone className="h-9 w-56" />
                  <Bone className="h-3 w-36" />
                  <Bone className="h-6 w-48 rounded-full" />
                </div>
                <div className="rounded-xl bg-oa-bg px-3.5 py-3">
                  <Bone className="h-3 w-20" />
                  <Bone className="mt-2 h-7 w-40" />
                  <Bone className="mt-2 h-3.5 w-full" />
                  <Bone className="mt-3 h-10 w-3/4" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-3.5 pb-2 pt-3 sm:px-4">
              <Bone className="h-9 w-52 sm:h-8" />
              <Bone className="h-4 w-24" />
            </div>
            <div className="px-3.5 pb-3 sm:px-4">
              <Bone className="h-[240px] w-full sm:h-[300px]" />
            </div>
            <div className="hidden grid-cols-4 gap-x-6 gap-y-2.5 border-t border-oa-border px-4 py-3 md:grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index}>
                  <Bone className="h-3 w-16" />
                  <Bone className="mt-1.5 h-4 w-20" />
                </div>
              ))}
            </div>
          </PanelBone>
        </div>

        <aside className="order-3 min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <PanelBone>
            <div className="border-b border-oa-border px-3.5 py-2.5 sm:px-4">
              <Bone className="h-3 w-24" />
            </div>
            <div className="px-3.5 py-3 sm:px-4">
              <Bone className="h-10 w-full rounded-full" />
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex h-9 items-center justify-between border-t border-oa-border px-3.5 sm:px-4">
                <Bone className="h-3.5 w-32" />
                <Bone className="h-3.5 w-14" />
              </div>
            ))}
          </PanelBone>
        </aside>

        <div className="order-2 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-2">
          <PanelBone>
            <div className="border-b border-oa-border px-3.5 py-2.5 sm:px-4">
              <Bone className="h-3 w-20" />
            </div>
            <div className="px-3.5 py-3.5 sm:px-4">
              <Bone className="h-7 w-4/5" />
              <Bone className="mt-3 h-4 w-full" />
              <Bone className="mt-2 h-4 w-11/12" />
              <Bone className="mt-2 h-4 w-3/5" />
            </div>
            <div className="grid border-t border-oa-border md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, column) => (
                <div key={column} className="flex flex-col gap-2.5 px-3.5 py-3 sm:px-4">
                  <Bone className="h-3 w-28" />
                  <Bone className="h-4 w-full" />
                  <Bone className="h-4 w-5/6" />
                  <Bone className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          </PanelBone>
          <BelowBones />
        </div>
      </div>
    </div>
  );
}

function BelowBones() {
  return (
    <>
      <PanelBone>
        <div className="border-b border-oa-border px-3.5 py-2.5 sm:px-4">
          <Bone className="h-3 w-28" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-oa-border px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:px-4">
            <Bone className="h-3.5 w-12" />
            <div>
              <Bone className="h-4 w-4/5" />
              <Bone className="mt-1.5 h-3 w-2/5" />
            </div>
          </div>
        ))}
      </PanelBone>
      <div className="flex gap-4 border-b border-oa-border pb-3 pt-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <Bone key={index} className="h-4 w-16 shrink-0" />
        ))}
      </div>
    </>
  );
}

/** The lower half while its reads finish: what changed, then the section tabs (below.tsx). */
export function StockBelowSkeleton() {
  return (
    // Marked as the "Changes" part, so on a phone it only shows where what changed will appear.
    <div data-phone-section="changed" className="flex min-w-0 flex-col gap-4" aria-busy="true" aria-label="Loading what changed">
      <BelowBones />
    </div>
  );
}
