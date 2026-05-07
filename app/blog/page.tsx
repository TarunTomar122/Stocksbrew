import type { Metadata } from "next";
import Link from "next/link";
import { allBlogPosts } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Blog",
  description: "Insights on market intelligence, AI-powered analysis, and smarter investing. From the makers of tikrr.online.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — Market Intelligence Insights · Tikrr",
    description: "Insights on market intelligence, AI-powered analysis, and smarter investing.",
    url: "https://www.tikrr.online/blog",
  },
  twitter: {
    title: "Blog — Market Intelligence Insights · Tikrr",
    description: "Insights on market intelligence, AI-powered analysis, and smarter investing.",
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  intelligence: "bg-[#ecfdf5] text-[#10b981]",
  tools: "bg-[#eef2ff] text-[#6366f1]",
  comparison: "bg-[#fef3c7] text-[#d97706]",
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
            Insights on market intelligence, AI-powered analysis, and smarter investing. No jargon, no hype, just what works.
          </p>
        </header>

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
