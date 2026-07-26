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
    "Turn the US stocks you follow into clear buy, hold, and sell calls, with earnings and price-zone alerts. Free for 3 stocks.",
  alternates: { canonical: "/radar" },
  openGraph: {
    title: "Stock watchlist alerts and calls · stocksbrew",
    description:
      "Clear buy, hold, and sell calls for the US stocks you follow, with earnings and price-zone alerts.",
    url: "https://www.stocksbrew.online/radar",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock watchlist alerts and calls · stocksbrew",
    description:
      "Clear buy, hold, and sell calls for the US stocks you follow, with earnings and price-zone alerts.",
  },
};

const FEATURES = [
  {
    title: "Your book, split clearly",
    body: "Holdings and watching lists stay separate — so research names do not pollute portfolio decisions.",
  },
  {
    title: "Buy / hold / sell on every ticker",
    body: "Calls update when fundamentals, news, Reddit, earnings, or price action materially change — not for every price ping.",
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
    question: "What is stocksbrew Radar?",
    answer:
      "Radar is your command center for US stocks you track. Each name gets a buy, hold, or sell stance with rationale, plus portfolio health, earnings flags, and alerts when a setup changes. Free for 3 stocks.",
  },
  {
    question: "Is Radar the same as a portfolio tracker?",
    answer:
      "Radar focuses on what to do next — stances, alerts, and health — not tax lots or broker sync. Pair it with your broker for execution and cost basis.",
  },
  {
    question: "How is Radar different from Finviz or TradingView?",
    answer:
      "Finviz and TradingView excel at screening and charting. Radar excels at personalized calls and alerts on the names you already care about. Many investors use all three.",
  },
  {
    question: "How much does Radar cost?",
    answer: `Free for 3 tracked stocks. Try Pro free for 3 days, then pay $${US_PRO_MONTHLY}/month for unlimited watchlist names and email alerts when setups change.`,
  },
];

export default function RadarLandingPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/radar"
        name="stocksbrew Radar"
        description="Buy, hold, and sell calls on your US stock watchlist, with alerts when a setup changes."
        faqs={FAQS}
        breadcrumbLabel="Radar"
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-14 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex max-w-[760px] flex-col gap-5">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">Radar</span>
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            {TAGLINE}
          </h1>
          <p className="text-[17px] text-[#374151] leading-[1.6]">
            Radar reads fundamentals, news, Reddit, earnings, and price action for your watchlist — then tells you what changed and what to do in plain English. Get alerted when a setup matters, not for every tick.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/watchlist"
              className="inline-flex h-[44px] items-center px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold"
            >
              Open your free watchlist →
            </Link>
            <Link
              href="/should-i-buy"
              className="inline-flex h-[44px] items-center px-6 rounded-full border border-[#e5e7eb] text-[#111111] text-[14px] font-medium hover:border-[#111111] transition-colors"
            >
              Try Should I Buy
            </Link>
          </div>
        </header>

        <DemoRadar headingLevel="h2" />

        <section className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-[#e5e7eb] p-6 flex flex-col gap-2">
              <h2 className="text-[17px] font-semibold text-[#111111]">{f.title}</h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-semibold text-[#111111]">Learn more</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/blog/buy-hold-sell-signals-explained" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Buy/hold/sell signals
            </Link>
            <Link href="/blog/watchlist-vs-portfolio-tracker" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Watchlist vs portfolio
            </Link>
            <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] text-[13px] font-medium hover:border-[#111111]">
              Research guide
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-semibold text-[#111111]">How stocksbrew compares</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_COMPARE_LINKS.slice(0, 6).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-[#fafaf7] text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
              >
                {c.label}
              </Link>
            ))}
            <Link href="/compare" className="inline-flex h-[36px] items-center px-4 text-[13px] font-medium text-[#0052ff] hover:underline">
              All comparisons →
            </Link>
          </div>
        </section>

        <ShareLinkBar url="/radar" title="stocksbrew Radar — AI watchlist buy, hold & sell calls" />

        <FaqSection faqs={FAQS} />

        <section className="rounded-2xl border border-[#111111] bg-[#111111] p-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 max-w-[480px]">
            <h2 className="text-[22px] font-semibold text-white">Start with 3 free stocks</h2>
            <p className="text-[14px] text-[#d1d5db] leading-relaxed">
              Add your holdings and watchlist. Get today&apos;s calls in under a minute.
            </p>
          </div>
          <Link href="/watchlist" className="inline-flex h-[44px] w-fit items-center px-6 rounded-full bg-white text-[#111111] text-[14px] font-semibold">
            Open Radar →
          </Link>
        </section>
      </div>
    </main>
  );
}
