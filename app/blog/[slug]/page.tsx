import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { allBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { getBlogContent } from "@/lib/blog";
import { BlogCompareStrip } from "@/components/marketing/compare-related-reading";
import { ShareLinkBar } from "@/components/marketing/share-link-bar";
import { ArticleSchema } from "@/components/seo/article-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return allBlogPosts.filter((post) => isIndexableBlogPost(post.slug)).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = allBlogPosts.find((p) => p.slug === slug);
  if (!post) return { title: "Not Found" };
  return {
    title: post.seoTitle ?? post.title,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: "Tarun Tomar", url: "/authors/tarun-tomar" }],
    alternates: { canonical: `/blog/${slug}` },
    robots: isIndexableBlogPost(slug)
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: `${post.title} · stocksbrew Blog`,
      description: post.description,
      url: `https://www.stocksbrew.online/blog/${slug}`,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: ["Tarun Tomar"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} · stocksbrew Blog`,
      description: post.description,
    },
  };
}

const PROSE =
  "blog-prose prose max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-oa-fg prose-h2:text-[24px] prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-[19px] prose-h3:mt-10 prose-h3:mb-3 prose-p:text-[16px] prose-p:leading-[1.8] prose-p:text-oa-fg/80 prose-p:my-5 prose-a:text-oa-primary prose-a:no-underline prose-a:font-medium hover:prose-a:underline prose-strong:text-oa-fg prose-strong:font-medium prose-ul:my-5 prose-ul:pl-0 prose-ul:list-none prose-li:text-[16px] prose-li:leading-[1.7] prose-li:text-oa-fg/80 prose-li:pl-6 prose-li:relative prose-li:my-2 [&_li::before]:content-['–'] [&_li::before]:absolute [&_li::before]:left-0 [&_li::before]:text-oa-muted-fg prose-ol:my-5 prose-ol:pl-6 prose-ol:list-decimal [&_ol>li]:pl-1 prose-blockquote:border-0 prose-blockquote:bg-oa-bg prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-[18px] prose-blockquote:not-italic prose-blockquote:text-oa-fg/80 prose-hr:hidden prose-img:rounded-[18px] [&_.sample-brief]:bg-oa-bg [&_.sample-brief]:border [&_.sample-brief]:border-oa-border [&_.sample-brief]:rounded-[18px] [&_.sample-brief]:p-5 [&_.sample-brief]:my-5 [&_.sample-brief_h4]:text-oa-fg [&_.sample-brief_h4]:font-medium [&_.sample-brief_h4]:mb-3 [&_.article-summary]:rounded-[22px] [&_.article-summary]:border [&_.article-summary]:border-oa-border [&_.article-summary]:bg-oa-bg [&_.article-summary]:p-6 [&_.article-summary]:my-8 [&_.article-summary_h2]:mt-0 [&_.article-summary_h2]:p-0 [&_.article-summary_h2]:text-[20px] [&_.source-note]:rounded-[18px] [&_.source-note]:border [&_.source-note]:border-oa-border [&_.source-note]:bg-oa-bg [&_.source-note]:p-5 [&_.source-note]:my-6 [&_.source-note]:text-sm [&_.table-scroll]:my-8 [&_.table-scroll]:overflow-x-auto [&_.table-scroll]:rounded-[18px] [&_.table-scroll]:border [&_.table-scroll]:border-oa-border [&_.table-scroll_table]:my-0 [&_.table-scroll_table]:min-w-[720px] [&_.table-scroll_table]:border-collapse [&_.table-scroll_th]:bg-oa-bg [&_.table-scroll_th]:px-4 [&_.table-scroll_th]:py-3 [&_.table-scroll_th]:text-left [&_.table-scroll_th]:text-xs [&_.table-scroll_th]:uppercase [&_.table-scroll_th]:tracking-wide [&_.table-scroll_th]:text-oa-muted-fg [&_.table-scroll_th]:font-medium [&_.table-scroll_td]:border-t [&_.table-scroll_td]:border-oa-border [&_.table-scroll_td]:px-4 [&_.table-scroll_td]:py-3 [&_.table-scroll_td]:align-top [&_.table-scroll_td]:text-sm [&_.cta-section]:mt-12 [&_.cta-section]:p-6 [&_.cta-section]:bg-oa-bg [&_.cta-section]:border [&_.cta-section]:border-oa-border [&_.cta-section]:rounded-[22px] [&_.cta-section]:text-center [&_.cta-section_h3]:text-xl [&_.cta-section_h3]:font-medium [&_.cta-section_h3]:tracking-tight [&_.cta-section_h3]:text-oa-fg [&_.cta-section_h3]:mb-2 [&_.cta-section_h3]:mt-0 [&_.cta-section_p]:text-sm [&_.cta-section_p]:text-oa-muted-fg [&_.cta-section_p]:mb-5 [&_.cta-button]:inline-flex [&_.cta-button]:items-center [&_.cta-button]:justify-center [&_.cta-button]:h-11 [&_.cta-button]:px-6 [&_.cta-button]:rounded-full [&_.cta-button]:bg-oa-primary [&_.cta-button]:text-white [&_.cta-button]:text-sm [&_.cta-button]:font-medium [&_.cta-button]:tracking-tight [&_.cta-button]:no-underline";

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = allBlogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const content = getBlogContent(slug);
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <ArticleSchema
        slug={slug}
        title={post.title}
        description={post.description}
        datePublished={post.date}
        dateModified={post.updated}
        keywords={post.tags}
        faqs={post.faqs}
      />
      <article className="mx-auto w-full max-w-[46rem] px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <Link
          href="/blog"
          className="group inline-flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg"
        >
          <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> Back to Blog
        </Link>

        <header className="mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] tabular-nums text-oa-muted-fg">
            <span className="rounded-full bg-oa-accent px-2.5 py-0.5 font-medium capitalize text-oa-fg">{post.category}</span>
            <span>
              Published {post.date}
              {post.updated ? ` · Updated ${post.updated}` : ""}
            </span>
            <span aria-hidden>·</span>
            <span>{post.readTime}</span>
          </div>
          <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-[2.75rem] sm:leading-[1.06]">
            {post.title}
          </h1>
          <p className="text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">{post.description}</p>
          <p className="text-[13px] leading-relaxed text-oa-muted-fg">
            By{" "}
            <Link href="/authors/tarun-tomar" rel="author" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
              Tarun Tomar
            </Link>
            {" · "}
            <Link href="/editorial-policy" className="underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
              Editorial standards
            </Link>
          </p>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full border border-oa-border bg-oa-card px-2.5 py-0.5 text-xs font-medium text-oa-muted-fg">
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className={`mt-10 ${PROSE}`} dangerouslySetInnerHTML={{ __html: content }} />

        {post.faqs?.length && !content.includes('id="faq"') ? (
          <section id="faq" className="mt-14" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-[22px] font-medium tracking-tight text-oa-fg">
              Frequently asked questions
            </h2>
            <dl className="mt-6 flex flex-col gap-6">
              {post.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-[17px] font-medium tracking-tight text-oa-fg">{faq.question}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-oa-muted-fg">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <footer className="mt-14 flex flex-col gap-6">
          <div className="rounded-[18px] border border-oa-border bg-oa-bg p-5 text-[13px] leading-relaxed text-oa-muted-fg">
            <strong className="font-medium text-oa-fg">How this was made:</strong> Tarun reviewed the article for product accuracy and investor usefulness. AI may assist with structure or editing; material factual claims should be verified against linked primary sources. See the{" "}
            <Link href="/editorial-policy" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4">editorial policy</Link>.
          </div>
          <BlogCompareStrip slug={slug} />
          <ShareLinkBar url={`/blog/${slug}`} title={post.title} />

          <div className="flex flex-col items-center gap-5 rounded-[22px] border border-oa-border bg-oa-bg px-6 py-12 text-center">
            <h3 className="max-w-[420px] text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg">
              Analyse a stock on stocksbrew
            </h3>
            <p className="max-w-[400px] text-[15px] leading-relaxed text-oa-muted-fg">
              Search any US stock for financials, news and market context.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/stocks"
                className="inline-flex h-11 items-center rounded-full bg-oa-primary px-6 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
              >
                Search US stocks
              </Link>
              <Link
                href="/watchlist"
                className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-6 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
              >
                Open Watchlist
              </Link>
            </div>
          </div>

          <Link
            href="/blog"
            className="group inline-flex w-fit items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg"
          >
            <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> All posts
          </Link>
        </footer>
      </article>
    </main>
  );
}
