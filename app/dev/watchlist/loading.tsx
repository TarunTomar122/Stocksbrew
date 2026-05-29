export default function DevWatchlistLoading() {
  return (
    <div className="flex h-full w-full">
      {/* Sidebar skeleton */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[#e5e7eb] bg-[#fafaf7]">
        <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-4 py-3">
          <div className="h-3 w-20 animate-pulse rounded bg-[#e5e7eb]" />
          <div className="ml-auto h-5 w-8 animate-pulse rounded-full bg-[#e5e7eb]" />
        </div>
        <div className="flex-1 space-y-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-start gap-3 border-b border-[#f3f4f6] px-4 py-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-[#e5e7eb]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-[#e5e7eb]" />
                  <div className="h-3 w-10 animate-pulse rounded bg-[#e5e7eb]" />
                </div>
                <div className="h-2.5 w-36 animate-pulse rounded bg-[#e5e7eb]" />
                <div className="h-2 w-16 animate-pulse rounded bg-[#e5e7eb]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex flex-1 flex-col bg-white">
        <div className="mx-auto w-full max-w-screen-2xl px-6 pt-6 md:px-10 lg:px-16">
          <div className="h-10 w-full animate-pulse rounded-xl bg-[#f3f4f6]" />
        </div>

        <div className="mx-auto w-full max-w-screen-2xl px-6 pt-6 md:px-10 lg:px-16">
          <div className="flex flex-col gap-4">
            <div className="h-3 w-48 animate-pulse rounded bg-[#f3f4f6]" />
            <div className="flex items-center gap-3">
              <div className="h-10 w-64 animate-pulse rounded bg-[#f3f4f6]" />
              <div className="h-6 w-28 animate-pulse rounded-full bg-[#f3f4f6]" />
            </div>
            <div className="h-3 w-72 animate-pulse rounded bg-[#f3f4f6]" />
          </div>
        </div>

        <div className="mx-auto mt-6 w-full border-y border-[#ececea] bg-[#fafaf7]">
          <div className="mx-auto flex max-w-screen-2xl gap-4 px-6 py-3 md:px-10 lg:px-16">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e5e7eb]" />
                <div className="h-3 w-16 animate-pulse rounded bg-[#e5e7eb]" />
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
          <div className="flex flex-col gap-6">
            <div className="flex items-baseline gap-3 border-t border-[#ececea] pt-8">
              <div className="h-3 w-12 animate-pulse rounded bg-[#e5e7eb]" />
              <div className="h-6 w-24 animate-pulse rounded bg-[#e5e7eb]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-[#f3f4f6]" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-[#f3f4f6]" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#f3f4f6]" />
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-screen-2xl px-6 pt-8 md:px-10 lg:px-16">
          <div className="flex flex-col gap-6">
            <div className="flex items-baseline gap-3 border-t border-[#ececea] pt-8">
              <div className="h-3 w-12 animate-pulse rounded bg-[#e5e7eb]" />
              <div className="h-6 w-28 animate-pulse rounded bg-[#e5e7eb]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-[#f3f4f6]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
