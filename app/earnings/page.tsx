import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EarningsCalendarStream } from "@/components/earnings-calendar-stream";
import { MarketingSchema } from "@/components/seo/marketing-schema";

export const metadata: Metadata = {
  title: "US Earnings Calendar & Reports",
  description:
    "Upcoming US earnings reports with report dates, timing, estimated EPS, and market expectations. Use the calendar, then analyze what changed after results.",
  keywords: [
    "earnings reports",
    "US earnings calendar",
    "stock earnings",
    "upcoming earnings",
    "earnings analysis",
  ],
  alternates: { canonical: "/earnings" },
  openGraph: {
    title: "US Earnings Calendar & Reports | stocksbrew",
    description:
      "Upcoming earnings reports for US stocks. See report dates, estimated EPS, and market expectations.",
    url: "https://www.stocksbrew.online/earnings",
  },
};

function EarningsCalendarSkeletonInline() {
  return <div className="h-[420px] w-full max-w-[960px] animate-pulse rounded-2xl bg-surface-container-low" />;
}

export default function EarningsPage() {
  const faqs = [
    {
      question: "What should investors check in an earnings report?",
      answer:
        "Compare revenue, margins, earnings per share, cash flow, and guidance with both the prior period and the expectations embedded in the stock price. Then identify what changed in management's explanation, risks, and outlook.",
    },
    {
      question: "Where can I verify a US company's earnings report?",
      answer:
        "Use the company's investor-relations page and its SEC filings. A quarterly Form 10-Q provides financial statements and management discussion, while an 8-K often carries the earnings release.",
    },
    {
      question: "Why can a stock fall after beating earnings estimates?",
      answer:
        "The reported quarter is only one input. Guidance, margins, forward demand, valuation, positioning, and the quality of the beat can matter more than the headline EPS result.",
    },
  ];
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/earnings"
        name="US Earnings Calendar and Reports"
        description="Upcoming US earnings reports with dates, timing, EPS estimates, and an evidence-first analysis workflow."
        breadcrumbLabel="Earnings Calendar"
        faqs={faqs}
      />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-8 px-6 py-12 md:px-10 lg:px-16">
        <header className="flex w-full max-w-[960px] flex-col gap-2">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Free tool
          </span>
          <h1 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#111111] md:text-[44px]">
            US Earnings Calendar
          </h1>
          <p className="text-[16px] leading-[1.55] text-[#374151]">
            See which companies are reporting earnings this month. Covers pre-market, after-close, and
            during-market reports with EPS estimates at a glance.
          </p>
        </header>

        <div className="w-full max-w-[960px]">
          <Suspense fallback={<EarningsCalendarSkeletonInline />}>
            <div className="landing-stream-in">
              <EarningsCalendarStream />
            </div>
          </Suspense>
        </div>

        <div className="w-full max-w-[960px] rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
          <p className="mb-3 text-[14px] text-[#6b7280]">
            New to earnings tracking? Read our guide on{" "}
            <Link href="/blog/earnings-season-watchlist-playbook" className="font-semibold text-[#111111] underline">
              navigating earnings season
            </Link>
            .
          </p>
          <Link href="/events" className="text-[13px] font-semibold text-[#111111] underline">
            See what changed in recent earnings reports →
          </Link>
        </div>

        <section className="grid w-full max-w-[960px] gap-8 border-y border-[#e5e7eb] py-9 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#15803d]">
              Earnings workflow
            </span>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] text-[#111111]">
              The report date is only the start.
            </h2>
          </div>
          <div className="text-[14px] leading-6 text-[#4b5563]">
            <p>
              Before the report, write down the revenue, margin, EPS, and guidance questions that matter.
              After the release, compare reported results with the prior quarter, the year-ago period, and
              management&apos;s previous outlook. Verify material facts in the company release and SEC filing
              before interpreting the stock reaction.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[#15803d]">
              <Link href="/blog/earnings-report-analysis-template" className="hover:underline">
                Copy the earnings analysis template
              </Link>
              <Link href="/blog/how-to-analyze-earnings-report" className="hover:underline">
                Read the full guide
              </Link>
              <Link href="/stocks" className="hover:underline">Browse US stocks</Link>
            </div>
          </div>
        </section>

        <section className="w-full max-w-[960px]">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111]">Earnings report questions</h2>
          <dl className="mt-5 grid gap-6 md:grid-cols-3">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="text-[14px] font-semibold text-[#111111]">{faq.question}</dt>
                <dd className="mt-2 text-[13px] leading-6 text-[#6b7280]">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
