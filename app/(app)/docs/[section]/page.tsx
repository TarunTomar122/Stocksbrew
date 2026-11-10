import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Crumbs, DocsShell } from "@/components/docs/docs-shell";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FOCUS, PageHead } from "@/components/oa/kit";
import { SECTIONS, getSection, guideHref, guidesIn, readingMinutes } from "@/lib/docs";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

type Props = { params: { section: string } };

export const dynamicParams = false;

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section: section.id }));
}

export function generateMetadata({ params }: Props): Metadata {
  const section = getSection(params.section);
  if (!section) return { title: "Not found" };
  return {
    title: `${section.title} · stocksbrew docs`,
    description: section.blurb,
    alternates: { canonical: `/docs/${section.id}` },
    openGraph: { title: `${section.title} · stocksbrew docs`, description: section.blurb, url: `${SITE_URL}/docs/${section.id}`, images: [ogImage(["docs", section.id], `${section.title} · stocksbrew docs`)] },
    twitter: { card: "summary_large_image", title: `${section.title} · stocksbrew docs`, description: section.blurb, images: [ogImage(["docs", section.id], `${section.title} · stocksbrew docs`)] },
  };
}

export default function DocsSectionPage({ params }: Props) {
  const section = getSection(params.section);
  if (!section) notFound();
  const guides = guidesIn(section.id);
  const index = SECTIONS.findIndex((item) => item.id === section.id);
  const prev = index > 0 ? SECTIONS[index - 1] : null;
  const next = index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null;

  return (
    <DocsShell current={`/docs/${section.id}`}>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: section.title, path: `/docs/${section.id}` },
        ])}
      />
      <Crumbs items={[{ label: "Docs", href: "/docs" }, { label: section.title }]} />
      <PageHead
        crumb={`Part ${index + 1} of ${SECTIONS.length}`}
        title={section.title}
        lede={section.blurb}
        meta={
          <p className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">
            {guides.length} {guides.length === 1 ? "guide" : "guides"} · about {guides.reduce((sum, guide) => sum + readingMinutes(guide), 0)} minutes
          </p>
        }
      />
      <ol className="oa-surface border border-oa-border bg-oa-card">
        {guides.map((guide, guideIndex) => (
          <li key={guide.slug} className="border-b border-oa-border last:border-b-0">
            <a href={guideHref(guide)} className={`group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-x-2 px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
              <span className="oa-mono pt-0.5 text-[13px] tabular-nums text-oa-label">{String(guideIndex + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block text-[16px] font-medium leading-6 text-oa-fg group-hover:underline">{guide.title}</span>
                <span className="mt-0.5 block text-pretty text-[14px] leading-5 text-oa-muted-fg">{guide.summary}</span>
              </span>
              <span className="oa-mono pt-1 text-[11.5px] tabular-nums text-oa-muted-fg">{readingMinutes(guide)} min</span>
            </a>
          </li>
        ))}
      </ol>
      <nav aria-label="Sections" className="mt-8 grid gap-3 sm:grid-cols-2">
        {prev ? (
          <a href={`/docs/${prev.id}`} className={`oa-surface border border-oa-border bg-oa-card px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
            <span className="oa-caption block">Previous part</span>
            <span className="mt-0.5 block text-[15px] font-medium text-oa-fg">{prev.title}</span>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={`/docs/${next.id}`} className={`oa-surface border border-oa-border bg-oa-card px-4 py-3 text-right hover:bg-oa-accent ${FOCUS}`}>
            <span className="oa-caption block">Next part</span>
            <span className="mt-0.5 block text-[15px] font-medium text-oa-fg">{next.title}</span>
          </a>
        ) : null}
      </nav>
    </DocsShell>
  );
}
