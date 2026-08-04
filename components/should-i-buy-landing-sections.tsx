import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import {
  SHOULD_I_BUY_FAQS,
  SHOULD_I_BUY_STACK,
  SHOULD_I_BUY_STEPS,
  SHOULD_I_BUY_VS_ROWS,
} from "@/lib/should-i-buy-landing-data";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { US_PRO_MONTHLY } from "@/lib/pricing";

export function ShouldIBuyLandingSections() {
  return (
    <>
      <MarketingSchema
        path="/should-i-buy"
        name="Free Should I Buy Stock Checker"
        description="Enter any US stock ticker and get a data-driven buy/hold/avoid signal. Free tool by stocksbrew."
        faqs={SHOULD_I_BUY_FAQS}
        breadcrumbLabel="Should I Buy"
      />
      <div className="border-t border-[#e5e7eb] bg-[#fafaf7]">
        <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-14 md:py-20 flex flex-col gap-14">
          <section className="flex flex-col gap-5 max-w-[720px]">
            <h2 className="text-[28px] font-semibold text-[#111111] tracking-[-0.03em]">What you get</h2>
            <ol className="flex flex-col gap-4">
              {SHOULD_I_BUY_STEPS.map((step, i) => (
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
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Screeners vs Should I Buy</h2>
            <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#fafaf7]">
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">Capability</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">stocksbrew</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#111111]">Typical screener</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHOULD_I_BUY_VS_ROWS.map((row) => (
                      <tr key={row.label} className="border-b border-[#f3f4f6] last:border-0">
                        <td className="px-4 py-3 font-medium text-[#374151]">{row.label}</td>
                        <td className="px-4 py-3 text-[#6b7280]">{row.stocksbrew}</td>
                        <td className="px-4 py-3 text-[#6b7280]">{row.other}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Recommended free stack</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SHOULD_I_BUY_STACK.map((item) => (
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
              <Link href="/compare/stocksbrew-vs-tickertape" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
                vs Tickertape
              </Link>
              <Link href="/use-cases/swing-trading" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
                Swing trading workflow
              </Link>
              <Link href="/guides" className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111]">
                Research guide
              </Link>
            </div>
          </section>

          <FaqSection faqs={SHOULD_I_BUY_FAQS} />

          <p className="text-[12px] text-[#9ca3af] leading-relaxed max-w-[640px]">
            Research and education only. Not investment advice. Not a broker. Free Watchlist is capped at 3 stocks; Pro unlocks unlimited tracking at ${US_PRO_MONTHLY}/month.
          </p>
        </div>
      </div>
    </>
  );
}
