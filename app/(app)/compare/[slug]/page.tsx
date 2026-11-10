import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FREE_COVERED_STOCKS } from "@/lib/entitlements";

import { FaqSection } from "@/components/marketing/faq-section";
import { CompareRelatedReading } from "@/components/marketing/compare-related-reading";
import { ShareLinkBar } from "@/components/marketing/share-link-bar";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { COMPARISON_PAGES, getComparisonPage } from "@/lib/compare-data";
import { US_PRO_MONTHLY } from "@/lib/pricing";

type Props = { params: Promise<{ slug: string }> };

const VERIFIED_COMPARISONS: Record<string, string> = {
  "stocksbrew-vs-finviz": "July 16, 2026",
  "stocksbrew-vs-tradingview": "July 16, 2026",
  "stocksbrew-vs-seeking-alpha": "July 16, 2026",
};

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
  const verifiedOn = VERIFIED_COMPARISONS[slug];

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
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
          <Link href="/compare" className="text-[13px] font-medium text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)] transition-colors w-fit">
            ← All comparisons
          </Link>
          <h1 className="text-[36px] md:text-[48px] font-medium tracking-[-0.04em] text-[var(--oa-fg)] leading-[1.08]">
            {page.title}
          </h1>
          <p className="text-[16px] text-[var(--oa-fg)] leading-[1.6]">{page.verdict}</p>
          <p className="text-[12px] leading-relaxed text-[var(--oa-muted-fg)]">
            {verifiedOn ? `Official product details rechecked ${verifiedOn}. ` : "Product details can change. "}
            This is a stocksbrew-authored comparison based on public product documentation, not an affiliate placement. See our{" "}
            <Link href="/editorial-policy" className="underline underline-offset-2 hover:text-[var(--oa-fg)]">
              comparison methodology
            </Link>.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/radar" className="inline-flex h-[40px] items-center px-5 rounded-full bg-oa-primary text-white text-[13px] font-medium">
              Start free Watchlist →
            </Link>
            <a
              href={page.competitorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[40px] items-center px-5 rounded-full border border-[var(--oa-border)] text-[13px] font-medium text-[var(--oa-fg)] hover:border-[var(--oa-fg)] transition-colors"
            >
              Visit {page.competitorName} ↗
            </a>
          </div>
        </header>

        <section className="rounded-2xl border border-[var(--oa-border)] bg-[#fafaf7] p-6">
          <h2 className="text-[17px] font-medium text-[var(--oa-fg)]">Research notes</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--oa-muted-fg)]">
            We compare the job each tool is designed to do, show meaningful drawbacks, and link to the competitor&apos;s official pages so you can verify the final decision. Pricing and plan limits should always be confirmed before purchase.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-medium">
            <a href={page.competitorUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--oa-fg)] underline underline-offset-2">
              Official {page.competitorName} site ↗
            </a>
            {page.competitorPricingUrl ? (
              <a href={page.competitorPricingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--oa-fg)] underline underline-offset-2">
                Official pricing ↗
              </a>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--oa-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[var(--oa-border)] bg-[#fafaf7]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--oa-fg)]">Dimension</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--oa-fg)]">stocksbrew</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--oa-fg)]">{page.competitorName}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.dimension} className="border-b border-[var(--oa-bg)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--oa-fg)]">{row.dimension}</td>
                    <td className="px-4 py-3 text-[var(--oa-muted-fg)]">{row.stocksbrew}</td>
                    <td className="px-4 py-3 text-[var(--oa-muted-fg)]">{row.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[var(--oa-border)] p-6 flex flex-col gap-3">
            <h2 className="text-[16px] font-medium text-[var(--oa-fg)]">Where stocksbrew wins</h2>
            <ul className="flex flex-col gap-2">
              {page.stocksbrewStrengths.map((item) => (
                <li key={item} className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#10b981]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--oa-border)] p-6 flex flex-col gap-3">
            <h2 className="text-[16px] font-medium text-[var(--oa-fg)]">Where {page.competitorName} wins</h2>
            <ul className="flex flex-col gap-2">
              {page.competitorStrengths.map((item) => (
                <li key={item} className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#6366f1]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-[22px] font-medium text-[var(--oa-fg)] tracking-[-0.02em]">A US investor week on stocksbrew</h2>
          <ol className="flex flex-col gap-4">
            {page.workflow.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-oa-primary text-[12px] font-medium text-white">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[15px] font-medium text-[var(--oa-fg)]">{step.title}</h3>
                  <p className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--oa-border)] bg-[#fafaf7] p-6">
          <h2 className="text-[18px] font-medium text-[var(--oa-fg)]">Who should pick which</h2>
          <p className="text-[14px] text-[var(--oa-fg)] leading-relaxed">
            <strong className="text-[var(--oa-fg)]">Choose {page.competitorName} if:</strong> {page.competitorBestFor}
          </p>
          <p className="text-[14px] text-[var(--oa-fg)] leading-relaxed">
            <strong className="text-[var(--oa-fg)]">Choose stocksbrew if:</strong> {page.stocksbrewBestFor}
          </p>
          <p className="text-[14px] text-[var(--oa-fg)] leading-relaxed">
            <strong className="text-[var(--oa-fg)]">Use both if:</strong> {page.bothScenario}
          </p>
          <p className="text-[13px] text-[var(--oa-muted-fg)]">
            stocksbrew: free for 3 Watchlist stocks,{" "}
            <Link href="/pricing" className="underline underline-offset-2 hover:text-[var(--oa-fg)]">
              Pro at ${US_PRO_MONTHLY}/month
            </Link>
            . {page.competitorName}: see{" "}
            {page.competitorPricingUrl ? (
              <a href={page.competitorPricingUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--oa-fg)]">
                their pricing page
              </a>
            ) : (
              "their website"
            )}
            .
          </p>
        </section>

        <CompareRelatedReading slug={slug} />

        <ShareLinkBar url={`/compare/${slug}`} title={page.title} />

        <FaqSection faqs={page.faqs} />

        <section className="rounded-2xl border border-oa-primary bg-oa-primary p-8 flex flex-col gap-4">
          <h2 className="text-[20px] font-medium text-white">Try the US workflow</h2>
          <p className="text-[14px] text-[var(--oa-border)] leading-relaxed max-w-[520px]">
            Track as many stocks as you like free, with {FREE_COVERED_STOCKS} covered in full. Get AI calls and optional email alerts when setups change.
          </p>
          <Link href="/radar" className="inline-flex h-[44px] w-fit items-center px-6 rounded-full bg-oa-card text-[var(--oa-fg)] text-[13px] font-medium">
            Open Watchlist →
          </Link>
        </section>
      </div>
    </main>
  );
}
