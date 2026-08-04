import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { USE_CASES, getUseCase } from "@/lib/use-cases-data";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) return { title: "Not Found" };
  return {
    title: uc.title,
    description: uc.description,
    alternates: { canonical: `/use-cases/${slug}` },
    openGraph: {
      title: `${uc.title} · stocksbrew`,
      description: uc.description,
      url: `https://www.stocksbrew.online/use-cases/${slug}`,
    },
  };
}

export default async function UseCasePage({ params }: Props) {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) notFound();

  return (
    <main className="flex-grow">
      <MarketingSchema
        path={`/use-cases/${slug}`}
        name={uc.title}
        description={uc.description}
        faqs={uc.faqs}
        breadcrumbLabel={uc.title}
        parent={{ name: "Use cases", path: "/use-cases" }}
      />
      <div className="mx-auto w-full max-w-[880px] px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <Link href="/use-cases" className="text-[13px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors w-fit">
            ← All use cases
          </Link>
          <h1 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.08]">
            {uc.title}
          </h1>
          <p className="text-[18px] text-[#374151] leading-[1.5]">{uc.headline}</p>
          <p className="text-[15px] text-[#6b7280] leading-relaxed">{uc.pain}</p>
          <Link href="/watchlist" className="inline-flex h-[40px] w-fit items-center px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold">
            Add stocks to Watchlist →
          </Link>
        </header>

        <section className="flex flex-col gap-5">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Your workflow</h2>
          <ol className="flex flex-col gap-4">
            {uc.steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[12px] font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-[14px] text-[#374151] leading-relaxed pt-0.5">
                  {step.text}{" "}
                  {step.href && step.linkLabel && (
                    <Link href={step.href} className="font-medium text-[#111111] underline underline-offset-2 hover:text-[#0052ff]">
                      {step.linkLabel} →
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Tools for this workflow</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {uc.features.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="group flex flex-col gap-1 rounded-xl border border-[#e5e7eb] bg-[#fafaf7] p-4 hover:border-[#111111] hover:bg-white transition-all"
              >
                <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                  {f.name}
                </span>
                <span className="text-[12px] text-[#6b7280] leading-relaxed">{f.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <FaqSection faqs={uc.faqs} />

        <section className="rounded-2xl border border-[#111111] bg-[#111111] p-8 flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold text-white">Start with 3 stocks free</h2>
          <p className="text-[14px] text-[#d1d5db] leading-relaxed max-w-[480px]">
            Match this workflow in your Watchlist. Upgrade to Pro for unlimited names and full alert coverage.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/watchlist" className="inline-flex h-[44px] items-center px-6 rounded-full bg-white text-[#111111] text-[13px] font-semibold">
              Open Watchlist →
            </Link>
            <Link href="/subscribe" className="inline-flex h-[44px] items-center px-6 rounded-full border border-[#374151] text-white text-[13px] font-medium hover:border-white transition-colors">
              See Pro
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
