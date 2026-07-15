import Link from "next/link";

import { getBlogCompareLinks, getCompareRelated, type SeoLink } from "@/lib/seo/compare-links";

function LinkPills({ items }: { items: SeoLink[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
        >
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
      <h2 className="text-[18px] font-semibold text-[#111111]">Related reading</h2>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9ca3af]">Guides</p>
          <LinkPills items={blogs} />
        </div>
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9ca3af]">Comparisons</p>
          <LinkPills items={compares} />
        </div>
        <Link href="/compare" className="text-[13px] font-medium text-[#0052ff] hover:underline w-fit">
          All comparisons →
        </Link>
      </div>
    </section>
  );
}

export function BlogCompareStrip({ slug }: { slug: string }) {
  const compareLinks = getBlogCompareLinks(slug);
  if (compareLinks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-5 flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-[#111111]">Compare stocksbrew</h3>
      <LinkPills items={compareLinks} />
      <Link href="/compare" className="text-[13px] font-medium text-[#0052ff] hover:underline w-fit">
        All comparisons →
      </Link>
    </section>
  );
}
