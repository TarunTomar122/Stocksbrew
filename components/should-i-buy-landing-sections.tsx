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

const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

const PILL =
  "inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg";

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
      <div>
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-14 px-4 py-14 sm:px-6 sm:py-20">
          <section className="flex max-w-[720px] flex-col gap-5" aria-labelledby="sib-what">
            <h2 id="sib-what" className="text-[26px] font-medium tracking-tight text-oa-fg">What you get</h2>
            <ol className="flex flex-col rounded-[22px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:px-6">
              {SHOULD_I_BUY_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4 border-b border-oa-border py-4 last:border-b-0">
                  <span className="oa-mono shrink-0 pt-0.5 text-xs tabular-nums text-oa-muted-fg">0{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[15px] font-medium tracking-tight text-oa-fg">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-oa-muted-fg">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-5" aria-labelledby="sib-vs">
            <h2 id="sib-vs" className={H2}>Screeners vs Should I Buy</h2>
            <div className="overflow-hidden rounded-[18px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-oa-border bg-oa-bg">
                      <th className="px-4 py-3 text-left font-medium text-oa-muted-fg">Capability</th>
                      <th className="px-4 py-3 text-left font-medium text-oa-muted-fg">stocksbrew</th>
                      <th className="px-4 py-3 text-left font-medium text-oa-muted-fg">Typical screener</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHOULD_I_BUY_VS_ROWS.map((row) => (
                      <tr key={row.label} className="border-b border-oa-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-oa-fg">{row.label}</td>
                        <td className="px-4 py-3 text-oa-muted-fg">{row.stocksbrew}</td>
                        <td className="px-4 py-3 text-oa-muted-fg">{row.other}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5" aria-labelledby="sib-stack">
            <h2 id="sib-stack" className={H2}>Recommended free stack</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SHOULD_I_BUY_STACK.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between gap-3 rounded-[18px] border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-oa-muted-fg">{item.role}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-oa-muted-fg transition-transform duration-200 group-hover:translate-x-0.5">›</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="sib-related">
            <h2 id="sib-related" className="text-[17px] font-medium tracking-tight text-oa-fg">Related</h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/compare/stocksbrew-vs-tickertape" className={PILL}>
                vs Tickertape
              </Link>
              <Link href="/use-cases/swing-trading" className={PILL}>
                Swing trading workflow
              </Link>
              <Link href="/guides" className={PILL}>
                Research guide
              </Link>
            </div>
          </section>

          <FaqSection faqs={SHOULD_I_BUY_FAQS} />

          <p className="max-w-[640px] text-xs leading-relaxed text-oa-muted-fg">
            Research and education only. Not investment advice. Not a broker. Free Watchlist is capped at 3 stocks; Pro unlocks unlimited tracking at ${US_PRO_MONTHLY}/month.
          </p>
        </div>
      </div>
    </>
  );
}
