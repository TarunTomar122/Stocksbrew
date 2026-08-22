import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";
import Link from "next/link";

import { DemoRadar } from "@/components/demo-radar";
import { FaqSection } from "@/components/marketing/faq-section";
import { ShareLinkBar } from "@/components/marketing/share-link-bar";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { ALL_COMPARE_LINKS } from "@/lib/seo/compare-links";
import { TAGLINE } from "@/lib/brand-copy";
import { US_PRO_MONTHLY } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Stock Watchlist Alerts & Buy, Hold, Sell Calls",
  description:
    "Track the US stocks you care about with fresh AI research, earnings context, and alerts when something important changes. Free for 3 stocks.",
  alternates: { canonical: "/radar" },
  openGraph: {
    title: "Stock watchlist alerts and calls · stocksbrew",
    description:
      "Fresh AI research and alerts for the US stocks you choose to track.",
    url: "https://www.stocksbrew.online/radar",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock watchlist alerts and calls · stocksbrew",
    description:
      "Fresh AI research and alerts for the US stocks you choose to track.",
  },
};

const FEATURES = [
  {
    title: "Your book, split clearly",
    body: "Holdings and watching lists stay separate — so research names do not pollute portfolio decisions.",
  },
  {
    title: "A current view on every ticker",
    body: "See the latest call, price zones, target, earnings, news and the reason anything changed.",
  },
  {
    title: "Portfolio health grade",
    body: "Concentration, sector tilt, and pillar scores so you catch risk before a drawdown forces a sale.",
  },
  {
    title: "Ideas that fit your book",
    body: "Screened suggestions aligned to what you already own — not a generic hot-stock feed.",
  },
];

const FAQS = [
  {
    question: "What is the stocksbrew Watchlist?",
    answer:
      "Track the US stocks you own or watch. Your Watchlist keeps their prices, research, earnings and important changes in one place. Free for three stocks.",
  },
  {
    question: "Is the Watchlist the same as a portfolio tracker?",
    answer:
      "The Watchlist covers current calls, alerts and portfolio health. It does not replace your broker for execution, tax lots or cost basis.",
  },
  {
    question: "How is the Watchlist different from Finviz or TradingView?",
    answer:
      "Finviz and TradingView cover screening and charting. Stocksbrew keeps researching the stocks you choose and alerts you to important changes.",
  },
  {
    question: "How much does the Watchlist cost?",
    answer: `Free for 3 tracked stocks. Try Pro free for 3 days, then pay $${US_PRO_MONTHLY}/month for unlimited watchlist names and email alerts when setups change.`,
  },
];

export default function RadarLandingPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path="/radar"
        name="stocksbrew Watchlist"
        description="Track US stocks with current research, earnings context and alerts for important changes."
        faqs={FAQS}
        breadcrumbLabel="Watchlist"
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-14 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex max-w-[760px] flex-col gap-5">
          <span className="text-[12px] font-medium tracking-[0.14em] uppercase text-[var(--oa-muted-fg)]">Watchlist</span>
          <h1 className="text-[40px] md:text-[56px] font-medium tracking-[-0.04em] text-[var(--oa-fg)] leading-[1.05]">
            {TAGLINE}
          </h1>
          <p className="text-[17px] text-[var(--oa-fg)] leading-[1.6]">
            Add the stocks you own or follow. See their financials, latest research, earnings, news, calls and price levels together. We&apos;ll email you when something important changes.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/watchlist"
              className="inline-flex h-[44px] items-center px-6 rounded-full bg-[var(--oa-fg)] text-white text-[14px] font-medium"
            >
              Open your free watchlist →
            </Link>
            <Link
              href="/should-i-buy"
              className="inline-flex h-[44px] items-center px-6 rounded-full border border-[var(--oa-border)] text-[var(--oa-fg)] text-[14px] font-medium hover:border-[var(--oa-fg)] transition-colors"
            >
              Try Should I Buy
            </Link>
          </div>
        </header>

        <DemoRadar headingLevel="h2" />

        <section className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-[var(--oa-border)] p-6 flex flex-col gap-2">
              <h2 className="text-[17px] font-medium text-[var(--oa-fg)]">{f.title}</h2>
              <p className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-medium text-[var(--oa-fg)]">Learn more</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/blog/buy-hold-sell-signals-explained" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Buy/hold/sell signals
            </Link>
            <Link href="/blog/watchlist-vs-portfolio-tracker" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Watchlist vs portfolio
            </Link>
            <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] text-[13px] font-medium hover:border-[var(--oa-fg)]">
              Research guide
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-medium text-[var(--oa-fg)]">How stocksbrew compares</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_COMPARE_LINKS.slice(0, 6).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[var(--oa-border)] bg-[#fafaf7] text-[13px] font-medium text-[var(--oa-fg)] hover:border-[var(--oa-fg)] transition-colors"
              >
                {c.label}
              </Link>
            ))}
            <Link href="/compare" className="inline-flex h-[36px] items-center px-4 text-[13px] font-medium text-[var(--oa-primary)] hover:underline">
              All comparisons →
            </Link>
          </div>
        </section>

        <ShareLinkBar url="/radar" title="stocksbrew Watchlist — stock research and alerts" />

        <FaqSection faqs={FAQS} />

        <section className="rounded-2xl border border-[var(--oa-fg)] bg-[var(--oa-fg)] p-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 max-w-[480px]">
            <h2 className="text-[22px] font-medium text-white">Start with 3 free stocks</h2>
            <p className="text-[14px] text-[var(--oa-border)] leading-relaxed">
              Add your holdings and watchlist. Get today&apos;s calls in under a minute.
            </p>
          </div>
          <Link href="/watchlist" className="inline-flex h-[44px] w-fit items-center px-6 rounded-full bg-oa-card text-[var(--oa-fg)] text-[14px] font-medium">
            Open Watchlist →
          </Link>
        </section>
      </div>
    </main>
  );
}
