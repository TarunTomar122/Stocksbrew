import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { allLearnPosts } from "@/lib/learn-data";
import { getLearnImage } from "@/lib/learn/images";
import { getLearnContent } from "@/lib/learn/content";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return allLearnPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = allLearnPosts.find((p) => p.slug === slug);
  if (!post) return { title: "Not Found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/learn/${slug}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `${post.title} · stocksbrew Learn`,
      description: post.description,
      url: `https://www.stocksbrew.online/learn/${slug}`,
      images: [{ url: post.image, width: 800, height: 600, alt: post.imageAlt }],
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} · stocksbrew Learn`,
      description: post.description,
      images: [post.image],
    },
  };
}

const PROSE =
  "prose max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-oa-fg prose-h2:text-[24px] prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-[19px] prose-h3:mt-10 prose-h3:mb-3 prose-p:text-[16px] prose-p:leading-[1.8] prose-p:text-oa-fg/80 prose-p:my-5 prose-a:text-oa-primary prose-a:no-underline prose-a:font-medium hover:prose-a:underline prose-strong:text-oa-fg prose-strong:font-medium prose-ul:my-5 prose-ul:pl-0 prose-ul:list-none prose-li:text-[16px] prose-li:leading-[1.7] prose-li:text-oa-fg/80 prose-li:pl-6 prose-li:relative prose-li:my-2 [&_li::before]:content-['–'] [&_li::before]:absolute [&_li::before]:left-0 [&_li::before]:text-oa-muted-fg prose-ol:my-5 prose-ol:pl-6 prose-ol:list-decimal [&_ol>li]:pl-1 prose-blockquote:border-0 prose-blockquote:bg-oa-bg prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-[18px] prose-blockquote:not-italic prose-blockquote:text-oa-fg/80 prose-hr:hidden prose-img:rounded-[18px]";

export default async function LearnPostPage({ params }: Props) {
  const { slug } = await params;
  const post = allLearnPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const content = getLearnContent(slug);
  const image = post.image || getLearnImage(slug);

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <article className="mx-auto w-full max-w-[46rem] px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <Link
          href="/learn"
          className="group inline-flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg"
        >
          <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> Back to Learn
        </Link>

        <header className="mt-8 flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-oa-accent px-3 py-1 text-xs font-medium capitalize text-oa-fg">
            {post.category}
          </span>
          <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-[2.75rem] sm:leading-[1.06]">
            {post.title}
          </h1>
          <p className="text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">{post.description}</p>
          <div className="flex items-center gap-2.5 text-[13px] tabular-nums text-oa-muted-fg">
            <span>{post.date}</span>
            <span aria-hidden>·</span>
            <span>{post.readTime}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full border border-oa-border bg-oa-card px-2.5 py-0.5 text-xs font-medium text-oa-muted-fg">
                {tag}
              </span>
            ))}
          </div>
        </header>

        {image && (
          <div className="relative mt-10 aspect-[21/9] w-full overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg">
            <Image src={image} alt={post.imageAlt} fill className="object-cover" sizes="(max-width: 800px) 100vw, 800px" priority />
          </div>
        )}

        <div className={`mt-10 ${PROSE}`} dangerouslySetInnerHTML={{ __html: content }} />

        <footer className="mt-14 flex flex-col gap-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-medium tracking-tight text-oa-fg">Research a real stock now</p>
            <p className="text-sm leading-relaxed text-oa-muted-fg">Search any US ticker and get the brief in minutes.</p>
          </div>
          <Link
            href="/watchlist"
            className="inline-flex h-10 w-fit shrink-0 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Open Watchlist
          </Link>
        </footer>

        <div className="mt-6">
          <Link href="/learn" className="group inline-flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg">
            <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> All articles
          </Link>
        </div>
      </article>
    </main>
  );
}
