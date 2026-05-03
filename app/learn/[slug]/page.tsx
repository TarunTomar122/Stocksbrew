import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { allLearnPosts, type LearnPost } from "@/lib/learn-data";
import { getLearnImage } from "@/lib/learn/images";
import { getLearnContent } from "@/lib/learn/content";

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
    openGraph: {
      title: `${post.title} · Tikrr Learn`,
      description: post.description,
      url: `https://tikrr.com/learn/${slug}`,
      images: [{ url: post.image, width: 800, height: 600, alt: post.imageAlt }],
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      title: `${post.title} · Tikrr Learn`,
      description: post.description,
      images: [post.image],
    },
  };
}

export default async function LearnPostPage({ params }: Props) {
  const { slug } = await params;
  const post = allLearnPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const content = getLearnContent(slug);
  const image = post.image || getLearnImage(slug);

  return (
    <main className="flex-grow">
      <article className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-12 md:py-16">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors mb-8"
        >
          <span aria-hidden>←</span> Back to Learn
        </Link>

        <header className="flex flex-col gap-4 mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.1em] uppercase text-[#6b7280] w-fit">
            {post.category}
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            {post.title}
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            {post.description}
          </p>
          <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
            <span>{post.date}</span>
            <span aria-hidden>·</span>
            <span>{post.readTime}</span>
          </div>
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

        {image && (
          <div className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden mb-10 bg-[#f3f4f6]">
            <Image
              src={image}
              alt={post.imageAlt}
              fill
              className="object-cover"
              sizes="(max-width: 800px) 100vw, 800px"
              priority
            />
          </div>
        )}

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
            [&_li::before]:content-['—'] [&_li::before]:absolute [&_li::before]:left-0 [&_li::before]:text-[#d1d5db]
            prose-ol:my-5 prose-ol:pl-6 prose-ol:list-decimal
            [&_ol>li]:pl-1
            prose-blockquote:border-l-[3px] prose-blockquote:border-[#0052ff] prose-blockquote:bg-[#f8f9fa] prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-[#374151]
            prose-hr:my-10 prose-hr:border-[#e5e7eb]
            prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: content }}
        />

        <footer className="mt-16 pt-8 border-t border-[#e5e7eb]">
          <Link
            href="/learn"
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            ← Back to all articles
          </Link>
        </footer>
      </article>
    </main>
  );
}
