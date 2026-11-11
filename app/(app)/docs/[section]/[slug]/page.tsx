import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocBlocks } from "@/components/docs/blocks";
import { Calculator } from "@/components/docs/calculators";
import { Crumbs, DocsShell, InlineToc } from "@/components/docs/docs-shell";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FOCUS } from "@/components/oa/kit";
import { GUIDES, getGuide, getGuideByKey, getSection, guideHref, guidesIn, headingsOf, neighbours, readingMinutes } from "@/lib/docs";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

type Props = { params: { section: string; slug: string } };

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ section: guide.section, slug: guide.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const guide = getGuide(params.section, params.slug);
  if (!guide) return { title: "Not found" };
  const path = guideHref(guide);
  const shareImage = ogImage(["docs", guide.section, guide.slug], guide.title);
  return {
    title: `${guide.title} · stocksbrew docs`,
    description: guide.summary,
    alternates: { canonical: path },
    openGraph: {
      title: guide.title,
      description: guide.summary,
      url: `${SITE_URL}${path}`,
      type: "article",
      modifiedTime: guide.updated,
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title: guide.title, description: guide.summary, images: [shareImage] },
  };
}

export default function DocsGuidePage({ params }: Props) {
  const guide = getGuide(params.section, params.slug);
  if (!guide) notFound();
  const section = getSection(guide.section);
  if (!section) notFound();

  const path = guideHref(guide);
  const toc = headingsOf(guide);
  const { prev, next } = neighbours(guide);
  const siblings = guidesIn(guide.section);
  const position = siblings.findIndex((item) => item.slug === guide.slug) + 1;
  const related = (guide.related ?? []).map(getGuideByKey).filter((item): item is NonNullable<typeof item> => item != null);

  return (
    <DocsShell current={path} toc={toc}>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": guide.tool ? "WebApplication" : "TechArticle",
            ...(guide.tool
              ? { name: guide.title, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }
              : { headline: guide.title }),
            description: guide.summary,
            url: `${SITE_URL}${path}`,
            dateModified: guide.updated,
            inLanguage: "en-US",
            author: { "@type": "Person", name: "Tarun Tomar", url: `${SITE_URL}/docs/methodology/who-writes-this` },
            publisher: { "@type": "Organization", name: "stocksbrew", url: SITE_URL },
            isPartOf: { "@type": "WebSite", name: "stocksbrew", url: SITE_URL },
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Docs", path: "/docs" },
            { name: section.title, path: `/docs/${section.id}` },
            { name: guide.title, path },
          ]),
          // The page about the author is the author's profile page: blog posts and guides point their `author.url` here.
          ...(guide.section === "methodology" && guide.slug === "who-writes-this"
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "ProfilePage",
                  url: `${SITE_URL}${path}`,
                  dateModified: guide.updated,
                  mainEntity: {
                    "@type": "Person",
                    name: "Tarun Tomar",
                    url: `${SITE_URL}${path}`,
                    description: guide.summary,
                    worksFor: { "@type": "Organization", name: "stocksbrew", url: SITE_URL },
                  },
                },
              ]
            : []),
        ]}
      />
      <article>
        <Crumbs items={[{ label: "Docs", href: "/docs" }, { label: section.title, href: `/docs/${section.id}` }, { label: `${position} of ${siblings.length}` }]} />
        <header className="mb-6">
          <h1 className="text-balance text-[24px] font-semibold leading-8 tracking-[-0.01em] text-oa-fg sm:text-[28px] sm:leading-9">{guide.title}</h1>
          <p className="mt-2 text-pretty text-[17px] leading-7 text-oa-muted-fg">{guide.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[12.5px] leading-4 text-oa-muted-fg">
              {guide.tool ? "Calculator" : `${readingMinutes(guide)} min read`}
            </p>
            {guide.surface ? (
              <AppLink
                href={guide.surface.href}
                className={`inline-flex h-8 items-center gap-1 rounded-md border border-oa-border bg-oa-card px-2.5 text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
              >
                {guide.surface.label}
                <span aria-hidden="true">→</span>
              </AppLink>
            ) : null}
          </div>
        </header>

        {guide.tool ? (
          <div className="mb-8">
            <Calculator tool={guide.tool} />
          </div>
        ) : null}

        <InlineToc toc={toc} />
        <DocBlocks blocks={guide.blocks} />

        {related.length > 0 ? (
          <section aria-labelledby="related" className="mt-10">
            <h2 id="related" className="oa-label mb-2">
              Read next
            </h2>
            <ul className="oa-surface border border-oa-border bg-oa-card">
              {related.map((item) => (
                <li key={guideHref(item)} className="border-b border-oa-border last:border-b-0">
                  <Link prefetch={false} href={guideHref(item)} className={`group block px-4 py-2.5 hover:bg-oa-accent ${FOCUS}`}>
                    <span className="block text-[15px] font-medium leading-6 text-oa-fg group-hover:underline">{item.title}</span>
                    <span className="block text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{item.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav aria-label="Previous and next guide" className="mt-8 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link prefetch={false} href={guideHref(prev)} className={`oa-surface border border-oa-border bg-oa-card px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
              <span className="oa-caption block">← Previous</span>
              <span className="mt-0.5 block text-[15px] font-medium leading-6 text-oa-fg">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link prefetch={false} href={guideHref(next)} className={`oa-surface border border-oa-border bg-oa-card px-4 py-3 hover:bg-oa-accent sm:text-right ${FOCUS}`}>
              <span className="oa-caption block">Next →</span>
              <span className="mt-0.5 block text-[15px] font-medium leading-6 text-oa-fg">{next.title}</span>
            </Link>
          ) : null}
        </nav>

        <p className="mt-8 border-t border-oa-border pt-4 text-[13.5px] leading-5 text-oa-muted-fg">
          Something here wrong or unclear?{" "}
          <Link prefetch={false} href="/docs/methodology/corrections#reporting-an-error" className={`font-medium text-oa-fg underline decoration-oa-border underline-offset-2 ${FOCUS}`}>
            Tell us
          </Link>
          . Informational only, not investment advice.
        </p>
      </article>
    </DocsShell>
  );
}
