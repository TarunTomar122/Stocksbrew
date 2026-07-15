import type { Metadata } from "next";
import Link from "next/link";
import { allBlogPosts } from "@/lib/blog-data";
import { ALL_COMPARE_LINKS } from "@/lib/seo/compare-links";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical notes on stock calls, watchlists, risk-aware investing, and tools from the makers of stocksbrew.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog · Stock calls & investing · stocksbrew",
    description:
      "Practical notes on personalized stock guidance, smarter watchlists, and building an investing workflow without noise.",
    url: "https://www.stocksbrew.online/blog",
  },
  twitter: {
    title: "Blog · Stock calls & investing · stocksbrew",
    description:
      "Practical notes on personalized stock guidance, smarter watchlists, and building an investing workflow without noise.",
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  intelligence: "bg-[#ecfdf5] text-[#10b981]",
  tools: "bg-[#eef2ff] text-[#6366f1]",
  comparison: "bg-[#fef3c7] text-[#d97706]",
  guides: "bg-[#eff6ff] text-[#3b82f6]",
};

export default function BlogPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-16 md:py-24 flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Blog
          </span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Notes from the desk.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55] max-w-[640px]">
            Notes on personalized stock calls, cutting through noise, and investing with clearer risk and opportunity framing. No jargon, no hype.
          </p>
        </header>

        <Link
          href="/guides"
          className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-[#111111] transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Guides</span>
            <span className="text-[16px] font-semibold text-[#111111]">Stock research guide</span>
            <span className="text-[13px] text-[#6b7280]">Free tools, comparisons, tutorials, and a weekly workflow in one place.</span>
          </div>
          <span className="text-[13px] font-semibold text-[#111111] shrink-0">Open guide →</span>
        </Link>

        <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Compare</span>
            <span className="text-[16px] font-semibold text-[#111111]">How stocksbrew compares</span>
            <span className="text-[13px] text-[#6b7280]">Honest side-by-sides with Finviz, TradingView, Yahoo Finance, and more.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_COMPARE_LINKS.slice(0, 8).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="inline-flex h-[34px] items-center px-3 rounded-full border border-[#e5e7eb] bg-white text-[12px] font-medium text-[#374151] hover:border-[#111111]"
              >
                {c.label}
              </Link>
            ))}
            <Link href="/compare" className="inline-flex h-[34px] items-center px-3 text-[12px] font-semibold text-[#0052ff] hover:underline">
              All comparisons →
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          {allBlogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-6 hover:border-[#111111] hover:shadow-card-hover transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${CATEGORY_COLORS[post.category] || "bg-[#f3f4f6] text-[#6b7280]"}`}
                >
                  {post.category}
                </span>
                <span className="text-[12px] text-[#9ca3af]">{post.date}</span>
                <span className="text-[12px] text-[#9ca3af]">·</span>
                <span className="text-[12px] text-[#9ca3af]">{post.readTime}</span>
              </div>
              <h2 className="text-[18px] md:text-[20px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug group-hover:text-[#0052ff] transition-colors">
                {post.title}
              </h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed line-clamp-2">
                {post.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
