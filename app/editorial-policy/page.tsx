import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";
import Link from "next/link";

const BASE = "https://www.stocksbrew.online";

export const metadata: Metadata = {
  title: "Editorial & Comparison Policy",
  description:
    "How stocksbrew researches, sources, reviews, updates, and corrects investing education and product comparisons.",
  alternates: { canonical: "/editorial-policy" },
  openGraph: {
    title: "stocksbrew editorial and comparison policy",
    description: "Our standards for sources, AI assistance, product comparisons, conflicts, and corrections.",
    url: `${BASE}/editorial-policy`,
  },
};

const sections = [
  {
    title: "Purpose",
    body: "We publish to help an individual investor complete a task: understand a research concept, build a repeatable workflow, or choose tools for a specific job. We do not publish guaranteed returns, anonymous stock tips, or content whose only purpose is to capture a keyword.",
  },
  {
    title: "Sources",
    body: "For company and market facts, we prefer SEC filings, investor-relations releases, exchange notices, and regulator material. For product comparisons, we prefer the competitor's official feature, help, and pricing pages. Secondary reporting may add context but should not be the only support for a material claim.",
  },
  {
    title: "Facts, analysis, and uncertainty",
    body: "A reported figure is a fact to verify. A thesis, score, call, or interpretation is a judgment. Articles should make that boundary clear, name important uncertainty, and explain what evidence would change the conclusion. No model or writer can reliably predict short-term market prices.",
  },
  {
    title: "Comparisons and conflicts",
    body: "stocksbrew is a party to every comparison that includes stocksbrew. We say so plainly. We evaluate tools by workflow, describe where the competing product is stronger, link to official pages, and avoid a universal 'best' when the answer depends on use. We currently do not use affiliate links in these comparisons.",
  },
  {
    title: "Hands-on testing",
    body: "We only say a tool was tested when we can describe the test criteria and the work performed. Otherwise, we label the comparison as desk research based on official documentation and public product access. Pricing and plan limits can change after review; readers should confirm them on the linked official page.",
  },
  {
    title: "AI assistance",
    body: "AI may help organize research, identify missing questions, or edit prose. It is not treated as a source. A named human reviews published, indexable editorial content for usefulness and product accuracy; material numbers and competitor facts should be checked against linked sources.",
  },
  {
    title: "Updates and corrections",
    body: "A page receives an updated date only after a substantive change to its text, data, sourcing, or conclusion. Silent spelling and formatting fixes do not reset freshness. If you find an error, email the address below with the URL and supporting source; we will correct verified errors and update the review date when the change is material.",
  },
  {
    title: "Financial boundary",
    body: "stocksbrew provides information, analytics, and decision-support tools. It is not a broker or investment adviser. Content does not account for a reader's objectives, finances, taxes, or risk tolerance and is not individualized investment advice.",
  },
];

export default function EditorialPolicyPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "stocksbrew editorial and comparison policy",
    url: `${BASE}/editorial-policy`,
    dateModified: "2026-07-22",
    isPartOf: { "@type": "WebSite", name: "stocksbrew", url: BASE },
  };

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <article className="mx-auto flex w-full max-w-[800px] flex-col gap-12 px-6 py-16 md:px-10 md:py-24 lg:px-16">
        <header className="flex flex-col gap-4">
          <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--oa-muted-fg)]">Trust & methodology</span>
          <h1 className="text-[40px] font-medium leading-[1.05] tracking-[-0.04em] text-[var(--oa-fg)] md:text-[52px]">
            Editorial & comparison policy
          </h1>
          <p className="text-[16px] leading-[1.65] text-[var(--oa-fg)]">
            The standard behind stocksbrew&apos;s indexable articles and software comparisons. Last materially reviewed July 22, 2026.
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--oa-fg)]">{section.title}</h2>
              <p className="text-[15px] leading-[1.75] text-[var(--oa-fg)]">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-[var(--oa-border)] bg-[#fafaf7] p-6">
          <h2 className="mb-2 text-[18px] font-medium text-[var(--oa-fg)]">Report a correction</h2>
          <p className="text-[14px] leading-relaxed text-[var(--oa-muted-fg)]">
            Email <a href="mailto:tomartarun2001@gmail.com" className="font-medium text-[var(--oa-fg)] underline underline-offset-2">tomartarun2001@gmail.com</a> with the page URL, the claim, and the best primary source you have.
          </p>
        </section>

        <nav className="flex flex-wrap gap-3">
          <Link href="/authors/tarun-tomar" className="inline-flex h-10 items-center rounded-full bg-[var(--oa-fg)] px-5 text-[13px] font-medium text-white">About the author</Link>
          <Link href="/compare" className="inline-flex h-10 items-center rounded-full border border-[var(--oa-border)] px-5 text-[13px] font-medium text-[var(--oa-fg)]">View comparisons</Link>
        </nav>
      </article>
    </main>
  );
}
