import type { Metadata } from "next";
import Link from "next/link";
import { indexableBlogPosts } from "@/lib/blog-data";
import { ALL_COMPARE_LINKS } from "@/lib/seo/compare-links";

export const metadata: Metadata = {
  title: "Stock Analysis Guides: Fundamentals, Earnings & Tools",
  description:
    "Evidence-based guides to fundamental stock analysis, earnings reports, analyst targets, research tools, and watchlist workflows.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Stock research guides · stocksbrew",
    description:
      "Researched guides to analysing companies, following earnings, and choosing stock research tools.",
    url: "https://www.stocksbrew.online/blog",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock research guides · stocksbrew",
    description:
      "Researched guides to analysing companies, following earnings, and choosing stock research tools.",
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  intelligence: "bg-[#ecfdf5] text-[#10b981]",
  tools: "bg-[#eef2ff] text-[#6366f1]",
  comparison: "bg-[#fef3c7] text-[#d97706]",
  guides: "bg-[#eff6ff] text-[#3b82f6]",
};

const STOCK_ANALYSIS_GUIDE_SLUGS = new Set([
  "best-stock-research-websites-2026",
  "best-stock-watchlist-apps-2026",
  "best-stock-news-apps-2026",
  "best-stock-analysis-apps-2026",
  "us-stock-market-analysis-daily-workflow-2026",
  "ai-stock-analysis-comparison",
  "free-stock-market-analysis-tools",
  "stock-analysis-app-checklist",
]);

const stockAnalysisGuides = indexableBlogPosts.filter((post) => STOCK_ANALYSIS_GUIDE_SLUGS.has(post.slug));

const RESEARCH_CLUSTERS = [
  {
    label: "Company analysis",
    description: "Fundamentals, analyst context, and a repeatable decision framework.",
    links: [
      ["Fundamental stock analysis", "/blog/fundamental-stock-analysis-framework"],
      ["What is a good P/E ratio?", "/blog/what-is-a-good-pe-ratio"],
      ["Free cash flow vs net income", "/blog/free-cash-flow-vs-net-income"],
      ["Profit margins explained", "/blog/gross-margin-vs-operating-margin-vs-net-margin"],
      ["Analyst ratings & targets", "/blog/analyst-ratings-price-targets-explained"],
      ["Browse US stocks", "/stocks"],
    ],
  },
  {
    label: "Earnings",
    description: "Prepare for the report, verify the filing, and record what changed.",
    links: [
      ["Earnings analysis template", "/blog/earnings-report-analysis-template"],
      ["How to analyze earnings", "/blog/how-to-analyze-earnings-report"],
      ["US earnings calendar", "/earnings"],
    ],
  },
  {
    label: "Markets & sectors",
    description: "Separate company events from the market and sector forces around them.",
    links: [
      ["Semiconductor stocks", "/blog/semiconductor-stocks-analysis-guide"],
      ["Stock news catalysts", "/blog/stock-news-catalyst-analysis"],
      ["US sector briefs", "/sectors"],
    ],
  },
] as const;

export default function BlogPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-16 md:py-24 flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Blog
          </span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Stock research guides
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55] max-w-[640px]">
            Clear methods, primary sources, and practical ways to research the US stocks you care about.
          </p>
        </header>

        <section className="border-y border-[#d1fae5] bg-[#f0fdf4] px-1 py-6" aria-labelledby="stock-analysis-guides">
          <div className="mb-4 flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#15803d]">2026 buyer guides</span>
            <h2 id="stock-analysis-guides" className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">Stock analysis apps, evaluated by workflow</h2>
            <p className="text-[13px] leading-relaxed text-[#4b5563]">Current pricing, visible methodology, primary sources, honest limits, and a test you can run yourself.</p>
          </div>
          <ol className="divide-y divide-[#d1fae5]">
            {stockAnalysisGuides.map((post, index) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group flex items-start gap-3 py-3">
                  <span className="font-mono text-[11px] text-[#15803d]">0{index + 1}</span>
                  <span className="text-[14px] font-semibold leading-snug text-[#111111] group-hover:text-[#15803d]">{post.title}</span>
                  <span className="ml-auto shrink-0 text-[#15803d]" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-[#e5e7eb] py-7" aria-labelledby="research-library">
          <div className="mb-5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">Research library</span>
            <h2 id="research-library" className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">
              Start with the question you have
            </h2>
          </div>
          <div className="grid gap-7 md:grid-cols-3">
            {RESEARCH_CLUSTERS.map((cluster) => (
              <div key={cluster.label}>
                <h3 className="text-[14px] font-semibold text-[#111111]">{cluster.label}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[#6b7280]">{cluster.description}</p>
                <ul className="mt-3 divide-y divide-[#e5e7eb]">
                  {cluster.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="flex items-center justify-between gap-3 py-2 text-[12px] font-semibold text-[#166534] hover:underline">
                        {label}<span aria-hidden>→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/guides"
          className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-[#111111] transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Guides</span>
            <span className="text-[16px] font-semibold text-[#111111]">Stock research guide</span>
            <span className="text-[13px] text-[#6b7280]">Free tools, comparisons, tutorials, and a weekly workflow in one place.</span>
          </div>
          <span className="text-[13px] font-semibold text-[#111111] shrink-0">Open guide →</span>
        </Link>

        <Link
          href="/agents"
          className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-[#16a34a] transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#16a34a]">Stocksbrew for AI agents</span>
            <span className="text-[16px] font-semibold text-[#111111]">Give your AI current, structured stock data</span>
            <span className="text-[13px] text-[#6b7280]">Connect with MCP or use the stock research, Watchlist and alerts API.</span>
          </div>
          <span className="text-[13px] font-semibold text-[#166534] shrink-0">Read the guide →</span>
        </Link>

        <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Compare</span>
            <span className="text-[16px] font-semibold text-[#111111]">How stocksbrew compares</span>
            <span className="text-[13px] text-[#6b7280]">Honest side-by-sides with Finviz, TradingView, Yahoo Finance, and more.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_COMPARE_LINKS.slice(0, 8).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="inline-flex h-[34px] items-center px-3 rounded-full border border-[#e5e7eb] bg-white text-[12px] font-medium text-[#374151] hover:border-[#111111]"
              >
                {c.label}
              </Link>
            ))}
            <Link href="/compare" className="inline-flex h-[34px] items-center px-3 text-[12px] font-semibold text-[#0052ff] hover:underline">
              All comparisons →
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          {indexableBlogPosts.map((post) => (
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
