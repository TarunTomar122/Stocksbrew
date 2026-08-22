import { OaSiteHeader } from "@/components/oa/oa-site-header";
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
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path="/sectors"
        name="US Stock Market Sectors"
        description="Current sector briefs and stock research across eight major US market groups."
        breadcrumbLabel="US Stock Market Sectors"
        faqs={FAQS}
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-[12px] text-oa-muted-fg">
            <Link href="/" className="hover:text-oa-fg">Home</Link>
            <span className="px-2">/</span>
            <span className="text-oa-fg">Sectors</span>
          </nav>
          <p className="mt-8 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-oa-primary">
            US market map
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-[-0.04em] text-oa-fg md:text-6xl">
            US stock market sectors.
          </h1>
          <p className="mt-5 max-w-3xl text-[16px] leading-7 text-oa-muted-fg">
            A stock can move because its company changed, because its industry changed, or because the whole
            market repriced risk. Start with the sector to see the shared drivers, then open individual company
            pages for valuation, growth, earnings, and recent news.
          </p>
        </header>

        <section className="border-t border-oa-border" aria-labelledby="sector-directory">
          <h2 id="sector-directory" className="sr-only">US sector analysis directory</h2>
          <ol>
            {SEO_SECTOR_PAGES.map((sector, index) => (
              <li key={sector.slug} className="border-b border-oa-border">
                <Link
                  href={`/sector/${sector.slug}`}
                  className="group grid gap-3 py-7 md:grid-cols-[52px_minmax(220px,0.65fr)_minmax(0,1.35fr)_24px] md:items-start"
                >
                  <span className="font-mono text-[11px] text-oa-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xl font-medium tracking-[-0.02em] text-oa-fg group-hover:underline">
                    {sector.name}
                  </span>
                  <span>
                    <span className="block text-[14px] leading-6 text-oa-muted-fg">{sector.description}</span>
                    <span className="mt-2 block text-[12px] leading-5 text-oa-muted-fg">
                      <strong className="text-oa-fg">Research focus:</strong> {sector.focus}
                    </span>
                  </span>
                  <span className="text-xl text-oa-primary" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-8 border-y border-oa-border py-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-oa-primary">
              A better comparison
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.025em] text-oa-fg">
              Compare the business drivers, not just the tickers.
            </h2>
          </div>
          <div className="grid gap-5 text-[14px] leading-6 text-oa-muted-fg sm:grid-cols-2">
            <p><strong className="text-oa-fg">Semiconductors:</strong> separate designers, foundries, memory, networking, and equipment because their cycles and bottlenecks differ.</p>
            <p><strong className="text-oa-fg">Financials:</strong> compare rates, deposits, credit quality, fee income, and capital rather than treating every bank alike.</p>
            <p><strong className="text-oa-fg">Healthcare:</strong> weigh current cash flows against clinical, patent, reimbursement, and policy risk.</p>
            <p><strong className="text-oa-fg">Industrials:</strong> study backlog quality, book-to-bill, margin execution, end markets, and government exposure.</p>
          </div>
        </section>

        <section aria-labelledby="sector-faqs">
          <h2 id="sector-faqs" className="text-2xl font-medium tracking-[-0.025em] text-oa-fg">
            Sector analysis questions
          </h2>
          <dl className="mt-5 grid gap-6 md:grid-cols-3">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <dt className="text-[15px] font-medium text-oa-fg">{faq.question}</dt>
                <dd className="mt-2 text-[13px] leading-6 text-oa-muted-fg">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
