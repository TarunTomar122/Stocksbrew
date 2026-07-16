import type { Metadata } from "next";
import Link from "next/link";
import { allLearnPosts } from "@/lib/learn-data";
import { getLearnImage } from "@/lib/learn/images";

export const metadata: Metadata = {
  title: "Learn to Invest",
  description: "50 free investing guides for beginners and intermediate investors. Stock analysis, portfolio building, market strategy, and more.",
  alternates: { canonical: "/learn" },
  robots: { index: false, follow: true },
  openGraph: {
    title: "Learn to Invest - Free Guides & Tutorials · stocksbrew",
    description: "Free investing guides for beginners and intermediate investors. Stock analysis, portfolio building, market strategy, and more.",
    url: "https://www.stocksbrew.online/learn",
  },
  twitter: {
    title: "Learn to Invest - Free Guides & Tutorials · stocksbrew",
    description: "Free investing guides for beginners and intermediate investors. Stock analysis, portfolio building, market strategy, and more.",
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  beginner: "bg-[#ecfdf5] text-[#10b981]",
  intermediate: "bg-[#eef2ff] text-[#6366f1]",
  advanced: "bg-[#fef3c7] text-[#d97706]",
};

function PostCard({ post, idx }: { post: typeof allLearnPosts[number]; idx: number }) {
  const image = post.image || getLearnImage(post.slug);
  return (
    <Link
      href={`/learn/${post.slug}`}
      className="group flex flex-col rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden hover:border-[#111111] hover:shadow-card-hover transition-all duration-200"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[#f3f4f6]">
        <img
          src={image}
          alt={post.imageAlt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading={idx < 6 ? "eager" : "lazy"}
        />
        <div className="absolute top-3 left-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${CATEGORY_COLORS[post.category]}`}
          >
            {post.category}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-5 flex-1">
        <h3 className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug group-hover:text-[#0052ff] transition-colors">
          {post.title}
        </h3>
        <p className="text-[13px] text-[#6b7280] leading-relaxed line-clamp-2">
          {post.description}
        </p>
        <div className="flex items-center gap-3 text-[12px] text-[#9ca3af] mt-auto pt-3">
          <span>{post.readTime}</span>
          <span aria-hidden>·</span>
          <span>{post.date}</span>
        </div>
      </div>
    </Link>
  );
}

export default function LearnPage() {
  const beginner = allLearnPosts.filter((p) => p.category === "beginner");
  const intermediate = allLearnPosts.filter((p) => p.category === "intermediate");

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-12">
        <header className="flex flex-col gap-3 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Learn
          </span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Learn to Invest
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            50 free guides covering everything from stock market basics to advanced factor investing. No jargon, no sales pitches - just clear, actionable knowledge.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#10b981]">
                  BEGINNER
                </span>
                <span className="text-[12px] text-[#9ca3af] font-medium">
                  {beginner.length} articles
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {beginner.map((post, idx) => (
                <PostCard key={post.slug} post={post} idx={idx} />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-[#eef2ff] px-2.5 py-0.5 text-[10px] font-bold tracking-[0.06em] text-[#6366f1]">
                  INTERMEDIATE
                </span>
                <span className="text-[12px] text-[#9ca3af] font-medium">
                  {intermediate.length} articles
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {intermediate.map((post, idx) => (
                <PostCard key={post.slug} post={post} idx={idx} />
              ))}
            </div>
          </section>
        </div>

        {/* Cross-link to Blog */}
        <section className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-8 text-center">
          <h2 className="text-[22px] font-semibold text-[#111111] mb-2">From the Blog</h2>
          <p className="text-[14px] text-[#6b7280] mb-5 max-w-[480px] mx-auto">
            Deeper dives into stock calls, smarter tracking, and investing strategy.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/blog/how-to-track-stock-news" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              Tracking Stock News
            </Link>
            <Link href="/blog/earnings-calendar-for-my-watchlist" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              Earnings Calendar
            </Link>
            <Link href="/blog/stay-updated-on-stocks-without-checking-daily" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              Stay Updated Daily
            </Link>
            <Link href="/blog/how-to-use-stock-alerts-effectively" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              Alert Tools
            </Link>
            <Link href="/guides" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              Research Guide
            </Link>
            <Link href="/compare/stocksbrew-vs-tickertape" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors">
              vs Tickertape
            </Link>
            <Link href="/blog" className="inline-flex items-center h-[36px] px-4 rounded-full border border-[#111111] bg-[#111111] text-white text-[13px] font-medium hover:-translate-y-[1px] transition-transform">
              All Posts →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
