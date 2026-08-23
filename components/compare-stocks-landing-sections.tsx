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
    answer: "You can add the stocks to your Watchlist to keep tracking their price, research and important changes.",
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

      <div>
        <div className="mx-auto grid w-full max-w-[76rem] gap-12 px-4 py-14 sm:px-6 md:grid-cols-[0.8fr_1.2fr] sm:py-20">
          <section aria-labelledby="compare-after">
            <p className="oa-mono text-[10px] uppercase tracking-[0.14em] text-oa-muted-fg">
              After the comparison
            </p>
            <h2 id="compare-after" className="mt-3 max-w-sm text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg sm:text-3xl">
              Compare once. Track what changes.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-oa-muted-fg">
              Add the names you care about to your Watchlist and we&apos;ll keep their research current.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/watchlist"
                className="inline-flex h-10 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
              >
                Open Watchlist
              </Link>
              <Link
                href="/should-i-buy"
                className="inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
              >
                Single-stock verdict
              </Link>
            </div>
          </section>

          <section aria-labelledby="compare-faq">
            <h2 id="compare-faq" className="text-[17px] font-medium tracking-tight text-oa-fg">Quick questions</h2>
            <div className="mt-4 flex flex-col rounded-[18px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group border-b border-oa-border py-4 last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-oa-fg">
                    {faq.question}
                    <span className="text-lg font-normal text-oa-muted-fg transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-xl pt-3 text-[13px] leading-relaxed text-oa-muted-fg">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
