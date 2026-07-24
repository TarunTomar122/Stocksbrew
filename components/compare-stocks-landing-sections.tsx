import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";

const FAQS = [
  {
    question: "Is the stock comparison tool free?",
    answer: "Yes. Compare two to five US stocks without signing in.",
  },
  {
    question: "What does Stocksbrew compare?",
    answer: "Current price, target room, market cap, valuation, growth, quality, momentum, returns, RSI, beta and more.",
  },
  {
    question: "What does “Best” mean?",
    answer: "It marks the strongest comparable value in that row. Metrics such as price, P/E, RSI and beta are shown without declaring a winner.",
  },
  {
    question: "Can I save a comparison?",
    answer: "You can add the stocks to Radar to keep tracking them as their price and setup change.",
  },
];

export function CompareStocksLandingSections() {
  return (
    <>
      <MarketingSchema
        path="/compare-stocks"
        name="Free Stock Comparison Tool"
        description="Compare up to 5 US stocks across current price, fundamentals, scores and returns."
        faqs={FAQS}
        breadcrumbLabel="Compare Stocks"
      />

      <div className="border-t border-[#e3e8e5] bg-[#f7f9f8]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 px-5 py-14 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:py-20 lg:px-10">
          <section>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#087a5b]">
              After the comparison
            </span>
            <h2 className="mt-3 max-w-sm text-[28px] font-semibold leading-[1.05] tracking-[-0.04em] text-[#151b17] sm:text-[34px]">
              Compare once. Track what changes.
            </h2>
            <p className="mt-4 max-w-sm text-[14px] leading-6 text-[#68736c]">
              Put the names you care about on Radar instead of rebuilding the same spreadsheet next week.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/watchlist"
                className="rounded-full bg-[#111713] px-4 py-2.5 text-[11px] font-semibold text-white"
              >
                Open Radar
              </Link>
              <Link
                href="/should-i-buy"
                className="rounded-full border border-[#d6ddd8] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#344139]"
              >
                Single-stock verdict
              </Link>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#1c241f]">Quick questions</h2>
            <div className="mt-4 divide-y divide-[#dde3df] border-y border-[#dde3df]">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] font-semibold text-[#27322b]">
                    {faq.question}
                    <span className="text-[18px] font-normal text-[#7f8982] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-xl pt-3 text-[12px] leading-5 text-[#6d7771]">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
