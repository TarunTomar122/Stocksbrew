import Link from "next/link";

import { getBlogCompareLinks, getCompareRelated, type SeoLink } from "@/lib/seo/compare-links";

const PILL =
  "inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg";

function LinkPills({ items }: { items: SeoLink[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={PILL}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function CompareRelatedReading({ slug }: { slug: string }) {
  const { blogs, compares } = getCompareRelated(slug);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium tracking-tight text-oa-fg">Related reading</h2>
      <div className="flex flex-col gap-4">
        <div>
          <p className="oa-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Guides</p>
          <LinkPills items={blogs} />
        </div>
        <div>
          <p className="oa-mono mb-2 text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Comparisons</p>
          <LinkPills items={compares} />
        </div>
        <Link href="/compare" className="w-fit text-[13px] font-medium text-oa-primary underline-offset-4 hover:underline">
          All comparisons ›
        </Link>
      </div>
    </section>
  );
}

export function BlogCompareStrip({ slug }: { slug: string }) {
  const compareLinks = getBlogCompareLinks(slug);
  if (compareLinks.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-bg p-5">
      <h3 className="text-[15px] font-medium tracking-tight text-oa-fg">Compare stocksbrew</h3>
      <LinkPills items={compareLinks} />
      <Link href="/compare" className="w-fit text-[13px] font-medium text-oa-primary underline-offset-4 hover:underline">
        All comparisons ›
      </Link>
    </section>
  );
}
