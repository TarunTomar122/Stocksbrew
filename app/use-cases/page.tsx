import type { Metadata } from "next";
import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";
import { USE_CASES } from "@/lib/use-cases-data";

export const metadata: Metadata = {
  title: "Stock research by investing style",
  description:
    "Workflow guides for dividend investors, swing traders and earnings-season prep. Each maps to the stocksbrew Watchlist, Should I Buy and free tools.",
  alternates: { canonical: "/use-cases" },
  openGraph: {
    title: "Stock research use cases · stocksbrew",
    description: "Pick a workflow that matches how you invest and jump to the right tools.",
    url: "https://www.stocksbrew.online/use-cases",
  },
};

export default function UseCasesIndexPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/use-cases"
        name="Stock research use cases"
        description="Workflow guides mapped to stocksbrew tools for different investing styles."
        breadcrumbLabel="Use cases"
      />
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-4 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">Use cases</span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Research workflows by style
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Not sure where to start? Pick the job you are trying to do. Each page maps your workflow to live stocksbrew tools, not generic advice.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {USE_CASES.map((uc) => (
            <Link
              key={uc.slug}
              href={`/use-cases/${uc.slug}`}
              className="group flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:border-[#111111] hover:shadow-card-hover transition-all h-full"
            >
              <h2 className="text-[17px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors leading-snug">
                {uc.title}
              </h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed flex-1">{uc.headline}</p>
              <span className="text-[13px] font-medium text-[#111111]">See workflow →</span>
            </Link>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-[14px] text-[#6b7280]">Want the full map of tools and guides?</p>
          <Link href="/guides" className="text-[14px] font-semibold text-[#111111] underline underline-offset-2 hover:text-[#0052ff] w-fit">
            Open the stock research guide →
          </Link>
        </section>
      </div>
    </main>
  );
}
