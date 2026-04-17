import { Sk, SkCard, SkNav, SkRibbon } from "@/components/skeleton";

export default function SectorLoading() {
  return (
    <div className="min-h-screen bg-[#0A0E16] font-body text-[#F5F6F8]">
      <header className="sticky top-0 z-50 w-full border-b border-[#1F2738] bg-[#0F1420]/95 backdrop-blur">
        <SkRibbon />
        <SkNav />
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Breadcrumb */}
        <div className="mb-5 flex items-center gap-2">
          <Sk className="h-2.5 w-16" />
          <Sk className="h-2 w-2 rounded-full" />
          <Sk className="h-2.5 w-28" />
        </div>

        {/* Sector hero */}
        <div className="mb-6 rounded-[10px] border border-[#252E42] bg-[#141A26] p-6">
          <Sk className="mb-2.5 h-2.5 w-16" />
          <Sk className="mb-4 h-7 w-56" />
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Sk className="h-2 w-16" />
                <Sk className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

          {/* Left — overview + stocks */}
          <div className="flex flex-col gap-5 lg:col-span-8">

            {/* Bottom line */}
            <SkCard>
              <div className="p-5 flex flex-col gap-2">
                <Sk className="h-3 w-full" />
                <Sk className="h-3 w-11/12" />
                <Sk className="h-3 w-4/5" />
              </div>
            </SkCard>

            {/* Stocks grid */}
            <SkCard>
              <div className="grid grid-cols-2 gap-px bg-[#1F2738] sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-3 bg-[#141A26] p-4">
                    <div className="flex items-center justify-between">
                      <Sk className="h-3.5 w-12" />
                      <Sk className="h-4 w-12 rounded-[4px]" />
                    </div>
                    <Sk className="h-10 w-full rounded-[3px]" />
                    <div className="flex items-end justify-between">
                      <Sk className="h-4 w-16" />
                      <Sk className="h-3 w-10" />
                    </div>
                  </div>
                ))}
              </div>
            </SkCard>
          </div>

          {/* Right — macro + headlines */}
          <div className="flex flex-col gap-5 lg:col-span-4">
            <SkCard>
              <div className="divide-y divide-[#1F2738]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <Sk className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="flex-1">
                      <Sk className="mb-1.5 h-3 w-full" />
                      <Sk className="h-2.5 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            </SkCard>

            <SkCard>
              <div className="p-5 flex flex-col gap-2">
                <Sk className="h-3 w-full" />
                <Sk className="h-3 w-4/5" />
                <Sk className="h-3 w-3/5" />
              </div>
            </SkCard>
          </div>
        </div>
      </main>
    </div>
  );
}
