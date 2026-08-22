import type { Metadata } from "next";
import Link from "next/link";
import { indexableBlogPosts } from "@/lib/blog-data";
import { ALL_COMPARE_LINKS } from "@/lib/seo/compare-links";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

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

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";

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
      ["Analyst ratings and targets", "/blog/analyst-ratings-price-targets-explained"],
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
    label: "Markets and sectors",
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
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[52rem] px-4 pb-20 sm:px-6">
        <header className="pb-12 pt-10 sm:pt-16">
          <p className={EYEBROW}>Blog</p>
          <h1 className={`mt-4 ${H1}`}>Stock research, written down</h1>
          <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Methods, primary sources and honest tool reviews. Everything we learn researching US stocks lands here first.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-[22px] border border-oa-border bg-oa-bg p-5 sm:p-6" aria-labelledby="buyer-guides">
          <div className="flex flex-col gap-1">
            <p className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">2026 buyer guides</p>
            <h2 id="buyer-guides" className="text-[17px] font-medium tracking-tight text-oa-fg">
              Stock analysis apps, evaluated by workflow
            </h2>
            <p className="text-sm leading-relaxed text-oa-muted-fg">
              Current pricing, visible methodology, primary sources, honest limits, and a test you can run yourself.
            </p>
          </div>
          <ol className="flex flex-col">
            {stockAnalysisGuides.map((post, index) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group -mx-3 flex items-baseline gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-oa-accent"
                >
                  <span className="oa-mono shrink-0 text-xs tabular-nums text-oa-muted-fg">0{index + 1}</span>
                  <span className="text-sm font-medium leading-snug text-oa-fg transition-colors group-hover:text-oa-primary">
                    {post.title}
                  </span>
                  <span aria-hidden className="ml-auto shrink-0 text-oa-muted-fg transition-transform duration-200 group-hover:translate-x-0.5">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4 pt-10" aria-labelledby="research-library">
          <div>
            <p className={EYEBROW}>Research library</p>
            <h2 id="research-library" className="mt-2 text-[22px] font-medium tracking-tight text-oa-fg">
              Start with the question you have
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RESEARCH_CLUSTERS.map((cluster) => (
              <div key={cluster.label} className="rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <h3 className="text-sm font-medium tracking-tight text-oa-fg">{cluster.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-oa-muted-fg">{cluster.description}</p>
                <ul className="mt-3 flex flex-col">
                  {cluster.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-primary">
                        {label}
                        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
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
          className="group mt-10 flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <span className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Guides</span>
            <span className="text-[16px] font-medium tracking-tight text-oa-fg">The stock research guide</span>
            <span className="text-[13px] leading-relaxed text-oa-muted-fg">Free tools, comparisons, tutorials, and a weekly workflow in one place.</span>
          </div>
          <span className="flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">
            Open guide
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
          </span>
        </Link>

        <Link
          href="/agents"
          className="group mt-3 flex flex-col gap-3 rounded-[22px] border border-[color-mix(in_srgb,var(--oa-primary)_35%,transparent)] bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <span className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-primary">For AI agents</span>
            <span className="text-[16px] font-medium tracking-tight text-oa-fg">Give your agent current, structured stock data</span>
            <span className="text-[13px] leading-relaxed text-oa-muted-fg">Connect over MCP or use the research, Watchlist and alerts API.</span>
          </div>
          <span className="flex items-center gap-1 text-[13px] font-medium text-oa-primary">
            Read the guide
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
          </span>
        </Link>

        <section className="mt-10 flex flex-col gap-3" aria-labelledby="compare-stack">
          <h2 id="compare-stack" className="text-[17px] font-medium tracking-tight text-oa-fg">How stocksbrew compares</h2>
          <p className="text-sm leading-relaxed text-oa-muted-fg">Honest side-by-sides with Finviz, TradingView, Yahoo Finance, and more.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {ALL_COMPARE_LINKS.slice(0, 8).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg"
              >
                {c.label}
              </Link>
            ))}
            <Link href="/compare" className="inline-flex h-8 items-center px-2 text-[13px] font-medium text-oa-primary hover:underline underline-offset-4">
              All comparisons ›
            </Link>
          </div>
        </section>

        <section className="flex flex-col pt-14" aria-labelledby="all-posts">
          <h2 id="all-posts" className="pb-4 text-[22px] font-medium tracking-tight text-oa-fg">All posts</h2>
          <div className="flex flex-col gap-3">
            {indexableBlogPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              >
                <div className="flex items-center gap-2.5 text-xs tabular-nums text-oa-muted-fg">
                  <span className="rounded-full bg-oa-accent px-2.5 py-0.5 font-medium text-oa-fg">{post.category}</span>
                  <span>{post.date}</span>
                  <span aria-hidden>·</span>
                  <span>{post.readTime}</span>
                </div>
                <h3 className="text-[17px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
                  {post.title}
                </h3>
                <p className="text-sm leading-relaxed text-oa-muted-fg">{post.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
