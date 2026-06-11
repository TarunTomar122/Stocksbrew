import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { COMPARISON_PAGES, getComparisonPage } from "@/lib/compare-data";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return COMPARISON_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparisonPage(slug);
  if (!page) return { title: "Not Found" };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/compare/${slug}` },
    openGraph: {
      title: `${page.title} · stocksbrew`,
      description: page.description,
      url: `https://www.stocksbrew.online/compare/${slug}`,
    },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const page = getComparisonPage(slug);
  if (!page) notFound();

  return (
    <main className="flex-grow">
      <MarketingSchema
        path={`/compare/${slug}`}
        name={page.title}
        description={page.description}
        faqs={page.faqs}
        breadcrumbLabel={page.title}
        parent={{ name: "Compare", path: "/compare" }}
      />
      <div className="mx-auto w-full max-w-[880px] px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <Link href="/compare" className="text-[13px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors w-fit">
            ← All comparisons
          </Link>
          <h1 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.08]">
            {page.title}
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.6]">{page.verdict}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/watchlist" className="inline-flex h-[40px] items-center px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold">
              Start free Radar →
            </Link>
            <a
              href={page.competitorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[40px] items-center px-5 rounded-full border border-[#e5e7eb] text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
            >
              Visit {page.competitorName} ↗
            </a>
          </div>
        </header>

        <section className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[#e5e7eb] bg-[#fafaf7]">
                  <th className="text-left px-4 py-3 font-semibold text-[#111111]">Dimension</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#111111]">stocksbrew</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#111111]">{page.competitorName}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.dimension} className="border-b border-[#f3f4f6] last:border-0">
                    <td className="px-4 py-3 font-medium text-[#374151]">{row.dimension}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{row.stocksbrew}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{row.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#e5e7eb] p-6 flex flex-col gap-3">
            <h2 className="text-[16px] font-semibold text-[#111111]">Where stocksbrew wins</h2>
            <ul className="flex flex-col gap-2">
              {page.stocksbrewStrengths.map((item) => (
                <li key={item} className="text-[14px] text-[#6b7280] leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#10b981]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#e5e7eb] p-6 flex flex-col gap-3">
            <h2 className="text-[16px] font-semibold text-[#111111]">Where {page.competitorName} wins</h2>
            <ul className="flex flex-col gap-2">
              {page.competitorStrengths.map((item) => (
                <li key={item} className="text-[14px] text-[#6b7280] leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#6366f1]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">A US investor week on stocksbrew</h2>
          <ol className="flex flex-col gap-4">
            {page.workflow.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[12px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[15px] font-semibold text-[#111111]">{step.title}</h3>
                  <p className="text-[14px] text-[#6b7280] leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6">
          <h2 className="text-[18px] font-semibold text-[#111111]">Who should pick which</h2>
          <p className="text-[14px] text-[#374151] leading-relaxed">
            <strong className="text-[#111111]">Choose {page.competitorName} if:</strong> {page.competitorBestFor}
          </p>
          <p className="text-[14px] text-[#374151] leading-relaxed">
            <strong className="text-[#111111]">Choose stocksbrew if:</strong> {page.stocksbrewBestFor}
          </p>
          <p className="text-[14px] text-[#374151] leading-relaxed">
            <strong className="text-[#111111]">Use both if:</strong> {page.bothScenario}
          </p>
          <p className="text-[13px] text-[#6b7280]">
            stocksbrew: free for 3 Radar stocks,{" "}
            <Link href="/subscribe" className="underline underline-offset-2 hover:text-[#111111]">
              Pro at $12/month
            </Link>
            . {page.competitorName}: see{" "}
            {page.competitorPricingUrl ? (
              <a href={page.competitorPricingUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#111111]">
                their pricing page
              </a>
            ) : (
              "their website"
            )}
            .
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold text-[#111111]">Related reading</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/blog/stocksbrew-vs-finviz" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
              vs Finviz
            </Link>
            <Link href="/should-i-buy" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
              Should I Buy
            </Link>
            <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
              Research guide
            </Link>
          </div>
        </section>

        <FaqSection faqs={page.faqs} />

        <section className="rounded-2xl border border-[#111111] bg-[#111111] p-8 flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold text-white">Try the US workflow</h2>
          <p className="text-[14px] text-[#d1d5db] leading-relaxed max-w-[520px]">
            Add 3 stocks free. Get AI calls and optional email alerts when setups change.
          </p>
          <Link href="/watchlist" className="inline-flex h-[44px] w-fit items-center px-6 rounded-full bg-white text-[#111111] text-[13px] font-semibold">
            Open Radar →
          </Link>
        </section>
      </div>
    </main>
  );
}
