import { Sk, SkCard, SkNav, SkRibbon } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0A0E16] font-body text-[#F5F6F8]">
      {/* Chrome */}
      <header className="sticky top-0 z-50 w-full border-b border-[#1F2738] bg-[#0F1420]/95 backdrop-blur">
        <SkRibbon />
        <SkNav />
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Page header */}
        <div className="mb-6">
          <Sk className="mb-2 h-2 w-20" />
          <Sk className="h-7 w-72" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

          {/* Row 1 left — Market mood + brief + blind spot */}
          <div className="flex flex-col gap-5 lg:col-span-8">
            {/* Market overview card */}
            <SkCard>
              <div className="p-5">
                <div className="mb-4 flex items-center gap-4">
                  {/* Arc gauge placeholder */}
                  <Sk className="h-20 w-20 rounded-full" />
                  <div className="flex flex-col gap-2">
                    <Sk className="h-5 w-28" />
                    <Sk className="h-3 w-40" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[20, 28, 22, 24, 18].map((w, i) => (
                    <Sk key={i} className={`h-5 w-${w}`} />
                  ))}
                </div>
              </div>
            </SkCard>

            {/* Brief */}
            <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] px-6 py-4">
              <Sk className="mb-2 h-2 w-20" />
              <Sk className="mb-1.5 h-3 w-full" />
              <Sk className="mb-1.5 h-3 w-11/12" />
              <Sk className="h-3 w-4/5" />
            </div>

            {/* Blind spot */}
            <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sk className="h-4 w-4 rounded-full" />
                <Sk className="h-2.5 w-20" />
              </div>
              <Sk className="mb-2 h-4 w-64" />
              <Sk className="h-3 w-full" />
            </div>
          </div>

          {/* Row 1 right — Macro strip */}
          <div className="lg:col-span-4">
            <SkCard>
              <div className="divide-y divide-[#1F2738]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Sk className="h-3 w-16" />
                      <Sk className="h-2 w-28" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Sk className="h-3.5 w-16" />
                      <Sk className="h-2.5 w-10" />
                    </div>
                  </div>
                ))}
              </div>
            </SkCard>
          </div>

          {/* Row 2 — Earnings strip */}
          <div className="lg:col-span-12">
            <div className="flex gap-3 overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26] p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex w-36 shrink-0 flex-col gap-2 rounded-[8px] border border-[#252E42] bg-[#0F1420] p-3">
                  <Sk className="h-2 w-12" />
                  <Sk className="h-4 w-20" />
                  <Sk className="h-2 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* Row 3 — Watchlist (8) + Sectors (4) */}
          <div className="lg:col-span-8">
            <SkCard>
              <div className="grid grid-cols-2 gap-px bg-[#1F2738] sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-3 bg-[#141A26] p-4">
                    <div className="flex items-center justify-between">
                      <Sk className="h-3.5 w-12" />
                      <Sk className="h-4 w-12 rounded-[4px]" />
                    </div>
                    {/* sparkline */}
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

          <div className="lg:col-span-4">
            <SkCard>
              <div className="grid grid-cols-2 gap-px bg-[#1F2738] p-px sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Sk key={i} className="h-12 rounded-none" />
                ))}
              </div>
            </SkCard>
          </div>

          {/* Row 4 — Headlines */}
          <div className="lg:col-span-12">
            <SkCard>
              <div className="divide-y divide-[#1F2738]">
                {Array.from({ length: 5 }).map((_, i) => (
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

        </div>
      </main>
    </div>
  );
}
