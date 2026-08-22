import type { Metadata } from "next";
import Link from "next/link";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import {
  ABOUT_PILLARS,
  LONG_DESCRIPTION,
  MEDIUM_DESCRIPTION,
  SITE_TITLE_DEFAULT,
} from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "About",
  description: MEDIUM_DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    title: `About ${SITE_TITLE_DEFAULT}`,
    description: MEDIUM_DESCRIPTION,
    url: "https://www.stocksbrew.online/about",
  },
  twitter: {
    card: "summary_large_image",
    title: `About ${SITE_TITLE_DEFAULT}`,
    description: MEDIUM_DESCRIPTION,
  },
};

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";
const PILL =
  "inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30";

export default function AboutPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <section className="flex flex-col gap-4">
          <p className={EYEBROW}>About stocksbrew</p>
          <h1 className={`mt-2 ${H1}`}>Analyse a stock. Track it when it matters to you.</h1>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            {LONG_DESCRIPTION}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="What stocksbrew stands on">
          {ABOUT_PILLARS.map((p) => (
            <div key={p.title} className="flex flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h2 className="text-[16px] font-medium tracking-tight text-oa-fg">{p.title}</h2>
              <p className="text-sm leading-relaxed text-oa-muted-fg">{p.body}</p>
            </div>
          ))}
        </section>

        <section className="flex max-w-[720px] flex-col gap-4" aria-labelledby="about-why">
          <h2 id="about-why" className="text-[22px] font-medium tracking-tight text-oa-fg">Why this exists</h2>
          <p className="text-[15px] leading-[1.7] text-oa-fg/80">
            I built stocksbrew because following a company meant reopening the same tabs every day.
            A stock page brings financials, valuation, filings, earnings, analyst targets and news together. Your Watchlist keeps
            researching the companies you own or want to follow.
          </p>
          <p className="text-[15px] leading-[1.7] text-oa-fg/80">
            Stocksbrew is a small, independent product. If a page feels confusing or a fact looks
            wrong, email me. I read every message.
          </p>
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <Link href="/authors/tarun-tomar" className={PILL}>
            About the author
          </Link>
          <Link href="/editorial-policy" className={PILL}>
            Editorial standards
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-oa-primary px-6 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Search a US stock
          </Link>
          <a
            href="mailto:tomartarun2001@gmail.com"
            className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
          >
            Say hi
          </a>
        </section>
      </div>
    </main>
  );
}
