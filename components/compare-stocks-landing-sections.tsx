import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { US_PRO_MONTHLY } from "@/lib/pricing";

const COMPARE_STOCKS_FAQS = [
  {
    question: "Is Compare Stocks really free?",
    answer:
      "Yes. Run as many comparisons as you like on US tickers without signing in. We pull fundamentals, scores, and returns from the same data that powers our Radar briefs.",
  },
  {
    question: "How many stocks can I compare at once?",
    answer:
      "Up to 5 tickers per comparison. That's the sweet spot for a side-by-side table on desktop and mobile without losing readability.",
  },
  {
    question: "What metrics are shown?",
    answer:
      "Price, day change, market cap, P/E, dividend yield, 52-week high and low, beta, RSI, analyst price target with upside, the stocksbrew overall score and four pillar scores (Valuation, Growth, Quality, Momentum), verdict, and 1m / 3m / 6m / 1y returns.",
  },
  {
    question: "How is the 'best' per row decided?",
    answer:
      "For each numeric row we pick the highest (or lowest, where it makes sense — like P/E and beta) value across your selected stocks. The winning cell gets a green highlight and a 'Best' badge so you can scan fast. Ties and missing data don't get a badge.",
  },
  {
    question: "Can I track the stocks I just compared?",
    answer:
      "Yes. There's an 'Add all to Radar' button on the results screen. Free Radar tracks up to 3 US stocks; Pro unlocks unlimited tracking and email alerts when setups shift.",
  },
  {
    question: "What if a ticker can't be found?",
    answer:
      "We show a 'No data' card in that slot and the rest of the table still works. The ticker is probably delisted, renamed, or not in our coverage universe yet.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. Compare Stocks is a research tool — it lines up data so you can make your own call. stocksbrew is not a broker and does not provide personalized investment advice.",
  },
];

const COMPARE_STOCKS_STEPS = [
  {
    title: "Add 2 to 5 US tickers",
    body: "Search by ticker or company name, paste a list, or tap a quick-add chip. The slots fill up in real time.",
  },
  {
    title: "Hit Compare",
    body: "We pull price, fundamentals, scores, RSI, and returns for every stock and build a side-by-side table in under a second.",
  },
  {
    title: "Spot the winner, then decide",
    body: "Each row highlights the best stock in green with a 'Best' badge. Add the whole list to Radar in one click if you want ongoing briefs.",
  },
];

const COMPARE_STOCKS_STACK = [
  { name: "Compare Stocks", href: "/compare-stocks", role: "Line up names side by side" },
  { name: "Should I Buy", href: "/should-i-buy", role: "Get a single-stock verdict" },
  { name: "Portfolio Analyzer", href: "/portfolio", role: "See concentration and overlap" },
  { name: "Radar", href: "/watchlist", role: "Daily directives on keepers (3 free)" },
];

export function CompareStocksLandingSections() {
  return (
    <>
      <MarketingSchema
        path="/compare-stocks"
        name="Free Stock Comparison Tool"
        description="Compare up to 5 US stocks side by side. See price, scores, fundamentals, and returns in one table with the winner of each row highlighted."
        faqs={COMPARE_STOCKS_FAQS}
        breadcrumbLabel="Compare Stocks"
      />
      <div className="border-t border-[#e5e7eb] bg-[#fafaf7]">
        <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-14 md:py-20 flex flex-col gap-14">
          <section className="flex flex-col gap-5 max-w-[720px]">
            <h2 className="text-[28px] font-semibold text-[#111111] tracking-[-0.03em]">How it works</h2>
            <ol className="flex flex-col gap-4">
              {COMPARE_STOCKS_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-[12px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[15px] font-semibold text-[#111111]">{step.title}</h3>
                    <p className="text-[14px] text-[#6b7280] leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">
              Compare Stocks vs. screeners
            </h2>
            <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#fafaf7]">
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">Capability</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">Compare Stocks</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">Typical screener</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#374151]">Number of stocks</td>
                      <td className="px-4 py-3 text-[#6b7280]">2 to 5 at a time, side by side</td>
                      <td className="px-4 py-3 text-[#6b7280]">Hundreds in a sortable table</td>
                    </tr>
                    <tr className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#374151]">Best per row</td>
                      <td className="px-4 py-3 text-[#6b7280]">Auto-highlighted in green</td>
                      <td className="px-4 py-3 text-[#6b7280]">Sort and pick manually</td>
                    </tr>
                    <tr className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#374151]">Scoring</td>
                      <td className="px-4 py-3 text-[#6b7280]">Stocksbrew 0–100 with 4 pillars</td>
                      <td className="px-4 py-3 text-[#6b7280]">Custom filters only</td>
                    </tr>
                    <tr className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#374151]">Track after</td>
                      <td className="px-4 py-3 text-[#6b7280]">One-click add all to Radar</td>
                      <td className="px-4 py-3 text-[#6b7280]">Manual watchlist export</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-[#374151]">Time to answer</td>
                      <td className="px-4 py-3 text-[#6b7280]">Under a minute</td>
                      <td className="px-4 py-3 text-[#6b7280]">Build the screen first</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Recommended free stack</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COMPARE_STOCKS_STACK.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col gap-1 rounded-xl border border-[#e5e7eb] bg-white p-4 hover:border-[#111111] transition-all"
                >
                  <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[12px] text-[#6b7280]">{item.role}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[18px] font-semibold text-[#111111]">Related</h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/should-i-buy"
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]"
              >
                Should I Buy
              </Link>
              <Link
                href="/position-size-calculator"
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]"
              >
                Position size calculator
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]"
              >
                Portfolio analyzer
              </Link>
              <Link
                href="/heat"
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]"
              >
                Market heat
              </Link>
              <Link
                href="/guides"
                className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]"
              >
                Research guide
              </Link>
            </div>
          </section>

          <FaqSection faqs={COMPARE_STOCKS_FAQS} />

          <p className="text-[12px] text-[#9ca3af] leading-relaxed max-w-[640px]">
            Research and education only. Not investment advice. Not a broker. Free Radar capped at 3 stocks; Pro unlocks unlimited tracking at ${US_PRO_MONTHLY}/month.
          </p>
        </div>
      </div>
    </>
  );
}
