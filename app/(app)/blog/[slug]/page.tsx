import type { Metadata } from "next";
import { notFound } from "next/navigation";

import styles from "@/components/docs/blog-prose.module.css";
import { CopyButton } from "@/components/docs/copy-button";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, FOCUS, Tag, fmtDay } from "@/components/oa/kit";
import { getBlogContent } from "@/lib/blog";
import { allBlogPosts, indexableBlogPosts, isIndexableBlogPost } from "@/lib/blog-data";
import { movedCompareHref } from "@/lib/docs/compare";
import { SITE_URL } from "@/lib/docs/site";
import { getBlogCompareLinks } from "@/lib/seo/compare-links";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

type Props = { params: { slug: string } };

const AUTHOR_PATH = "/docs/methodology/who-writes-this";

export function generateStaticParams() {
  return indexableBlogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const post = allBlogPosts.find((item) => item.slug === params.slug);
  if (!post) return { title: "Not Found" };
  return {
    title: post.seoTitle ?? post.title,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: "Tarun Tomar", url: AUTHOR_PATH }],
    alternates: { canonical: `/blog/${post.slug}` },
    robots: isIndexableBlogPost(post.slug) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: `${post.title} · stocksbrew Blog`,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: ["Tarun Tomar"],
      images: [ogImage(["blog", post.slug], post.title)],
    },
    twitter: { card: "summary_large_image", title: `${post.title} · stocksbrew Blog`, description: post.description, images: [ogImage(["blog", post.slug], post.title)] },
  };
}

const LINK = `font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg rounded-sm ${FOCUS}`;

export default function BlogPostPage({ params }: Props) {
  const post = allBlogPosts.find((item) => item.slug === params.slug);
  if (!post) notFound();

  const content = getBlogContent(post.slug);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const faqs = post.faqs ?? [];
  const showFaqs = faqs.length > 0 && !content.includes('id="faq"');
  const compares = getBlogCompareLinks(post.slug).map((link) => ({ ...link, href: movedCompareHref(link.href) }));
  const more = indexableBlogPosts
    .filter((item) => item.slug !== post.slug && item.category === post.category)
    .sort((a, b) => (b.updated ?? b.date).localeCompare(a.updated ?? a.date))
    .slice(0, 3);

  return (
    <AppPage width="read">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            image: [`${SITE_URL}/api/og`],
            author: { "@type": "Person", name: "Tarun Tomar", url: `${SITE_URL}${AUTHOR_PATH}` },
            publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "stocksbrew", url: SITE_URL },
            isPartOf: { "@id": `${SITE_URL}/#website` },
            inLanguage: "en-US",
            datePublished: post.date,
            dateModified: post.updated ?? post.date,
            isAccessibleForFree: true,
            keywords: post.tags,
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            url,
          },
          // No FAQPage markup (owner's SEO playbook): Google shows FAQ results for few sites; the questions stay visible on the page.
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <article>
        <nav aria-label="Breadcrumb" className="oa-mono mb-3 flex flex-wrap items-center gap-x-1.5 text-[11.5px] uppercase tracking-[0.06em] text-oa-muted-fg">
          <Link prefetch={false} href="/blog" className={`rounded hover:text-oa-fg ${FOCUS}`}>
            Blog
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-oa-label">{post.category}</span>
        </nav>

        <header className="mb-8 border-b border-oa-border pb-6">
          <h1 className="text-balance text-[30px] font-medium leading-[1.12] tracking-tight text-oa-fg sm:text-[38px]">{post.title}</h1>
          <p className="mt-3 text-pretty text-[17.5px] leading-7 text-oa-muted-fg">{post.description}</p>
          <p className="oa-mono mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-4 text-oa-muted-fg">
            <span>
              By{" "}
              <a href={AUTHOR_PATH} rel="author" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                Tarun Tomar
              </a>
            </span>
            <span aria-hidden="true">·</span>
            <span>Published {fmtDay(post.date, true)}</span>
            {post.updated && post.updated !== post.date ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Updated {fmtDay(post.updated, true)}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </p>
        </header>

        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: content }} />

        {showFaqs ? (
          <section id="faq" aria-labelledby="faq-h" className="mt-12 scroll-mt-24 border-t border-oa-border pt-7">
            <h2 id="faq-h" className="text-[23px] font-medium leading-8 tracking-tight text-oa-fg">
              Questions
            </h2>
            <dl className="mt-3">
              {faqs.map((faq) => (
                <div key={faq.question} className="border-b border-oa-border py-3.5 last:border-b-0">
                  <dt className="text-[16.5px] font-medium leading-6 text-oa-fg">{faq.question}</dt>
                  <dd className="mt-1 text-pretty text-[15.5px] leading-7 text-oa-fg/85">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <footer className="mt-12 flex flex-col gap-6">
          <div className="oa-surface border border-oa-border bg-oa-card px-4 py-3">
            <p className="oa-caption mb-1">How this was made</p>
            <p className="text-pretty text-[14.5px] leading-6 text-oa-fg/85">
              Tarun reviewed this article for product accuracy and usefulness. A model may have helped with structure or editing. Material facts should be checked
              against the linked primary sources. Found an error?{" "}
              <Link prefetch={false} href="/docs/methodology/corrections#reporting-an-error" className={LINK}>
                Tell us
              </Link>
              . The standard is in{" "}
              <Link prefetch={false} href="/docs/methodology/corrections" className={LINK}>
                Editorial standards and corrections
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {post.tags.slice(0, 6).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            <span className="ml-auto flex items-center gap-2 text-[13px] text-oa-muted-fg">
              Share
              <CopyButton value={url} label="Copy link" />
            </span>
          </div>

          {more.length > 0 || compares.length > 0 ? (
            <section aria-labelledby="more-h">
              <h2 id="more-h" className="oa-label mb-2">
                Read next
              </h2>
              <ul className="oa-surface border border-oa-border bg-oa-card">
                {more.map((item) => (
                  <li key={item.slug} className="border-b border-oa-border last:border-b-0">
                    <Link prefetch={false} href={`/blog/${item.slug}`} className={`group block px-4 py-2.5 hover:bg-oa-accent ${FOCUS}`}>
                      <span className="block text-[15px] font-medium leading-6 text-oa-fg group-hover:underline">{item.title}</span>
                      <span className="line-clamp-1 block text-[13.5px] leading-5 text-oa-muted-fg">{item.description}</span>
                    </Link>
                  </li>
                ))}
                {compares.map((link) => (
                  <li key={link.href} className="border-b border-oa-border last:border-b-0">
                    <AppLink href={link.href} className={`group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-oa-accent ${FOCUS}`}>
                      <span className="text-[15px] font-medium leading-6 text-oa-fg group-hover:underline">stocksbrew {link.label.replace(/^stocksbrew\s+/i, "")}</span>
                      <span className="oa-mono text-[10.5px] uppercase tracking-[0.06em] text-oa-label">Comparison</span>
                    </AppLink>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-medium leading-6 text-oa-fg">Try it on a stock you know</p>
              <p className="text-[14px] leading-5 text-oa-muted-fg">Search any US stock for financials, earnings, filings and news. Free to read.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link prefetch={false} href="/explore" className={`inline-flex h-9 items-center rounded-lg bg-oa-fg px-3.5 text-[14px] font-medium text-oa-page hover:opacity-90 ${FOCUS}`}>
                Search a stock
              </Link>
              <Link prefetch={false} href="/docs" className={`inline-flex h-9 items-center rounded-lg border border-oa-border bg-oa-card px-3.5 text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}>
                Read the docs
              </Link>
            </div>
          </div>

          <Link prefetch={false} href="/blog" className={`w-fit rounded text-[14px] font-medium text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
            ← All posts
          </Link>
        </footer>
      </article>
    </AppPage>
  );
}
