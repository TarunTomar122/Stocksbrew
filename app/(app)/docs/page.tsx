import type { Metadata } from "next";

import { DocsShell } from "@/components/docs/docs-shell";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FOCUS, PageHead } from "@/components/oa/kit";
import { GLOSSARY, GUIDES, SECTIONS, guideHref, guidesIn, readingMinutes } from "@/lib/docs";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "docs"], "stocksbrew docs");

export const metadata: Metadata = {
  title: "Docs: how stocksbrew works",
  description:
    "The stocksbrew documentation: how to read the briefing and a stock report, how 13F and Congress records are measured, what a backtest can tell you, where every data set comes from, and three calculators.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "stocksbrew docs",
    description: "How each part of stocksbrew works, how the numbers are computed and where the data comes from.",
    url: `${SITE_URL}/docs`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export default function DocsIndexPage() {
  const totalMinutes = GUIDES.reduce((sum, guide) => sum + readingMinutes(guide), 0);

  return (
    <DocsShell current="/docs" wide>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "stocksbrew docs",
            url: `${SITE_URL}/docs`,
            description: "Documentation for stocksbrew: guides, methodology, glossary and calculators.",
            isPartOf: { "@type": "WebSite", name: "stocksbrew", url: SITE_URL },
            hasPart: GUIDES.map((guide) => ({ "@type": "TechArticle", headline: guide.title, url: `${SITE_URL}${guideHref(guide)}` })),
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Docs", path: "/docs" },
          ]),
        ]}
      />
      <PageHead
        title="How stocksbrew works"
        lede="A course in ten parts. Read it in order the first time, then come back for the page you need. Every guide describes what the product actually does, including what it does not."
        meta={
          <p className="text-[12.5px] leading-4 text-oa-muted-fg">
            {GUIDES.length} guides · about {totalMinutes} minutes in all · {GLOSSARY.length} glossary terms · 3 calculators
          </p>
        }
      />

      {/* The whole course. The first part is where a new reader starts, so it is open and numbered; the rest are lists of titles. */}
      <div className="flex flex-col gap-6">
        {SECTIONS.map((section, sectionIndex) => {
          const guides = guidesIn(section.id);
          const lead = sectionIndex === 0;
          return (
            <section key={section.id} aria-labelledby={`sec-${section.id}`} id={section.id} className="scroll-mt-24">
              <div className="mb-2">
                <h2 id={`sec-${section.id}`} className={`${lead ? "text-[17px] leading-6" : "text-[15px] leading-[22px]"} font-semibold text-oa-fg`}>
                  <span className="oa-mono mr-2 text-[12.5px] font-normal tabular-nums text-oa-muted-fg">{String(sectionIndex + 1).padStart(2, "0")}</span>
                  <a href={`/docs/${section.id}`} className={`rounded hover:underline ${FOCUS}`}>
                    {section.title}
                  </a>
                </h2>
                <p className="mt-0.5 max-w-[70ch] text-[14px] leading-5 text-oa-muted-fg">{section.blurb}</p>
              </div>
              <ul className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
                {guides.map((guide, guideIndex) => (
                  <li key={guide.slug} className="border-b border-oa-border last:border-b-0">
                    <a
                      href={guideHref(guide)}
                      className={`group grid min-h-11 items-baseline gap-x-4 px-4 py-2.5 hover:bg-oa-accent ${
                        lead ? "grid-cols-[1.25rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
                      } ${FOCUS}`}
                    >
                      {lead ? <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{guideIndex + 1}</span> : null}
                      {lead ? (
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium leading-[22px] text-oa-fg group-hover:underline">{guide.title}</span>
                          <span className="mt-0.5 block max-w-[70ch] text-pretty text-[14px] leading-5 text-oa-muted-fg">{guide.summary}</span>
                        </span>
                      ) : (
                        <>
                          <span className="text-[14px] font-medium leading-5 text-oa-fg group-hover:underline">{guide.title}</span>
                          <span className="truncate text-[14px] leading-5 text-oa-muted-fg max-sm:hidden">{guide.summary}</span>
                        </>
                      )}
                      <span className="whitespace-nowrap text-[12.5px] tabular-nums text-oa-muted-fg">{readingMinutes(guide)} min</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section aria-labelledby="sec-reference">
          <h2 id="sec-reference" className="mb-2 text-[15px] font-semibold leading-[22px] text-oa-fg">
            Reference
          </h2>
          <ul className="oa-surface grid overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-3">
            {[
              { href: "/docs/glossary", title: "Glossary", text: `${GLOSSARY.length} terms in plain words, each linked to the guide that goes deeper.` },
              { href: "/docs/compare", title: "Comparisons", text: "stocksbrew next to other research tools, with where each one is stronger." },
              { href: "/developers", title: "API, MCP and CLI", text: "Connect your own agent or script to your stocks and our research." },
            ].map((item) => (
              <li key={item.href} className="-mb-px -mr-px border-b border-r border-oa-border">
                <a href={item.href} className={`group block h-full px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
                  <span className="block text-[15px] font-medium leading-6 text-oa-fg group-hover:underline">{item.title}</span>
                  <span className="mt-0.5 block text-pretty text-[14px] leading-5 text-oa-muted-fg">{item.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DocsShell>
  );
}
