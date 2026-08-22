import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { COMPARISON_PAGES } from "@/lib/compare-data";

export const metadata: Metadata = {
  title: "Compare Stock Research Tools: stocksbrew vs Finviz & TradingView",
  description:
    "Compare stocksbrew with Finviz, TradingView, and other stock research tools across screening, evidence, monitoring, alerts, and cost.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "Compare stock research tools · stocksbrew",
    description: "See which stock research workflow fits your investing process.",
    url: "https://www.stocksbrew.online/compare",
  },
};

const OTHER_COMPARISONS = [
  {
    href: "/blog/finviz-vs-tradingview-vs-stocksbrew",
    title: "Finviz vs TradingView vs stocksbrew",
    description: "A source-backed workflow comparison across screening, charting, monitoring, alerts, and cost.",
  },
];

export default function CompareIndexPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path="/compare"
        name="Compare stocksbrew"
        description="Side-by-side comparisons of stocksbrew with other stock research tools."
        breadcrumbLabel="Compare"
      />
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-4 max-w-[720px]">
          <span className="text-[12px] font-medium tracking-[0.14em] uppercase text-[var(--oa-muted-fg)]">Compare</span>
          <h1 className="text-[40px] md:text-[52px] font-medium tracking-[-0.04em] text-[var(--oa-fg)] leading-[1.05]">
            How stocksbrew compares
          </h1>
          <p className="text-[16px] text-[var(--oa-fg)] leading-[1.55]">
            Picking a research stack? These pages break down what each tool does best so you can match the product to your market and workflow.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COMPARISON_PAGES.map((page) => (
            <Link
              key={page.slug}
              href={`/compare/${page.slug}`}
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--oa-border)] bg-oa-card p-6 hover:border-[var(--oa-fg)] hover:shadow-card-hover transition-all"
            >
              <h2 className="text-[18px] font-medium text-[var(--oa-fg)] group-hover:text-[var(--oa-primary)] transition-colors">
                {page.title}
              </h2>
              <p className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed flex-1">{page.description}</p>
              <span className="text-[13px] font-medium text-[var(--oa-fg)]">Read comparison →</span>
            </Link>
          ))}
          {OTHER_COMPARISONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--oa-border)] bg-[#fafaf7] p-6 hover:border-[var(--oa-fg)] hover:bg-oa-card transition-all"
            >
              <h2 className="text-[18px] font-medium text-[var(--oa-fg)] group-hover:text-[var(--oa-primary)] transition-colors">
                {item.title}
              </h2>
              <p className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed flex-1">{item.description}</p>
              <span className="text-[13px] font-medium text-[var(--oa-fg)]">Read on blog →</span>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-[var(--oa-fg)] bg-[var(--oa-fg)] p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-[440px]">
            <h2 className="text-[20px] font-medium text-white">Not sure yet?</h2>
            <p className="text-[14px] text-[var(--oa-border)] leading-relaxed">
              Add 3 stocks to Watchlist free or run Should I Buy on any US ticker. No card required.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/radar" className="inline-flex h-[44px] items-center px-6 rounded-full bg-oa-card text-[var(--oa-fg)] text-[13px] font-medium">
              Open Watchlist →
            </Link>
            <Link href="/should-i-buy" className="inline-flex h-[44px] items-center px-6 rounded-full border border-[var(--oa-fg)] text-white text-[13px] font-medium hover:border-white transition-colors">
              Try Should I Buy
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-medium text-[var(--oa-fg)]">Related guides</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/blog/buy-hold-sell-signals-explained" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Buy/hold/sell signals
            </Link>
            <Link href="/blog/watchlist-vs-portfolio-tracker" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Watchlist vs portfolio
            </Link>
            <Link href="/blog/finviz-vs-tradingview-vs-stocksbrew" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              AI tools compared
            </Link>
            <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Research guide hub
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
