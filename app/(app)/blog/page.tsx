import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, FOCUS, PageHead, fmtDay } from "@/components/oa/kit";
import { indexableBlogPosts, type BlogPost } from "@/lib/blog-data";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";

const SHARE_IMAGE = ogImage(["page", "blog"], "The stocksbrew blog");

export const metadata: Metadata = {
  title: "Stock Analysis Guides: Fundamentals, Earnings & Tools",
  description: "Evidence-based guides to fundamental stock analysis, earnings reports, analyst targets, research tools, and watchlist workflows.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Stock research guides · stocksbrew",
    description: "Researched guides to analysing companies, following earnings, and choosing stock research tools.",
    url: `${SITE_URL}/blog`,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock research guides · stocksbrew",
    description: "Researched guides to analysing companies, following earnings, and choosing stock research tools.",
    images: [SHARE_IMAGE],
  },
};

const TOPICS: { id: string; title: string; blurb: string }[] = [
  { id: "guides", title: "Guides", blurb: "How to analyse a company, read a report and build a routine." },
  { id: "intelligence", title: "Agents and automation", blurb: "Connecting your own agent to stock data, and what to ask it." },
  { id: "tools", title: "Tools", blurb: "Reviews and roundups of research software." },
  { id: "comparison", title: "Comparisons", blurb: "Research tools side by side." },
];

function lastTouched(post: BlogPost): string {
  return post.updated ?? post.date;
}

function byRecency(a: BlogPost, b: BlogPost): number {
  return lastTouched(b).localeCompare(lastTouched(a));
}

function PostRow({ post }: { post: BlogPost }) {
  return (
    <li className="border-b border-oa-border last:border-b-0">
      <Link prefetch={false} href={`/blog/${post.slug}`} className={`group grid gap-x-4 px-4 py-3 hover:bg-oa-accent sm:grid-cols-[5.5rem_minmax(0,1fr)] ${FOCUS}`}>
        <span className="oa-mono pt-0.5 text-[12px] tabular-nums leading-5 text-oa-muted-fg">
          {fmtDay(lastTouched(post), true)}
          <span className="sm:block"> · {post.readTime.replace(" read", "")}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-pretty text-[16px] font-medium leading-6 text-oa-fg group-hover:underline">{post.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-pretty text-[14px] leading-5 text-oa-muted-fg">{post.description}</span>
        </span>
      </Link>
    </li>
  );
}

export default function BlogPage() {
  const posts = [...indexableBlogPosts].sort(byRecency);
  const latest = posts.slice(0, 3);
  const known = new Set(TOPICS.map((topic) => topic.id));
  const groups = TOPICS.map((topic) => ({ ...topic, posts: posts.filter((post) => post.category === topic.id) }));
  const other = posts.filter((post) => !known.has(post.category));
  if (other.length > 0) groups.push({ id: "more", title: "More", blurb: "", posts: other });
  const shown = groups.filter((group) => group.posts.length > 0);

  return (
    <AppPage width="read">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "stocksbrew blog",
            url: `${SITE_URL}/blog`,
            blogPost: posts.map((post) => ({
              "@type": "BlogPosting",
              headline: post.title,
              url: `${SITE_URL}/blog/${post.slug}`,
              datePublished: post.date,
              dateModified: lastTouched(post),
            })),
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
          ]),
        ]}
      />
      <PageHead
        label="Blog"
        title="Longer reads on analysing stocks"
        lede="For how stocksbrew itself works, read the docs."
        meta={
          <p className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">
            {posts.length} posts · reviewed before they are listed ·{" "}
            <Link prefetch={false} href="/docs/methodology/corrections" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
              editorial standards
            </Link>
          </p>
        }
      />

      <nav aria-label="Topics" className="mb-6 flex flex-wrap gap-1.5">
        {shown.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border border-oa-border bg-oa-card px-2.5 text-[13px] text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}
          >
            {group.title}
            <span className="oa-mono text-[11.5px] tabular-nums opacity-70">{group.posts.length}</span>
          </a>
        ))}
        <Link prefetch={false} href="/docs" className={`inline-flex h-7 items-center rounded-md border border-oa-fg bg-oa-fg px-2.5 text-[13px] text-oa-page ${FOCUS}`}>
          Docs →
        </Link>
      </nav>

      <section aria-labelledby="latest" className="mb-8">
        <h2 id="latest" className="oa-label mb-2">
          Latest
        </h2>
        <ul className="oa-surface border border-oa-border bg-oa-card">
          {latest.map((post) => (
            <PostRow key={post.slug} post={post} />
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-8">
        {shown.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-h`} className="scroll-mt-24">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`${group.id}-h`} className="text-[19px] font-medium leading-7 tracking-tight text-oa-fg">
                {group.title}
              </h2>
              {group.blurb ? <p className="text-[13.5px] leading-5 text-oa-muted-fg">{group.blurb}</p> : null}
            </div>
            <ul className="oa-surface border border-oa-border bg-oa-card">
              {group.posts.map((post) => (
                <PostRow key={post.slug} post={post} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppPage>
  );
}
