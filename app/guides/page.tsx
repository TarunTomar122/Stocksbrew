import type { Metadata } from "next";
import Link from "next/link";

import { GuidesHubSchema } from "@/components/seo/guides-hub-schema";
import {
  COMPARISONS,
  FREE_TOOLS,
  START_PATHS,
  WEEKLY_WORKFLOW,
  WORKFLOW_GUIDES,
  GUIDES_FAQS,
  type HubLink,
} from "@/lib/guides-hub-data";

export const metadata: Metadata = {
  title: "Stock Research Guide",
  description:
    "Free tools, comparisons, and tutorials for US stock research. Radar watchlists, Should I Buy, Learn guides, and a weekly workflow in one place.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Stock Research Guide · stocksbrew",
    description:
      "Free tools, comparisons, and tutorials for US stock research. Start with Radar, Should I Buy, or the Learn library.",
    url: "https://www.stocksbrew.online/guides",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock Research Guide · stocksbrew",
    description:
      "Free tools, comparisons, and tutorials for US stock research. Start with Radar, Should I Buy, or the Learn library.",
  },
};

function HubCard({ link, idx }: { link: HubLink; idx?: number }) {
  return (
    <Link
      href={link.href}
      className="group flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-5 hover:border-[#111111] hover:shadow-card-hover transition-all duration-200 h-full"
    >
      {link.badge && (
        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
          {link.badge}
        </span>
      )}
      <h3 className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em] group-hover:text-[#0052ff] transition-colors">
        {link.title}
      </h3>
      <p className="text-[13px] text-[#6b7280] leading-relaxed flex-1">{link.description}</p>
      <span className="text-[13px] font-medium text-[#111111] mt-1">
        {idx === 0 ? "Browse guides →" : idx !== undefined ? "Open →" : "Read →"}
      </span>
    </Link>
  );
}

function ToolCard({ link }: { link: HubLink }) {
  return (
    <Link
      href={link.href}
      className="group flex flex-col gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#fafaf7] p-4 hover:border-[#111111] hover:bg-white transition-all duration-200"
    >
      <h3 className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
        {link.title}
      </h3>
      <p className="text-[12px] text-[#6b7280] leading-relaxed">{link.description}</p>
    </Link>
  );
}

export default function GuidesPage() {
  return (
    <main className="flex-grow">
      <GuidesHubSchema />
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-14">
        <header className="flex flex-col gap-4 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Guides
          </span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Stock research, one place to start
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Free tools, comparisons, and tutorials for US investors. Pick a path below, or jump straight to{" "}
            <Link href="/watchlist" className="font-medium text-[#111111] underline underline-offset-2 hover:text-[#0052ff]">
              Radar
            </Link>{" "}
            if you already know your tickers.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/watchlist"
              className="inline-flex items-center h-[40px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold hover:-translate-y-[1px] transition-transform"
            >
              Open Radar →
            </Link>
            <Link
              href="/should-i-buy"
              className="inline-flex items-center h-[40px] px-5 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
            >
              Try Should I Buy
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Start here</h2>
            <p className="text-[14px] text-[#6b7280] mt-1">Three common entry points depending on where you are.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {START_PATHS.map((path, idx) => (
              <HubCard key={path.href} link={path} idx={idx} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Free tools</h2>
              <p className="text-[14px] text-[#6b7280] mt-1">Live on stocksbrew. No paywall to try them.</p>
            </div>
            <Link href="/free-tools" className="text-[13px] font-medium text-[#111111] hover:text-[#0052ff] transition-colors">
              View all free tools →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FREE_TOOLS.map((tool) => (
              <ToolCard key={tool.href} link={tool} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Compare research stacks</h2>
            <p className="text-[14px] text-[#6b7280] mt-1">Honest side-by-sides when you are choosing a workflow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMPARISONS.map((item) => (
              <HubCard key={item.href} link={item} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Guides & tutorials</h2>
            <p className="text-[14px] text-[#6b7280] mt-1">Workflow write-ups and the full Learn library.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKFLOW_GUIDES.map((item) => (
              <HubCard key={item.href} link={item} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-6 md:p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Weekly research rhythm</h2>
            <p className="text-[14px] text-[#6b7280] mt-1">A simple cadence so you stay informed without living in the app.</p>
          </div>
          <ol className="flex flex-col gap-4">
            {WEEKLY_WORKFLOW.map((step) => (
              <li key={step.day} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
                <span className="shrink-0 text-[12px] font-bold tracking-[0.08em] uppercase text-[#10b981] w-[88px]">
                  {step.day}
                </span>
                <p className="text-[14px] text-[#374151] leading-relaxed flex-1">
                  {step.task}{" "}
                  <Link href={step.href} className="font-medium text-[#111111] underline underline-offset-2 hover:text-[#0052ff]">
                    Open →
                  </Link>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">Common questions</h2>
          </div>
          <dl className="flex flex-col gap-4 max-w-[720px]">
            {GUIDES_FAQS.map((faq) => (
              <div key={faq.question} className="flex flex-col gap-1.5">
                <dt className="text-[15px] font-semibold text-[#111111]">{faq.question}</dt>
                <dd className="text-[14px] text-[#6b7280] leading-relaxed">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-[#111111] bg-[#111111] p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-[480px]">
            <h2 className="text-[22px] font-semibold text-white tracking-[-0.02em]">Ready to track your names?</h2>
            <p className="text-[14px] text-[#d1d5db] leading-relaxed">
              Add up to three US tickers free. Daily briefs, earnings intel, and alerts without rebuilding your workflow from scratch.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/watchlist"
              className="inline-flex items-center h-[44px] px-6 rounded-full bg-white text-[#111111] text-[13px] font-semibold hover:-translate-y-[1px] transition-transform"
            >
              Open Radar →
            </Link>
            <Link
              href="/subscribe"
              className="inline-flex items-center h-[44px] px-6 rounded-full border border-[#374151] text-white text-[13px] font-medium hover:border-white transition-colors"
            >
              See Pro
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
