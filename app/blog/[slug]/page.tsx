import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { allBlogPosts, type BlogPost } from "@/lib/blog-data";
import { getBlogContent } from "@/lib/blog";

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  intelligence: { bg: "bg-[#ecfdf5]", text: "text-[#10b981]" },
  tools: { bg: "bg-[#eef2ff]", text: "text-[#6366f1]" },
  comparison: { bg: "bg-[#fef3c7]", text: "text-[#d97706]" },
  guides: { bg: "bg-[#eff6ff]", text: "text-[#3b82f6]" },
};

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return allBlogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = allBlogPosts.find((p) => p.slug === slug);
  if (!post) return { title: "Not Found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: `${post.title} · stocksbrew Blog`,
      description: post.description,
      url: `https://www.stocksbrew.online/blog/${slug}`,
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      title: `${post.title} · stocksbrew Blog`,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = allBlogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const content = getBlogContent(slug);

  return (
    <main className="flex-grow">
      <article className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-12 md:py-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors mb-8"
        >
          <span aria-hidden>←</span> Back to Blog
        </Link>

        <header className="flex flex-col gap-4 mb-10">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${CATEGORY_COLORS[post.category]?.bg || "bg-[#f3f4f6]"} ${CATEGORY_COLORS[post.category]?.text || "text-[#6b7280]"}`}>
              {post.category}
            </span>
            <span className="text-[13px] text-[#6b7280]">{post.date}</span>
            <span className="text-[13px] text-[#6b7280]">·</span>
            <span className="text-[13px] text-[#6b7280]">{post.readTime}</span>
          </div>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            {post.title}
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            {post.description}
          </p>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[11px] font-medium text-[#6b7280]"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div
          className="prose prose-lg max-w-none
            prose-headings:text-[#111111] prose-headings:font-semibold prose-headings:tracking-[-0.02em]
            prose-h2:text-[26px] prose-h2:mt-12 prose-h2:mb-5 prose-h2:pb-2 prose-h2:border-b prose-h2:border-[#e5e7eb]
            prose-h3:text-[20px] prose-h3:mt-10 prose-h3:mb-4 prose-h3:font-semibold
            prose-p:text-[16px] prose-p:text-[#374151] prose-p:leading-[1.8] prose-p:my-5
            prose-a:text-[#0052ff] prose-a:no-underline prose-a:font-medium hover:prose-a:underline
            prose-strong:text-[#111111] prose-strong:font-semibold
            prose-ul:my-5 prose-ul:pl-0 prose-ul:list-none
            prose-li:text-[16px] prose-li:text-[#374151] prose-li:leading-[1.7] prose-li:pl-6 prose-li:relative prose-li:my-2
            [&_li::before]:content-['-'] [&_li::before]:absolute [&_li::before]:left-0 [&_li::before]:text-[#d1d5db]
            prose-ol:my-5 prose-ol:pl-6 prose-ol:list-decimal
            [&_ol>li]:pl-1
            prose-blockquote:border-l-[3px] prose-blockquote:border-[#0052ff] prose-blockquote:bg-[#f8f9fa] prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-[#374151]
            prose-hr:my-10 prose-hr:border-[#e5e7eb]
            prose-img:rounded-xl
            [&_.sample-brief]:bg-[#f8f9fa] [&_.sample-brief]:border [&_.sample-brief]:border-[#e5e7eb] [&_.sample-brief]:rounded-xl [&_.sample-brief]:p-5 [&_.sample-brief]:my-5
            [&_.sample-brief_h4]:text-[#6b38d4] [&_.sample-brief_h4]:font-semibold [&_.sample-brief_h4]:mb-3
            [&_.cta-section]:mt-12 [&_.cta-section]:p-6 [&_.cta-section]:bg-[#f8f9fa] [&_.cta-section]:border [&_.cta-section]:border-[#e5e7eb] [&_.cta-section]:rounded-2xl [&_.cta-section]:text-center
            [&_.cta-section_h3]:text-[20px] [&_.cta-section_h3]:font-semibold [&_.cta-section_h3]:text-[#111111] [&_.cta-section_h3]:mb-2 [&_.cta-section_h3]:mt-0
            [&_.cta-section_p]:text-[14px] [&_.cta-section_p]:text-[#6b7280] [&_.cta-section_p]:mb-5
            [&_.cta-button]:inline-flex [&_.cta-button]:items-center [&_.cta-button]:justify-center [&_.cta-button]:h-[44px] [&_.cta-button]:px-6 [&_.cta-button]:rounded-full [&_.cta-button]:bg-[#111111] [&_.cta-button]:text-white [&_.cta-button]:text-[14px] [&_.cta-button]:font-semibold [&_.cta-button]:tracking-tight [&_.cta-button]:no-underline [&_.cta-button]:hover:-translate-y-[1px]"
          dangerouslySetInnerHTML={{ __html: content }}
        />

        <footer className="mt-16 pt-8 border-t border-[#e5e7eb] flex flex-col gap-6">
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-8 text-center">
            <h3 className="text-[20px] font-semibold text-[#111111] mb-2">
              Know what to do with your stocks
            </h3>
            <p className="text-[14px] text-[#6b7280] mb-5">
              Personalized buy, hold, and sell calls from fundamentals, news, Reddit, and earnings. Set triggers and get emailed in buy or sell zones. Free for 3 stocks.
            </p>
            <a
              href="https://www.stocksbrew.online"
              className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
            >
              Try stocksbrew Free →
            </a>
          </div>

          <Link
            href="/blog"
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full border border-[#e5e7eb] text-[#111111] text-[13px] font-semibold tracking-tight hover:border-[#111111] transition-colors w-fit"
          >
            ← Back to all posts
          </Link>
        </footer>
      </article>
    </main>
  );
}
