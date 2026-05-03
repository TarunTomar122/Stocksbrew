import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Tikrr delivers AI-powered market intelligence for retail investors — twice-daily briefs, stock scores, heat lists, and thematic screens grounded in real news.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Tikrr — AI-Powered Market Intelligence",
    description: "Twice-daily AI briefs grounded in real news. No more wading through 30 tabs to figure out what mattered.",
    url: "https://tikrr.com/about",
  },
  twitter: {
    title: "About Tikrr — AI-Powered Market Intelligence",
    description: "Twice-daily AI briefs grounded in real news. No more wading through 30 tabs to figure out what mattered.",
  },
};

const PILLARS = [
  {
    title: "Read the market in five minutes.",
    body: "Twice-daily AI briefs grounded in real news. No more wading through 30 tabs to figure out what mattered.",
  },
  {
    title: "Catch what you'd miss.",
    body: "Insider sells, buried downgrades, options-flow flips, technical setups — surfaced before they hit the headlines.",
  },
  {
    title: "Track without limits.",
    body: "Pin every US stock you actually care about. We watch it — more markets coming soon.",
  },
];

export default function AboutPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[960px] px-6 md:px-10 lg:px-16 py-16 md:py-24 flex flex-col gap-16">
        {/* Hero */}
        <section className="flex flex-col gap-5">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            About Tikrr
          </span>
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            We're building the read on the market we wished existed.
          </h1>
          <p className="text-[17px] text-[#374151] leading-[1.55] max-w-[640px]">
            Tikrr surfaces institutional flows, sentiment shifts, and sector rotations across US markets — written in plain English, grounded in real data, refreshed twice a day. More markets coming soon.
          </p>
        </section>

        {/* Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p) => (
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

        {/* Story */}
        <section className="flex flex-col gap-4 max-w-[720px]">
          <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.01em]">
            Why this exists
          </h2>
          <p className="text-[15px] text-[#374151] leading-[1.7]">
            Most retail investors are drowning in feeds. Twitter is fast but noisy, Bloomberg is rigorous but expensive, Yahoo Finance is free but doesn't tell you what to look at. We built Tikrr to bridge that gap — institutional-quality reads in retail-friendly language, on the stocks you actually care about.
          </p>
          <p className="text-[15px] text-[#374151] leading-[1.7]">
            We're a small team. The product is live and improving daily. Feedback is gold — write to us anytime.
          </p>
        </section>

        {/* CTA */}
        <section className="flex items-center gap-4 flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            Explore the markets
          </Link>
          <a
            href="mailto:hello@tikrr.com"
            className="inline-flex items-center justify-center h-[44px] px-5 rounded-full border border-[#e5e7eb] text-[#111111] text-[14px] font-medium hover:border-[#111111] transition-colors"
          >
            Say hi
          </a>
        </section>
      </div>
    </main>
  );
}
