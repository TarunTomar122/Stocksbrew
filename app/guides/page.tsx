import type { Metadata } from "next";
import Link from "next/link";

import { GuidesHubSchema } from "@/components/seo/guides-hub-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
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
    "Free tools, comparisons and tutorials for US stock research. Start with Watchlist, Should I Buy, Learn guides or the weekly workflow.",
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Stock Research Guide · stocksbrew",
    description:
      "Free tools, comparisons and tutorials for US stock research. Start with Watchlist, Should I Buy or the Learn library.",
    url: "https://www.stocksbrew.online/guides",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock Research Guide · stocksbrew",
    description:
      "Free tools, comparisons and tutorials for US stock research. Start with Watchlist, Should I Buy or the Learn library.",
  },
};

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";
const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

const CARD =
  "group flex flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] h-full";

function HubCard({ link, idx }: { link: HubLink; idx?: number }) {
  return (
    <Link href={link.href} className={CARD}>
      {link.badge && (
        <span className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">
          {link.badge}
        </span>
      )}
      <h3 className="text-[15px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
        {link.title}
      </h3>
      <p className="flex-1 text-[13px] leading-relaxed text-oa-muted-fg">{link.description}</p>
      <span className="mt-1 flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">
        {idx === 0 ? "Browse guides" : idx !== undefined ? "Open" : "Read"}
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
      </span>
    </Link>
  );
}

function ToolCard({ link }: { link: HubLink }) {
  return (
    <Link
      href={link.href}
      className="group flex flex-col gap-1.5 rounded-[18px] border border-oa-border bg-oa-bg p-4 transition-colors duration-200 hover:bg-oa-card"
    >
      <h3 className="text-[14px] font-medium tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
        {link.title}
      </h3>
      <p className="text-[12px] leading-relaxed text-oa-muted-fg">{link.description}</p>
    </Link>
  );
}

function SectionHead({ id, title, sub, action }: { id: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className={H2}>{title}</h2>
        <p className="mt-1 text-sm text-oa-muted-fg">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export default function GuidesPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <GuidesHubSchema />
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-14 px-4 pb-20 sm:px-6">
        <header className="max-w-[640px] pb-2 pt-10 sm:pt-16">
          <p className={EYEBROW}>Guides</p>
          <h1 className={`mt-4 ${H1}`}>Learn how to research a US stock</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Pick a guide, compare a tool, or open{" "}
            <Link href="/watchlist" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
              Watchlist
            </Link>{" "}
            if you already know your tickers.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/watchlist"
              className="inline-flex h-11 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
            >
              Track a stock
            </Link>
            <Link
              href="/should-i-buy"
              className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
            >
              Try Should I Buy
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-5" aria-labelledby="guides-start">
          <SectionHead id="guides-start" title="Start here" sub="Choose the job you need to do." />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {START_PATHS.map((path, idx) => (
              <HubCard key={path.href} link={path} idx={idx} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="guides-tools">
          <SectionHead
            id="guides-tools"
            title="Free tools"
            sub="Live on stocksbrew. No paywall to try them."
            action={
              <Link href="/free-tools" className="text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg">
                View all free tools ›
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FREE_TOOLS.map((tool) => (
              <ToolCard key={tool.href} link={tool} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="guides-compare">
          <SectionHead id="guides-compare" title="Compare research stacks" sub="See which tool fits the way you research." />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {COMPARISONS.map((item) => (
              <HubCard key={item.href} link={item} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="guides-tutorials">
          <SectionHead id="guides-tutorials" title="Guides and tutorials" sub="Workflow write-ups and the full Learn library." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_GUIDES.map((item) => (
              <HubCard key={item.href} link={item} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:p-8" aria-labelledby="guides-weekly">
          <div>
            <h2 id="guides-weekly" className={H2}>A simple weekly check</h2>
            <p className="mt-1 text-sm text-oa-muted-fg">A short routine for the stocks you follow.</p>
          </div>
          <ol className="flex flex-col">
            {WEEKLY_WORKFLOW.map((step) => (
              <li key={step.day} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="oa-mono w-[88px] shrink-0 text-xs uppercase tracking-[0.08em] text-oa-muted-fg">
                  {step.day}
                </span>
                <p className="flex-1 text-sm leading-relaxed text-oa-fg/80">
                  {step.task}{" "}
                  <Link href={step.href} className="font-medium text-oa-primary hover:underline underline-offset-4">
                    Open
                  </Link>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="guides-faq">
          <h2 id="guides-faq" className={H2}>Common questions</h2>
          <dl className="flex max-w-[720px] flex-col gap-5">
            {GUIDES_FAQS.map((faq) => (
              <div key={faq.question} className="flex flex-col gap-1.5">
                <dt className="text-[15px] font-medium tracking-tight text-oa-fg">{faq.question}</dt>
                <dd className="text-sm leading-relaxed text-oa-muted-fg">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col items-center gap-5 rounded-[22px] border border-oa-border bg-oa-bg px-6 py-12 text-center sm:py-16">
          <h2 className="max-w-[480px] text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg sm:text-3xl">
            Ready to track your names?
          </h2>
          <p className="max-w-[440px] text-[15px] leading-relaxed text-oa-muted-fg">
            Add up to three US tickers free. Daily briefs, earnings intel and alerts, without rebuilding your workflow.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/watchlist"
              className="inline-flex h-11 items-center rounded-full bg-oa-primary px-6 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
            >
              Open Watchlist
            </Link>
            <Link
              href="/subscribe"
              className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-6 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
            >
              See Pro
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
