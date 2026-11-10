import type { Metadata } from "next";

import { Crumbs, DocsShell } from "@/components/docs/docs-shell";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FOCUS, PageHead } from "@/components/oa/kit";
import { DOC_COMPARISONS, docCompareHref } from "@/lib/docs/compare";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "tools"], "stocksbrew compared with other research tools");

export const metadata: Metadata = {
  title: "Compare stock research tools: stocksbrew vs Finviz, TradingView and others",
  description:
    "stocksbrew next to Finviz, TradingView, Seeking Alpha, Yahoo Finance, Morningstar and other research tools: what each is built for and where the other one is stronger.",
  alternates: { canonical: "/docs/compare" },
  openGraph: {
    title: "stocksbrew compared with other research tools",
    description: "What each tool is built for, and where the other one is stronger.",
    url: `${SITE_URL}/docs/compare`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export default function DocsCompareIndexPage() {
  return (
    <DocsShell current="/docs/compare">
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
          { name: "Comparisons", path: "/docs/compare" },
        ])}
      />
      <Crumbs items={[{ label: "Docs", href: "/docs" }, { label: "Comparisons" }]} />
      <PageHead
        title="stocksbrew next to other tools"
        lede="We are a party to every comparison here, so read them knowing that. Each one says what the other product is built for and where it is stronger, and links to its official pages."
        meta={<p className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">{DOC_COMPARISONS.length} comparisons · desk research from official pages unless a page says otherwise</p>}
      />
      <ul className="oa-surface border border-oa-border bg-oa-card">
        {DOC_COMPARISONS.map((page) => (
          <li key={page.slug} className="border-b border-oa-border last:border-b-0">
            <a href={docCompareHref(page.slug)} className={`group block px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
              <span className="block text-[16px] font-medium leading-6 text-oa-fg group-hover:underline">{page.title}</span>
              <span className="mt-0.5 block text-pretty text-[14px] leading-5 text-oa-muted-fg">{page.competitorBestFor}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-pretty text-[14px] leading-6 text-oa-muted-fg">
        Looking to compare two stocks, not two products? That is{" "}
        <a href="/compare" className={`font-medium text-oa-fg underline decoration-oa-border underline-offset-2 ${FOCUS}`}>
          Compare
        </a>
        . How these pages are researched is in{" "}
        <a href="/docs/methodology/corrections" className={`font-medium text-oa-fg underline decoration-oa-border underline-offset-2 ${FOCUS}`}>
          Editorial standards and corrections
        </a>
        .
      </p>
    </DocsShell>
  );
}
