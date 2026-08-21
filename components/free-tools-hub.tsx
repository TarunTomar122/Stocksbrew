import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import {
  ALL_FREE_TOOLS,
  FEATURED_FREE_TOOLS,
  FREE_TOOL_GROUPS,
  FREE_TOOLS_FAQS,
  type HubLink,
} from "@/lib/free-tools-hub-data";

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";
const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

const CARD =
  "group flex flex-col gap-2 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] h-full";

function FeaturedToolCard({ tool }: { tool: HubLink }) {
  return (
    <Link href={tool.href} className={CARD}>
      <span className="oa-mono w-fit rounded-full bg-oa-accent px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-oa-muted-fg">
        Popular
      </span>
      <h3 className="text-[17px] font-medium leading-snug tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
        {tool.title}
      </h3>
      <p className="flex-1 text-[13px] leading-relaxed text-oa-muted-fg">{tool.description}</p>
      <span className="mt-1 flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">
        Open tool
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
      </span>
    </Link>
  );
}

function ToolCard({ tool }: { tool: HubLink }) {
  return (
    <Link
      href={tool.href}
      className="group flex items-center justify-between gap-4 rounded-[18px] border border-oa-border bg-oa-bg p-4 transition-colors duration-200 hover:bg-oa-card"
    >
      <span className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
          {tool.title}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-oa-muted-fg">{tool.description}</p>
      </span>
      <span aria-hidden className="shrink-0 text-oa-muted-fg transition-transform duration-200 group-hover:translate-x-0.5">
        ›
      </span>
    </Link>
  );
}

export function FreeToolsHub() {
  return (
    <>
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <header className="max-w-[640px]">
          <p className={EYEBROW}>Free tools</p>
          <h1 className={`mt-4 ${H1}`}>Every free research tool, one place</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Check a ticker, scan the market, or size a trade. Add your favorites to Watchlist when you are ready to track them daily.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/pulse"
              className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
            >
              Market Pulse
            </Link>
            <Link
              href="/watchlist"
              className="inline-flex h-11 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
            >
              Open Watchlist
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-xs text-oa-muted-fg">
            {["No credit card", "US tickers", "Updated daily"].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </header>

        <section aria-labelledby="tools-start">
          <div className="mb-5">
            <h2 id="tools-start" className={H2}>Start here</h2>
            <p className="mt-1 text-sm text-oa-muted-fg">The tools people open most often.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {FEATURED_FREE_TOOLS.map((tool) => (
              <FeaturedToolCard key={tool.href} tool={tool} />
            ))}
          </div>
        </section>

        {FREE_TOOL_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`tools-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="mb-5 max-w-2xl">
              <h2 id={`tools-${group.title.replace(/\s+/g, "-").toLowerCase()}`} className={H2}>
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-oa-muted-fg">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {group.tools.map((tool) => (
                <ToolCard key={tool.href} tool={tool} />
              ))}
            </div>
          </section>
        ))}

        <section aria-labelledby="tools-guides">
          <h2 id="tools-guides" className={H2}>Free research guides</h2>
          <p className="mt-1 text-sm text-oa-muted-fg">Choose the tools, then use them with a repeatable process.</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ["Build a $0 stock research stack", "/blog/free-stock-market-analysis-tools"],
              ["Compare stock watchlist apps", "/blog/best-stock-watchlist-apps-2026"],
              ["Read analyst targets correctly", "/blog/analyst-ratings-price-targets-explained"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center justify-between gap-3 rounded-[18px] border border-oa-border bg-oa-bg p-4 text-[15px] font-medium tracking-tight text-oa-fg transition-colors hover:bg-oa-card"
              >
                {label}
                <span aria-hidden className="shrink-0 text-oa-muted-fg transition-transform duration-200 group-hover:translate-x-0.5">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:p-8" aria-labelledby="all-tools">
          <h2 id="all-tools" className="text-[17px] font-medium tracking-tight text-oa-fg">
            All {ALL_FREE_TOOLS.length} tools
          </h2>
          <ul className="flex flex-wrap gap-2">
            {ALL_FREE_TOOLS.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-6 rounded-[22px] border border-oa-border bg-oa-bg p-7 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="max-w-md">
            <h2 className="text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg sm:text-3xl">
              Found a stock? Add it to Watchlist.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-oa-muted-fg">
              Free for up to three US tickers. Daily briefs, alerts, and earnings intel when you are ready to go deeper.
            </p>
          </div>
          <Link
            href="/watchlist"
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-oa-primary px-6 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Open Watchlist
          </Link>
        </section>

        <FaqSection title="Free tools FAQ" faqs={FREE_TOOLS_FAQS} />
      </div>
    </>
  );
}
