import type { Metadata } from "next";
import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { ResourcesCiteSection } from "@/components/marketing/resources-cite-section";
import { ALL_RESOURCES, RESOURCE_GROUPS } from "@/lib/resources-hub-data";

export const metadata: Metadata = {
  title: "Stock Investing Resources: Guides, Tools & Research",
  description:
    "Browse StocksBrew's stock investing guides, research workflows, tool comparisons, and practical use cases in one place.",
  alternates: { canonical: "/resources" },
  openGraph: {
    title: "Stock investing resources · stocksbrew",
    description: "Guides, research workflows, tool comparisons, and practical investing use cases.",
    url: "https://www.stocksbrew.online/resources",
  },
};

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";
const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

function ResourceCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[16px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
          {title}
        </h3>
        {badge ? (
          <span className="shrink-0 rounded-full bg-oa-accent px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-oa-muted-fg">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="flex-1 text-sm leading-relaxed text-oa-muted-fg">{description}</p>
      <span className="mt-1 flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">
        Open
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
      </span>
    </Link>
  );
}

export default function ResourcesPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path="/resources"
        name="Learn and resources"
        description="Learning resources and guides from stocksbrew."
        breadcrumbLabel="Resources"
      />
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <header className="max-w-[640px]">
          <p className={EYEBROW}>Resources</p>
          <h1 className={`mt-4 ${H1}`}>Learn, read, and pick your workflow</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Long-form guides, blog posts and workflow maps, plus honest comparisons when you are choosing a research stack.
          </p>
          <Link
            href="/free-tools"
            className="mt-7 inline-flex h-11 w-fit items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
          >
            Browse free tools ›
          </Link>
        </header>

        {RESOURCE_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`resources-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="mb-5 max-w-2xl">
              <h2
                id={`resources-${group.title.replace(/\s+/g, "-").toLowerCase()}`}
                className={H2}
              >
                {group.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-oa-muted-fg">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <ResourceCard key={item.href} {...item} />
              ))}
            </div>
          </section>
        ))}

        <ResourcesCiteSection />

        <section className="flex flex-col gap-4 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:p-8" aria-labelledby="all-resources">
          <h2 id="all-resources" className="text-[17px] font-medium tracking-tight text-oa-fg">All resources</h2>
          <ul className="flex flex-wrap gap-2">
            {ALL_RESOURCES.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
