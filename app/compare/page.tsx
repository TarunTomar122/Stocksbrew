import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { COMPARISON_PAGES } from "@/lib/compare-data";

export const metadata: Metadata = {
  title: "Compare stocksbrew",
  description:
    "Side-by-side comparisons of stocksbrew with Tickertape, Finviz, and other stock research tools. Pick the right workflow for US investing.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "Compare stocksbrew · stocksbrew",
    description: "Honest tool comparisons for US stock research workflows.",
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
    <main className="flex-grow">
      <MarketingSchema
        path="/compare"
        name="Compare stocksbrew"
        description="Side-by-side comparisons of stocksbrew with other stock research tools."
        breadcrumbLabel="Compare"
      />
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-4 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">Compare</span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            How stocksbrew compares
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Picking a research stack? These pages break down what each tool does best so you can match the product to your market and workflow.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COMPARISON_PAGES.map((page) => (
            <Link
              key={page.slug}
              href={`/compare/${page.slug}`}
              className="group flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:border-[#111111] hover:shadow-card-hover transition-all"
            >
              <h2 className="text-[18px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                {page.title}
              </h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed flex-1">{page.description}</p>
              <span className="text-[13px] font-medium text-[#111111]">Read comparison →</span>
            </Link>
          ))}
          {OTHER_COMPARISONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6 hover:border-[#111111] hover:bg-white transition-all"
            >
              <h2 className="text-[18px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                {item.title}
              </h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed flex-1">{item.description}</p>
              <span className="text-[13px] font-medium text-[#111111]">Read on blog →</span>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-[#111111] bg-[#111111] p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-[440px]">
            <h2 className="text-[20px] font-semibold text-white">Not sure yet?</h2>
            <p className="text-[14px] text-[#d1d5db] leading-relaxed">
              Add 3 stocks to Watchlist free or run Should I Buy on any US ticker. No card required.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/radar" className="inline-flex h-[44px] items-center px-6 rounded-full bg-white text-[#111111] text-[13px] font-semibold">
              Open Watchlist →
            </Link>
            <Link href="/should-i-buy" className="inline-flex h-[44px] items-center px-6 rounded-full border border-[#374151] text-white text-[13px] font-medium hover:border-white transition-colors">
              Try Should I Buy
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-semibold text-[#111111]">Related guides</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/blog/buy-hold-sell-signals-explained" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Buy/hold/sell signals
            </Link>
            <Link href="/blog/watchlist-vs-portfolio-tracker" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Watchlist vs portfolio
            </Link>
            <Link href="/blog/finviz-vs-tradingview-vs-stocksbrew" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              AI tools compared
            </Link>
            <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Research guide hub
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
