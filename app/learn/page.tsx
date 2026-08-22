import type { Metadata } from "next";
import Link from "next/link";
import { allLearnPosts } from "@/lib/learn-data";
import { getLearnImage } from "@/lib/learn/images";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

export const metadata: Metadata = {
  title: "Stock Analysis Guides: Fundamentals, Valuation & Earnings",
  description: "Free stock analysis guides covering fundamentals, valuation, earnings, portfolios, and market strategy for US investors.",
  alternates: { canonical: "/learn" },
  openGraph: {
    title: "Stock analysis guides · stocksbrew",
    description: "Free guides to fundamentals, valuation, earnings, portfolios, and market strategy.",
    url: "https://www.stocksbrew.online/learn",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock analysis guides · stocksbrew",
    description: "Free guides to fundamentals, valuation, earnings, portfolios, and market strategy.",
  },
};

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";

const GROUPS = [
  { key: "beginner", label: "Beginner", dot: "bg-emerald-500" },
  { key: "intermediate", label: "Intermediate", dot: "bg-[var(--oa-primary)]" },
  { key: "advanced", label: "Advanced", dot: "bg-amber-500" },
] as const;

const CARD =
  "group flex flex-col overflow-hidden rounded-[22px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]";

function PostCard({ post, idx }: { post: typeof allLearnPosts[number]; idx: number }) {
  const image = post.image || getLearnImage(post.slug);
  return (
    <Link href={`/learn/${post.slug}`} className={CARD}>
      <div className="relative aspect-[16/9] overflow-hidden bg-oa-bg">
        <img
          src={image}
          alt={post.imageAlt}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading={idx < 6 ? "eager" : "lazy"}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-[15px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
          {post.title}
        </h3>
        <p className="text-[13px] leading-relaxed text-oa-muted-fg">{post.description}</p>
        <p className="mt-auto flex items-center gap-2 pt-3 text-xs tabular-nums text-oa-muted-fg">
          <span>{post.readTime}</span>
          <span aria-hidden>·</span>
          <span>{post.date}</span>
        </p>
      </div>
    </Link>
  );
}

export default function LearnPage() {
  const total = allLearnPosts.length;

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[76rem] px-4 pb-20 sm:px-6">
        <header className="max-w-[640px] pb-12 pt-10 sm:pt-16">
          <p className={EYEBROW}>Learn</p>
          <h1 className={`mt-4 ${H1}`}>Learn to read any stock</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            {total} free guides that take you from your first ticker to factor investing. Plain English, no jargon, nothing for sale.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {GROUPS.map((group) => {
            const posts = allLearnPosts.filter((p) => p.category === group.key);
            if (posts.length === 0) return null;
            return (
              <section key={group.key} aria-labelledby={`learn-${group.key}`}>
                <div className="flex items-center gap-2.5 pb-4">
                  <h2
                    id={`learn-${group.key}`}
                    className="inline-flex items-center gap-2 rounded-full bg-oa-accent px-3 py-1.5 text-xs font-medium text-oa-fg"
                  >
                    <span className={`size-1.5 rounded-full ${group.dot}`} aria-hidden />
                    {group.label}
                  </h2>
                  <span className="text-xs tabular-nums text-oa-muted-fg">
                    {posts.length} guides
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {posts.map((post, idx) => (
                    <PostCard key={post.slug} post={post} idx={idx} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-14 flex flex-col gap-5 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">From the blog</h2>
            <p className="text-sm leading-relaxed text-oa-muted-fg">
              Longer reads on research methods, tracking workflows and honest tool reviews.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/blog/track-stock-news-for-your-portfolio" className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg">
              Tracking stock news
            </Link>
            <Link href="/blog/earnings-calendar-for-my-watchlist" className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg">
              Earnings calendar
            </Link>
            <Link href="/blog/how-to-use-stock-alerts-effectively" className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg">
              Alerts that work
            </Link>
            <Link href="/blog" className="inline-flex h-8 items-center rounded-full bg-oa-primary px-4 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]">
              All posts
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
