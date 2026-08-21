import type { Metadata } from "next";
import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
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

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";

export default function UseCasesIndexPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path="/use-cases"
        name="Stock research use cases"
        description="Workflow guides mapped to stocksbrew tools for different investing styles."
        breadcrumbLabel="Use cases"
      />
      <div className="mx-auto w-full max-w-[76rem] px-4 pb-20 sm:px-6">
        <header className="max-w-[640px] pb-12 pt-10 sm:pt-16">
          <p className={EYEBROW}>Use cases</p>
          <h1 className={`mt-4 ${H1}`}>Start from how you invest</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            {USE_CASES.length} workflows, each mapped to live tools. Pick the job you are trying to do and we will show you the clicks, not generic advice.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((uc) => (
            <Link
              key={uc.slug}
              href={`/use-cases/${uc.slug}`}
              className="group flex flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
            >
              <h2 className="text-[16px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
                {uc.title}
              </h2>
              <p className="flex-1 text-sm leading-relaxed text-oa-muted-fg">{uc.headline}</p>
              <span className="mt-2 flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">
                See workflow
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-14 flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">Want the full map?</h2>
            <p className="text-sm leading-relaxed text-oa-muted-fg">
              Every tool and guide, organized into one research path.
            </p>
          </div>
          <Link
            href="/guides"
            className="group inline-flex h-10 w-fit shrink-0 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Open the guide
            <span aria-hidden className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5">›</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
