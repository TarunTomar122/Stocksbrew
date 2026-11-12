import type { Metadata } from "next";

import { Crumbs, DocsShell } from "@/components/docs/docs-shell";
import { GlossaryList, type GlossaryRow } from "@/components/docs/glossary-list";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { PageHead } from "@/components/oa/kit";
import { GLOSSARY, getGuideByKey, guideHref } from "@/lib/docs";
import { glossaryLetter } from "@/lib/docs/glossary";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "glossary"], "The stocksbrew glossary");

export const metadata: Metadata = {
  title: "Glossary · stocksbrew docs",
  description: "Plain definitions of the terms stocksbrew uses: 13F, Form 4, CAGR, drawdown, Sharpe ratio, survivorship bias, add zone and more.",
  alternates: { canonical: "/docs/glossary" },
  openGraph: { title: "stocksbrew glossary", description: "The terms the product uses, in plain words.", url: `${SITE_URL}/docs/glossary`, images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export default function GlossaryPage() {
  const rows: GlossaryRow[] = GLOSSARY.map((term) => {
    const guide = term.see ? getGuideByKey(term.see) : null;
    return {
      term: term.term,
      id: term.id,
      text: term.text,
      letter: glossaryLetter(term.term),
      see: guide ? { href: guideHref(guide), title: guide.title } : null,
    };
  });

  return (
    <DocsShell current="/docs/glossary">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "DefinedTermSet",
            name: "stocksbrew glossary",
            url: `${SITE_URL}/docs/glossary`,
            hasDefinedTerm: GLOSSARY.map((term) => ({
              "@type": "DefinedTerm",
              name: term.term,
              description: term.text,
              url: `${SITE_URL}/docs/glossary#${term.id}`,
            })),
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Docs", path: "/docs" },
            { name: "Glossary", path: "/docs/glossary" },
          ]),
        ]}
      />
      <Crumbs items={[{ label: "Docs", href: "/docs" }, { label: "Glossary" }]} />
      <PageHead
        title="Glossary"
        lede="Each word defined the way the product uses it."
        meta={<p className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">{GLOSSARY.length} terms · A to Z</p>}
      />
      <GlossaryList rows={rows} />
    </DocsShell>
  );
}
