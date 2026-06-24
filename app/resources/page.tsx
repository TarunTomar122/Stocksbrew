import type { Metadata } from "next";
import Link from "next/link";

import { MarketingSchema } from "@/components/seo/marketing-schema";
import { ALL_RESOURCES, RESOURCE_GROUPS } from "@/lib/resources-hub-data";

export const metadata: Metadata = {
  title: "Learn, guides & resources",
  description:
    "Learn investing basics, read the blog, follow research workflows, compare tools, and browse use cases — all stocksbrew learning resources in one place.",
  alternates: { canonical: "/resources" },
  openGraph: {
    title: "Learn & resources · stocksbrew",
    description: "Learn library, blog, guides, use cases, and tool comparisons.",
    url: "https://www.stocksbrew.online/resources",
  },
};

function ResourceCard({
  href,
  title,
  description,
  icon,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-6 shadow-sm transition-all hover:border-on-surface/20 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-landing-brand">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 400" }}>
            {icon}
          </span>
        </span>
        {badge ? (
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <h3 className="text-[17px] font-semibold text-on-surface group-hover:text-landing-brand transition-colors">
          {title}
        </h3>
        <p className="flex-1 text-[14px] leading-relaxed text-on-surface-variant">{description}</p>
        <span className="text-[13px] font-medium text-on-surface">Open →</span>
      </div>
    </Link>
  );
}

export default function ResourcesPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/resources"
        name="Learn and resources"
        description="Learning resources and guides from stocksbrew."
        breadcrumbLabel="Resources"
      />
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-14 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex max-w-[720px] flex-col gap-4">
          <span className="landing-section-kicker text-landing-brand">Resources</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl md:text-[2.75rem] md:leading-tight">
            Learn, read, and pick your workflow.
          </h1>
          <p className="text-[16px] leading-relaxed text-on-surface-variant">
            Long-form guides, blog posts, and workflow maps — plus honest comparisons when you are choosing a research stack.
          </p>
          <Link href="/free-tools" className="landing-btn-secondary w-fit px-4 py-2 text-sm">
            Browse free tools →
          </Link>
        </header>

        {RESOURCE_GROUPS.map((group) => (
          <section key={group.title}>
            <div className="mb-5 max-w-2xl">
              <h2 className="text-xl font-bold text-on-surface">{group.title}</h2>
              <p className="mt-1 text-[14px] text-on-surface-variant">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <ResourceCard key={item.href} {...item} />
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-6 md:p-8">
          <h2 className="text-lg font-bold text-on-surface">All resources</h2>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {ALL_RESOURCES.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="text-[14px] font-medium text-landing-brand hover:underline">
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
