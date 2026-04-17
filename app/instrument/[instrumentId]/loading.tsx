import { Sk, SkCard, SkNav, SkRibbon } from "@/components/skeleton";

export default function InstrumentLoading() {
  return (
    <div className="min-h-screen bg-[#0A0E16] font-body text-[#F5F6F8]">
      <header className="sticky top-0 z-50 w-full border-b border-[#1F2738] bg-[#0F1420]/95 backdrop-blur">
        <SkRibbon />
        <SkNav />
      </header>
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-5 flex items-center gap-2">
          <Sk className="h-2.5 w-12" />
          <Sk className="h-2 w-2 rounded-full" />
          <Sk className="h-2.5 w-20" />
        </div>
        <SkCard>
          <div className="p-6 flex flex-col gap-3">
            <Sk className="h-7 w-56" />
            <Sk className="h-3 w-full" />
            <Sk className="h-3 w-11/12" />
            <Sk className="h-3 w-4/5" />
          </div>
        </SkCard>
      </main>
    </div>
  );
}
