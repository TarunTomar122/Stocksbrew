import type { Metadata } from "next";
import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";
import { SEO_SECTOR_PAGES } from "@/lib/seo/sector-pages";

export const metadata: Metadata = {
  title: "US Stock Market Sectors",
  description:
    "Browse current US stock sector analysis for semiconductors, AI infrastructure, big tech, financials, healthcare, energy, industrials, and consumer stocks.",
  keywords: [
    "US stock market sectors",
    "sector analysis",
    "semiconductor stocks",
    "technology stocks",
    "US stocks by sector",
  ],
  alternates: { canonical: "/sectors" },
  openGraph: {
    title: "US Stock Market Sectors · stocksbrew",
    description:
      "Current sector briefs, tracked stocks, drivers, risks, and what to watch across eight major US market groups.",
    url: "https://www.stocksbrew.online/sectors",
  },
};

const FAQS = [
  {
    question: "What is stock market sector analysis?",
    answer:
      "Sector analysis groups companies with similar demand drivers and compares their momentum, earnings trends, valuation, risks, and market leadership. It helps distinguish a company-specific move from a broader industry move.",
  },
  {
    question: "Which US stock sectors does Stocksbrew track?",
    answer:
      "Stocksbrew publishes briefs for semiconductors, AI infrastructure, big tech, financials, healthcare, energy, industrials, and consumer stocks, with company links inside each group.",
  },
  {
    question: "How should investors compare stocks inside a sector?",
    answer:
      "Compare businesses on the metrics that drive that sector, then normalize for growth, margins, balance-sheet quality, valuation, and risk. A P/E ratio or price move alone is not enough.",
  },
];

export default function SectorsPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/sectors"
        name="US Stock Market Sectors"
        description="Current sector briefs and stock research across eight major US market groups."
        breadcrumbLabel="US Stock Market Sectors"
        faqs={FAQS}
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-[12px] text-on-surface-variant">
            <Link href="/" className="hover:text-on-surface">Home</Link>
            <span className="px-2">/</span>
            <span className="text-on-surface">Sectors</span>
          </nav>
          <p className="mt-8 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-brand">
            US market map
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-[-0.04em] text-on-surface md:text-6xl">
            US stock market sectors.
          </h1>
          <p className="mt-5 max-w-3xl text-[16px] leading-7 text-on-surface-variant">
            A stock can move because its company changed, because its industry changed, or because the whole
            market repriced risk. Start with the sector to see the shared drivers, then open individual company
            pages for valuation, growth, earnings, and recent news.
          </p>
        </header>

        <section className="border-t border-outline-variant" aria-labelledby="sector-directory">
          <h2 id="sector-directory" className="sr-only">US sector analysis directory</h2>
          <ol>
            {SEO_SECTOR_PAGES.map((sector, index) => (
              <li key={sector.slug} className="border-b border-outline-variant">
                <Link
                  href={`/sector/${sector.slug}`}
                  className="group grid gap-3 py-7 md:grid-cols-[52px_minmax(220px,0.65fr)_minmax(0,1.35fr)_24px] md:items-start"
                >
                  <span className="font-mono text-[11px] text-landing-brand">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xl font-bold tracking-[-0.02em] text-on-surface group-hover:underline">
                    {sector.name}
                  </span>
                  <span>
                    <span className="block text-[14px] leading-6 text-on-surface-variant">{sector.description}</span>
                    <span className="mt-2 block text-[12px] leading-5 text-on-surface-variant">
                      <strong className="text-on-surface">Research focus:</strong> {sector.focus}
                    </span>
                  </span>
                  <span className="text-xl text-landing-brand" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-8 border-y border-outline-variant py-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
              A better comparison
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-on-surface">
              Compare the business drivers, not just the tickers.
            </h2>
          </div>
          <div className="grid gap-5 text-[14px] leading-6 text-on-surface-variant sm:grid-cols-2">
            <p><strong className="text-on-surface">Semiconductors:</strong> separate designers, foundries, memory, networking, and equipment because their cycles and bottlenecks differ.</p>
            <p><strong className="text-on-surface">Financials:</strong> compare rates, deposits, credit quality, fee income, and capital rather than treating every bank alike.</p>
            <p><strong className="text-on-surface">Healthcare:</strong> weigh current cash flows against clinical, patent, reimbursement, and policy risk.</p>
            <p><strong className="text-on-surface">Industrials:</strong> study backlog quality, book-to-bill, margin execution, end markets, and government exposure.</p>
          </div>
        </section>

        <section aria-labelledby="sector-faqs">
          <h2 id="sector-faqs" className="text-2xl font-bold tracking-[-0.025em] text-on-surface">
            Sector analysis questions
          </h2>
          <dl className="mt-5 grid gap-6 md:grid-cols-3">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <dt className="text-[15px] font-bold text-on-surface">{faq.question}</dt>
                <dd className="mt-2 text-[13px] leading-6 text-on-surface-variant">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
