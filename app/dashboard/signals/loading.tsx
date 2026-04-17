import { Sk, SkCard, SkNav, SkRibbon } from "@/components/skeleton";

export default function SignalsLoading() {
  return (
    <div className="min-h-screen bg-[#0A0E16] font-body text-[#F5F6F8]">
      <header className="sticky top-0 z-50 w-full border-b border-[#1F2738] bg-[#0F1420]/95 backdrop-blur">
        <SkRibbon />
        <SkNav />
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Page header */}
        <div className="mb-5 flex items-end justify-between">
          <div>
            <Sk className="mb-2 h-2 w-20" />
            <Sk className="h-6 w-28" />
          </div>
          <Sk className="h-6 w-24 rounded-[6px]" />
        </div>

        <div className="flex flex-col gap-6">

          {/* Market context hero — 2×2 grid */}
          <div className="overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26]">
            <div className="border-b border-[#1F2738] px-6 py-4">
              <Sk className="mb-2 h-2 w-24" />
              <Sk className="h-6 w-56" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`px-6 py-5 ${i % 2 === 0 ? "sm:border-r sm:border-[#1F2738]" : ""} ${i < 2 ? "border-b border-[#1F2738]" : ""}`}
                >
                  <Sk className="mb-3 h-2 w-24" />
                  <Sk className="mb-1.5 h-3 w-full" />
                  <Sk className="mb-1.5 h-3 w-11/12" />
                  <Sk className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          </div>

          {/* Narrative brief */}
          <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] px-6 py-4">
            <Sk className="mb-2 h-2 w-28" />
            <Sk className="mb-1.5 h-3 w-full" />
            <Sk className="mb-1.5 h-3 w-11/12" />
            <Sk className="h-3 w-3/4" />
          </div>

          {/* Signal cards row */}
          <div>
            <Sk className="mb-3 h-2 w-32" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-[10px] border border-[#252E42] bg-[#141A26] p-4">
                  <Sk className="h-5 w-20 rounded-[4px]" />
                  <Sk className="h-3.5 w-full" />
                  <Sk className="h-3.5 w-5/6" />
                  <Sk className="h-2.5 w-full" />
                  <Sk className="h-2.5 w-4/5" />
                </div>
              ))}
            </div>
          </div>

          {/* Movers + blind spot */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <SkCard>
                <div className="divide-y divide-[#1F2738]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-baseline gap-4 px-5 py-3.5">
                      <div className="flex w-16 shrink-0 flex-col gap-1.5">
                        <Sk className="h-3.5 w-10" />
                        <Sk className="h-2.5 w-12" />
                      </div>
                      <div className="flex-1 flex flex-col gap-1.5">
                        <Sk className="h-3 w-full" />
                        <Sk className="h-3 w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              </SkCard>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Sk className="h-4 w-4 rounded-full" />
                  <Sk className="h-2.5 w-20" />
                </div>
                <Sk className="mb-2 h-4 w-64" />
                <Sk className="mb-1.5 h-3 w-full" />
                <Sk className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
