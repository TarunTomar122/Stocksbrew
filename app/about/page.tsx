import type { Metadata } from "next";
import Link from "next/link";

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

export default function AboutPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[960px] px-6 md:px-10 lg:px-16 py-16 md:py-24 flex flex-col gap-16">
        <section className="flex flex-col gap-5">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            About stocksbrew
          </span>
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Analyse a stock. Track it when it matters to you.
          </h1>
          <p className="text-[17px] text-[#374151] leading-[1.55] max-w-[640px]">
            {LONG_DESCRIPTION}
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ABOUT_PILLARS.map((p) => (
            <div
              key={p.title}
              className="flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-6"
            >
              <h2 className="text-[16px] font-semibold text-[#111111] tracking-[-0.01em]">
                {p.title}
              </h2>
              <p className="text-[14px] text-[#6b7280] leading-[1.55]">{p.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-4 max-w-[720px]">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.01em]">
            Why this exists
          </h2>
          <p className="text-[15px] text-[#374151] leading-[1.7]">
            I built stocksbrew because following a company meant reopening the same tabs every day.
            A stock page now brings the financials, news and market context together. Radar keeps
            researching the companies you own or want to follow.
          </p>
          <p className="text-[15px] text-[#374151] leading-[1.7]">
            Stocksbrew is a small, independent product. If a page feels confusing or a fact looks
            wrong, email me. I read every message.
          </p>
        </section>

        <section className="flex items-center gap-4 flex-wrap">
          <Link
            href="/authors/tarun-tomar"
            className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#e5e7eb] px-5 text-[13px] font-semibold text-[#111111] hover:border-[#111111]"
          >
            About the author
          </Link>
          <Link
            href="/editorial-policy"
            className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#e5e7eb] px-5 text-[13px] font-semibold text-[#111111] hover:border-[#111111]"
          >
            Editorial standards
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            Search a US stock
          </Link>
          <a
            href="mailto:tomartarun2001@gmail.com"
            className="inline-flex items-center justify-center h-[44px] px-5 rounded-full border border-[#e5e7eb] text-[#111111] text-[14px] font-medium hover:border-[#111111] transition-colors"
          >
            Say hi
          </a>
        </section>
      </div>
    </main>
  );
}
