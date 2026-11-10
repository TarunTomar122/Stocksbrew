import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { ReadPage } from "@/components/docs/read-page";
import { TabBar, fmtDay } from "@/components/oa/kit";
import { LEGAL_DOCS, getLegalDoc } from "@/lib/docs/company";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

type Props = { params: { slug: string } };

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ slug: doc.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const doc = getLegalDoc(params.slug);
  if (!doc) return { title: "Not found" };
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/legal/${doc.slug}` },
    openGraph: { title: `${doc.title} · stocksbrew`, description: doc.description, url: `${SITE_URL}/legal/${doc.slug}`, images: [ogImage(["legal", doc.slug], doc.title)] },
    twitter: { card: "summary_large_image", title: `${doc.title} · stocksbrew`, description: doc.description, images: [ogImage(["legal", doc.slug], doc.title)] },
  };
}

export default function LegalPage({ params }: Props) {
  const doc = getLegalDoc(params.slug);
  if (!doc) notFound();
  return (
    <ReadPage
      label="Legal"
      title={doc.title}
      lede={doc.lede}
      meta={`Last updated ${fmtDay(doc.updated, true)}`}
      blocks={doc.blocks}
      contents={false}
      before={
        <>
          <JsonLd
            data={[
              { "@context": "https://schema.org", "@type": "WebPage", name: `${doc.title} · stocksbrew`, url: `${SITE_URL}/legal/${doc.slug}`, dateModified: doc.updated },
              breadcrumbLd([
                { name: "Home", path: "/" },
                { name: doc.title, path: `/legal/${doc.slug}` },
              ]),
            ]}
          />
          <TabBar current={doc.slug} tabs={LEGAL_DOCS.map((item) => ({ id: item.slug, label: item.tab, href: `/legal/${item.slug}` }))} />
        </>
      }
      after={
        <p className="mt-10 border-t border-oa-border pt-4 text-[13.5px] leading-5 text-oa-muted-fg">
          For how this works in practice, see{" "}
          <a href="/security" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
            Security
          </a>
          .
        </p>
      }
    />
  );
}
