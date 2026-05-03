import Link from "next/link";
import Image from "next/image";
import { allLearnPosts } from "@/lib/learn-data";
import { getLearnImage } from "@/lib/learn/images";

const PICKS = ["power-of-compound-interest", "building-your-first-portfolio", "what-are-etfs", "why-diversification-matters", "bull-vs-bear-markets", "value-investing-principles"];

const CATEGORY_COLORS: Record<string, string> = {
  beginner: "bg-[#ecfdf5] text-[#10b981]",
  intermediate: "bg-[#eef2ff] text-[#6366f1]",
  advanced: "bg-[#fef3c7] text-[#d97706]",
};

export function LearnTeaser() {
  const featured = PICKS.map((slug) => allLearnPosts.find((p) => p.slug === slug)).filter(Boolean) as typeof allLearnPosts;
  if (featured.length === 0) return null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Learn
          </span>
          <h2 className="text-[24px] md:text-[28px] font-semibold tracking-[-0.03em] text-[#111111]">
            Free investing guides
          </h2>
        </div>
        <Link
          href="/learn"
          className="hidden md:inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0052ff] hover:underline"
        >
          View all 50 articles <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {featured.map((post) => {
          const image = post.image || getLearnImage(post.slug);
          return (
            <Link
              key={post.slug}
              href={`/learn/${post.slug}`}
              className="group flex rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden hover:border-[#111111] hover:shadow-card-hover transition-all duration-200"
            >
              <div className="relative w-[100px] sm:w-[120px] shrink-0 bg-[#f3f4f6] overflow-hidden">
                <Image
                  src={image}
                  alt={post.imageAlt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="120px"
                />
              </div>
              <div className="flex flex-col gap-1.5 p-4 flex-1 min-w-0">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase w-fit ${CATEGORY_COLORS[post.category]}`}
                >
                  {post.category}
                </span>
                <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug line-clamp-2 group-hover:text-[#0052ff] transition-colors">
                  {post.title}
                </h3>
                <p className="text-[12px] text-[#6b7280] leading-relaxed line-clamp-2">
                  {post.description}
                </p>
                <span className="text-[11px] text-[#9ca3af] mt-auto">{post.readTime}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        href="/learn"
        className="md:hidden inline-flex items-center justify-center h-[44px] px-6 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-semibold text-[#111111] hover:border-[#111111] transition-colors w-full"
      >
        View all 50 articles →
      </Link>
    </section>
  );
}
