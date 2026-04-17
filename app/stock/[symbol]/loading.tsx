import { Sk, SkCard, SkNav, SkRibbon } from "@/components/skeleton";

export default function StockLoading() {
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
          <Sk className="h-2.5 w-24" />
        </div>

        {/* Stock hero header */}
        <div className="mb-6 rounded-[10px] border border-[#252E42] bg-[#141A26] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <Sk className="h-2.5 w-20" />
              <Sk className="h-7 w-48" />
              <div className="flex items-baseline gap-4">
                <Sk className="h-9 w-32" />
                <Sk className="h-5 w-20" />
                <Sk className="h-5 w-24" />
              </div>
            </div>
            <div className="hidden flex-wrap justify-end gap-2 lg:flex">
              {Array.from({ length: 4 }).map((_, i) => (
                <Sk key={i} className="h-8 w-24 rounded-[6px]" />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

          {/* Left column — chart + drivers + summary + news */}
          <div className="flex flex-col gap-5 lg:col-span-8">

            {/* Price chart */}
            <SkCard>
              <div className="p-5">
                <div className="mb-4 flex items-baseline gap-4">
                  <Sk className="h-7 w-28" />
                  <Sk className="h-4 w-24" />
                </div>
                <Sk className="h-[220px] w-full rounded-[6px]" />
                <div className="mt-3 flex items-center justify-between">
                  <Sk className="h-2.5 w-20" />
                  <Sk className="h-2.5 w-20" />
                  <Sk className="h-2.5 w-20" />
                </div>
              </div>
            </SkCard>

            {/* Drivers + Challenges */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {["Growth drivers", "Key challenges"].map((title) => (
                <SkCard key={title}>
                  <div className="p-4 flex flex-col gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Sk className="mt-0.5 h-3 w-3 shrink-0 rounded-full" />
                        <Sk className="h-2.5 w-full" />
                      </div>
                    ))}
                  </div>
                </SkCard>
              ))}
            </div>

            {/* Summary */}
            <SkCard>
              <div className="p-5 flex flex-col gap-2">
                <Sk className="h-3 w-full" />
                <Sk className="h-3 w-11/12" />
                <Sk className="h-3 w-4/5" />
              </div>
            </SkCard>

            {/* News */}
            <SkCard>
              <div className="divide-y divide-[#1F2738]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <Sk className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="flex-1">
                      <Sk className="mb-1.5 h-3 w-full" />
                      <Sk className="h-2.5 w-3/4" />
                    </div>
                    <Sk className="h-2 w-10 shrink-0" />
                  </div>
                ))}
              </div>
            </SkCard>
          </div>

          {/* Right column — metrics + ratings + peers */}
          <div className="flex flex-col gap-5 lg:col-span-4">

            {/* Key metrics */}
            <SkCard>
              <div className="grid grid-cols-2 divide-x divide-y divide-[#1F2738]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5 p-4">
                    <Sk className="h-2 w-14" />
                    <Sk className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </SkCard>

            {/* Analyst ratings */}
            <SkCard>
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <Sk className="h-5 w-16 rounded-[4px]" />
                  <Sk className="h-3 w-24" />
                </div>
                <Sk className="h-2 w-full rounded-full" />
                <div className="flex justify-between">
                  {["w-10", "w-14", "w-10"].map((w, i) => (
                    <Sk key={i} className={`h-2 ${w}`} />
                  ))}
                </div>
              </div>
            </SkCard>

            {/* Similar stocks */}
            <SkCard>
              <div className="divide-y divide-[#1F2738]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Sk className="h-3.5 w-12" />
                      <Sk className="h-2 w-20" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Sk className="h-3 w-14" />
                      <Sk className="h-2.5 w-10" />
                    </div>
                  </div>
                ))}
              </div>
            </SkCard>
          </div>
        </div>
      </main>
    </div>
  );
}
