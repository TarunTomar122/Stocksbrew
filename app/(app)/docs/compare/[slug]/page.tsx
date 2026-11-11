import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Crumbs, DocsShell, InlineToc } from "@/components/docs/docs-shell";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FOCUS, fmtDay } from "@/components/oa/kit";
import { COMPARISON_RECHECKED, DOC_COMPARISONS, docCompareHref, getDocComparison, movedCompareHref } from "@/lib/docs/compare";
import { SITE_URL } from "@/lib/docs/site";
import { getCompareRelated } from "@/lib/seo/compare-links";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

type Props = { params: { slug: string } };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_COMPARISONS.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const page = getDocComparison(params.slug);
  if (!page) return { title: "Not found" };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: docCompareHref(page.slug) },
    openGraph: { title: `${page.title} · stocksbrew`, description: page.description, url: `${SITE_URL}${docCompareHref(page.slug)}`, images: [ogImage(["versus", page.slug], page.title)] },
    twitter: { card: "summary_large_image", title: `${page.title} · stocksbrew`, description: page.description, images: [ogImage(["versus", page.slug], page.title)] },
  };
}

const H2 = "mt-8 scroll-mt-24 border-t border-oa-border pt-6 text-[21px] font-medium leading-7 tracking-tight text-oa-fg";
const LINK = `font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`;

export default function DocsComparePage({ params }: Props) {
  const page = getDocComparison(params.slug);
  if (!page) notFound();
  const path = docCompareHref(page.slug);
  const rechecked = COMPARISON_RECHECKED[page.slug];
  const related = getCompareRelated(page.slug);
  const toc = [
    { id: "who-each-is-for", text: "Who each is for" },
    { id: "side-by-side", text: "Side by side" },
    { id: "strengths", text: "Where each is stronger" },
    { id: "a-week", text: "A week with stocksbrew" },
    { id: "questions", text: "Questions" },
  ];

  return (
    <DocsShell current="/docs/compare" toc={toc}>
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: `${SITE_URL}${path}` },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: page.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Docs", path: "/docs" },
            { name: "Comparisons", path: "/docs/compare" },
            { name: page.title, path },
          ]),
        ]}
      />
      <article>
        <Crumbs items={[{ label: "Docs", href: "/docs" }, { label: "Comparisons", href: "/docs/compare" }, { label: page.competitorName }]} />
        <header className="mb-6">
          <h1 className="text-balance text-[28px] font-medium leading-[1.15] tracking-tight text-oa-fg sm:text-[34px]">{page.title}</h1>
          <p className="mt-3 text-pretty text-[17px] leading-7 text-oa-muted-fg">{page.verdict}</p>
          <p className="oa-mono mt-3 text-[11.5px] leading-4 text-oa-muted-fg">
            Written by stocksbrew · desk research from official pages · no affiliate links
            {rechecked ? ` · ${page.competitorName} details rechecked ${fmtDay(rechecked, true)}` : ""}
          </p>
        </header>

        <aside className="oa-surface mb-6 border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-oa-card px-4 py-3">
          <p className="oa-caption mb-1">Read this first</p>
          <p className="text-pretty text-[15px] leading-6 text-oa-fg/90">
            What this page says about stocksbrew was rechecked against the product on November 10, 2026. What it says about {page.competitorName} is desk research and may
            be out of date. For what stocksbrew does today, see{" "}
            <Link prefetch={false} href="/docs/start/what-stocksbrew-is" className={LINK}>
              What stocksbrew is and is not
            </Link>
            . Check {page.competitorName}&apos;s current features and prices on{" "}
            <a href={page.competitorUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
              its own site
            </a>
            {page.competitorPricingUrl ? (
              <>
                {" "}
                and{" "}
                <a href={page.competitorPricingUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                  pricing page
                </a>
              </>
            ) : null}
            .
          </p>
        </aside>

        <InlineToc toc={toc} />

        <h2 id="who-each-is-for" className={`${H2} !mt-0 !border-t-0 !pt-0`}>
          Who each is for
        </h2>
        <dl className="oa-surface mt-3 border border-oa-border bg-oa-card">
          {[
            ["stocksbrew fits when", page.stocksbrewBestFor],
            [`${page.competitorName} fits when`, page.competitorBestFor],
            ["Using both", page.bothScenario],
          ].map(([term, text]) => (
            <div key={term} className="grid gap-x-5 gap-y-0.5 border-b border-oa-border px-4 py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="oa-caption pt-0.5">{term}</dt>
              <dd className="text-pretty text-[15px] leading-6 text-oa-fg/90">{text}</dd>
            </div>
          ))}
        </dl>

        <h2 id="side-by-side" className={H2}>
          Side by side
        </h2>
        <div className="oa-surface mt-3 overflow-x-auto border border-oa-border bg-oa-card">
          <table className="w-full border-collapse text-left text-[14.5px] leading-6">
            <thead>
              <tr>
                {["", "stocksbrew", page.competitorName].map((cell) => (
                  <th key={cell} scope="col" className="oa-caption whitespace-nowrap border-b border-oa-border bg-oa-bg px-3 py-2 first:pl-4 last:pr-4">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.dimension} className="border-b border-oa-border last:border-b-0">
                  <th scope="row" className="min-w-[8rem] px-3 py-2 pl-4 text-left align-top font-medium text-oa-fg">
                    {row.dimension}
                  </th>
                  <td className="min-w-[10rem] px-3 py-2 align-top text-oa-fg/85">{row.stocksbrew}</td>
                  <td className="min-w-[10rem] px-3 py-2 pr-4 align-top text-oa-fg/85">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="strengths" className={H2}>
          Where each is stronger
        </h2>
        <div className="oa-surface mt-3 grid border border-oa-border bg-oa-card sm:grid-cols-2">
          {[
            [page.competitorName, page.competitorStrengths],
            ["stocksbrew", page.stocksbrewStrengths],
          ].map(([name, items], index) => (
            <div key={name as string} className={`px-4 py-3 ${index === 0 ? "border-b border-oa-border sm:border-b-0 sm:border-r" : ""}`}>
              <p className="oa-caption mb-1.5">{name as string}</p>
              <ul className="flex flex-col gap-1.5">
                {(items as string[]).map((item) => (
                  <li key={item} className="relative pl-4 text-pretty text-[14.5px] leading-6 text-oa-fg/90">
                    <span aria-hidden="true" className="absolute left-0 top-[10px] h-[5px] w-[5px] rounded-full bg-oa-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h2 id="a-week" className={H2}>
          A week with stocksbrew
        </h2>
        <ol className="oa-surface mt-3 border border-oa-border bg-oa-card">
          {page.workflow.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b border-oa-border px-4 py-3 last:border-b-0">
              <span className="oa-mono pt-0.5 text-[13px] tabular-nums text-oa-label">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-[15.5px] font-medium leading-6 text-oa-fg">{step.title}</p>
                <p className="mt-0.5 text-pretty text-[15px] leading-6 text-oa-fg/85">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 id="questions" className={H2}>
          Questions
        </h2>
        <dl className="mt-3 flex flex-col">
          {page.faqs.map((faq) => (
            <div key={faq.question} className="border-b border-oa-border py-3 last:border-b-0">
              <dt className="text-[16px] font-medium leading-6 text-oa-fg">{faq.question}</dt>
              <dd className="mt-1 text-pretty text-[15px] leading-6 text-oa-fg/85">{faq.answer}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="more" className="mt-8">
          <h2 id="more" className="oa-label mb-2">
            More reading
          </h2>
          <ul className="oa-surface border border-oa-border bg-oa-card">
            {[...related.compares.map((link) => ({ ...link, href: movedCompareHref(link.href) })), ...related.blogs].map((link) => (
              <li key={link.href} className="border-b border-oa-border last:border-b-0">
                <AppLink href={link.href} className={`block px-4 py-2 text-[14.5px] font-medium text-oa-fg hover:bg-oa-accent hover:underline ${FOCUS}`}>
                  {link.label}
                </AppLink>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 border-t border-oa-border pt-4 text-[13.5px] leading-5 text-oa-muted-fg">
          Found something out of date?{" "}
          <Link prefetch={false} href="/docs/methodology/corrections#reporting-an-error" className={LINK}>
            Tell us
          </Link>{" "}
          with the official page that shows it. <Link prefetch={false} href="/docs/compare" className={LINK}>All comparisons</Link>.
        </p>
      </article>
    </DocsShell>
  );
}
